import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const operating = new Set([
  "Dash",
  "Connection",
  "$$$",
  "WL",
  "US",
  "Transit",
  "IO",
  "SPD",
  "Communications",
]);
const adultSourceNames = { F: "adult_service_1", I: "adult_service_2" };
const raw = (cell) => (cell?.formula === null ? cell.value : (cell?.cachedValue ?? null));
const numeric = (cell) => {
  const value = raw(cell);
  if (
    cell?.flags.includes("spreadsheet_error") ||
    value === null ||
    String(value).trim() === "" ||
    !/^\d+(?:\.\d+)?$/.test(value)
  )
    return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
};
// Missing literal cells qualify; failed formulas and error cells do not.
const literalBlank = (cell) =>
  !cell ||
  (cell.formula === null &&
    !cell.flags.includes("spreadsheet_error") &&
    (cell.value === null || String(cell.value).trim() === ""));
export const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export function csv(rows) {
  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            if (/^\s*[=+\-@]|^[\t\r\n]/.test(text)) text = "'" + text;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n") + "\r\n"
  );
}

// Discovery only: never calls a repository, storage, evaluator or approval API.
export function buildReview(workbook, excelDate, snapshotDate = null, ownerNotes = {}) {
  if (
    snapshotDate !== null &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate) ||
      Number.isNaN(Date.parse(`${snapshotDate}T00:00:00Z`)) ||
      new Date(`${snapshotDate}T00:00:00Z`).toISOString().slice(0, 10) !== snapshotDate)
  )
    throw new Error("Snapshot must be a valid YYYY-MM-DD calendar date");
  const lookup = new Map(
    workbook.cells.map(({ sheet, cell }) => [JSON.stringify([sheet, cell.coordinate]), cell]),
  );
  const get = (sheet, coordinate) => lookup.get(JSON.stringify([sheet, coordinate]));
  const columns = new Map();
  const flags = {};
  for (const { sheet, cell } of workbook.cells) {
    for (const flag of cell.flags) flags[flag] = (flags[flag] ?? 0) + 1;
    const key = JSON.stringify([sheet, cell.column]);
    if (!columns.has(key)) {
      const header = operating.has(sheet) ? get(sheet, `${cell.column}2`) : undefined;
      columns.set(key, {
        sheet,
        column: cell.column,
        headerCoordinate: header?.coordinate ?? "",
        legacyLabel: header?.value ?? "",
        candidateMetric: sheet === "SPD" ? (adultSourceNames[cell.column] ?? "") : "",
        firstRow: cell.row,
        lastRow: cell.row,
        populated: 0,
        formulas: 0,
        external: 0,
        missingCaches: 0,
        errors: 0,
      });
    }
    const col = columns.get(key);
    col.firstRow = Math.min(col.firstRow, cell.row);
    col.lastRow = Math.max(col.lastRow, cell.row);
    col.populated++;
    col.formulas += Number(cell.formula !== null);
    col.external += Number(cell.flags.includes("external_dependency"));
    col.missingCaches += Number(cell.flags.includes("missing_formula_cache"));
    col.errors += Number(cell.flags.includes("spreadsheet_error"));
  }
  const adult = [];
  for (const { sheet, cell: dateCell } of workbook.cells) {
    if (sheet !== "Dash" || dateCell.column !== "A" || dateCell.row < 3) continue;
    const date = excelDate(raw(dateCell), workbook.dateSystem);
    if (!date?.startsWith("2026-")) continue;
    const row = dateCell.row;
    const first = get("SPD", `F${row}`),
      second = get("SPD", `I${row}`);
    const total = get("SPD", `L${row}`),
      dash = get("Dash", `C${row}`);
    const firstValue = numeric(first),
      secondValue = numeric(second);
    const sourceArithmeticSum =
      firstValue !== null && secondValue !== null && Number.isSafeInteger(firstValue + secondValue)
        ? firstValue + secondValue
        : null;
    const totalValue = numeric(total),
      dashValue = numeric(dash);
    const spdDate = excelDate(raw(get("SPD", `A${row}`)), workbook.dateSystem);
    const dated = snapshotDate !== null && spdDate === date;
    const future = dated && date > snapshotDate;
    const attendance = (cell, value) => (future ? null : dated && literalBlank(cell) ? 0 : value);
    const service1 = attendance(first, firstValue);
    const service2 = attendance(second, secondValue);
    const adultServicesTotal =
      service1 !== null && service2 !== null && Number.isSafeInteger(service1 + service2)
        ? service1 + service2
        : null;
    const pastZero = dated && !future && adultServicesTotal === 0;
    const ownerNote = spdDate === date ? (ownerNotes[date] ?? "") : "";
    const complete = [adultServicesTotal, totalValue, dashValue].every((v) => v !== null);
    adult.push({
      date,
      row,
      spdDate,
      adult_service_1: service1,
      adult_service_2: service2,
      rawAdultService1: firstValue,
      rawAdultService2: secondValue,
      adult_services_total: adultServicesTotal,
      sourceArithmeticSum,
      ownerNote,
      sourceStatus:
        spdDate !== date
          ? "DATE_MISMATCH"
          : future
            ? "FUTURE_NOT_RECORDED"
            : pastZero
              ? "ZERO_ATTENDANCE_NO_SERVICE_OR_CANCELLED"
              : adultServicesTotal === null
                ? "MISSING_INPUTS"
                : "INPUTS_PRESENT_UNAPPROVED",
      total: totalValue,
      dash: dashValue,
      variance: totalValue !== null && dashValue !== null ? dashValue - totalValue : null,
      formula: dash?.formula ?? "",
      flags: [
        ...new Set([
          ...[first, second, total, dash, get("SPD", `A${row}`)].flatMap((c) => c?.flags ?? []),
          ...(snapshotDate !== null && date > snapshotDate ? ["future_relative_to_snapshot"] : []),
        ]),
      ],
      snapshotStatus:
        snapshotDate === null
          ? "SNAPSHOT_UNCONFIRMED"
          : date > snapshotDate
            ? "FUTURE"
            : "WITHIN_SNAPSHOT",
      status:
        spdDate !== date
          ? "DATE_MISMATCH"
          : !complete
            ? "INCOMPLETE"
            : adultServicesTotal === totalValue && totalValue === dashValue
              ? "MATCHED_COPIES_UNAPPROVED"
              : "VALUE_MISMATCH",
    });
  }
  const rawDates = workbook.cells
    .filter((x) => x.sheet === "All Raw Data" && x.cell.column === "A" && x.cell.row > 1)
    .map((x) => excelDate(raw(x.cell), workbook.dateSystem))
    .filter(Boolean)
    .sort();
  return {
    snapshotDate,
    sheets: workbook.sheets,
    columns: [...columns.values()],
    flags,
    adult,
    populatedCells: workbook.cells.length,
    typedErrors: workbook.cells.filter((x) => x.cell.type === "e").length,
    rawDateCoverage: {
      first: rawDates[0] ?? null,
      last: rawDates.at(-1) ?? null,
      dates2026: rawDates.filter((d) => d.startsWith("2026-")).length,
    },
  };
}

const table = (headers, rows) =>
  `<div class="scroll"><table><thead><tr>${headers
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${row.map((value) => `<td>${escapeHtml(value ?? "unknown")}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table></div>`;

export function renderReview(review, source) {
  const counts = (flag) => review.flags[flag] ?? 0;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Northpoint — Phase 2 source review</title><style>
body{font:16px/1.55 system-ui,sans-serif;color:#223442;background:#f8f5f0;margin:0}
main{max-width:1150px;margin:auto;padding:32px 24px}h1,h2{line-height:1.2}
section{margin:28px 0;padding:24px;background:white;border:1px solid #ddd;border-radius:10px}
small,code{overflow-wrap:anywhere}.notice{border-left:4px solid #c94632;padding:16px;background:#fff}
.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:9px;text-align:left;vertical-align:top;border-bottom:1px solid #ddd}
th{background:#e7efec}td{max-width:390px;overflow-wrap:anywhere}
@media(max-width:600px){main{padding:16px}section{padding:14px}}
</style></head><body><main>
<h1>Phase 2 source review</h1>
<p class="notice"><strong>Draft — not approved or published.</strong>
${
  review.snapshotDate === null
    ? "Snapshot date is unconfirmed. Future-relative-to-snapshot checks have not run."
    : `Snapshot date: ${escapeHtml(review.snapshotDate)}. Later adult weeks are flagged, not deleted.
Snapshot checks here cover the 2026 adult date axis only; other columns require explicit date mappings.`
}
No workbook data has been cataloged, staged or approved by this review.</p>
<p>Source: ${escapeHtml(source.filename)}<br><small>SHA-256:
<code>${escapeHtml(source.sha256)}</code></small><br>Excel date system:
${escapeHtml(source.dateSystem)}. Whole-workbook metadata; no donor or person-level
values are included. Only the adult aggregate comparison below includes source counts.
No formulas were executed and no external dependencies were fetched.</p>
<section><h2>Findings</h2><ul>
<li>${review.sheets.length} sheets and ${review.populatedCells} populated cells inspected,
including hidden sheets. ${review.columns.length} populated columns inventoried.</li>
<li>${counts("external_dependency")} formulas reference external dependencies;
${counts("missing_formula_cache")} formulas lack cached results;
${counts("shared_formula_unresolved")} shared-formula followers are unresolved.
Flags overlap.</li>
<li>${review.typedErrors} typed Excel error cells, but ${counts("spreadsheet_error")}
cells contain error-like raw results. These are different checks; the old typed-error
count did not establish clean data.</li>
<li>The owner named SPD F <code>adult_service_1</code>, SPD I
<code>adult_service_2</code>, and their sum <code>adult_services_total</code>.
These names do not approve weekly values or publish a canonical metric.
SPD L and Dash C remain raw cached comparison columns with unconfirmed meanings.
Dash formulas reference SPD L; matching caches are not independent corroboration.
Workbook formulas have not been evaluated.</li>
${review.adult
  .filter((r) => r.ownerNote)
  .map(
    (r) =>
      `<li>${escapeHtml(r.date)}: ${escapeHtml(r.ownerNote)} Original F/I values and their arithmetic sum are preserved. Owner context does not approve other weeks or establish whether services were cancelled.</li>`,
  )
  .join("")}
<li>Of ${review.adult.length} 2026 adult rows,
${review.adult.filter((r) => r.status === "MATCHED_COPIES_UNAPPROVED").length}
have matching caches and diagnostic service-count sums;
${review.adult.filter((r) => r.status === "INCOMPLETE").length} are incomplete.
None has been independently reconciled or approved.</li>
${
  review.snapshotDate === null
    ? ""
    : `<li>${
        review.adult.filter((r) => r.snapshotStatus === "FUTURE").length
      } adult weeks are later than the snapshot. ${
        review.adult.filter(
          (r) => r.snapshotStatus === "WITHIN_SNAPSHOT" && r.status === "INCOMPLETE",
        ).length
      } incomplete cached comparisons fall on or before the snapshot. Missing future weeks are not past attendance gaps.</li>`
}
<li>All Raw Data column A has ${review.rawDateCoverage.dates2026} interpreted dates
in 2026. Its observed date-axis coverage is
${escapeHtml(review.rawDateCoverage.first ?? "unknown")} to
${escapeHtml(review.rawDateCoverage.last ?? "unknown")}. This does not establish
the workbook snapshot date or the coverage of every historical tab.</li>
</ul></section>
<section><h2>Decisions required before approval</h2><ol>
<li>${
    review.snapshotDate === null
      ? "Confirm the workbook's export/as-of date, or obtain a dated replacement."
      : `Keep the owner-confirmed ${escapeHtml(review.snapshotDate)} snapshot date with the original-file provenance.`
  }</li>
<li>Retain the owner-confirmed names: SPD F → adult_service_1; SPD I →
adult_service_2; their sum → adult_services_total. Confirm any additional
counting semantics before publication. Do not infer that SPD L is authoritative
or equivalent to adult_services_total. The old 9:30 header is not proof of a
2026 service time. Online multipliers are excluded from this comparison.</li>
<li>Choose real sample weeks and confirm them against an independent source.
Resolve missing/error/shared-formula issues rather than approving copied totals.</li>
<li>Review the remaining ministry and historical column definitions in batches.
Only SPD F/I have owner-confirmed source names; their values remain unapproved.
Other columns remain UNREVIEWED; forecast outputs are not historical truth.
Giving/person-level data stays outside this packet.</li>
</ol></section>
<section><h2>All-sheet quality inventory</h2>
${table(
  ["Sheet", "Visibility", "Populated", "Formulas", "External", "Error-like cells", "Merged ranges"],
  review.sheets.map((s) => [
    s.name,
    s.state,
    s.cellCount,
    s.formulas,
    s.externalFormulas,
    s.errors,
    s.merges.length,
  ]),
)}
</section><section><h2>Adult in-person comparison — every 2026 date in Dash A</h2>
<p>Dates are workbook calendar dates (America/Chicago reporting convention), not
timestamps. Source names follow the owner's correction; additional counting
semantics and weekly values remain unapproved. SPD L/Dash C are comparison caches only.
Owner rule: on or before the snapshot date, blank or zero attendance inputs mean
zero attendance (no service or cancelled service). Future attendance is not yet
recorded and is excluded from actuals. Original inputs are retained separately.
Without a confirmed snapshot or matching source date, blanks remain unknown.
Formula failures, missing formula caches and invalid values remain unknown.</p>
<p>For row r, columns are SPD!Fr, SPD!Ir, SPD!Lr and Dash!Cr.
SPD!Ar must agree with Dash!Ar; their shared row number alone is not a valid join.</p>
${table(
  [
    "Date / row",
    "adult_service_1 (SPD F)",
    "adult_service_2 (SPD I)",
    "adult_services_total (F + I)",
    "Original F + I arithmetic",
    "Raw SPD F",
    "Raw SPD I",
    "Owner context",
    "SPD L cache — meaning unconfirmed",
    "Dash C cache — meaning unconfirmed",
    "Dash − SPD",
    "Status / flags",
    "Dash formula",
  ],
  review.adult.map((r) => [
    r.date + " / " + r.row,
    r.adult_service_1,
    r.adult_service_2,
    r.adult_services_total,
    r.sourceArithmeticSum,
    r.rawAdultService1,
    r.rawAdultService2,
    r.ownerNote,
    r.total,
    r.dash,
    r.variance,
    r.snapshotStatus +
      "; " +
      r.sourceStatus +
      "; comparison: " +
      r.status +
      "; " +
      r.flags.join(", "),
    r.formula,
  ]),
)}
</section><p>This offline packet is a review aid, not an import approval.
Column inventory and comparisons accompany it as CSV files. No public app
routes, credentials, private storage references, raw giving amounts, personal
identities or provider URLs are embedded.</p></main></body></html>`;
}

async function main() {
  const filename = process.argv[2];
  if (!filename)
    throw new Error(
      "Usage: pnpm exec tsx scripts/src/prepare-legacy-review.mjs <workbook.xlsx> [YYYY-MM-DD]",
    );
  const snapshotDate = process.argv[3] ?? null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(
    new Date(),
  );
  if (snapshotDate !== null && snapshotDate > today)
    throw new Error("Snapshot cannot be later than today in America/Chicago");
  const { readWorkbook, excelDate, digest } =
    await import("../../artifacts/api-server/src/lib/workbook.ts");
  const bytes = await fs.readFile(filename),
    workbook = readWorkbook(bytes);
  const sha256 = digest(bytes);
  // Owner context applies only to the reviewed immutable workbook, not other uploads.
  const ownerNotes =
    sha256 === "c925d771b67c4503ad46d5919000fcb5744c164fc1683a441055b11a1c70a1b3"
      ? {
          "2026-01-25":
            "The owner clarified that in-person attendance was zero; ice-storm context retained.",
        }
      : {};
  const review = buildReview(workbook, excelDate, snapshotDate, ownerNotes);
  const source = { filename: path.basename(filename), sha256, dateSystem: workbook.dateSystem };
  const directory = path.join(
    "generated-artifacts",
    "phase2-review",
    sha256,
    snapshotDate ?? "undated",
    "owner-named-adult-sources",
  );
  await fs.mkdir(directory, { recursive: true });
  const html = renderReview(review, source);
  if (Buffer.byteLength(html, "utf8") > 5 * 1024 * 1024)
    throw new Error("Review exceeds 5 MiB; nothing delivered");
  await fs.writeFile(path.join(directory, "source-review.html"), html);
  await fs.writeFile(
    path.join(directory, "column-inventory-unreviewed.csv"),
    csv([
      [
        "sheet",
        "column",
        "header_coordinate",
        "legacy_label",
        "first_populated_row",
        "last_populated_row",
        "populated_cells",
        "formulas",
        "external_formulas",
        "missing_caches",
        "error_like_cells",
        "candidate_metric",
        "unit",
        "ministry",
        "source_semantics",
        "source_priority",
        "confidence",
        "status",
      ],
      ...review.columns.map((c) => [
        c.sheet,
        c.column,
        c.headerCoordinate,
        c.legacyLabel,
        c.firstRow,
        c.lastRow,
        c.populated,
        c.formulas,
        c.external,
        c.missingCaches,
        c.errors,
        c.candidateMetric,
        "",
        "",
        "",
        "",
        "",
        c.candidateMetric ? "OWNER_NAMED_VALUES_UNAPPROVED" : "UNREVIEWED",
      ]),
    ]),
  );
  await fs.writeFile(
    path.join(directory, "adult-comparison-unapproved.csv"),
    csv([
      [
        "week",
        "row",
        "spd_week",
        "adult_service_1",
        "adult_service_2",
        "adult_services_total",
        "spd_L_cache",
        "dash_C_cache",
        "dash_minus_spd",
        "comparison_status",
        "flags",
        "dash_formula",
        "snapshot_date",
        "snapshot_status",
        "source_status",
        "source_arithmetic_sum",
        "owner_context",
        "raw_spd_F",
        "raw_spd_I",
      ],
      ...review.adult.map((r) => [
        r.date,
        r.row,
        r.spdDate,
        r.adult_service_1,
        r.adult_service_2,
        r.adult_services_total,
        r.total,
        r.dash,
        r.variance,
        r.status,
        r.flags.join(";"),
        r.formula,
        snapshotDate,
        r.snapshotStatus,
        r.sourceStatus,
        r.sourceArithmeticSum,
        r.ownerNote,
        r.rawAdultService1,
        r.rawAdultService2,
      ]),
    ]),
  );
  // Metadata/counts only; never print source cell values or formulas.
  console.log(
    JSON.stringify(
      {
        directory,
        sheets: review.sheets.length,
        columns: review.columns.length,
        populatedCells: review.populatedCells,
        flags: review.flags,
        typedErrors: review.typedErrors,
        adultWeeks: review.adult.length,
        adultStatuses: review.adult.reduce((a, r) => {
          a[r.status] = (a[r.status] ?? 0) + 1;
          return a;
        }, {}),
        rawDateCoverage: review.rawDateCoverage,
        htmlBytes: Buffer.byteLength(html),
      },
      null,
      2,
    ),
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("Review generation failed; no approval or import was performed.");
    process.exitCode = 1;
  });
}
