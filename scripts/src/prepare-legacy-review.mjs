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
export function buildReview(workbook, excelDate) {
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
    const diagnosticSum =
      firstValue !== null && secondValue !== null && Number.isSafeInteger(firstValue + secondValue)
        ? firstValue + secondValue
        : null;
    const totalValue = numeric(total),
      dashValue = numeric(dash);
    const spdDate = excelDate(raw(get("SPD", `A${row}`)), workbook.dateSystem);
    const complete = [diagnosticSum, totalValue, dashValue].every((v) => v !== null);
    adult.push({
      date,
      row,
      spdDate,
      first: firstValue,
      second: secondValue,
      diagnosticSum,
      total: totalValue,
      dash: dashValue,
      variance: totalValue !== null && dashValue !== null ? dashValue - totalValue : null,
      formula: dash?.formula ?? "",
      flags: [
        ...new Set(
          [first, second, total, dash, get("SPD", `A${row}`)].flatMap((c) => c?.flags ?? []),
        ),
      ],
      status:
        spdDate !== date
          ? "DATE_MISMATCH"
          : !complete
            ? "INCOMPLETE"
            : diagnosticSum === totalValue && totalValue === dashValue
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
Snapshot date is unconfirmed. Future-relative-to-snapshot checks have not run.
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
<li>Dash adult counts link to SPD. Matching cached copies are not independent
corroboration. The service-count sum below is diagnostic arithmetic, not an
approved metric definition or an evaluation of workbook formulas.</li>
<li>Of ${review.adult.length} 2026 adult rows,
${review.adult.filter((r) => r.status === "MATCHED_COPIES_UNAPPROVED").length}
have matching caches and diagnostic service-count sums;
${review.adult.filter((r) => r.status === "INCOMPLETE").length} are incomplete.
None has been independently reconciled or approved.</li>
<li>All Raw Data column A has ${review.rawDateCoverage.dates2026} interpreted dates
in 2026. Its observed date-axis coverage is
${escapeHtml(review.rawDateCoverage.first ?? "unknown")} to
${escapeHtml(review.rawDateCoverage.last ?? "unknown")}. This does not establish
the workbook snapshot date or the coverage of every historical tab.</li>
</ul></section>
<section><h2>Decisions required before approval</h2><ol>
<li>Confirm the workbook's export/as-of date, or obtain a dated replacement.</li>
<li>Confirm adult in-person semantics and whether SPD F/I are entered headcounts
and L their authoritative weekly total. The old 9:30 header is not proof of a
2026 service time. Online multipliers are excluded from this comparison.</li>
<li>Choose real sample weeks and confirm them against an independent source.
Resolve missing/error/shared-formula issues rather than approving copied totals.</li>
<li>Review the remaining ministry and historical column definitions in batches.
Every column remains UNREVIEWED; forecast outputs are not historical truth.
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
timestamps. Counts are source headcounts/caches with unapproved definitions.
Blank or invalid values remain unknown. Zero is preserved only when explicit.</p>
<p>For row r, columns are SPD!Fr, SPD!Ir, SPD!Lr and Dash!Cr.
SPD!Ar must agree with Dash!Ar; their shared row number alone is not a valid join.</p>
${table(
  [
    "Date / row",
    "First count",
    "Second count",
    "Diagnostic sum",
    "SPD cache",
    "Dash cache",
    "Dash − SPD",
    "Status / flags",
    "Dash formula",
  ],
  review.adult.map((r) => [
    r.date + " / " + r.row,
    r.first,
    r.second,
    r.diagnosticSum,
    r.total,
    r.dash,
    r.variance,
    r.status + "; " + r.flags.join(", "),
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
    throw new Error("Usage: pnpm exec tsx scripts/src/prepare-legacy-review.mjs <workbook.xlsx>");
  const { readWorkbook, excelDate, digest } =
    await import("../../artifacts/api-server/src/lib/workbook.ts");
  const bytes = await fs.readFile(filename),
    workbook = readWorkbook(bytes);
  const sha256 = digest(bytes),
    review = buildReview(workbook, excelDate);
  const source = { filename: path.basename(filename), sha256, dateSystem: workbook.dateSystem };
  const directory = path.join("generated-artifacts", "phase2-review", sha256);
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
        "",
        "",
        "",
        "",
        "",
        "",
        "UNREVIEWED",
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
        "spd_F",
        "spd_I",
        "diagnostic_sum",
        "spd_L_cache",
        "dash_C_cache",
        "dash_minus_spd",
        "status",
        "flags",
        "dash_formula",
      ],
      ...review.adult.map((r) => [
        r.date,
        r.row,
        r.spdDate,
        r.first,
        r.second,
        r.diagnosticSum,
        r.total,
        r.dash,
        r.variance,
        r.status,
        r.flags.join(";"),
        r.formula,
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
