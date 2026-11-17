/**
 * Preview or import the accepted workbook's annual general-giving history.
 * The workbook's 2026 Sunday axis is aligned ordinally to each year, preserving
 * the accepted snapshot cutoff and allowing complete PCO values to win overlap.
 * No donor identities or Planning Center sync state are read or changed.
 *
 * Run without flags for a read-only preview; pass --apply to publish. Large
 * imports can be split with --range=first-last using one-based mapping numbers.
 */
import { pool } from "@workspace/db";
import {
  createMapping,
  reviewMapping,
  stageMapping,
} from "../lib/imports";
import { importMinistryHistory } from "../lib/ministry-data";
import { excelDate } from "../lib/workbook";

const apply = process.argv.includes("--apply");
const rangeArgument = process.argv.find((argument) => argument.startsWith("--range="));
const sheetName = "$$$";
const firstRow = 3;
const lastRow = 54;
const dateColumn = "A";
const years = Array.from({ length: 14 }, (_, index) => 2013 + index);
const columns = "BCDEFGHIJKLMNO".split("");
const approvalNote =
  "Owner accepted the workbook as historical source data. This annual " +
  "general-giving series uses ordinal Sundays and USD values; complete PCO " +
  "values win overlapping weeks. The workbook notes an additional PCO general " +
  "gift not represented in its total, so sources must never be added together.";

type Actor = Parameters<typeof createMapping>[0];
type MappingInput = Parameters<typeof createMapping>[2];
type ExistingMapping = {
  id: string;
  status: string;
  definition: MappingInput;
  staged_rows: number;
};
type Plan = {
  year: number;
  column: string;
  status: "create" | "approve" | "stage" | "reuse";
};

class GivingHistoryError extends Error {}

function expectedDefinition(year: number, valueColumn: string): MappingInput {
  return {
    sheet: sheetName,
    valueColumn,
    dateColumn,
    startRow: firstRow,
    endRow: lastRow,
    target: "giving_total",
    unit: "USD",
    ministry: "giving",
    semantics:
      "Accepted workbook historical general-giving total for this source year; " +
      "USD, aligned by ordinal Sunday. Source-defined amount is not identity-linked. " +
      "Complete PCO giving wins on overlap; never sum sources.",
    priority: "accepted_workbook_history",
    confidence: "high",
    legacyLabel: `Historical General Giving ${year}`,
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

function selectedPlan(plan: Plan[]) {
  if (!rangeArgument) return plan;
  const range = /^--range=(\d+)-(\d+)$/.exec(rangeArgument);
  if (!range)
    throw new GivingHistoryError("Use --range=first-last with one-based mapping numbers");
  const first = Number(range[1]);
  const last = Number(range[2]);
  if (first < 1 || last < first || last > plan.length)
    throw new GivingHistoryError(`Choose a mapping range from 1-${plan.length}`);
  return plan.slice(first - 1, last);
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
      catalog: {
        dateSystem: "1900" | "1904";
        sheets: { name: string; maxRow: number }[];
      };
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
    if (batches.rowCount !== 1)
      throw new GivingHistoryError(
        "Expected exactly one accepted active workbook with its general-giving sheet",
      );
    const batch = batches.rows[0]!;
    batchId = batch.id;
    snapshotDate = batch.snapshot_date;
    actor = { userId: batch.actor_id, role: "admin" };
    await c.query("SELECT set_config('np.user_id',$1,true)", [actor.userId]);

    if (snapshotDate !== "2026-11-07")
      throw new GivingHistoryError(
        `Expected the accepted 2026-11-07 workbook snapshot; found ${snapshotDate}`,
      );
    const sheet = batch.catalog.sheets.find((item) => item.name === sheetName);
    if (!sheet || sheet.maxRow < lastRow)
      throw new GivingHistoryError("The accepted giving sheet does not match the reviewed row range");

    const headerRows = await c.query<{ coordinate: string; label: string }>(
      `SELECT coordinate,COALESCE(cell->>'value',cell->>'cachedValue') AS label
       FROM import_cells
       WHERE batch_id=$1 AND sheet=$2 AND coordinate=ANY($3::text[])`,
      [batchId, sheetName, columns.map((column) => `${column}2`)],
    );
    const headerByCoordinate = new Map(
      headerRows.rows.map((row) => [row.coordinate, row.label]),
    );
    if (
      headerRows.rows.length !== years.length ||
      years.some(
        (year, index) => Number(headerByCoordinate.get(`${columns[index]}2`)) !== year,
      )
    )
      throw new GivingHistoryError(
        "The general-giving year columns differ from the reviewed 2013–2026 crosswalk",
      );

    const note = await c.query<{ value: string | null }>(
      `SELECT COALESCE(cell->>'value',cell->>'cachedValue') AS value
       FROM import_cells WHERE batch_id=$1 AND sheet=$2 AND coordinate=$3`,
      [batchId, sheetName, "W66"],
    );
    if (!note.rows[0]?.value?.toLowerCase().includes("additional 170k in pco general giving"))
      throw new GivingHistoryError(
        "The giving-sheet overlap note differs from the reviewed source evidence",
      );

    const dateRows = await c.query<{ coordinate: string; cell: unknown }>(
      `SELECT coordinate,cell FROM import_cells
       WHERE batch_id=$1 AND sheet=$2
         AND coordinate ~ '^A([3-9]|[1-4][0-9]|5[0-4])$'`,
      [batchId, sheetName],
    );
    const orderedDates = dateRows.rows.sort(
      (a, b) => Number(a.coordinate.slice(1)) - Number(b.coordinate.slice(1)),
    );
    if (orderedDates.length !== lastRow - firstRow + 1)
      throw new GivingHistoryError("The giving sheet does not have the reviewed 52-week date axis");
    const dates = orderedDates.map((row) => {
      const cell = row.cell as {
        value?: string | null;
        cachedValue?: string | null;
        formula?: string | null;
      };
      const raw =
        cell.formula !== null && cell.formula !== undefined
          ? cell.cachedValue
          : cell.value;
      return excelDate(raw ?? null, batch.catalog.dateSystem);
    });
    const first = dates[0];
    const last = dates.at(-1);
    if (
      first !== "2026-01-04" ||
      last !== "2026-12-27" ||
      dates.some(
        (date, index) =>
          date === null ||
          date !==
            new Date(
              Date.parse(`${first}T12:00:00Z`) + index * 7 * 86400000,
            )
              .toISOString()
              .slice(0, 10),
      )
    )
      throw new GivingHistoryError(
        "The giving sheet date axis differs from the reviewed 2026 Sunday sequence",
      );

    mappingRows = (
      await c.query<ExistingMapping>(
        `SELECT m.id,m.status,m.definition,
          (SELECT count(*)::int FROM import_staged_rows r WHERE r.mapping_id=m.id) AS staged_rows
         FROM import_mappings m WHERE m.batch_id=$1`,
        [batchId],
      )
    ).rows;
    mappingPlan = years.map((year, index) => {
      const column = columns[index]!;
      const expected = expectedDefinition(year, column);
      const current = mappingRows.filter(
        (row) =>
          row.status !== "superseded" &&
          row.definition.sheet === sheetName &&
          row.definition.valueColumn === column &&
          row.definition.target === "giving_total" &&
          row.definition.ministry === "giving",
      );
      if (!current.length) return { year, column, status: "create" as const };
      if (current.length !== 1 || !sameDefinition(current[0]!.definition, expected))
        throw new GivingHistoryError(
          `${year} already has a different current giving mapping; refusing to replace it`,
        );
      const found = current[0]!;
      if (found.status === "draft") return { year, column, status: "approve" as const };
      if (found.status !== "approved")
        throw new GivingHistoryError(`${year} giving mapping is not approvable`);
      if (found.staged_rows && found.staged_rows !== lastRow - firstRow + 1)
        throw new GivingHistoryError(`${year} giving mapping has an incomplete staged row set`);
      return {
        year,
        column,
        status: found.staged_rows ? ("reuse" as const) : ("stage" as const),
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
    console.log(
      JSON.stringify(
        {
          mode: "preview",
          sheet: sheetName,
          snapshotDate,
          sourceRows: { start: firstRow, end: lastRow, count: lastRow - firstRow + 1 },
          target: "giving.giving_total",
          unit: "USD (stored as exact minor units)",
          scope: "all",
          years: mappingPlan!.map(({ year, column, status }) => ({ year, column, status })),
          sourceValuesRead: false,
          pcoOverlap: "complete PCO values take precedence; never sum sources",
          sensitiveIdentitiesRead: false,
          pcoSyncTouched: false,
          metricsPublished: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const work = selectedPlan(mappingPlan!);
  const publications: {
    year: number;
    publicationId: string;
    rows: number;
    issues: string[];
    reused: boolean;
  }[] = [];
  for (const [index, item] of work.entries()) {
    const definition = expectedDefinition(item.year, item.column);
    const existing = mappingRows!.find(
      (row) =>
        row.status !== "superseded" &&
        row.definition.sheet === sheetName &&
        row.definition.valueColumn === item.column &&
        row.definition.target === "giving_total" &&
        row.definition.ministry === "giving",
    );
    const mappingId =
      existing?.id ?? (await createMapping(actor!, batchId!, definition)).id;
    const status = existing?.status ?? "draft";
    if (status === "draft")
      await reviewMapping(actor!, batchId!, mappingId, "approved", approvalNote);
    if (!existing?.staged_rows)
      await stageMapping(actor!, batchId!, mappingId);
    const imported = await importMinistryHistory(actor!, {
      batchId: batchId!,
      mappingId,
      ministry: "giving",
      measure: "giving_total",
      scope: "all",
      year: item.year,
    });
    publications.push({
      year: item.year,
      publicationId: imported.publicationId,
      rows: imported.values,
      issues: imported.issues,
      reused: imported.reused,
    });
    console.log(
      JSON.stringify({
        progress: index + 1,
        total: work.length,
        year: item.year,
        rows: imported.values,
        issues: imported.issues,
        reused: imported.reused,
      }),
    );
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
    const verified =
      validity.rows.length === publications.length &&
      validity.rows.every((row) => row.valid === true);
    console.log(
      JSON.stringify(
        {
          mode: "imported",
          sheet: sheetName,
          snapshotDate: snapshotDate!,
          scope: "all",
          unit: "USD_minor",
          pcoOverlap: "complete PCO values take precedence; never sum sources",
          years: publications.map(({ year, rows, issues, reused }) => ({
            year,
            rows,
            issues,
            reused,
          })),
          validPublications: verified ? validity.rows.length : 0,
          publicationsValid: verified,
          sensitiveIdentitiesRead: false,
          pcoSyncTouched: false,
        },
        null,
        2,
      ),
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
      error instanceof GivingHistoryError
        ? error.message
        : error instanceof Error &&
            error.message === "Workbook imports saved but publication verification needs attention"
          ? error.message
          : "Giving workbook history operation failed",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
