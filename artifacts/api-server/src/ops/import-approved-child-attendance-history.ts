/**
 * Preview or import the accepted aggregate children/student attendance history.
 * --apply creates/reuses audited mappings for the four documented series and
 * publishes each year using its ordinal Sundays. It never reads or changes
 * Planning Center sync state.
 */
import { pool } from "@workspace/db";
import {
  createMapping,
  reviewMapping,
  stageMapping,
} from "../lib/imports";
import { importMinistryHistory } from "../lib/ministry-data";

const apply = process.argv.includes("--apply");
const headerRow = 34;
const startRow = 35;
const endRow = 86;
const dateColumns = ["B", "S"] as const;
const years = Array.from({ length: 14 }, (_, index) => 2013 + index);
const firstSeriesColumns = "CDEFGHIJKLMNOP".split("");
const secondSeriesColumns = [
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "AA",
  "AB",
  "AC",
  "AD",
  "AE",
  "AF",
  "AG",
];
const approvalNote =
  "Owner authorized this accepted children/student attendance history. " +
  "Each column is an aggregate workbook headcount aligned to its year's " +
  "ordinal Sundays; it has no historical service, location, or group split.";

type Actor = Parameters<typeof createMapping>[0];
type MappingInput = Parameters<typeof createMapping>[2];
type ExistingMapping = {
  id: string;
  status: string;
  definition: MappingInput;
  staged_rows: number;
};
type Series = {
  sheet: string;
  ministry: "waumba-land" | "upstreet" | "transit" | "insideout";
  dateColumn: "B" | "S";
  valueColumns: string[];
  title: string;
};
type Plan = {
  series: Series;
  year: number;
  column: string;
  status: "create" | "approve" | "stage" | "reuse";
};

class ChildHistoryError extends Error {}

const series: Series[] = [
  {
    sheet: "Historical - Kids",
    ministry: "waumba-land",
    dateColumn: "B",
    valueColumns: firstSeriesColumns,
    title: "Historical - In-Person WL Attendance",
  },
  {
    sheet: "Historical - Kids",
    ministry: "upstreet",
    dateColumn: "S",
    valueColumns: secondSeriesColumns,
    title: "Historical - In-Person US Attendance",
  },
  {
    sheet: "Historical - Students",
    ministry: "transit",
    dateColumn: "B",
    valueColumns: firstSeriesColumns,
    title: "Historical - In-Person Transit Attendance",
  },
  {
    sheet: "Historical - Students",
    ministry: "insideout",
    dateColumn: "S",
    valueColumns: secondSeriesColumns,
    title: "Historical - In-Person IO Attendance",
  },
];

function expectedDefinition(
  entry: Series,
  year: number,
  valueColumn: string,
): MappingInput {
  return {
    sheet: entry.sheet,
    valueColumn,
    dateColumn: entry.dateColumn,
    startRow,
    endRow,
    target: "attendance_headcount",
    unit: "attendances",
    ministry: entry.ministry,
    semantics:
      "Accepted historical aggregate ministry attendance headcount; " +
      "not distinct PCO participants and not split by service, location, or group.",
    priority: "accepted_workbook_history",
    confidence: "high",
    legacyLabel: `${entry.title} ${year}`,
    supersedes: null,
  };
}

function sameDefinition(actual: MappingInput, expected: MappingInput) {
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
    (actual.supersedes ?? null) === null
  );
}

function expectedYearsFor(entry: Series) {
  return years.map((year, index) => ({
    year,
    column: entry.valueColumns[index]!,
  }));
}

async function main() {
  const c = await pool.connect();
  let actor: Actor;
  let batchId: string;
  let snapshotDate: string;
  let mappingRows: ExistingMapping[];
  let mappingPlan: Plan[];
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    const batches = await c.query<{
      id: string;
      snapshot_date: string;
      actor_id: string;
      catalog: { sheets: { name: string; maxRow: number }[] };
    }>(
      `SELECT b.id,b.snapshot_date::text,b.catalog,u.id AS actor_id
       FROM import_batches b
       JOIN workbook_source_authorities a
         ON a.batch_id=b.id AND a.sha256=b.sha256
       JOIN users u ON u.id=b.created_by AND u.role='admin' AND u.status='active'
       WHERE b.state='active'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(b.catalog->'sheets') s(value)
           WHERE s.value->>'name'='Historical - Kids'
         )
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(b.catalog->'sheets') s(value)
           WHERE s.value->>'name'='Historical - Students'
         )
       ORDER BY b.created_at DESC LIMIT 2`,
    );
    if (batches.rowCount !== 1)
      throw new ChildHistoryError(
        "Expected exactly one accepted active workbook with both children history sheets",
      );
    const batch = batches.rows[0]!;
    batchId = batch.id;
    snapshotDate = batch.snapshot_date;
    actor = { userId: batch.actor_id, role: "admin" };
    await c.query("SELECT set_config('np.user_id',$1,true)", [actor.userId]);

    for (const sheetName of ["Historical - Kids", "Historical - Students"]) {
      const sheet = batch.catalog.sheets.find((item) => item.name === sheetName);
      if (!sheet || sheet.maxRow < endRow)
        throw new ChildHistoryError(`${sheetName} does not match its reviewed row range`);
    }

    for (const entry of series) {
      const headerColumns = entry.valueColumns;
      const headers = await c.query<{ coordinate: string; label: string }>(
        `SELECT coordinate,COALESCE(cell->>'cachedValue',cell->>'value') AS label
         FROM import_cells
         WHERE batch_id=$1 AND sheet=$2 AND coordinate=ANY($3::text[])`,
        [
          batchId,
          entry.sheet,
          headerColumns.map((column) => `${column}${headerRow}`),
        ],
      );
      const headersByCoordinate = new Map(
        headers.rows.map((header) => [header.coordinate, header.label]),
      );
      if (
        headers.rows.length !== years.length ||
        expectedYearsFor(entry).some(
          ({ year, column }) =>
            Number(headersByCoordinate.get(`${column}${headerRow}`)) !== year,
        )
      )
        throw new ChildHistoryError(
          `${entry.sheet} ${entry.title} year columns differ from the reviewed crosswalk`,
        );
    }

    const axis = await c.query<{
      sheet: string;
      date_column: string;
      first_row: number | null;
      last_row: number | null;
      rows: number;
      unique_dates: number;
    }>(
      `SELECT sheet,substring(coordinate from 1 for 1) AS date_column,
              min(regexp_replace(coordinate,'[^0-9]','','g')::int)::int AS first_row,
              max(regexp_replace(coordinate,'[^0-9]','','g')::int)::int AS last_row,
              count(*)::int AS rows,
              count(DISTINCT cell->>'cachedValue')::int AS unique_dates
       FROM import_cells
       WHERE batch_id=$1 AND sheet=ANY($2::text[])
         AND coordinate ~ '^(B|S)[0-9]+$'
         AND regexp_replace(coordinate,'[^0-9]','','g')::int BETWEEN $3 AND $4
         AND cell->>'cachedValue' IS NOT NULL
       GROUP BY sheet,date_column`,
      [
        batchId,
        ["Historical - Kids", "Historical - Students"],
        startRow,
        endRow,
      ],
    );
    if (
      axis.rows.length !== 4 ||
      ["Historical - Kids", "Historical - Students"].some((sheet) =>
        dateColumns.some((dateColumn) => {
          const found = axis.rows.find(
            (row) => row.sheet === sheet && row.date_column === dateColumn,
          );
          return (
            found?.first_row !== startRow ||
            found.last_row !== endRow ||
            found.rows !== endRow - startRow + 1 ||
            found.unique_dates !== found.rows
          );
        }),
      )
    )
      throw new ChildHistoryError(
        "Children history date axes differ from the reviewed 52-Sunday structure",
      );

    mappingRows = (
      await c.query<ExistingMapping>(
        `SELECT m.id,m.status,m.definition,
          (SELECT count(*)::int FROM import_staged_rows r WHERE r.mapping_id=m.id) AS staged_rows
         FROM import_mappings m WHERE m.batch_id=$1`,
        [batchId],
      )
    ).rows;

    mappingPlan = series.flatMap((entry) =>
      expectedYearsFor(entry).map(({ year, column }) => {
        const expected = expectedDefinition(entry, year, column);
        const current = mappingRows.filter(
          (row) =>
            row.status !== "superseded" &&
            row.definition.sheet === entry.sheet &&
            row.definition.valueColumn === column &&
            row.definition.target === expected.target &&
            row.definition.ministry === expected.ministry,
        );
        if (!current.length)
          return { series: entry, year, column, status: "create" as const };
        if (current.length !== 1 || !sameDefinition(current[0]!.definition, expected))
          throw new ChildHistoryError(
            `${entry.ministry} ${year} already has a different current mapping; refusing to replace it`,
          );
        const found = current[0]!;
        if (found.status === "draft")
          return { series: entry, year, column, status: "approve" as const };
        if (found.status !== "approved")
          throw new ChildHistoryError(
            `${entry.ministry} ${year} mapping is not approvable`,
          );
        if (found.staged_rows && found.staged_rows !== endRow - startRow + 1)
          throw new ChildHistoryError(
            `${entry.ministry} ${year} mapping has an incomplete staged row set`,
          );
        return {
          series: entry,
          year,
          column,
          status: found.staged_rows ? ("reuse" as const) : ("stage" as const),
        };
      }),
    );
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }

  if (!apply) {
    console.log(
      JSON.stringify({
        mode: "preview",
        snapshotDate,
        years: { first: years[0], last: years.at(-1), count: years.length },
        sourceRows: { start: startRow, end: endRow, count: endRow - startRow + 1 },
        targets: series.map((entry) => ({
          sheet: entry.sheet,
          ministry: entry.ministry,
          measure: "attendance_headcount",
          unit: "attendances",
          scope: "all",
          dateColumn: entry.dateColumn,
          mappings: expectedYearsFor(entry).map(({ year, column }) => ({
            year,
            valueColumn: column,
            status: mappingPlan.find(
              (item) =>
                item.series.ministry === entry.ministry && item.year === year,
            )!.status,
          })),
        })),
        sourceValuesRead: false,
        pcoSyncTouched: false,
        metricsPublished: false,
      }),
    );
    return;
  }

  const publications: {
    ministry: string;
    year: number;
    publicationId: string;
    weekRows: number;
    issues: string[];
    reused: boolean;
  }[] = [];

  for (const plan of mappingPlan!) {
    const definition = expectedDefinition(plan.series, plan.year, plan.column);
    const existing = mappingRows!.find(
      (row) =>
        row.status !== "superseded" &&
        row.definition.sheet === plan.series.sheet &&
        row.definition.valueColumn === plan.column &&
        row.definition.target === definition.target &&
        row.definition.ministry === definition.ministry,
    );
    const mappingId = existing
      ? existing.id
      : (await createMapping(actor!, batchId!, definition)).id;
    const currentStatus = existing?.status ?? "draft";
    if (currentStatus === "draft")
      await reviewMapping(
        actor!,
        batchId!,
        mappingId,
        "approved",
        approvalNote,
      );
    if (!existing?.staged_rows) await stageMapping(actor!, batchId!, mappingId);

    const imported = await importMinistryHistory(actor!, {
      batchId: batchId!,
      mappingId,
      ministry: plan.series.ministry,
      measure: "attendance_headcount",
      scope: "all",
      year: plan.year,
    });
    publications.push({
      ministry: plan.series.ministry,
      year: plan.year,
      publicationId: imported.publicationId,
      weekRows: imported.values,
      issues: imported.issues,
      reused: imported.reused,
    });
  }

  const verify = await pool.connect();
  try {
    await verify.query("BEGIN READ ONLY");
    await verify.query("SELECT set_config('np.role','admin',true)");
    await verify.query("SELECT set_config('np.user_id',$1,true)", [actor!.userId]);
    const validity = await verify.query<{
      publication_id: string;
      valid: boolean;
    }>(
      `SELECT id AS publication_id,np_ministry_publication_valid(id) AS valid
       FROM ministry_publications WHERE id=ANY($1::uuid[])`,
      [publications.map((row) => row.publicationId)],
    );
    await verify.query("COMMIT");
    const verified =
      validity.rows.length === publications.length &&
      validity.rows.every((row) => row.valid === true);
    console.log(
      JSON.stringify({
        mode: "imported",
        snapshotDate: snapshotDate!,
        targets: series.map((entry) => {
          const rows = publications.filter(
            (item) => item.ministry === entry.ministry,
          );
          return {
            ministry: entry.ministry,
            measure: "attendance_headcount",
            unit: "attendances",
            scope: "all",
            years: rows.map(({ year, weekRows, issues, reused }) => ({
              year,
              weekRows,
              issues,
              reused,
            })),
            validPublications: rows.length,
          };
        }),
        publicationsValid: verified,
        pcoSyncTouched: false,
      }),
    );
    if (!verified)
      throw new Error("Workbook imports saved but publication verification needs attention");
  } catch (error) {
    await verify.query("ROLLBACK");
    throw error;
  } finally {
    verify.release();
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof ChildHistoryError
        ? error.message
        : error instanceof Error &&
            error.message ===
              "Workbook imports saved but publication verification needs attention"
          ? error.message
          : "Children/student workbook history operation failed",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
