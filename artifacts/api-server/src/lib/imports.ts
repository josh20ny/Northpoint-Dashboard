import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  ImportMappingInput,
  ImportMapping,
  ImportReport,
  ImportWeek,
  StagedImportRow,
  ImportReviewMethod,
  ImportEvidenceReview,
} from "@workspace/api-zod";
import type { Principal } from "./auth";
import { adminTransaction, AccessError, validCalendarDate } from "./administration";
import { recordAudit } from "./audit";
import { digest, readWorkbook, stageRows, columnNumber, type Catalog } from "./workbook";
import { originalWorkbook, importStorageReady } from "./import-storage";
import { trackedOriginal, withImportLock } from "./import-attempts";

type Batch = {
  id: string;
  sha256: string;
  filename: string;
  snapshotDate: string;
  state: "active" | "withdrawn";
  createdAt: string;
  objectPath: string;
  catalog: Catalog;
};
const batchSelect = `id,sha256,filename,snapshot_date AS "snapshotDate",state,created_at AS "createdAt",object_path AS "objectPath",catalog`;
const publicBatch = ({ objectPath: _objectPath, catalog: _catalog, ...v }: Batch) =>
  JSON.parse(JSON.stringify(v));
async function batch(c: PoolClient, id: string, active = true): Promise<Batch> {
  const r = await c.query<Batch>(`SELECT ${batchSelect} FROM import_batches WHERE id=$1`, [id]);
  const b = r.rows[0];
  if (!b) throw new AccessError(404, "Import batch not found");
  if (active && b.state !== "active")
    throw new AccessError(409, "Restore this withdrawn batch before continuing");
  return b;
}
async function audit(c: PoolClient, p: Principal, action: string, id: string) {
  await recordAudit(p.userId!, `import.${action}`, "import_batch", id, "success", c);
}
export async function listImports(p: Principal) {
  return adminTransaction(p, async (c) => {
    const r = await c.query<Batch>(
      `SELECT ${batchSelect} FROM import_batches ORDER BY created_at DESC LIMIT 100`,
    );
    await recordAudit(p.userId!, "import.list", "imports", null, "success", c);
    return { storageReady: importStorageReady(), batches: r.rows.map(publicBatch) };
  });
}
export async function listImportUploads(p: Principal, page: number) {
  return adminTransaction(p, async (c) => {
    const r = await c.query(
      `SELECT a.id,a.sha256,a.filename,a.snapshot_date AS "snapshotDate",
       a.object_path AS "objectPath",a.status,a.storage_state AS "storageState",
       a.failure_phase AS "failurePhase",b.id AS "linkedBatchId",
       a.created_at AS "createdAt",a.updated_at AS "updatedAt"
       FROM import_upload_attempts a LEFT JOIN import_batches b ON b.object_path=a.object_path
       ORDER BY (b.id IS NULL) DESC,a.created_at DESC,a.id DESC LIMIT 51 OFFSET $1`,
      [(page - 1) * 50],
    );
    await recordAudit(
      p.userId!,
      "import.uploads_read",
      "import_upload_attempts",
      null,
      "success",
      c,
    );
    return JSON.parse(
      JSON.stringify({
        attempts: r.rows.slice(0, 50),
        page,
        hasMore: r.rows.length > 50,
      }),
    );
  });
}
export async function catalogWorkbook(
  p: Principal,
  bytes: Buffer,
  filename: string,
  snapshotDate: string,
) {
  if (
    !filename.toLowerCase().endsWith(".xlsx") ||
    filename.length > 180 ||
    !filename.trim() ||
    /[/\\]/.test(filename) ||
    [...filename].some((c) => c.charCodeAt(0) < 32)
  )
    throw new AccessError(400, "Use a plain .xlsx filename");
  if (
    !validCalendarDate(snapshotDate) ||
    snapshotDate >
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())
  )
    throw new AccessError(400, "Enter the workbook snapshot date, not a future date");
  // Check actual local access before expensive parsing or confidential storage.
  await adminTransaction(p, async () => undefined);
  const hash = digest(bytes);
  const parsed = readWorkbook(bytes);
  return withImportLock(`${hash}:${snapshotDate}`, async (connection) => {
    const matched = await adminTransaction(
      p,
      async (c) => {
        const existing = await c.query<Batch>(
          `SELECT ${batchSelect} FROM import_batches WHERE sha256=$1 AND snapshot_date=$2`,
          [hash, snapshotDate],
        );
        if (existing.rows[0]) {
          await audit(c, p, "reimport_matched", existing.rows[0].id);
          return publicBatch(existing.rows[0]);
        }
        if ((await c.query("SELECT id FROM import_batches LIMIT 100")).rowCount! >= 100)
          throw new AccessError(
            409,
            "Import workspace is limited to 100 batches; review retention before adding more",
          );
        return null;
      },
      connection,
    );
    if (matched) return matched;
    return trackedOriginal(
      p,
      connection,
      { sha256: hash, filename, snapshotDate },
      bytes,
      async (c, objectPath) => {
        // Recheck the workspace limit at commit time (other digests may have completed).
        if ((await c.query("SELECT id FROM import_batches LIMIT 100")).rowCount! >= 100)
          throw new AccessError(
            409,
            "Import workspace is limited to 100 batches; review retention before adding more",
          );
        const id = randomUUID();
        const catalog: Catalog = { dateSystem: parsed.dateSystem, sheets: parsed.sheets };
        const r = await c.query<Batch>(
          `INSERT INTO import_batches(id,sha256,filename,snapshot_date,object_path,catalog,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${batchSelect}`,
          [id, hash, filename, snapshotDate, objectPath, JSON.stringify(catalog), p.userId],
        );
        for (let offset = 0; offset < parsed.cells.length; offset += 1000) {
          await c.query(
            `INSERT INTO import_cells(batch_id,sheet,coordinate,cell)
        SELECT $1,x.sheet,x.cell->>'coordinate',x.cell FROM jsonb_to_recordset($2::jsonb) AS x(sheet text,cell jsonb)`,
            [id, JSON.stringify(parsed.cells.slice(offset, offset + 1000))],
          );
        }
        await audit(c, p, "cataloged", id);
        return publicBatch(r.rows[0]!);
      },
    );
  });
}
async function mappings(c: PoolClient, id: string): Promise<ImportMapping[]> {
  const r = await c.query<ImportMapping>(
    `SELECT m.id,m.definition,m.status,m.review_note AS "reviewNote",
    (SELECT count(*)::int FROM import_staged_rows r WHERE r.mapping_id=m.id) AS "stagedCount"
    FROM import_mappings m WHERE m.batch_id=$1 ORDER BY m.created_at,m.id`,
    [id],
  );
  return r.rows;
}
export async function importDetail(p: Principal, id: string) {
  return adminTransaction(p, async (c) => {
    const b = await batch(c, id, false);
    await audit(c, p, "read", id);
    return { batch: publicBatch(b), ...b.catalog, mappings: await mappings(c, id) };
  });
}
export async function importCells(p: Principal, id: string, sheet: string, page: number) {
  return adminTransaction(p, async (c) => {
    const b = await batch(c, id);
    if (!b.catalog.sheets.some((s) => s.name === sheet))
      throw new AccessError(404, "Worksheet not found");
    const r = await c.query(
      `SELECT cell FROM import_cells WHERE batch_id=$1 AND sheet=$2
      ORDER BY (cell->>'row')::int,length(cell->>'column'),cell->>'column' LIMIT 101 OFFSET $3`,
      [id, sheet, (page - 1) * 100],
    );
    await audit(c, p, "cells_read", id);
    return { cells: r.rows.slice(0, 100).map((r) => r.cell), page, hasMore: r.rows.length > 100 };
  });
}
export async function downloadOriginal(p: Principal, id: string) {
  const b = await adminTransaction(p, async (c) => {
    const b = await batch(c, id);
    await audit(c, p, "original_downloaded", id);
    return b;
  });
  return { bytes: await originalWorkbook(b.objectPath), filename: b.filename };
}
export async function changeImportState(p: Principal, id: string, state: string, note: string) {
  await adminTransaction(p, async (c) => {
    await batch(c, id, false);
    await c.query("UPDATE import_batches SET state=$2 WHERE id=$1", [id, state]);
    // Notes are confidential review records, not included in general audit payloads.
    await c.query(
      `INSERT INTO import_week_reviews(batch_id,week,evidence_hash,note,reviewed_by)
      VALUES($1,'lifecycle',$2,$3,$4) ON CONFLICT DO NOTHING`,
      [id, digest(`${state}:${note}`), `${state}: ${note}`, p.userId],
    );
    await audit(c, p, state === "active" ? "restored" : "withdrawn", id);
  });
}
export async function createMapping(p: Principal, id: string, input: ImportMappingInput) {
  return adminTransaction(p, async (c) => {
    const b = await batch(c, id);
    const sheet = b.catalog.sheets.find((s) => s.name === input.sheet);
    if (
      !sheet ||
      input.endRow < input.startRow ||
      input.endRow - input.startRow >= 1000 ||
      input.endRow > sheet.maxRow ||
      columnNumber(input.valueColumn) > 16384 ||
      columnNumber(input.dateColumn) > 16384 ||
      input.valueColumn === input.dateColumn
    )
      throw new AccessError(
        400,
        "Choose an existing sheet, different date/value columns and up to 1,000 existing rows",
      );
    const existing = await mappings(c, id);
    if (
      existing.length >= 1000 ||
      existing.filter((m) => m.status === "approved" || m.status === "draft").length >= 250
    )
      throw new AccessError(409, "Mapping review limit reached");
    if (
      input.supersedes &&
      !existing.some((m) => m.id === input.supersedes && m.status !== "superseded")
    )
      throw new AccessError(400, "Select an existing current mapping version to replace");
    if (
      existing.some(
        (m) =>
          (m.status === "draft" || m.status === "approved") &&
          m.id !== input.supersedes &&
          m.definition.sheet === input.sheet &&
          m.definition.valueColumn === input.valueColumn &&
          m.definition.target === input.target &&
          m.definition.unit === input.unit &&
          m.definition.ministry === input.ministry &&
          m.definition.startRow <= input.endRow &&
          m.definition.endRow >= input.startRow,
      )
    )
      throw new AccessError(
        409,
        "Overlapping mapping exists; create an explicit replacement version",
      );
    const r = await c.query(
      `INSERT INTO import_mappings(batch_id,definition) VALUES($1,$2)
      RETURNING id,definition,status,review_note AS "reviewNote",0 AS "stagedCount"`,
      [id, JSON.stringify(input)],
    );
    await audit(c, p, "mapping_drafted", id);
    return r.rows[0];
  });
}
async function mapping(c: PoolClient, id: string, mappingId: string) {
  const rows = await mappings(c, id);
  const m = rows.find((m) => m.id === mappingId);
  if (!m) throw new AccessError(404, "Mapping not found");
  return m;
}
export async function reviewMapping(
  p: Principal,
  id: string,
  mappingId: string,
  decision: string,
  note: string,
) {
  await adminTransaction(p, async (c) => {
    await batch(c, id);
    const m = await mapping(c, id, mappingId);
    if (m.status !== "draft")
      throw new AccessError(409, "This version has already been reviewed; create a new version");
    if (decision === "approved" && m.definition.supersedes) {
      const old = await mapping(c, id, m.definition.supersedes);
      if (old.status === "superseded")
        throw new AccessError(409, "The replaced version changed; create a new draft");
      await c.query("UPDATE import_mappings SET status='superseded' WHERE id=$1", [old.id]);
    }
    await c.query(
      "UPDATE import_mappings SET status=$2,review_note=$3,reviewed_by=$4 WHERE id=$1",
      [mappingId, decision, note, p.userId],
    );
    await audit(c, p, `mapping_${decision}`, id);
  });
}
export async function stageMapping(p: Principal, id: string, mappingId: string) {
  await adminTransaction(p, async (c) => {
    const b = await batch(c, id);
    const m = await mapping(c, id, mappingId);
    if (m.status !== "approved")
      throw new AccessError(409, "Approve this mapping version before staging");
    const cells = await c.query("SELECT cell FROM import_cells WHERE batch_id=$1 AND sheet=$2", [
      id,
      m.definition.sheet,
    ]);
    const rows = stageRows(
      m.definition,
      cells.rows.map((r) => r.cell),
      b.catalog,
      b.snapshotDate,
    );
    await c.query(
      `INSERT INTO import_staged_rows(mapping_id,source_row,data)
      SELECT $1,x.value->>'sourceRow',x.value FROM jsonb_array_elements($2::jsonb) AS x(value)
      ON CONFLICT(mapping_id,source_row) DO NOTHING`,
      [mappingId, JSON.stringify(rows)],
    );
    await audit(c, p, "mapping_staged", id);
    // Source-level authority replaces per-week publication. Only approved,
    // explicitly mapped, usable adult observations are imported by this module.
    const accepted = await c.query("SELECT 1 FROM workbook_source_authorities WHERE batch_id=$1", [
      id,
    ]);
    const definition = await c.query(
      "SELECT id FROM attendance_definitions ORDER BY version DESC LIMIT 1",
    );
    if (accepted.rowCount && definition.rowCount) {
      await c.query("SELECT pg_advisory_xact_lock(716104)");
      const { importAuthorizedWorkbook } = await import("./attendance-workbook");
      const result = await importAuthorizedWorkbook(c, id, definition.rows[0].id, true);
      if (result.conflicts.length)
        throw new AccessError(
          409,
          "Workbook attendance conflicts with an existing correction or another source; no staging changes were committed",
        );
    }
  });
}
export async function stagedRows(p: Principal, id: string, mappingId: string, page: number) {
  return adminTransaction(p, async (c) => {
    await batch(c, id);
    await mapping(c, id, mappingId);
    const r = await c.query(
      "SELECT data FROM import_staged_rows WHERE mapping_id=$1 ORDER BY source_row::int LIMIT 101 OFFSET $2",
      [mappingId, (page - 1) * 100],
    );
    await audit(c, p, "staged_rows_read", id);
    return { rows: r.rows.slice(0, 100).map((r) => r.data), page, hasMore: r.rows.length > 100 };
  });
}
export type EvidenceRow = {
  mappingId: string;
  definition: ImportMappingInput;
  data: StagedImportRow;
};
export function buildReport(
  rows: EvidenceRow[],
  approvals: ({ week: string; evidenceHash: string } & Partial<ImportEvidenceReview>)[],
): ImportReport {
  const groups = new Map<string, ImportWeek>();
  for (const { mappingId, definition: d, data } of rows) {
    if (!data.sundayDate) continue;
    const key = JSON.stringify([data.sundayDate, d.target, d.unit, d.ministry]);
    let group = groups.get(key);
    if (!group) {
      group = {
        week: data.sundayDate,
        target: d.target,
        unit: d.unit,
        ministry: d.ministry,
        evidence: [],
        variance: null,
        flags: [],
        evidenceHash: "",
        approved: false,
      };
      groups.set(key, group);
    }
    group.evidence.push({
      mappingId,
      sheet: data.sheet,
      coordinate: data.coordinate,
      value: data.value,
      flags: data.flags,
    });
    group.flags.push(...data.flags);
  }
  const weeks = [...groups.values()].sort(
    (a, b) => a.week.localeCompare(b.week) || a.target.localeCompare(b.target),
  );
  for (const g of weeks) {
    const sourceKeys = new Set(g.evidence.map((e) => `${e.sheet}:${e.coordinate}`));
    const numbers = g.evidence.map((e) => e.value).filter((n): n is number => n !== null);
    if (sourceKeys.size < 2) g.flags.push("insufficient_comparison_sources");
    if (sourceKeys.size !== g.evidence.length) g.flags.push("duplicate_source_cell");
    if (numbers.length > 1) g.variance = Math.max(...numbers) - Math.min(...numbers);
    if (g.variance !== null && g.variance !== 0) g.flags.push("source_conflict");
    if (new Set(g.evidence.map((e) => e.mappingId)).size < g.evidence.length)
      g.flags.push("duplicate_week_in_mapping");
    g.flags = [...new Set(g.flags)].sort();
    g.evidence.sort(
      (a, b) => a.mappingId.localeCompare(b.mappingId) || a.coordinate.localeCompare(b.coordinate),
    );
    g.evidenceHash = digest(JSON.stringify({ ...g, evidenceHash: "", approved: false }));
    // Hash only source evidence, never review metadata: retain historical hashes.
    const review = approvals.find((a) => a.week === g.week && a.evidenceHash === g.evidenceHash);
    g.approved = !!review;
    g.approval =
      review?.reviewedBy && review.reviewedAt && review.note
        ? {
            method: review.method ?? "two_source",
            note: review.note,
            reviewedBy: review.reviewedBy,
            reviewedAt: review.reviewedAt,
          }
        : null;
  }
  const weekDates = [...new Set(weeks.map((w) => w.week))];
  return {
    weeks,
    stagedRows: rows.length,
    flaggedRows: rows.filter((r) => r.data.flags.length).length,
    approvedWeeks: weekDates.filter((date) =>
      weeks.filter((w) => w.week === date).every((w) => w.approved),
    ).length,
  };
}
export async function evidence(c: PoolClient, id: string) {
  const r = await c.query<EvidenceRow>(
    `SELECT m.id AS "mappingId",m.definition,r.data FROM import_mappings m
    JOIN import_staged_rows r ON r.mapping_id=m.id WHERE m.batch_id=$1 AND m.status='approved'
    ORDER BY m.id,r.source_row::int`,
    [id],
  );
  const a = await c.query<{ week: string; evidenceHash: string } & ImportEvidenceReview>(
    `SELECT week,evidence_hash AS "evidenceHash",review_method AS method,note,
      reviewed_by AS "reviewedBy",created_at AS "reviewedAt"
      FROM import_week_reviews WHERE batch_id=$1 ORDER BY created_at,id`,
    [id],
  );
  return { rows: r.rows, report: buildReport(r.rows, a.rows) };
}
export async function importReport(p: Principal, id: string) {
  return adminTransaction(p, async (c) => {
    await batch(c, id);
    const e = await evidence(c, id);
    await audit(c, p, "report_read", id);
    return e.report;
  });
}
const blocking =
  /missing|invalid|future|external|error|non_numeric|non_sunday|merged|forecast|duplicate|conflict|insufficient|shared_formula|unsafe_numeric/;
export function validateWeekReview(
  group: ImportWeek,
  note: string,
  method: ImportReviewMethod = "two_source",
  ownerConfirmed = false,
) {
  if (method !== "two_source" && method !== "owner_confirmed")
    throw new AccessError(400, "Choose a supported review method");
  if (note.trim().length < (method === "owner_confirmed" ? 20 : 10) || note.length > 1000)
    throw new AccessError(400, "Explain the review basis (20 characters for owner confirmation)");
  if (method === "owner_confirmed") {
    if (!ownerConfirmed)
      throw new AccessError(400, "Explicitly confirm the owner verified these exact values");
    if (
      !["adult_service_1", "adult_service_2"].includes(group.target) ||
      group.unit !== "attendance_count"
    )
      throw new AccessError(409, "Owner confirmation is enabled only for adult service attendance");
    if (
      !group.evidence.length ||
      group.evidence.some((e) => e.value === null || !Number.isSafeInteger(e.value) || e.value < 0)
    )
      throw new AccessError(409, "Owner confirmation requires known nonnegative attendance counts");
    if (group.flags.some((f) => f !== "insufficient_comparison_sources" && blocking.test(f)))
      throw new AccessError(409, "Resolve flagged evidence before owner confirmation");
    // Only the missing second-source requirement is waived, never a conflict.
    if (group.variance !== null && group.variance !== 0)
      throw new AccessError(409, "Resolve conflicting sources before owner confirmation");
  } else if (group.variance !== 0 || group.flags.some((f) => blocking.test(f))) {
    throw new AccessError(
      409,
      "Resolve flagged sources and compare at least two distinct source cells before approving",
    );
  }
}
export async function approveWeek(
  p: Principal,
  id: string,
  week: string,
  evidenceHash: string,
  note: string,
  method: ImportReviewMethod = "two_source",
  ownerConfirmed = false,
) {
  await adminTransaction(p, async (c) => {
    await batch(c, id);
    const e = await evidence(c, id);
    const group = e.report.weeks.find((w) => w.week === week && w.evidenceHash === evidenceHash);
    if (!group) throw new AccessError(409, "Evidence changed; reload the report before reviewing");
    validateWeekReview(group, note, method, ownerConfirmed);
    await c.query(
      `INSERT INTO import_week_reviews(batch_id,week,evidence_hash,note,reviewed_by,review_method)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [id, week, evidenceHash, note.trim(), p.userId, method],
    );
    await audit(c, p, method === "owner_confirmed" ? "week_owner_confirmed" : "week_approved", id);
  });
}
export function csv(rows: unknown[][]) {
  // Prevent spreadsheet formula injection when opening exported review artifacts.
  return rows
    .map((row) =>
      row
        .map((v) => {
          let s = v === null || v === undefined ? "" : String(v);
          if (/^[\s]*[=+\-@\t\r]/.test(s)) s = `'${s}`;
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}
export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export async function exportReport(p: Principal, id: string, kind: string) {
  return adminTransaction(p, async (c) => {
    await batch(c, id);
    const { report, rows } = await evidence(c, id);
    const maps = await mappings(c, id);
    await audit(c, p, "report_exported", id);
    if (kind === "report") {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Historical source reconciliation</title><style>body{font:15px system-ui;margin:32px;color:#223242}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:8px;text-align:left}small{display:block}</style></head><body><h1>Historical source reconciliation</h1><p>Review-only staging. No metrics published. ${report.approvedWeeks} complete reviewed weeks; ${report.flaggedRows} flagged rows.</p><table><tr><th>Sunday</th><th>Candidate</th><th>Source evidence</th><th>Variance</th><th>Review / flags</th></tr>${report.weeks.map((w) => `<tr><td>${escapeHtml(w.week)}</td><td>${escapeHtml(w.target)}<small>${escapeHtml(w.unit)} / ${escapeHtml(w.ministry)}</small></td><td>${w.evidence.map((e) => `${escapeHtml(e.sheet)}!${escapeHtml(e.coordinate)}: ${escapeHtml(e.value ?? "unknown")}`).join("<br>")}</td><td>${escapeHtml(w.variance ?? "not comparable")}</td><td>${w.approved ? "Approved evidence" : "Unreviewed"}<small>${escapeHtml(w.flags.join(", "))}</small></td></tr>`).join("")}</table></body></html>`;
      const reviews = report.weeks
        .filter((w) => w.approval)
        .map((w) => {
          const review = w.approval!;
          return `<section><h3>${escapeHtml(w.week)} — ${escapeHtml(w.target)}</h3>
          <p>${
            review.method === "owner_confirmed"
              ? "Owner-confirmed review — not independent two-source verification"
              : "Two-source comparison review"
          }</p>
          <p>${escapeHtml(review.note)}</p>
          <p>Reviewer: ${escapeHtml(review.reviewedBy)} · ${escapeHtml(review.reviewedAt.toISOString())}</p>
          <p>Evidence: ${escapeHtml(w.evidenceHash)}</p></section>`;
        })
        .join("");
      return {
        content: html.replace("</body>", `<h2>Recorded reviews</h2>${reviews}</body>`),
        type: "text/html; charset=utf-8",
        filename: "variance_report.html",
      };
    }
    let output: unknown[][];
    let filename: string;
    if (kind === "mappings") {
      filename = "mapping_approved.csv";
      output = [
        [
          "mapping_version",
          "sheet",
          "column",
          "date_axis",
          "rows",
          "legacy_label",
          "candidate",
          "unit",
          "ministry",
          "semantics",
          "priority",
          "confidence",
          "review_note",
        ],
        ...maps
          .filter((m) => m.status === "approved")
          .map((m) => {
            const d = m.definition;
            return [
              m.id,
              d.sheet,
              d.valueColumn,
              d.dateColumn,
              `${d.startRow}:${d.endRow}`,
              d.legacyLabel,
              d.target,
              d.unit,
              d.ministry,
              d.semantics,
              d.priority,
              d.confidence,
              m.reviewNote,
            ];
          }),
      ];
    } else if (kind === "errors") {
      filename = "row_errors.csv";
      output = [
        ["mapping_version", "sheet", "cell", "date_cell", "original_date", "sunday", "flags"],
        ...rows
          .filter((r) => r.data.flags.length)
          .map((r) => [
            r.mappingId,
            r.data.sheet,
            r.data.coordinate,
            r.data.dateCoordinate,
            r.data.originalDate,
            r.data.sundayDate,
            r.data.flags.join(";"),
          ]),
      ];
    } else {
      filename = kind === "conflicts" ? "source_conflicts.csv" : "reconciled_weekly.csv";
      output = [
        [
          "sunday",
          "candidate",
          "unit",
          "ministry",
          "variance",
          "approved",
          "flags",
          "source_evidence",
          "review_method",
          "review_note",
          "reviewed_by",
          "reviewed_at",
        ],
        ...report.weeks
          .filter(
            (w) =>
              kind !== "conflicts" ||
              w.flags.includes("source_conflict") ||
              w.flags.some((f) => f.includes("duplicate")),
          )
          .map((w) => [
            w.week,
            w.target,
            w.unit,
            w.ministry,
            w.variance,
            w.approved,
            w.flags.join(";"),
            w.evidence
              .map((e) => `${e.sheet}!${e.coordinate}=${e.value ?? "unknown"} [${e.mappingId}]`)
              .join(";"),
            w.approval?.method ?? "",
            w.approval?.note ?? "",
            w.approval?.reviewedBy ?? "",
            w.approval?.reviewedAt.toISOString() ?? "",
          ]),
      ];
    }
    return { content: csv(output), type: "text/csv; charset=utf-8", filename };
  });
}
