import { createHash } from "node:crypto";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type {
  WorkbookCell,
  WorkbookSheet,
  ImportMappingInput,
  StagedImportRow,
} from "@workspace/api-zod";
import { AccessError, validCalendarDate } from "./administration";

export const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;
const MAX_EXPANDED = 100 * 1024 * 1024;
const MAX_CELLS = 250000;
type XmlText = string | { "#text"?: string; "@_si"?: string };
type XmlInline = { t?: XmlText; r?: { t?: XmlText } | { t?: XmlText }[] };
type XmlCell = {
  "@_r"?: string;
  "@_t"?: string;
  "@_s"?: string;
  v?: XmlText;
  f?: XmlText;
  is?: XmlInline;
};
type XmlSheet = { "@_name"?: string; "@_state"?: string; "@_r:id"?: string };
type XmlRelationship = { "@_TargetMode"?: string; "@_Target"?: string; "@_Id"?: string };
type XmlDocument = {
  workbook?: { workbookPr?: { "@_date1904"?: string }; sheets?: { sheet?: XmlSheet | XmlSheet[] } };
  Relationships?: { Relationship?: XmlRelationship | XmlRelationship[] };
  sst?: { si?: XmlInline | XmlInline[] };
  worksheet?: {
    mergeCells?: { mergeCell?: { "@_ref"?: string } | { "@_ref"?: string }[] };
    sheetData?: { row?: { c?: XmlCell | XmlCell[] } | { c?: XmlCell | XmlCell[] }[] };
  };
};
const array = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
// XML is data only: DTD/entity declarations are rejected before parsing.
const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
});
const text = (v: unknown): string =>
  typeof v === "object" && v !== null
    ? String((v as Record<string, unknown>)["#text"] ?? "")
    : String(v ?? "");
const richText = (v: XmlInline | undefined): string =>
  v?.t !== undefined
    ? text(v.t)
    : array(v?.r)
        .map((r) => text(r.t))
        .join("");
export const digest = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
export interface Catalog {
  dateSystem: "1900" | "1904";
  sheets: WorkbookSheet[];
}
export interface ParsedWorkbook extends Catalog {
  cells: { sheet: string; cell: WorkbookCell }[];
}
export function readWorkbook(bytes: Uint8Array): ParsedWorkbook {
  if (bytes.length > MAX_WORKBOOK_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new AccessError(400, "Upload an XLSX workbook up to 10 MB");
  let expanded = 0,
    entries = 0;
  try {
    const files = unzipSync(bytes, {
      filter: (entry) => {
        expanded += entry.originalSize;
        if (++entries > 1200 || expanded > MAX_EXPANDED || entry.originalSize > 35 * 1024 * 1024)
          throw new Error("Archive limit");
        return /^(xl\/|_rels\/|docProps\/|\[Content_Types\])/.test(entry.name);
      },
    });
    const xml = (name: string, optional = false): XmlDocument => {
      if (!files[name]) {
        if (optional) return {};
        throw new Error("Missing part");
      }
      const value = strFromU8(files[name]!);
      if (/<!DOCTYPE|<!ENTITY/i.test(value)) throw new Error("Unsafe XML");
      return parser.parse(value) as XmlDocument;
    };
    if (Object.keys(files).some((n) => /vbaProject\.bin$/i.test(n)))
      throw new Error("Macros not allowed");
    const workbook = xml("xl/workbook.xml").workbook;
    const dateSystem =
      workbook?.workbookPr?.["@_date1904"] === "1" ||
      workbook?.workbookPr?.["@_date1904"] === "true"
        ? "1904"
        : "1900";
    const relationships = new Map<string, string>();
    for (const r of array(xml("xl/_rels/workbook.xml.rels").Relationships?.Relationship)) {
      if (r["@_TargetMode"] === "External") continue;
      const target = r["@_Target"];
      if (!target || !r["@_Id"]) throw new Error("Invalid relationship");
      const normalized = target?.startsWith("/")
        ? target.slice(1)
        : path.posix.normalize(`xl/${target}`);
      if (normalized.startsWith("xl/")) relationships.set(r["@_Id"]!, normalized);
    }
    const strings = array(xml("xl/sharedStrings.xml", true).sst?.si).map(richText);
    const sheets: WorkbookSheet[] = [];
    const cells: ParsedWorkbook["cells"] = [];
    let physicalCells = 0;
    const sourceSheets = array(workbook?.sheets?.sheet);
    if (!sourceSheets.length || sourceSheets.length > 100) throw new Error("Sheet limit");
    const sheetNames = new Set<string>();
    for (const sheet of sourceSheets) {
      const name = String(sheet["@_name"]);
      if (!sheet["@_name"] || name.length > 100 || sheetNames.has(name))
        throw new Error("Invalid worksheet name");
      sheetNames.add(name);
      const part = relationships.get(sheet["@_r:id"] ?? "");
      if (!part) throw new Error("Missing sheet");
      const sheetXml = xml(part).worksheet;
      const merges = array(sheetXml?.mergeCells?.mergeCell).map((m) => String(m["@_ref"]));
      const summary: WorkbookSheet = {
        name,
        state: sheet["@_state"] ?? "visible",
        cellCount: 0,
        maxRow: 0,
        formulas: 0,
        externalFormulas: 0,
        errors: 0,
        merges,
      };
      const coordinates = new Set<string>();
      for (const row of array(sheetXml?.sheetData?.row)) {
        for (const c of array(row.c)) {
          const coordinate = String(c["@_r"]);
          const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(coordinate);
          if (!match) throw new Error("Invalid coordinate");
          if (++physicalCells > 1500000) throw new Error("Physical cell limit");
          summary.maxRow = Math.max(summary.maxRow, Number(match[2]));
          const raw = c.v === undefined ? null : text(c.v);
          // The supplied workbook has over a million empty formatting cells.
          // Their exact XML stays in the immutable original, not a million DB rows.
          if ((raw === null || raw === "") && c.f === undefined && c.is === undefined) continue;
          if (coordinates.has(coordinate)) throw new Error("Duplicate source coordinate");
          coordinates.add(coordinate);
          summary.cellCount++;
          const type = c["@_t"] ?? "n";
          const formula =
            c.f === undefined
              ? null
              : text(c.f) ||
                `[shared:${typeof c.f === "object" ? (c.f["@_si"] ?? "unknown") : "unknown"}]`;
          const flags: string[] = [];
          if (formula !== null) {
            summary.formulas++;
            flags.push("formula_unverified");
            if (/\[shared:/.test(formula)) flags.push("shared_formula_unresolved");
            if (/IMPORTRANGE|_xludf|\[(?!shared:)[^\]]+\]|https?:\/\//i.test(formula)) {
              flags.push("external_dependency");
              summary.externalFormulas++;
            }
            if (raw === null || raw === "") flags.push("missing_formula_cache");
          }
          if (
            type === "e" ||
            (raw !== null && /^#(REF!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!|NULL!)/.test(raw))
          ) {
            flags.push("spreadsheet_error");
            summary.errors++;
          }
          let value = raw;
          if (type === "s" && raw !== null) {
            value = strings[Number(raw)] ?? null;
            if (value === null) flags.push("invalid_shared_string");
          } else if (type === "inlineStr") value = richText(c.is);
          const cell: WorkbookCell = {
            coordinate,
            row: Number(match[2]),
            column: match[1]!,
            type,
            value: formula === null ? value : null,
            formula,
            cachedValue: formula !== null ? value : null,
            style: c["@_s"] ?? null,
            flags,
          };
          summary.maxRow = Math.max(summary.maxRow, cell.row);
          cells.push({ sheet: name, cell });
          if (cells.length > MAX_CELLS) throw new Error("Cell limit");
        }
      }
      sheets.push(summary);
    }
    return { dateSystem, sheets, cells };
  } catch (e) {
    if (e instanceof AccessError) throw e;
    const error = new AccessError(400, "Invalid, unsupported or oversized workbook archive");
    error.cause = e;
    throw error;
  }
}

export function excelDate(raw: string | null, system: Catalog["dateSystem"]): string | null {
  if (raw === null || raw.trim() === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return validCalendarDate(raw) ? raw : null;
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const serial = Number(raw),
    days = Math.floor(serial);
  if (days > 120000 || days < 0 || (system === "1900" && days === 60)) return null;
  const origin = system === "1904" ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const adjusted = system === "1900" && days > 60 ? days - 1 : days;
  return new Date(origin + adjusted * 86400000).toISOString().slice(0, 10);
}
export function columnNumber(value: string) {
  return [...value].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
}
function merged(coordinate: string, ranges: string[]) {
  const position = (v: string) => {
    const m = /^([A-Z]+)(\d+)$/.exec(v);
    return m ? [columnNumber(m[1]!), Number(m[2])] : [-1, -1];
  };
  const [x, y] = position(coordinate);
  return ranges.some((range) => {
    const [a, b = a] = range.split(":");
    const [x1, y1] = position(a!),
      [x2, y2] = position(b!);
    return x! >= x1! && x! <= x2! && y! >= y1! && y! <= y2!;
  });
}
export function stageRows(
  mapping: ImportMappingInput,
  cells: WorkbookCell[],
  catalog: Catalog,
  snapshotDate: string,
): StagedImportRow[] {
  const lookup = new Map(cells.map((c) => [c.coordinate, c]));
  const ranges = catalog.sheets.find((s) => s.name === mapping.sheet)?.merges ?? [];
  const staged: StagedImportRow[] = [];
  const seen = new Set<string>();
  for (let row = mapping.startRow; row <= mapping.endRow; row++) {
    const coordinate = `${mapping.valueColumn}${row}`,
      dateCoordinate = `${mapping.dateColumn}${row}`;
    const c = lookup.get(coordinate),
      d = lookup.get(dateCoordinate);
    const raw = c?.formula !== null && c?.formula !== undefined ? c.cachedValue : c?.value;
    const originalDate =
      d?.formula !== null && d?.formula !== undefined ? d.cachedValue : (d?.value ?? null);
    const flags = [...(c?.flags ?? []), ...(d?.flags ?? []).map((f) => `date_${f}`)];
    const sourceDate = excelDate(originalDate, catalog.dateSystem);
    let sundayDate: string | null = null;
    if (sourceDate) {
      const day = new Date(`${sourceDate}T12:00:00Z`);
      if (day.getUTCDay() !== 0) flags.push("non_sunday_date");
      day.setUTCDate(day.getUTCDate() + ((7 - day.getUTCDay()) % 7));
      sundayDate = day.toISOString().slice(0, 10);
      if (sundayDate > snapshotDate) flags.push("future_relative_to_snapshot");
      if (seen.has(sundayDate)) flags.push("duplicate_week_in_mapping");
      seen.add(sundayDate);
    } else flags.push("missing_or_invalid_date");
    let value: number | null = null;
    if (raw === undefined || raw === null || raw.trim() === "") flags.push("missing_value");
    else if (
      /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) &&
      Number.isFinite(Number(raw))
    )
      value = Number(raw);
    else flags.push("non_numeric_value");
    if (value !== null && Number.isInteger(value) && !Number.isSafeInteger(value)) {
      value = null;
      flags.push("unsafe_numeric_precision");
    }
    if (merged(coordinate, ranges) || merged(dateCoordinate, ranges))
      flags.push("merged_or_shifted_cell");
    if (/forecast|prediction|pivot|yoy|trend/i.test(mapping.sheet))
      flags.push("legacy_derived_or_forecast");
    staged.push({
      sourceRow: row,
      sheet: mapping.sheet,
      coordinate,
      dateCoordinate,
      originalDate,
      sundayDate,
      value,
      formula: c?.formula ?? null,
      cachedValue: c?.cachedValue ?? null,
      calculationStatus: !c ? "missing" : c.formula !== null ? "cached_unverified" : "literal",
      flags: [...new Set(flags)],
    });
  }
  return staged;
}
