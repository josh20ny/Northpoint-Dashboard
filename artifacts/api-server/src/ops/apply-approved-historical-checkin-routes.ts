/**
 * Apply the owner-approved historical Check-In routes and publish the staged
 * PCO history. Preview by default; this operation never starts a source scan.
 */
import { pool } from "@workspace/db";
import type { AdminActor } from "../lib/administration";
import { createMinistryMapping, publishMinistryData } from "../lib/ministry-data";

const CURRENT_START = "2026-11-08";
const HISTORICAL_END = "2026-11-07";
const HISTORY_START = "2022-03-20";
const NINE_THIRTY_END = "2026-04-19";
const NINE_AM_START = "2026-04-26";
const ELEVEN_AM_START = "2022-03-27";
const FOUR_THIRTY_START = "2022-04-03";
const PUBLISH_END = "2026-11-22";
const apply = process.argv.includes("--apply");

type Mapping = {
  product: "check_ins" | "groups";
  object_type: "Location" | "EventTime" | "GroupType";
  external_id: string;
  ministry: string;
  measure: "attendance" | "service_session" | "student_group_classification";
  scope: string;
  effective_from: string;
  effective_to: string | null;
};

type MappingTarget = Omit<Mapping, "effective_from" | "effective_to"> & {
  effectiveFrom: string;
  effectiveTo: string;
  note: string;
};

class HistoricalCheckInRouteError extends Error {}

let operationStage = "checking the approved integration";

function overlaps(
  leftStart: string,
  leftEnd: string | null,
  rightStart: string,
  rightEnd: string | null,
): boolean {
  return leftStart <= (rightEnd ?? "9999-12-31") &&
    rightStart <= (leftEnd ?? "9999-12-31");
}

function sameTarget(row: Mapping, target: MappingTarget): boolean {
  return row.product === target.product &&
    row.object_type === target.object_type &&
    row.external_id === target.external_id &&
    row.ministry === target.ministry &&
    row.measure === target.measure &&
    row.scope === target.scope &&
    row.effective_from === target.effectiveFrom &&
    row.effective_to === target.effectiveTo;
}

function overlapsTarget(row: Mapping, target: MappingTarget): boolean {
  return row.product === target.product &&
    row.object_type === target.object_type &&
    row.external_id === target.external_id &&
    row.measure === target.measure &&
    (target.measure !== "service_session" || row.ministry === target.ministry) &&
    overlaps(row.effective_from, row.effective_to, target.effectiveFrom, target.effectiveTo);
}

async function main() {
  const c = await pool.connect();
  let actor: AdminActor;
  let account: string;
  let targets: MappingTarget[] = [];
  let alreadyPresent = 0;
  let routeSummary: Array<{ kind: string; mappings: number; from: string; through: string }> = [];

  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    const owner = await c.query(
      `SELECT p.account_ref,u.id FROM pco_connections p
       JOIN users u ON u.id=p.connected_by
       WHERE p.id='planning_center' AND p.state='connected'
         AND u.role='admin' AND u.status='active'`,
    );
    if (owner.rowCount !== 1)
      throw new HistoricalCheckInRouteError("An active Admin integration authorizer is required");
    account = owner.rows[0].account_ref;
    actor = { userId: owner.rows[0].id, role: "admin" };

    operationStage = "checking staged Check-In history";
    const activeRun = await c.query(
      `SELECT 1 FROM pco_sync_runs WHERE account_ref=$1 AND product='check_ins'
       AND status IN ('running','retry') LIMIT 1`,
      [account],
    );
    if (activeRun.rowCount)
      throw new HistoricalCheckInRouteError("A Check-In scan is active; retry after it finishes");

    const event = await c.query<{ id: string }>(
      `SELECT external_id AS id FROM pco_source_entities
       WHERE account_ref=$1 AND product='check_ins' AND object_type='Event'
         AND missing_run_id IS NULL
         AND normalized->'attributes'->>'name'='Normal Service Times'`,
      [account],
    );
    if (event.rowCount !== 1)
      throw new HistoricalCheckInRouteError("The approved Normal Service Times event is not unique");
    const eventId = event.rows[0].id;

    operationStage = "validating the historical service-time templates";
    const historicalMorning = await c.query<{ id: string; local_date: string }>(
      `SELECT external_id AS id,
         ((normalized->'attributes'->>'starts_at')::timestamptz
           AT TIME ZONE 'America/Chicago')::date::text AS local_date
       FROM pco_source_entities
       WHERE account_ref=$1 AND product='check_ins' AND object_type='EventTime'
         AND missing_run_id IS NULL
         AND normalized->'sourceRelationships'->'event'->'data'->>'id'=$2
         AND to_char((normalized->'attributes'->>'starts_at')::timestamptz
           AT TIME ZONE 'America/Chicago','HH24:MI')='09:30'
       ORDER BY normalized->'attributes'->>'starts_at',external_id LIMIT 1`,
      [account, eventId],
    );
    if (
      historicalMorning.rowCount !== 1 ||
      historicalMorning.rows[0].local_date !== HISTORY_START
    )
      throw new HistoricalCheckInRouteError(
        "The first approved 9:30 AM EventTime template is missing or has a different date",
      );

    operationStage = "validating owner-approved current mappings";
    const current = await c.query<Mapping>(
      `SELECT product,object_type,external_id,ministry,measure,scope,
         effective_from::text,effective_to::text
       FROM ministry_source_mappings m
       WHERE account_ref=$1 AND enabled AND effective_from=$2::date AND effective_to IS NULL
         AND id NOT IN (SELECT supersedes_id FROM ministry_source_mappings
                        WHERE supersedes_id IS NOT NULL)
         AND ((product='check_ins' AND
               ((object_type='Location' AND measure='attendance') OR
                (object_type='EventTime' AND measure='service_session'))) OR
              (product='groups' AND object_type='GroupType'
                AND measure='student_group_classification'))
       ORDER BY product,object_type,scope,ministry,external_id`,
      [account, CURRENT_START],
    );
    const locations = current.rows.filter(
      (row) => row.product === "check_ins" && row.object_type === "Location",
    );
    const studentCategories = current.rows.filter(
      (row) => row.product === "groups" && row.object_type === "GroupType",
    );
    const serviceTimes = current.rows.filter(
      (row) => row.product === "check_ins" && row.object_type === "EventTime",
    );
    if (locations.length !== 27 || studentCategories.length !== 4 || serviceTimes.length !== 7)
      throw new HistoricalCheckInRouteError(
        "The owner-approved current location, student-category, or service-time mappings changed",
      );

    const expectedByScope: Record<string, string[]> = {
      "service-1": ["transit", "upstreet", "waumba-land"],
      "service-2": ["transit", "upstreet", "waumba-land"],
      "service-3": ["insideout"],
    };
    for (const [scope, ministries] of Object.entries(expectedByScope)) {
      const actual = serviceTimes
        .filter((row) => row.scope === scope)
        .map((row) => row.ministry)
        .sort();
      if (JSON.stringify(actual) !== JSON.stringify([...ministries].sort()))
        throw new HistoricalCheckInRouteError("The approved service-time routes changed");
    }

    const currentTemplateIds = [...new Set(serviceTimes.map((row) => row.external_id))];
    const templateRows = await c.query<{ id: string; event_id: string; time: string }>(
      `SELECT external_id AS id,
         normalized->'sourceRelationships'->'event'->'data'->>'id' AS event_id,
         to_char((normalized->'attributes'->>'starts_at')::timestamptz
           AT TIME ZONE 'America/Chicago','HH24:MI') AS time
       FROM pco_source_entities
       WHERE account_ref=$1 AND product='check_ins' AND object_type='EventTime'
         AND missing_run_id IS NULL AND external_id=ANY($2::text[])`,
      [account, currentTemplateIds],
    );
    const timeById = new Map(templateRows.rows.map((row) => [row.id, row]));
    const expectedClockByScope = { "service-1": "09:00", "service-2": "11:00", "service-3": "16:30" };
    if (
      serviceTimes.some((row) => {
        const template = timeById.get(row.external_id);
        return !template ||
          template.event_id !== eventId ||
          template.time !== expectedClockByScope[row.scope as keyof typeof expectedClockByScope];
      })
    )
      throw new HistoricalCheckInRouteError("The stored EventTime templates do not match the approved clock times");

    operationStage = "checking for conflicting historical mappings";
    const note =
      "Owner approved applying the existing Check-In room and student GroupType classifications " +
      `to historical PCO records from ${HISTORY_START} through ${HISTORICAL_END}. ` +
      "Workbook headcounts remain a separate aggregate measure. No PCO scan was started.";
    const makeTarget = (
      mapping: Mapping,
      effectiveFrom: string,
      effectiveTo: string,
      extraNote = "",
      externalId = mapping.external_id,
    ): MappingTarget => ({
      product: mapping.product,
      object_type: mapping.object_type,
      external_id: externalId,
      ministry: mapping.ministry,
      measure: mapping.measure,
      scope: mapping.scope,
      effectiveFrom,
      effectiveTo,
      note: `${note}${extraNote}`,
    });

    targets = [
      ...locations.map((mapping) => makeTarget(mapping, HISTORY_START, HISTORICAL_END)),
      ...studentCategories.map((mapping) =>
        makeTarget(mapping, HISTORY_START, HISTORICAL_END),
      ),
      ...serviceTimes
        .filter((mapping) => mapping.scope === "service-1")
        .map((mapping) =>
          makeTarget(
            mapping,
            HISTORY_START,
            NINE_THIRTY_END,
            " The 09:30 Chicago-time route follows the staged Normal Service Times history.",
            historicalMorning.rows[0].id,
          ),
        ),
      ...serviceTimes
        .filter((mapping) => mapping.scope === "service-1")
        .map((mapping) =>
          makeTarget(
            mapping,
            NINE_AM_START,
            HISTORICAL_END,
            " The 09:00 Chicago-time route follows the staged Normal Service Times history.",
          ),
        ),
      ...serviceTimes
        .filter((mapping) => mapping.scope === "service-2")
        .map((mapping) =>
          makeTarget(
            mapping,
            ELEVEN_AM_START,
            HISTORICAL_END,
            " The 11:00 Chicago-time route follows the staged Normal Service Times history.",
          ),
        ),
      ...serviceTimes
        .filter((mapping) => mapping.scope === "service-3")
        .map((mapping) =>
          makeTarget(
            mapping,
            FOUR_THIRTY_START,
            HISTORICAL_END,
            " The 16:30 Chicago-time route follows the staged Normal Service Times history.",
          ),
        ),
    ];
    if (targets.length !== 41)
      throw new HistoricalCheckInRouteError("The approved historical route set is incomplete");

    const existing = await c.query<Mapping>(
      `SELECT product,object_type,external_id,ministry,measure,scope,
         effective_from::text,effective_to::text
       FROM ministry_source_mappings m
       WHERE account_ref=$1 AND enabled
         AND id NOT IN (SELECT supersedes_id FROM ministry_source_mappings
                        WHERE supersedes_id IS NOT NULL)
         AND product IN ('check_ins','groups')
         AND object_type IN ('Location','EventTime','GroupType')`,
      [account],
    );
    const pending: MappingTarget[] = [];
    for (const target of targets) {
      const same = existing.rows.filter((row) => sameTarget(row, target));
      if (same.length > 1)
        throw new HistoricalCheckInRouteError("Duplicate historical routes need review");
      if (same.length === 1) continue;
      if (existing.rows.some((row) => overlapsTarget(row, target)))
        throw new HistoricalCheckInRouteError(
          "An existing source interpretation overlaps the approved historical dates",
        );
      pending.push(target);
    }
    alreadyPresent = targets.length - pending.length;
    targets = pending;

    routeSummary = [
      { kind: "location routes", mappings: locations.length, from: HISTORY_START, through: HISTORICAL_END },
      { kind: "student GroupType routes", mappings: studentCategories.length, from: HISTORY_START, through: HISTORICAL_END },
      { kind: "9:30 AM service 1 routes", mappings: 3, from: HISTORY_START, through: NINE_THIRTY_END },
      { kind: "9:00 AM service 1 routes", mappings: 3, from: NINE_AM_START, through: HISTORICAL_END },
      { kind: "11:00 AM service 2 routes", mappings: 3, from: ELEVEN_AM_START, through: HISTORICAL_END },
      { kind: "4:30 PM service 3 route", mappings: 1, from: FOUR_THIRTY_START, through: HISTORICAL_END },
    ];

    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }

  const preview = {
    mode: apply ? "apply" : "preview",
    sourceCoverage: "Uses the already-staged completed PCO history; no new scan is started.",
    historicalRoutes: routeSummary,
    totalHistoricalMappings: 41,
    mappingsAlreadyPresent: alreadyPresent,
    mappingsToCreate: targets.length,
    reportingWeeks: { start: HISTORY_START, end: PUBLISH_END },
    scanStarted: false,
    metricsPublished: false,
  };
  if (!apply) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  operationStage = "creating approved historical mappings";
  for (const mapping of targets) {
    await createMinistryMapping(actor!, {
      product: mapping.product,
      objectType: mapping.object_type,
      externalId: mapping.external_id,
      ministry: mapping.ministry,
      measure: mapping.measure,
      scope: mapping.scope,
      effectiveFrom: mapping.effectiveFrom,
      effectiveTo: mapping.effectiveTo,
      note: mapping.note,
      enabled: true,
    });
  }
  operationStage = "publishing and verifying historical attendance";
  const publication = await publishMinistryData(actor!, {
    product: "check_ins",
    start: HISTORY_START,
    end: PUBLISH_END,
  });
  const verify = await pool.connect();
  try {
    await verify.query("BEGIN READ ONLY");
    await verify.query("SELECT set_config('np.role','admin',true)");
    await verify.query("SELECT set_config('np.user_id',$1,true)", [actor!.userId]);
    const validity = await verify.query(
      "SELECT np_ministry_publication_valid($1) AS valid",
      [publication.publicationId],
    );
    const published = await verify.query(
      `SELECT ministry,measure,scope,quality,count(*)::int AS weeks,
         count(value)::int AS populated,min(week)::text AS first_week,
         max(week)::text AS last_week
       FROM ministry_metric_values WHERE publication_id=$1
       GROUP BY ministry,measure,scope,quality ORDER BY ministry,measure,scope,quality`,
      [publication.publicationId],
    );
    await verify.query("COMMIT");
    const hasAttendance = published.rows.some((row) => row.measure === "attendance");
    const valid = validity.rows[0]?.valid === true && hasAttendance;
    console.log(
      JSON.stringify(
        {
          ...preview,
          mode: "published",
          ...publication,
          coverage: published.rows,
          publicationValid: validity.rows[0]?.valid === true,
          verified: valid,
          metricsPublished: valid,
        },
        null,
        2,
      ),
    );
    if (!valid) throw new HistoricalCheckInRouteError("Publication saved but verification needs attention");
  } catch (error) {
    await verify.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    verify.release();
  }
}

main()
  .catch((error: unknown) => {
    if (process.argv.includes("--debug") && error instanceof Error)
      console.error(`${error.name}: ${error.message.slice(0, 300)}`);
    console.error(
      error instanceof HistoricalCheckInRouteError
        ? error.message
        : `Historical Check-In route operation failed while ${operationStage}`,
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
