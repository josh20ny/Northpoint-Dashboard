/**
 * Preview or publish the unambiguous Phase 5 measures on accepted 2026
 * operating tabs. The script reads cached workbook values only, honors the
 * workbook snapshot cutoff, and never reads or changes Planning Center syncs.
 *
 * Run without flags for a read-only preview; pass --apply to save mappings and
 * publications. Ambiguous/overlapping measures are deliberately not included.
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
const firstRow = 10;
const lastRow = 54;
const dateColumn = "A";
const approvalNote =
  "Owner accepted the workbook as the historical source. This operating-tab " +
  "measure is imported from its cached values with the workbook snapshot cutoff; " +
  "formula results are not recalculated.";

type Actor = Parameters<typeof createMapping>[0];
type MappingInput = Parameters<typeof createMapping>[2];
type ExistingMapping = {
  id: string;
  status: string;
  definition: MappingInput;
  staged_rows: number;
};
type Entry = {
  sheet: string;
  column: string;
  label: string;
  ministry: "connection" | "waumba-land" | "upstreet" | "transit" | "insideout";
  measure: string;
  unit: string;
  scope: string;
  semantics: string;
};
type Plan = Entry & {
  status: "create" | "approve" | "stage" | "reuse";
};

class OperatingHistoryError extends Error {}

function selectedPlan(plan: Plan[]) {
  if (!rangeArgument) return plan;
  const range = /^--range=(\d+)-(\d+)$/.exec(rangeArgument);
  if (!range) throw new OperatingHistoryError("Use --range=first-last with one-based mapping numbers");
  const first = Number(range[1]);
  const last = Number(range[2]);
  if (first < 1 || last < first || last > plan.length)
    throw new OperatingHistoryError(`Choose a mapping range from 1-${plan.length}`);
  return plan.slice(first - 1, last);
}

// The total attendance columns are excluded because all-service attendance
// already has an accepted historical series. Connection's duplicate/
// definition-dependent measures and the "LG" volunteer label are likewise
// excluded rather than published under an assumed meaning.
const entries: Entry[] = [
  ...(
    [
      {
        ministry: "waumba-land",
        sheet: "WL",
        attendance: ["E", "F"],
        newByService: ["H", "I"],
        newTotal: "J",
        volunteers: ["K", "L"],
        volunteerTotal: "M",
      },
      {
        ministry: "upstreet",
        sheet: "US",
        attendance: ["E", "F"],
        newByService: ["H", "I"],
        newTotal: "J",
        volunteers: ["L", "N"],
        volunteerTotal: "Q",
      },
      {
        ministry: "transit",
        sheet: "Transit",
        attendance: ["B", "C"],
        newByService: [],
        newTotal: "E",
        volunteers: [],
        volunteerTotal: null,
      },
      {
        ministry: "insideout",
        sheet: "IO",
        attendance: [],
        newByService: [],
        newTotal: "H",
        volunteers: [],
        volunteerTotal: null,
      },
    ] as const
  ).flatMap((ministry) => {
    const attendance = ministry.attendance.flatMap((column, index) => [
      {
        sheet: ministry.sheet,
        column,
        label: `${ministry.sheet} in-person attendance service ${index + 1}`,
        ministry: ministry.ministry,
        measure: "attendance_headcount",
        unit: "attendances",
        scope: `service-${index + 1}`,
        semantics:
          "Accepted workbook in-person headcount for the first or second service. " +
          "The source labels the first service 9:30 AM through the workbook snapshot; " +
          "this is a service slot, not a unique-person count.",
      },
    ]);
    const newGuests = [
      ...ministry.newByService.map((column, index) => ({
        sheet: ministry.sheet,
        column,
        label: `${ministry.sheet} new attendees service ${index + 1}`,
        ministry: ministry.ministry,
        measure: "new_guests",
        unit: "people",
        scope: `service-${index + 1}`,
        semantics:
          "Accepted workbook source-defined new child/student count for this service; " +
          "not PCO first-known or first-ever attendance.",
      })),
      ...(ministry.newTotal
        ? [
            {
              sheet: ministry.sheet,
              column: ministry.newTotal,
              label: `${ministry.sheet} new attendees total`,
              ministry: ministry.ministry,
              measure: "new_guests",
              unit: "people",
              scope: "all",
              semantics:
                "Accepted workbook source-defined total new child/student count; " +
                "not PCO first-known or first-ever attendance.",
            },
          ]
        : []),
    ];
    const volunteers = [
      ...ministry.volunteers.map((column, index) => ({
        sheet: ministry.sheet,
        column,
        label: `${ministry.sheet} volunteers serving service ${index + 1}`,
        ministry: ministry.ministry,
        measure: "volunteer_headcount",
        unit: "source_count",
        scope: `service-${index + 1}`,
        semantics:
          "Accepted workbook source-defined volunteer headcount for this service; " +
          "not a deduplicated unique-person count.",
      })),
      ...(ministry.volunteerTotal
        ? [
            {
              sheet: ministry.sheet,
              column: ministry.volunteerTotal,
              label: `${ministry.sheet} total volunteers serving`,
              ministry: ministry.ministry,
              measure: "volunteer_headcount",
              unit: "source_count",
              scope: "all",
              semantics:
                "Accepted workbook source-defined total serving volunteer count; " +
                "not deduplicated against other ministries.",
            },
          ]
        : []),
    ];
    return [...attendance, ...newGuests, ...volunteers];
  }),
  ...[
    {
      sheet: "US",
      column: "K",
      label: "UpStreet volunteers in rally service 1",
      ministry: "upstreet",
      scope: "service-1",
    },
    {
      sheet: "US",
      column: "M",
      label: "UpStreet volunteers in rally service 2",
      ministry: "upstreet",
      scope: "service-2",
    },
    {
      sheet: "US",
      column: "O",
      label: "UpStreet total volunteers in rally",
      ministry: "upstreet",
      scope: "all",
    },
    {
      sheet: "Transit",
      column: "F",
      label: "Transit SGLs in rally service 1",
      ministry: "transit",
      scope: "service-1",
    },
    {
      sheet: "Transit",
      column: "G",
      label: "Transit SGLs in rally service 2",
      ministry: "transit",
      scope: "service-2",
    },
    {
      sheet: "Transit",
      column: "H",
      label: "Transit SGLs in rally total",
      ministry: "transit",
      scope: "all",
    },
    {
      sheet: "IO",
      column: "I",
      label: "InsideOut SGLs in rally",
      ministry: "insideout",
      scope: "all",
    },
  ].map((entry) => ({
    ...entry,
    measure: "volunteer_rally",
    unit: "people",
    semantics:
      "Accepted workbook-defined volunteer rally count; separate from serving, " +
      "scheduled or accepted Planning Center service.",
  })),
  ...[
    {
      sheet: "IO",
      column: "F",
      label: "InsideOut large-group count",
      measure: "large_group",
    },
    {
      sheet: "IO",
      column: "G",
      label: "InsideOut small-group count",
      measure: "small_group",
    },
  ].map((entry) => ({
    ...entry,
    ministry: "insideout",
    unit: "count",
    scope: "all",
    semantics:
      "Accepted workbook source-defined InsideOut group count. Keep large and " +
      "small groups separate; the workbook does not establish unique attendees.",
  })),
  ...[
    {
      column: "M",
      label: "Connection group leaders",
      measure: "group_leaders",
      unit: "memberships",
      semantics:
        "Accepted workbook-defined weekly group-leader count; not a person-level list.",
    },
    {
      column: "N",
      label: "Connection coaches",
      measure: "coaches",
      unit: "people",
      semantics:
        "Accepted workbook-defined coach count; not automatically PCO group leaders.",
    },
    {
      column: "O",
      label: "Connection group volunteers",
      measure: "volunteer_headcount",
      unit: "source_count",
      semantics:
        "Accepted workbook-defined total group-volunteer count; not assumed unique.",
    },
    {
      column: "P",
      label: "Connection guest-services volunteers",
      measure: "guest_services_volunteers",
      unit: "people",
      semantics:
        "Accepted workbook-defined guest-services volunteer count; distinct from group volunteers.",
    },
    {
      column: "T",
      label: "Connection total church volunteers",
      measure: "total_volunteers",
      unit: "people",
      semantics:
        "Accepted workbook-defined total church-volunteer count; do not sum component ministries into it.",
    },
    {
      column: "U",
      label: "Connection groups reporting attendance",
      measure: "groups_reported",
      unit: "groups",
      semantics:
        "Accepted workbook-defined count of groups reporting attendance; not total active groups.",
    },
  ].map((entry) => ({
    sheet: "Connection",
    ...entry,
    ministry: "connection",
    scope: "all",
  })),
];

function expectedDefinition(entry: Entry): MappingInput {
  return {
    sheet: entry.sheet,
    valueColumn: entry.column,
    dateColumn,
    startRow: firstRow,
    endRow: lastRow,
    target: entry.measure,
    unit: entry.unit,
    ministry: entry.ministry,
    semantics: entry.semantics,
    priority: "accepted_workbook_history",
    confidence: "high",
    legacyLabel: entry.label,
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
  if (entries.length > 250) throw new OperatingHistoryError("Mapping review limit exceeded");
  const c = await pool.connect();
  let actor: Actor;
  let batchId: string;
  let snapshotDate: string;
  let mappingRows: ExistingMapping[];
  let plan: Plan[];
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
           WHERE s.value->>'name'='WL'
         )
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(b.catalog->'sheets') s(value)
           WHERE s.value->>'name'='US'
         )
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(b.catalog->'sheets') s(value)
           WHERE s.value->>'name'='Transit'
         )
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(b.catalog->'sheets') s(value)
           WHERE s.value->>'name'='IO'
         )
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(b.catalog->'sheets') s(value)
           WHERE s.value->>'name'='Connection'
         )
       ORDER BY b.created_at DESC LIMIT 2`,
    );
    if (batches.rowCount !== 1)
      throw new OperatingHistoryError(
        "Expected exactly one accepted active workbook with all Phase 5 operating tabs",
      );
    const batch = batches.rows[0]!;
    batchId = batch.id;
    snapshotDate = batch.snapshot_date;
    actor = { userId: batch.actor_id, role: "admin" };
    await c.query("SELECT set_config('np.user_id',$1,true)", [actor.userId]);

    for (const sheetName of ["WL", "US", "Transit", "IO", "Connection"]) {
      const sheet = batch.catalog.sheets.find((item) => item.name === sheetName);
      if (!sheet || sheet.maxRow < lastRow)
        throw new OperatingHistoryError(
          `${sheetName} does not match the reviewed operating-tab row range`,
        );
    }
    if (snapshotDate !== "2026-11-07")
      throw new OperatingHistoryError(
        `Expected the accepted 2026-11-07 workbook snapshot; found ${snapshotDate}`,
      );

    const dateRows = await c.query<{ sheet: string; coordinate: string; cell: unknown }>(
      `SELECT sheet,coordinate,cell FROM import_cells
       WHERE batch_id=$1 AND sheet=ANY($2::text[])
         AND coordinate ~ '^A(10|[1-4][0-9]|5[0-4])$'`,
      [batchId, ["WL", "US", "Transit", "IO", "Connection"]],
    );
    for (const sheetName of ["WL", "US", "Transit", "IO", "Connection"]) {
      const sheetRows = dateRows.rows
        .filter((row) => row.sheet === sheetName)
        .sort(
          (a, b) =>
            Number(a.coordinate.slice(1)) - Number(b.coordinate.slice(1)),
        );
      if (sheetRows.length !== lastRow - firstRow + 1)
        throw new OperatingHistoryError(
          `${sheetName} does not have the reviewed 45-row weekly date axis`,
        );
      const dates = sheetRows.map((row) => {
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
        first !== "2026-02-22" ||
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
        throw new OperatingHistoryError(
          `${sheetName} date axis differs from the reviewed 2026 Sunday sequence`,
        );
    }

    mappingRows = (
      await c.query<ExistingMapping>(
        `SELECT m.id,m.status,m.definition,
          (SELECT count(*)::int FROM import_staged_rows r WHERE r.mapping_id=m.id) AS staged_rows
         FROM import_mappings m WHERE m.batch_id=$1`,
        [batchId],
      )
    ).rows;
    plan = entries.map((entry) => {
      const expected = expectedDefinition(entry);
      const current = mappingRows.filter(
        (row) =>
          row.status !== "superseded" &&
          row.definition.sheet === entry.sheet &&
          row.definition.valueColumn === entry.column &&
          row.definition.target === entry.measure &&
          row.definition.ministry === entry.ministry,
      );
      if (!current.length) return { ...entry, status: "create" };
      if (current.length !== 1 || !sameDefinition(current[0]!.definition, expected))
        throw new OperatingHistoryError(
          `${entry.label} already has a different current mapping; refusing to replace it`,
        );
      const found = current[0]!;
      if (found.status === "draft") return { ...entry, status: "approve" };
      if (found.status !== "approved")
        throw new OperatingHistoryError(`${entry.label} mapping is not approvable`);
      if (found.staged_rows && found.staged_rows !== lastRow - firstRow + 1)
        throw new OperatingHistoryError(`${entry.label} has an incomplete staged row set`);
      return {
        ...entry,
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
          snapshotDate,
          sourceRows: { start: firstRow, end: lastRow, count: lastRow - firstRow + 1 },
          dateAxis: { first: "2026-02-22", last: "2026-12-27", checkedPerSheet: true },
          plannedMappings: plan!.map(({ sheet, column, label, ministry, measure, scope, status }) => ({
            sheet,
            column,
            label,
            ministry,
            measure,
            scope,
            status,
          })),
          excludedAsAmbiguousOrOverlapping: [
            "All-service child/student attendance totals already covered by accepted history",
            "UpStreet volunteer LG category",
            "UpStreet new-family check-in volunteers",
            "Connection group-count columns and duplicate/definition-dependent attendance columns",
            "Digital metrics and later-phase scorecards",
          ],
          applyRange: rangeArgument
            ? rangeArgument.slice("--range=".length)
            : `1-${plan!.length}`,
          sourceValuesRead: false,
          pcoSyncTouched: false,
          metricsPublished: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const publications: {
    label: string;
    publicationId: string;
    rows: number;
    issues: string[];
    reused: boolean;
  }[] = [];
  const work = selectedPlan(plan!);
  for (const [index, item] of work.entries()) {
    const definition = expectedDefinition(item);
    const existing = mappingRows!.find(
      (row) =>
        row.status !== "superseded" &&
        row.definition.sheet === item.sheet &&
        row.definition.valueColumn === item.column &&
        row.definition.target === item.measure &&
        row.definition.ministry === item.ministry,
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
      ministry: item.ministry,
      measure: item.measure,
      scope: item.scope,
      year: null,
    });
    publications.push({
      label: item.label,
      publicationId: imported.publicationId,
      rows: imported.values,
      issues: imported.issues,
      reused: imported.reused,
    });
    console.log(
      JSON.stringify({
        progress: index + 1,
        total: work.length,
        label: item.label,
        rows: imported.values,
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
          snapshotDate: snapshotDate!,
          measureGroups: Object.entries(
            publications.reduce<Record<string, number>>((acc, item) => {
              const entry = entries.find((candidate) => candidate.label === item.label)!;
              const key = `${entry.ministry}.${entry.measure}`;
              acc[key] = (acc[key] ?? 0) + 1;
              return acc;
            }, {}),
          ).map(([measure, count]) => ({ measure, mappings: count })),
          appliedRange: rangeArgument
            ? rangeArgument.slice("--range=".length)
            : `1-${plan!.length}`,
          mappings: publications.map(({ label, rows, issues, reused }) => ({
            label,
            rows,
            issues,
            reused,
          })),
          validPublications: verified ? validity.rows.length : 0,
          publicationsValid: verified,
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
      error instanceof OperatingHistoryError
        ? error.message
        : error instanceof Error &&
            error.message === "Workbook imports saved but publication verification needs attention"
          ? error.message
          : "Operating-tab workbook history operation failed",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
