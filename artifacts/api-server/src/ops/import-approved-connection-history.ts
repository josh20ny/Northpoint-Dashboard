/**
 * Preview or import the accepted Historical - Connection attendance series.
 * --apply creates/reuses audited mappings, stages the nine year columns, and
 * imports each as workbook-defined member_attendance using ordinal Sundays.
 * It never reads or changes Planning Center sync state.
 */
import { pool } from "@workspace/db";
import {
  createMapping,
  reviewMapping,
  stageMapping,
} from "../lib/imports";
import { importMinistryHistory } from "../lib/ministry-data";

const apply = process.argv.includes("--apply");
const sheetName = "Historical - Connection";
const approvedHeaderRow = 27;
const approvedDateColumn = "B";
const approvedStartRow = 28;
const approvedEndRow = 79;
const expectedYears = Array.from({ length: 9 }, (_, index) => 2018 + index);
const columns = "CDEFGHIJK".split("");
const approvalNote =
  "Owner authorized this accepted Connection history mapping. The series is " +
  "aggregate group attendance, aligned to each year's ordinal Sundays. " +
  "Use accepted cached values; past literal blank attendance means zero.";

type Actor = Parameters<typeof createMapping>[0];
type MappingInput = Parameters<typeof createMapping>[2];
type ExistingMapping = {
  id: string;
  status: string;
  definition: MappingInput;
  staged_rows: number;
};

class ConnectionHistoryError extends Error {}

function expectedDefinition(year: number, valueColumn: string): MappingInput {
  return {
    sheet: sheetName,
    valueColumn,
    dateColumn: approvedDateColumn,
    startRow: approvedStartRow,
    endRow: approvedEndRow,
    target: "member_attendance",
    unit: "attendances",
    ministry: "connection",
    semantics:
      "Historical aggregate group attendance from the accepted workbook; " +
      "not unique PCO attendees or active group memberships.",
    priority: "accepted_workbook_history",
    confidence: "high",
    legacyLabel: `Historical - Total Groups Attendance ${year}`,
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

async function main() {
  const c = await pool.connect();
  let actor: Actor;
  let batchId: string;
  let snapshotDate: string;
  let mappingRows: ExistingMapping[];
  let mappingPlan: {
    year: number;
    column: string;
    status: "create" | "approve" | "stage" | "reuse";
  }[];
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    const batch = await c.query<{
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
           WHERE s.value->>'name'=$1
         )
       ORDER BY b.created_at DESC LIMIT 2`,
      [sheetName],
    );
    if (batch.rowCount !== 1)
      throw new ConnectionHistoryError(
        "Expected exactly one accepted active workbook with the Connection history sheet",
      );
    batchId = batch.rows[0].id;
    snapshotDate = batch.rows[0].snapshot_date;
    actor = { userId: batch.rows[0].actor_id, role: "admin" };
    await c.query("SELECT set_config('np.user_id',$1,true)", [actor.userId]);

    const sheet = batch.rows[0].catalog.sheets.find((item) => item.name === sheetName);
    if (!sheet || sheet.maxRow < approvedEndRow)
      throw new ConnectionHistoryError("The accepted Connection sheet does not match its reviewed row range");

    const headers = await c.query<{ coordinate: string; label: string }>(
      `SELECT coordinate,COALESCE(cell->>'value',cell->>'cachedValue') AS label
       FROM import_cells WHERE batch_id=$1 AND sheet=$2
         AND coordinate ~ '^[C-K]27$' ORDER BY coordinate`,
      [batchId, sheetName],
    );
    const expectedHeaders = expectedYears.map((year, index) => ({
      coordinate: columns[index]!,
      year,
    }));
    if (
      headers.rows.length !== expectedHeaders.length ||
      expectedHeaders.some((expected, index) => {
        const header = headers.rows[index];
        return (
          header?.coordinate !== `${expected.coordinate}${approvedHeaderRow}` ||
          Number(header.label) !== expected.year
        );
      })
    )
      throw new ConnectionHistoryError("The Connection history year columns differ from the reviewed crosswalk");

    const axis = await c.query<{
      firstRow: number | null;
      lastRow: number | null;
      rows: number;
      uniqueDates: number;
    }>(
      `SELECT min(regexp_replace(coordinate,'[^0-9]','','g')::int) AS "firstRow",
              max(regexp_replace(coordinate,'[^0-9]','','g')::int) AS "lastRow",
              count(*)::int AS rows,
              count(DISTINCT cell->>'cachedValue')::int AS "uniqueDates"
       FROM import_cells WHERE batch_id=$1 AND sheet=$2
         AND coordinate ~ '^B[0-9]+$'
         AND regexp_replace(coordinate,'[^0-9]','','g')::int BETWEEN $3 AND $4
         AND cell->>'cachedValue' IS NOT NULL`,
      [batchId, sheetName, approvedStartRow, approvedEndRow],
    );
    if (
      axis.rows[0]?.firstRow !== approvedStartRow ||
      axis.rows[0]?.lastRow !== approvedEndRow ||
      axis.rows[0]?.rows !== approvedEndRow - approvedStartRow + 1 ||
      axis.rows[0]?.uniqueDates !== axis.rows[0]?.rows
    )
      throw new ConnectionHistoryError("The Connection date axis does not match the reviewed 52-week structure");

    mappingRows = (
      await c.query<ExistingMapping>(
        `SELECT m.id,m.status,m.definition,
          (SELECT count(*)::int FROM import_staged_rows r WHERE r.mapping_id=m.id) AS staged_rows
         FROM import_mappings m WHERE m.batch_id=$1`,
        [batchId],
      )
    ).rows;
    mappingPlan = expectedYears.map((year, index) => {
      const expected = expectedDefinition(year, columns[index]!);
      const current = mappingRows.filter((row) =>
        row.status !== "superseded" &&
        row.definition.sheet === sheetName &&
        row.definition.valueColumn === expected.valueColumn
      );
      if (!current.length) return { year, column: expected.valueColumn, status: "create" as const };
      if (current.length !== 1 || !sameDefinition(current[0]!.definition, expected))
        throw new ConnectionHistoryError(
          `The ${year} Connection column has a different current mapping; refusing to replace it`,
        );
      const found = current[0]!;
      if (found.status === "draft") return { year, column: expected.valueColumn, status: "approve" as const };
      if (found.status !== "approved")
        throw new ConnectionHistoryError(`The ${year} Connection mapping is not approvable`);
      return {
        year,
        column: expected.valueColumn,
        status: found.staged_rows ? "reuse" as const : "stage" as const,
      };
    });
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }

  if (!apply) {
    console.log(JSON.stringify({
      mode: "preview",
      sheet: sheetName,
      snapshotDate,
      dateColumn: approvedDateColumn,
      sourceRows: { start: approvedStartRow, end: approvedEndRow, count: approvedEndRow - approvedStartRow + 1 },
      target: "connection.member_attendance",
      unit: "attendances",
      scope: "all",
      years: mappingPlan,
      sourceValuesRead: false,
      groupsSyncTouched: false,
      metricsPublished: false,
    }));
    return;
  }

  const publications: {
    year: number;
    publicationId: string;
    weekRows: number;
    issues: string[];
    reused: boolean;
  }[] = [];
  for (const plan of mappingPlan!) {
    const definition = expectedDefinition(plan.year, plan.column);
    const existing = mappingRows!.find((row) =>
      row.status !== "superseded" &&
      row.definition.sheet === sheetName &&
      row.definition.valueColumn === plan.column
    );
    const mappingId = existing
      ? existing.id
      : (await createMapping(actor!, batchId!, definition)).id;
    const currentStatus =
      existing?.status ?? "draft";
    if (currentStatus === "draft")
      await reviewMapping(actor!, batchId!, mappingId, "approved", approvalNote);
    const stagedRows = existing?.staged_rows ?? 0;
    if (stagedRows === 0) await stageMapping(actor!, batchId!, mappingId);

    const imported = await importMinistryHistory(actor!, {
      batchId: batchId!,
      mappingId,
      ministry: "connection",
      measure: "member_attendance",
      scope: "all",
      year: plan.year,
    });
    publications.push({
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
    const validity = await verify.query<{ publication_id: string; valid: boolean }>(
      `SELECT id AS publication_id,np_ministry_publication_valid(id) AS valid
       FROM ministry_publications WHERE id=ANY($1::uuid[])`,
      [publications.map((row) => row.publicationId)],
    );
    await verify.query("COMMIT");
    const verified = validity.rows.length === publications.length &&
      validity.rows.every((row) => row.valid === true);
    console.log(JSON.stringify({
      mode: "imported",
      sheet: sheetName,
      snapshotDate: snapshotDate!,
      target: "connection.member_attendance",
      scope: "all",
      publications: publications.map(({ year, weekRows, issues, reused }) => ({
        year, weekRows, issues, reused,
      })),
      publicationsValid: verified,
      groupsSyncTouched: false,
    }));
    if (!verified) throw new Error("Workbook imports saved but publication verification needs attention");
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
      error instanceof ConnectionHistoryError
        ? error.message
        : error instanceof Error &&
            error.message === "Workbook imports saved but publication verification needs attention"
          ? error.message
          : "Connection workbook history operation failed",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
