/**
 * Preview or publish the owner-approved Giving workbook measures by their
 * source periods. Uses the reviewed Imports mappings and lineage validator;
 * reads aggregate workbook cells only and never touches a PCO sync.
 */
import { pool } from "@workspace/db";
import type { ImportMappingInput, WorkbookCell } from "@workspace/api-zod";
import { createMapping, reviewMapping, stageMapping } from "../lib/imports";
import { importMinistryHistory } from "../lib/ministry-data";
import type { Catalog } from "../lib/workbook";
import { buildGivingWorkbookPeriodHistory } from "../lib/giving-workbook-period-history";

const apply = process.argv.includes("--apply");
const approvalNote =
  "Owner accepted these source-labeled Giving period measures for historical display.";

type Actor = Parameters<typeof createMapping>[0];
type Entry = {
  label: string;
  column: string;
  dateColumn: string;
  startRow: number;
  endRow: number;
  measure: string;
  unit: string;
  period: "week" | "month";
  sourceYear?: number;
  alignedYear?: number;
  semantics: string;
};
type ExistingMapping = {
  id: string;
  status: string;
  definition: ImportMappingInput;
  stagedCount: number;
};
type PlannedEntry = Entry & {
  status: "create" | "approve" | "stage" | "reuse";
  mappingId?: string;
};

const entries: Entry[] = [
  ...[
    ["B", 2022],
    ["C", 2023],
    ["E", 2024],
    ["G", 2025],
  ].map(([column, year]) => ({
    label: `Monthly recurring gifts ${year} (workbook)`,
    column: String(column),
    dateColumn: "A",
    startRow: 101,
    endRow: 112,
    measure: "legacy_monthly_recurring_giving",
    unit: "USD",
    period: "month" as const,
    sourceYear: Number(year),
    semantics:
      "Accepted workbook-defined monthly recurring-gift dollar subtotal. Keep separate from General Giving; source values are USD.",
  })),
  ...[
    ["B", 2021],
    ["C", 2022],
    ["D", 2023],
    ["E", 2024],
    ["F", 2025],
    ["G", 2026],
  ].map(([column, year]) => ({
    label: `Giving people per week ${year} (workbook)`,
    column: String(column),
    dateColumn: "A",
    startRow: 118,
    endRow: 169,
    measure: "legacy_giving_people",
    unit: "people",
    period: "week" as const,
    alignedYear: Number(year),
    semantics:
      "Accepted workbook-defined count of people who gave during this Sunday-aligned week. Separate from current PCO giving units that may group joint givers.",
  })),
  ...[
    ["J", 2021],
    ["K", 2022],
    ["L", 2023],
    ["M", 2024],
    ["N", 2025],
    ["O", 2026],
  ].map(([column, year]) => ({
    label: `Giving people per month ${year} (workbook)`,
    column: String(column),
    dateColumn: "I",
    startRow: 118,
    endRow: 129,
    measure: "legacy_giving_people",
    unit: "people",
    period: "month" as const,
    sourceYear: Number(year),
    semantics:
      "Accepted workbook-defined count of people who gave during the calendar month. Separate from current PCO giving units that may group joint givers.",
  })),
];

function expectedDefinition(entry: Entry): ImportMappingInput {
  return {
    sheet: "$$$",
    valueColumn: entry.column,
    dateColumn: entry.dateColumn,
    startRow: entry.startRow,
    endRow: entry.endRow,
    target: entry.measure,
    unit: entry.unit,
    ministry: "giving",
    semantics: entry.semantics,
    priority: "accepted_workbook_history",
    confidence: "high",
    legacyLabel: entry.label,
    supersedes: null,
    period: entry.period,
    sourceYear: entry.sourceYear,
  };
}

function sameDefinition(actual: ImportMappingInput, expected: ImportMappingInput) {
  return (
    actual.sheet === expected.sheet &&
    actual.valueColumn === expected.valueColumn &&
    actual.dateColumn === expected.dateColumn &&
    actual.startRow === expected.startRow &&
    actual.endRow === expected.endRow &&
    actual.target === expected.target &&
    actual.unit === expected.unit &&
    actual.ministry === expected.ministry &&
    actual.semantics === expected.semantics &&
    actual.priority === expected.priority &&
    actual.confidence === expected.confidence &&
    actual.legacyLabel === expected.legacyLabel &&
    (actual.period ?? "week") === expected.period &&
    (actual.sourceYear ?? null) === (expected.sourceYear ?? null) &&
    (actual.supersedes ?? null) === null
  );
}

async function main() {
  const c = await pool.connect();
  let actor: Actor;
  let batchId: string;
  let snapshotDate: string;
  let seriesSummary: unknown[];
  let plan: PlannedEntry[];
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    const batches = await c.query<{
      id: string;
      sha256: string;
      snapshotDate: string;
      actorId: string;
      catalog: Catalog;
    }>(
      `SELECT b.id,b.sha256,b.snapshot_date::text AS "snapshotDate",
        u.id AS "actorId",b.catalog
       FROM import_batches b
       JOIN workbook_source_authorities a
         ON a.batch_id=b.id AND a.sha256=b.sha256
       JOIN users u ON u.id=b.created_by AND u.role='admin' AND u.status='active'
       WHERE b.state='active'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(b.catalog->'sheets') s(value)
           WHERE s.value->>'name'='$$$'
         )
       ORDER BY b.created_at DESC LIMIT 2`,
    );
    if (batches.rowCount !== 1)
      throw new Error("Expected exactly one accepted active workbook with the reviewed Giving sheet");
    const batch = batches.rows[0]!;
    batchId = batch.id;
    snapshotDate = batch.snapshotDate;
    actor = { userId: batch.actorId, role: "admin" };
    if (snapshotDate !== "2026-11-07")
      throw new Error(`Expected the accepted 2026-11-07 snapshot; found ${snapshotDate}`);
    if (!batch.catalog.sheets.some((sheet) => sheet.name === "$$$" && sheet.maxRow >= 169))
      throw new Error("The accepted Giving sheet does not match the reviewed period-history layout");
    await c.query("SELECT set_config('np.user_id',$1,true)", [actor.userId]);
    const sourceRows = await c.query<{ coordinate: string; cell: WorkbookCell }>(
      `SELECT coordinate,cell FROM import_cells
       WHERE batch_id=$1 AND sheet='$$$'
         AND coordinate ~ '^(A|B|C|D|E|F|G|I|J|K|L|M|N|O)(9[9]|10[0-9]|11[0-9]|12[0-9]|13[0-9]|14[0-9]|15[0-9]|16[0-9])$'`,
      [batchId],
    );
    const cells = new Map(sourceRows.rows.map((row) => [row.coordinate, row.cell]));
    const series = buildGivingWorkbookPeriodHistory(cells, batch.catalog, snapshotDate);
    seriesSummary = series.map((item) => {
      const dates = item.values.map((value) => value.week).sort();
      return {
        series: item.label,
        measure: item.measure,
        period: item.period,
        unit: item.unit,
        rows: item.values.length,
        usable: item.values.filter((value) => value.value !== null).length,
        missing: item.values.filter((value) => value.value === null).length,
        from: dates[0],
        through: dates.at(-1),
        examples: item.values
          .filter((value) => value.value !== null)
          .slice(0, 3)
          .map((value) => ({ period: value.week, value: value.value })),
      };
    });

    const existing = (
      await c.query<ExistingMapping>(
        `SELECT m.id,m.status,m.definition,
          (SELECT count(*)::int FROM import_staged_rows r WHERE r.mapping_id=m.id) AS "stagedCount"
         FROM import_mappings m WHERE m.batch_id=$1`,
        [batchId],
      )
    ).rows;
    plan = entries.map((entry) => {
      const expected = expectedDefinition(entry);
      const current = existing.filter(
        (row) =>
          row.status !== "superseded" &&
          row.definition.sheet === expected.sheet &&
          row.definition.valueColumn === expected.valueColumn &&
          row.definition.target === expected.target &&
          row.definition.ministry === expected.ministry,
      );
      if (!current.length) return { ...entry, status: "create" };
      if (current.length !== 1 || !sameDefinition(current[0]!.definition, expected))
        throw new Error(`${entry.label} already has a different current mapping; refusing to replace it`);
      const found = current[0]!;
      if (found.status === "draft")
        return { ...entry, status: "approve", mappingId: found.id };
      if (found.status !== "approved")
        throw new Error(`${entry.label} mapping is not approved`);
      if (found.stagedCount && found.stagedCount !== entry.endRow - entry.startRow + 1)
        throw new Error(`${entry.label} has an incomplete staged row set`);
      return {
        ...entry,
        status: found.stagedCount ? ("reuse" as const) : ("stage" as const),
        mappingId: found.id,
      };
    });
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    c.release();
  }

  if (plan!.length > 250) throw new Error("Mapping review limit exceeded");
  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "preview",
          snapshotDate,
          series: seriesSummary,
          plannedMappings: plan!.map(({ label, column, dateColumn, period, sourceYear, status }) => ({
            label,
            valueColumn: column,
            dateColumn,
            period,
            sourceYear,
            status,
          })),
          sourceCellsRead: true,
          personLinkedDataRead: false,
          pcoSyncTouched: false,
          metricsPublished: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const publications = [];
  for (const entry of plan!) {
    let mappingId = entry.mappingId;
    if (entry.status === "create") {
      const mapping = await createMapping(actor!, batchId!, expectedDefinition(entry));
      mappingId = mapping.id;
      await reviewMapping(actor!, batchId!, mappingId!, "approved", approvalNote);
      await stageMapping(actor!, batchId!, mappingId!);
    } else if (entry.status === "approve") {
      await reviewMapping(actor!, batchId!, mappingId!, "approved", approvalNote);
      await stageMapping(actor!, batchId!, mappingId!);
    } else if (entry.status === "stage") {
      await stageMapping(actor!, batchId!, mappingId!);
    }
    const result = await importMinistryHistory(actor!, {
      batchId: batchId!,
      mappingId: mappingId!,
      ministry: "giving",
      measure: entry.measure,
      scope: "all",
      year: entry.period === "week" ? (entry.alignedYear ?? null) : null,
      period: entry.period,
    });
    publications.push({
      label: entry.label,
      period: entry.period,
      publicationId: result.publicationId,
      values: result.values,
      issues: result.issues,
      reused: result.reused,
    });
  }
  console.log(
    JSON.stringify(
      {
        mode: "applied",
        snapshotDate: snapshotDate!,
        series: seriesSummary!,
        publications,
        pcoSyncTouched: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Giving workbook period-history import failed");
  process.exitCode = 1;
});
