import type { PoolClient } from "pg";
import type {
  MinistryDataWorkspace,
  MinistryDataAdmin,
  MinistrySourceMappingInput,
  MinistryPublicationInput,
  MinistryPublicationResult,
  MinistryHistoryInput,
  GivingTransactionPage,
} from "@workspace/api-zod";
import type { Principal } from "./auth";
import {
  adminTransaction,
  AccessError,
  validCalendarDate,
  type AdminActor,
} from "./administration";
import { attendanceTransaction } from "./attendance";
import { completedSunday, shiftDate, sunday, chicagoDate } from "./attendance-calculation";
import { recordAudit } from "./audit";
import { digest } from "./planning-center-client";
import {
  getCheckInReview,
  readCheckInResolutions,
  resolveCheckIn,
} from "./ministry-checkin-review-store";
import {
  checkInTemplateIds,
  loadCheckInFactsForWindow,
  loadCheckInGradeFacts,
} from "./ministry-checkin-source";
import { reportingWeekEnding } from "./reporting-calendar";

export { getCheckInReview, resolveCheckIn };
import {
  summarizeGivingPatternsByWeeks,
  GIVING_PATTERN_VERSION,
  type GivingUnit,
} from "./giving-patterns";
import { currentGivingPolicy } from "./giving-policy";
import { canonical } from "./planning-center-source";
import {
  compileMinistryFacts,
  MINISTRY_DEFINITION_VERSION,
  MAPPING_ONLY_MEASURES,
  MINISTRY_SLUGS,
  MEASURES,
  SAFE_SCOPES,
  exactMinorUnits,
  ordinalSunday,
  type SourceFact,
  type SourceMapping,
  type MetricFact,
} from "./ministry-calculation";
import { acceptedBlankAttendanceIsZero } from "./workbook";

const mappingSelect = `SELECT id,product,object_type AS "objectType",external_id AS "externalId",supersedes_id AS "supersedesId",enabled,
 ministry,measure,scope,effective_from::text AS "effectiveFrom",effective_to::text AS "effectiveTo",note
 FROM ministry_source_mappings`;
const allowedMapping: Record<string, Record<string, string[]>> = {
  check_ins: {
    Event: ["attendance", "volunteers", "first_known"],
    EventTime: ["service_session"],
    Location: ["attendance", "volunteers", "first_known"],
  },
  serving: { ServiceType: ["scheduled", "accepted"], Team: ["scheduled", "accepted"] },
  groups: {
    Group: [
      "group_attendance",
      "group_memberships",
      "group_leaders",
      "student_group_classification",
    ],
    GroupType: ["group_attendance", "student_group_classification"],
  },
  giving: { Fund: ["giving_total", "fund_giving"] },
};
function validateTarget(ministry: string, measure: string, scope: string) {
  if (
    !MINISTRY_SLUGS.some((s) => s === ministry) ||
    (!MEASURES[measure] && !MAPPING_ONLY_MEASURES.has(measure)) ||
    !SAFE_SCOPES.some((s) => s === scope)
  )
    throw new AccessError(400, "Choose a supported ministry, measure and fixed aggregate scope");
  if (
    measure === "service_session" &&
    (!["upstreet", "waumba-land", "transit", "insideout"].includes(ministry) ||
      !["service-1", "service-2", "service-3"].includes(scope))
  )
    throw new AccessError(
      400,
      "Service-time routing must target a child ministry and service-1, service-2 or service-3",
    );
  if (
    measure === "student_group_classification" &&
    (!["transit", "insideout"].includes(ministry) || scope !== "all")
  )
    throw new AccessError(
      400,
      "Student group classification must target Transit or InsideOut with all scope",
    );
  if (
    [
      "giving_total",
      "all_fund_giving",
      "refund_total",
      "fund_giving",
      "recurring_schedules",
      "first_time_givers",
      "lapsed_givers",
      "legacy_first_time_givers",
      "legacy_recurring_givers",
      "legacy_lapsed_givers",
    ].includes(measure) !==
    (ministry === "giving")
  )
    throw new AccessError(400, "Financial measures belong only to Giving");
  if (measure === "giving_total" && scope !== "all")
    throw new AccessError(400, "General Giving must use the all-services scope");
  if (scope.startsWith("fuel-") && (ministry !== "giving" || measure !== "fund_giving"))
    throw new AccessError(400, "Fuel campaign scopes belong only to fund giving");
}
function dates(start: string, end: string) {
  if (
    !sunday(start) ||
    !sunday(end) ||
    start > end ||
    +new Date(end) - +new Date(start) > 10 * 366 * 86400000
  )
    throw new AccessError(400, "Choose Sunday dates in order, no more than ten years apart");
}
async function loadGivingSourceFacts(
  c: PoolClient,
  account: string,
  runId: string,
  hasBackfill: boolean,
): Promise<SourceFact[]> {
  const pageSize = 5_000;
  const pageLimit = pageSize + 1;
  const facts: SourceFact[] = [];
  let afterType = "";
  let afterId = "";
  while (true) {
    const page = await c.query<{
      objectType: string;
      externalId: string;
      normalized: {
        sourceType: string;
        sourceId: string;
        attributes: SourceFact["attributes"];
        sourceRelationships: SourceFact["relationships"];
        sourceCollection: string | null;
      };
    }>(
      `SELECT object_type AS "objectType",external_id AS "externalId",normalized
       FROM pco_source_entities
       WHERE account_ref=$1 AND product='giving'
         AND (observed_run_id=$2 OR ($3 AND observed_run_id IS NOT NULL))
         AND missing_run_id IS NULL
         AND (object_type,external_id)>($4,$5)
       ORDER BY object_type,external_id LIMIT $6`,
      [account, runId, hasBackfill, afterType, afterId, pageLimit],
    );
    if (!page.rows.length) break;
    if (facts.length + page.rows.length > 500_000)
      throw new AccessError(
        409,
        "Dataset exceeds bounded publisher; partition coverage before continuing",
      );
    for (const row of page.rows) {
      const normalized = row.normalized;
      facts.push({
        type: normalized.sourceType,
        id: normalized.sourceId,
        attributes: normalized.attributes,
        relationships: normalized.sourceRelationships,
        sourceCollection: normalized.sourceCollection,
      });
    }
    const last = page.rows.at(-1)!;
    afterType = last.objectType;
    afterId = last.externalId;
    if (page.rows.length < pageLimit) break;
  }
  return facts;
}
export async function readMinistryData(
  p: Principal,
  ministry: string,
  start?: string,
  end?: string,
): Promise<MinistryDataWorkspace> {
  if (!MINISTRY_SLUGS.some((s) => s === ministry))
    throw new AccessError(404, "Ministry data not available");
  const now = new Date(),
    latest = completedSunday(now),
    to = end ?? latest,
    from = start ?? shiftDate(to, -84);
  dates(from, to);
  return attendanceTransaction(p, false, false, async (c) => {
    // First select the newest revision from each source, THEN choose between
    // independent PCO/workbook sources. Never fall back to stale earlier PCO
    // data just because the newest revision marks that value missing.
    // Validate each selected publication once, not once per metric/week:
    // evidence is shared across a publication and can span years of records.
    const result = await c.query(
      `WITH revisions AS (
        SELECT v.*,p.source_kind,p.source_as_of,p.definition_version,p.created_at,
          row_number() OVER (PARTITION BY v.measure,v.scope,v.week,v.unit,p.product,p.source_kind
            ORDER BY p.created_at DESC,p.id DESC) AS revision
        FROM ministry_metric_values v JOIN ministry_publications p ON p.id=v.publication_id
        WHERE v.ministry=$1 AND v.week BETWEEN $2::date AND $3::date
      ), current_rows AS MATERIALIZED (
        SELECT * FROM revisions WHERE revision=1
      ), validity AS MATERIALIZED (
        SELECT id,np_ministry_publication_valid(id) AS source_valid
        FROM (SELECT DISTINCT publication_id AS id FROM current_rows) ids
      ), chosen AS (
        SELECT r.*,source_valid,row_number() OVER (PARTITION BY measure,scope,week,unit ORDER BY
          CASE WHEN NOT source_valid THEN 3 WHEN quality='complete' THEN 0 WHEN quality='partial' THEN 1 ELSE 2 END,
          CASE source_kind WHEN 'pco' THEN 0 ELSE 1 END,created_at DESC) AS preference
        FROM current_rows r JOIN validity s ON s.id=r.publication_id
      )
      SELECT measure,scope,week::text,CASE WHEN source_valid THEN value::float8 ELSE NULL END AS value,unit,
        CASE WHEN source_valid THEN quality ELSE 'invalidated' END AS quality,denominator::float8 AS denominator,
        CASE WHEN source_valid THEN flags ELSE '["source_configuration_changed"]'::jsonb END AS flags,
        source_kind AS source,source_as_of AS "sourceAsOf",definition_version AS "definitionVersion"
      FROM chosen WHERE preference=1 ORDER BY week DESC,measure,scope,unit`,
      [ministry, from, to],
    );
    const metrics = result.rows.map((r) => ({
      ...r,
      title: MEASURES[r.measure]?.title ?? "Unrecognized measure",
      sourceAsOf: new Date(r.sourceAsOf).toISOString(),
    }));
    const expected =
      ministry === "giving"
        ? [
            "giving_total",
            "all_fund_giving",
            "refund_total",
            "fund_giving",
            "recurring_schedules",
            "first_time_givers",
            "lapsed_givers",
            "legacy_first_time_givers",
            "legacy_recurring_givers",
            "legacy_lapsed_givers",
          ]
        : ministry === "connection"
          ? [
              "group_count",
              "group_attendance",
              "group_memberships",
              "group_leaders",
              "coaches",
              "guest_services_volunteers",
              "total_volunteers",
              "groups_reported",
              "member_attendance",
              "scheduled",
              "accepted",
            ]
          : [
              "attendance",
              "attendance_headcount",
              "volunteers",
              "volunteer_headcount",
              "first_known",
              "new_guests",
              "new_families",
              "volunteer_rally",
              "large_group",
              "small_group",
              "scheduled",
              "accepted",
            ];
    const kpis = expected.map((key) => ({
      key,
      title: MEASURES[key].title,
      status: metrics.some((m) => m.measure === key && m.value !== null)
        ? "available"
        : "not_published",
      reason: MEASURES[key].definition,
    }));
    const later =
      ministry === "giving"
        ? [
            [
              "health_integration",
              "Giving and health",
              "Later-phase restricted health integration will use versioned first-recorded-gift/cadence/three-miss evidence, not expose person-linked giving to non-Admins.",
            ],
          ]
        : [
            [
              "scorecard",
              "Ministry scorecard",
              "Phase 6 configurable scorecards and evaluation workflows; not inferred from attendance.",
            ],
            [
              "engagement",
              "Engagement and retention",
              "Phase 8 cross-domain identities/journeys; not inferred from unmatched PCO person IDs.",
            ],
          ];
    for (const [key, title, reason] of later)
      kpis.push({ key, title, status: "definition_or_later_phase", reason });
    await recordAudit(p.userId!, "ministry.aggregate_read", "ministry", null, "success", c);
    return {
      ministry,
      start: from,
      end: to,
      latestCompletedWeek: latest,
      timezone: "America/Chicago",
      asOf: now.toISOString(),
      metrics,
      kpis,
      issues: metrics.length
        ? [
            "Missing values are unknown, not zero. PCO wins overlapping complete values; independent sources are never added together. Snapshot measures only describe their observation date.",
          ]
        : [
            "No data has been published for this range. An Admin must finish a source scan, map its ministry meaning and publish, or import accepted mapped workbook history.",
          ],
    };
  });
}
export async function ministryDataAdmin(p: Principal): Promise<MinistryDataAdmin> {
  return adminTransaction(p, async (c) => {
    const connection = await c.query(
      "SELECT account_ref FROM pco_connections WHERE id='planning_center'",
    );
    const account = connection.rows[0]?.account_ref ?? "";
    const mappings = await c.query(
      `${mappingSelect} WHERE account_ref=$1 ORDER BY created_at DESC LIMIT 500`,
      [account],
    );
    const sources = await c.query(
      `SELECT product,object_type AS "objectType",external_id AS "externalId",
      CASE WHEN product='check_ins' AND object_type='EventTime' THEN
        coalesce((
          SELECT nullif(event.normalized->'attributes'->>'name','')
          FROM pco_source_entities event
          WHERE event.account_ref=source.account_ref AND event.product='check_ins'
            AND event.object_type='Event'
            AND event.external_id=source.normalized->'sourceRelationships'->'event'->'data'->>'id'
        ),'Check-Ins event')
        || ' · ' ||
        to_char((source.normalized->'attributes'->>'starts_at')::timestamptz
          AT TIME ZONE 'America/Chicago','Mon DD, YYYY HH12:MI AM')
      ELSE coalesce(normalized->'attributes'->>'name',object_type || ' ' || external_id) END AS label
      FROM pco_source_entities source WHERE account_ref=$1 AND missing_run_id IS NULL
      AND ((product='check_ins' AND object_type IN ('Event','Location'))
        OR (product='check_ins' AND object_type='EventTime'
          AND (normalized->'attributes'->>'starts_at')::timestamptz >= now() - interval '120 days')
        OR (product='serving' AND object_type='ServiceType')
        OR (product='groups' AND object_type IN ('Group','GroupType')) OR (product='giving' AND object_type='Fund'))
      UNION
      SELECT 'serving','Team',normalized->'sourceRelationships'->'team'->'data'->>'id',
        'Services team ' || (normalized->'sourceRelationships'->'team'->'data'->>'id')
      FROM pco_source_entities WHERE account_ref=$1 AND product='serving' AND object_type='PlanPerson'
        AND normalized->'sourceRelationships'->'team'->'data'->>'id' IS NOT NULL
      ORDER BY product,"objectType","externalId" LIMIT 2500`,
      [account],
    );
    const batches =
      await c.query(`SELECT b.id,b.filename,b.sha256,b.snapshot_date AS "snapshotDate",b.state,
      b.created_at AS "createdAt" FROM import_batches b JOIN workbook_source_authorities a ON a.batch_id=b.id AND a.sha256=b.sha256
      WHERE b.state='active' ORDER BY b.created_at DESC LIMIT 100`);
    await recordAudit(p.userId!, "ministry.configuration_read", "workspace", null, "success", c);
    return JSON.parse(
      JSON.stringify({
        mappings: mappings.rows,
        sources: sources.rows,
        batches: batches.rows,
        asOf: new Date().toISOString(),
      }),
    );
  });
}
export async function createMinistryMapping(p: AdminActor, input: MinistrySourceMappingInput) {
  validateTarget(input.ministry, input.measure, input.scope);
  if (input.enabled && input.product === "giving" &&
    input.measure === "fund_giving" && input.scope === "fuel")
    throw new AccessError(400, "Choose a specific Fuel campaign; workbook Fuel has no campaign assignment");
  if (
    !allowedMapping[input.product]?.[input.objectType]?.includes(input.measure) ||
    !validCalendarDate(input.effectiveFrom) ||
    (input.effectiveTo !== null &&
      (!validCalendarDate(input.effectiveTo) || input.effectiveTo < input.effectiveFrom))
  )
    throw new AccessError(400, "Invalid source-to-measure mapping or effective dates");
  await adminTransaction(p, async (c) => {
    const connection = await c.query(
      "SELECT account_ref FROM pco_connections WHERE id='planning_center'",
    );
    const account = connection.rows[0]?.account_ref;
    if (!account) throw new AccessError(409, "A source organization is required");
    const options =
      input.objectType === "Team"
        ? await c.query(
            "SELECT 1 FROM pco_source_entities WHERE account_ref=$1 AND product='serving' AND object_type='PlanPerson' AND normalized->'sourceRelationships'->'team'->'data'->>'id'=$2 LIMIT 1",
            [account, input.externalId],
          )
        : await c.query(
            "SELECT 1 FROM pco_source_entities WHERE account_ref=$1 AND product=$2 AND object_type=$3 AND external_id=$4 LIMIT 1",
            [account, input.product, input.objectType, input.externalId],
          );
    if (!options.rowCount) throw new AccessError(409, "Import this resource before mapping it");
    const overlap = await c.query(
      `SELECT id FROM ministry_source_mappings WHERE account_ref=$1 AND product=$2 AND object_type=$3
      AND external_id=$4 AND measure=$5
      AND ($5<>'service_session' OR ministry=$6)
      AND id IS DISTINCT FROM $9::uuid
      AND id NOT IN (SELECT supersedes_id FROM ministry_source_mappings WHERE supersedes_id IS NOT NULL)
      AND enabled AND daterange(effective_from,effective_to,'[]') && daterange($7::date,$8::date,'[]')`,
      [
        account,
        input.product,
        input.objectType,
        input.externalId,
        input.measure,
        input.ministry,
        input.effectiveFrom,
        input.effectiveTo,
        input.supersedesId ?? null,
      ],
    );
    if (overlap.rowCount)
      throw new AccessError(
        409,
        "An overlapping interpretation already exists; preserve history and choose nonoverlapping effective dates",
      );
    if (input.supersedesId) {
      const prior = await c.query(
        `SELECT 1 FROM ministry_source_mappings m WHERE id=$1 AND account_ref=$2 AND product=$3
        AND object_type=$4 AND external_id=$5 AND measure=$6
        AND ($6<>'service_session' OR ministry=$7)
        AND NOT EXISTS(SELECT 1 FROM ministry_source_mappings n WHERE n.supersedes_id=m.id)`,
        [
          input.supersedesId,
          account,
          input.product,
          input.objectType,
          input.externalId,
          input.measure,
          input.ministry,
        ],
      );
      if (!prior.rowCount)
        throw new AccessError(
          409,
          "Only the current interpretation of this source/measure can be replaced",
        );
    }
    const r = await c.query(
      `INSERT INTO ministry_source_mappings(account_ref,product,object_type,external_id,ministry,measure,scope,effective_from,effective_to,note,created_by,supersedes_id,enabled)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        account,
        input.product,
        input.objectType,
        input.externalId,
        input.ministry,
        input.measure,
        input.scope,
        input.effectiveFrom,
        input.effectiveTo,
        input.note,
        p.userId,
        input.supersedesId ?? null,
        input.enabled ?? true,
      ],
    );
    await recordAudit(
      p.userId!,
      "ministry.mapping_created",
      "ministry_mapping",
      r.rows[0].id,
      "success",
      c,
    );
  });
}
async function publish(
  c: PoolClient,
  p: AdminActor,
  input: {
    product: string;
    account: string;
    key: string;
    kind: string;
    asOf: Date;
    start: string;
    end: string;
    values: MetricFact[];
    issues: string[];
    evidence: unknown;
  },
): Promise<MinistryPublicationResult> {
  const previous = await c.query(
    "SELECT id FROM ministry_publications WHERE product=$1 AND account_ref=$2 AND source_key=$3",
    [input.product, input.account, input.key],
  );
  if (previous.rowCount)
    return {
      publicationId: previous.rows[0].id,
      values: input.values.length,
      issues: input.issues,
      reused: true,
    };
  const r = await c.query(
    `INSERT INTO ministry_publications(product,account_ref,source_key,source_kind,definition_version,source_as_of,coverage_start,coverage_end,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()) RETURNING id`,
    [
      input.product,
      input.account,
      input.key,
      input.kind,
      MINISTRY_DEFINITION_VERSION,
      input.asOf,
      input.start,
      input.end,
    ],
  );
  const id = r.rows[0].id;
  await c.query(
    `INSERT INTO ministry_metric_values(publication_id,ministry,measure,scope,week,value,unit,quality,denominator,flags)
    SELECT $1,x->>'ministry',x->>'measure',x->>'scope',(x->>'week')::date,(x->>'value')::bigint,x->>'unit',x->>'quality',
      (x->>'denominator')::bigint,x->'flags' FROM jsonb_array_elements($2::jsonb) AS x`,
    [id, JSON.stringify(input.values)],
  );
  await c.query(
    "INSERT INTO ministry_publication_evidence(publication_id,evidence,created_by) VALUES($1,$2,$3)",
    [id, JSON.stringify(input.evidence), p.userId],
  );
  await recordAudit(p.userId!, "ministry.data_published", "ministry_publication", id, "success", c);
  return { publicationId: id, values: input.values.length, issues: input.issues, reused: false };
}
export async function publishMinistryData(
  p: AdminActor,
  input: MinistryPublicationInput,
): Promise<MinistryPublicationResult> {
  dates(input.start, input.end);
  return adminTransaction(p, (c) => publishMinistryDataInTransaction(c, p, input));
}
async function publishMinistryDataInTransaction(
  c: PoolClient,
  p: AdminActor,
  input: MinistryPublicationInput,
): Promise<MinistryPublicationResult> {
  dates(input.start, input.end);
  const connection = await c.query(
    "SELECT account_ref FROM pco_connections WHERE id='planning_center'",
  );
  const account = connection.rows[0]?.account_ref;
  if (!account) throw new AccessError(409, "No Planning Center organization");
  const runs = await c.query(
    `SELECT id,status,finished_at,coverage_start::text AS coverage_start FROM pco_sync_runs WHERE account_ref=$1 AND product=$2 ORDER BY started_at DESC,id DESC LIMIT 1`,
    [account, input.product],
  );
  const run = runs.rows[0];
  if (!run || run.status !== "complete" || !run.finished_at)
    throw new AccessError(409, "Finish the latest source scan before publication");
  const hasBackfill = !!(
    await c.query(
      `SELECT 1 FROM pco_sync_runs WHERE account_ref=$1 AND product=$2 AND mode='backfill' AND status='complete' LIMIT 1`,
      [account, input.product],
    )
  ).rowCount;
  if (
    run.coverage_start &&
    input.start < String(run.coverage_start) &&
    !(input.product === "giving" && hasBackfill)
  )
    throw new AccessError(
      409,
      "The selected range starts before this scan's current-data coverage",
    );
  const mappings = (
    await c.query<SourceMapping>(
      `${mappingSelect} WHERE account_ref=$1 AND product=$2 AND enabled
      AND id NOT IN (SELECT supersedes_id FROM ministry_source_mappings WHERE supersedes_id IS NOT NULL) ORDER BY id`,
      [account, input.product],
    )
  ).rows;
  if (["serving", "check_ins"].includes(input.product) && !mappings.length)
    throw new AccessError(409, "Map source resources to ministry measures first");
  let facts: SourceFact[];
  let gradeFacts: SourceFact[] = [];
  if (input.product === "check_ins") {
    try {
      facts = await loadCheckInFactsForWindow(
        c,
        account,
        input.start,
        input.end,
        checkInTemplateIds(mappings),
      );
      gradeFacts = await loadCheckInGradeFacts(c, account);
    } catch (error) {
      if (error instanceof AccessError) throw error;
      throw new AccessError(
        409,
        error instanceof Error ? error.message : "Check-In source window could not be loaded",
      );
    }
  } else {
    if (input.product === "giving") {
      facts = await loadGivingSourceFacts(c, account, run.id, hasBackfill);
    } else {
      const sources = await c.query(
        `SELECT normalized FROM pco_source_entities WHERE account_ref=$1 AND product=$2
          AND (observed_run_id=$3 OR ($4 AND observed_run_id IS NOT NULL))
          AND missing_run_id IS NULL LIMIT 500001`,
        [account, input.product, run.id, false],
      );
      if (sources.rows.length > 500000)
        throw new AccessError(
          409,
          "Dataset exceeds bounded publisher; partition coverage before continuing",
        );
      facts = sources.rows.map(({ normalized: n }) => ({
        type: n.sourceType,
        id: n.sourceId,
        attributes: n.attributes,
        relationships: n.sourceRelationships,
        sourceCollection: n.sourceCollection,
      }));
    }
  }
  const checkInResolutions =
    input.product === "check_ins"
      ? await readCheckInResolutions(c, account)
      : new Map<string, "include" | "exclude">();
  let groupMappings: SourceMapping[] = [];
  let groupFacts: SourceFact[] = [];
  let groupRunId: string | null = null;
  let groupSnapshotAt: Date | null = null;
  if (input.product === "check_ins") {
    groupMappings = (
      await c.query<SourceMapping>(
        `${mappingSelect} WHERE account_ref=$1 AND product='groups' AND object_type IN ('Group','GroupType')
        AND measure='student_group_classification'
        AND enabled AND id NOT IN (SELECT supersedes_id FROM ministry_source_mappings WHERE supersedes_id IS NOT NULL)
        ORDER BY id`,
        [account],
      )
    ).rows;
    if (groupMappings.length) {
      const groupRun = (
        await c.query(
          `SELECT id,finished_at FROM pco_sync_runs
          WHERE account_ref=$1 AND product='groups' AND status='complete'
          ORDER BY started_at DESC,id DESC LIMIT 1`,
          [account],
        )
      ).rows[0];
      if (groupRun?.finished_at) {
        groupRunId = String(groupRun.id);
        groupSnapshotAt = new Date(groupRun.finished_at);
        const groupSources = await c.query(
          `SELECT jsonb_build_object(
            'sourceType',object_type,
            'sourceId',external_id,
            'attributes',CASE
              WHEN object_type='Group' THEN jsonb_build_object(
                'archived_at',normalized->'attributes'->'archived_at')
              ELSE jsonb_build_object(
                'joined_at',normalized->'attributes'->'joined_at',
                'role',normalized->'attributes'->'role')
            END,
            'sourceRelationships',normalized->'sourceRelationships',
            'sourceCollection',normalized->'sourceCollection'
          ) AS normalized
          FROM pco_source_entities
          WHERE account_ref=$1 AND product='groups' AND object_type IN ('Group','Membership')
            AND observed_run_id=$2 AND missing_run_id IS NULL
          LIMIT 200001`,
          [account, groupRunId],
        );
        if (groupSources.rows.length > 200000)
          throw new AccessError(409, "Groups membership snapshot exceeds the safe matching limit");
        groupFacts = groupSources.rows.map(({ normalized: n }) => ({
          type: n.sourceType,
          id: n.sourceId,
          attributes: n.attributes ?? {},
          relationships: n.sourceRelationships ?? {},
          sourceCollection: n.sourceCollection ?? null,
        }));
      }
    }
  }
  const compiled = compileMinistryFacts(
    input.product,
    facts,
    mappings,
    input.start,
    input.end,
    new Date(run.finished_at),
    checkInResolutions,
    groupFacts,
    groupMappings,
    groupSnapshotAt,
    gradeFacts,
    input.product !== "check_ins" ||
      (!!run.coverage_start && input.start <= String(run.coverage_start)),
  );
  const givingPolicy = input.product === "giving" ? await currentGivingPolicy(c) : null;
  let givingUnits: GivingUnit[] | undefined;
  if (input.product === "giving" && givingPolicy) {
    const weeks: string[] = [];
    for (let week = input.start; week <= input.end; week = shiftDate(week, 7))
      weeks.push(week);
    const givingAnalysis = summarizeGivingPatternsByWeeks(
      facts,
      new Date(run.finished_at),
      hasBackfill,
      givingPolicy,
      weeks,
    );
    givingUnits = givingAnalysis.givingUnits;
    for (const summary of givingAnalysis.weeks) {
      compiled.values.push({
        ministry: "giving",
        measure: "first_time_givers",
        scope: "all",
        week: summary.week,
        value: summary.firstTimeGivers,
        unit: "giving_units",
        quality: summary.firstTimeGivers === null ? "missing" : "complete",
        denominator: null,
        flags: [
          "current_pco_joint_giving_units",
          ...(summary.personMetadata ? [] : ["first_gift_metadata_required"]),
          ...(summary.linkageComplete ? [] : ["giving_unit_linkage_incomplete"]),
        ],
      });
      compiled.values.push({
        ministry: "giving",
        measure: "lapsed_givers",
        scope: "all",
        week: summary.week,
        value: hasBackfill ? summary.lapsedGivers : null,
        unit: "giving_units",
        quality:
          hasBackfill && summary.lapsedDenominator > 0 ? "complete" : "missing",
        denominator: summary.lapsedDenominator,
        flags: !hasBackfill
          ? ["historical_backfill_required"]
          : !summary.lapsedDenominator
            ? ["no_units_with_classifiable_history"]
            : ["unclassified_patterns_excluded", "current_pco_joint_giving_units"],
      });
    }
  }
  // Check-Ins attendance is Sunday-only: a bounded Friday–Sunday scan covers
  // that entire attendance Sunday. Other products still need a full week.
  const firstCoveredWeek =
    input.product !== "check_ins" &&
    run.coverage_start &&
    !(input.product === "giving" && hasBackfill)
    ? new Date(`${run.coverage_start}T12:00:00Z`).getUTCDay() === 1
      ? null
      : (() => {
          const day = new Date(`${run.coverage_start}T12:00:00Z`);
          return shiftDate(String(run.coverage_start), (7 - day.getUTCDay()) % 7);
        })()
    : null;
  for (const row of compiled.values) {
    if (row.week === firstCoveredWeek) {
      row.value = null;
      row.quality = "partial";
      row.flags.push("partial_first_reporting_week");
    }
    // Attendance and received money for an unfinished week are not a final
    // weekly actual. Scheduling and explicitly labelled snapshots may remain.
    if (
      row.week > completedSunday(new Date(run.finished_at)) &&
      ![
        "scheduled",
        "accepted",
        "recurring_schedules",
        "group_count",
        "group_memberships",
        "group_leaders",
      ].includes(row.measure)
    ) {
      row.value = null;
      row.quality = "future";
      row.flags.push("reporting_week_not_complete");
    }
  }
  if (run.coverage_start && !(input.product === "giving" && hasBackfill))
    for (const row of compiled.values)
      if (row.measure === "first_known") {
        row.value = null;
        row.quality = "partial";
        row.flags.push("historical_backfill_required_for_first_known");
      }
  const expected =
    input.product === "giving"
      ? ["giving_total", "all_fund_giving", "refund_total", "recurring_schedules"].map((measure) => ({
          ministry: "giving",
          measure,
          scope: "all",
          unit: MEASURES[measure].unit,
        }))
      : input.product === "groups"
        ? ["group_count", "group_memberships", "group_leaders"].map((measure) => ({
            ministry: "connection",
            measure,
            scope: "all",
            unit: MEASURES[measure].unit,
          }))
        : [];
  expected.push(
    ...mappings.filter((m) => !MAPPING_ONLY_MEASURES.has(m.measure)).flatMap((m) => {
      const routedScopes =
        input.product === "check_ins" && m.scope === "all"
          ? mappings
              .filter(
                (session) =>
                  session.measure === "service_session" && session.ministry === m.ministry,
              )
              .map((session) => session.scope)
          : [];
      const scopes = routedScopes.length ? [...new Set(routedScopes)] : [m.scope];
      return scopes.map((scope) => ({
        ministry: m.ministry,
        measure: m.measure,
        scope,
        unit: MEASURES[m.measure].unit,
      }));
    }),
  );
  if (input.product === "check_ins") {
    const serviceSessions = mappings.filter((m) => m.measure === "service_session");
    for (const groupMapping of groupMappings)
      for (const session of serviceSessions.filter((m) => m.ministry === groupMapping.ministry))
        expected.push({
          ministry: groupMapping.ministry,
          measure: "attendance",
          scope: session.scope,
          unit: MEASURES.attendance.unit,
        });
  }
  const slots = new Map(
    expected.map((m) => [[m.ministry, m.measure, m.scope, m.unit].join("|"), m]),
  );
  for (const row of compiled.values)
    slots.set([row.ministry, row.measure, row.scope, row.unit].join("|"), row);
  const keys = new Set(
    compiled.values.map((r) => [r.ministry, r.measure, r.scope, r.unit, r.week].join("|")),
  );
  for (const slot of slots.values())
    for (let week = input.start; week <= input.end; week = shiftDate(week, 7)) {
      if (!keys.has([slot.ministry, slot.measure, slot.scope, slot.unit, week].join("|"))) {
        compiled.values.push({
          ministry: slot.ministry,
          measure: slot.measure,
          scope: slot.scope,
          unit: slot.unit,
          week,
          value: null,
          quality: "missing",
          denominator: null,
          flags: ["no_eligible_observations"],
        });
        keys.add([slot.ministry, slot.measure, slot.scope, slot.unit, week].join("|"));
      }
    }
  return publish(c, p, {
    product: input.product,
    account,
    kind: "pco",
    key: digest(
      canonical({
        run: run.id,
        mappings,
        input,
        checkInResolutions: [...checkInResolutions].sort(([a], [b]) => a.localeCompare(b)),
        groupRunId,
        groupMappings,
        givingPolicy,
        version: MINISTRY_DEFINITION_VERSION,
      }),
    ),
    asOf: new Date(run.finished_at),
    start: input.start,
    end: input.end,
    ...compiled,
    evidence: {
      runId: run.id,
      mappingIds: mappings.map((m) => m.id),
      issues: compiled.issues,
      sourceRows: facts.length + groupFacts.length,
      ...(input.product === "check_ins"
        ? {
            checkInResolutions: {
              included: [...checkInResolutions.values()].filter((action) => action === "include")
                .length,
              excluded: [...checkInResolutions.values()].filter((action) => action === "exclude")
                .length,
            },
            studentGroupClassification: {
              groupRunId,
              groupSnapshotAsOf: groupSnapshotAt?.toISOString() ?? null,
              mappingIds: groupMappings.map((m) => m.id),
            },
          }
        : {}),
      ...(givingUnits
        ? {
            givingUnits,
            givingPatternVersion: GIVING_PATTERN_VERSION,
            givingPolicyId: givingPolicy!.id,
            givingPolicy,
          }
        : {}),
    },
  });
}
/** Refresh only a domain an Admin already explicitly published. Does not start
 * scans, add scopes, change scheduling, or invent a ministry interpretation. */
export async function refreshPublishedMinistry(
  c: PoolClient,
  p: AdminActor,
  product: string,
  account: string,
) {
  if (!["giving", "groups", "serving", "check_ins"].includes(product)) return;
  const refreshCheckInClassification = product === "groups";
  const previous = (
    await c.query(
      `SELECT coverage_start::text AS start,coverage_end::text AS "end"
    FROM ministry_publications WHERE product=$1 AND account_ref=$2 AND source_kind='pco'
    ORDER BY created_at DESC,id DESC LIMIT 1`,
      [product, account],
    )
  ).rows[0];
  if (!previous) {
    if (refreshCheckInClassification) await refreshPublishedMinistry(c, p, "check_ins", account);
    return;
  }
  const current = reportingWeekEnding(new Date());
  await c.query("SAVEPOINT ministry_refresh");
  try {
    await publishMinistryDataInTransaction(c, p, {
      product: product as MinistryPublicationInput["product"],
      start: previous.start,
      end: previous.end > current ? previous.end : current,
    });
    await c.query("RELEASE SAVEPOINT ministry_refresh");
  } catch {
    await c.query("ROLLBACK TO SAVEPOINT ministry_refresh");
    await c.query("RELEASE SAVEPOINT ministry_refresh");
    await recordAudit(p.userId!, "ministry.publication_failed", "integration", null, "failure", c);
    await c.query(
      `UPDATE pco_sync_runs SET error='Source scan completed; ministry publication needs Admin review'
      WHERE account_ref=$1 AND product=$2 AND status='complete'
      AND started_at=(SELECT max(started_at) FROM pco_sync_runs WHERE account_ref=$1 AND product=$2)`,
      [account, product],
    );
  }
  if (refreshCheckInClassification) await refreshPublishedMinistry(c, p, "check_ins", account);
}
export async function givingTransactions(
  p: Principal,
  page: number,
): Promise<GivingTransactionPage> {
  return adminTransaction(p, async (c) => {
    if (
      (
        await c.query(`SELECT 1 FROM pco_sync_runs r JOIN pco_connections v ON v.account_ref=r.account_ref AND v.id='planning_center'
      WHERE r.product='giving' AND r.status IN ('running','retry') LIMIT 1`)
      ).rowCount
    )
      throw new AccessError(
        409,
        "Finish or cancel the Giving scan before reading person-linked transactions",
      );
    const r = await c.query(
      `SELECT e.external_id AS id,e.normalized->'sourceRelationships'->'person'->'data'->>'id' AS "personId",
      e.normalized->'attributes'->>'received_at' AS "receivedAt",e.normalized->'attributes'->'amount_cents' AS "amountMinor",
      e.normalized->'attributes'->>'amount_currency' AS currency,e.normalized->'attributes'->>'payment_status' AS status,
      e.normalized->'attributes'->'refunded' AS refunded,e.normalized->'sourceRelationships'->'recurring_donation'->'data'->>'id' AS "recurringId"
      FROM pco_source_entities e JOIN pco_connections v ON v.id='planning_center' AND v.account_ref=e.account_ref
      JOIN pco_sync_runs r ON r.id=e.observed_run_id AND r.status='complete'
      WHERE e.product='giving' AND e.object_type='Donation' AND e.missing_run_id IS NULL
      ORDER BY e.normalized->'attributes'->>'received_at' DESC,e.external_id LIMIT 51 OFFSET $1`,
      [(page - 1) * 50],
    );
    await recordAudit(p.userId!, "giving.transactions_read", "giving", null, "success", c);
    return {
      transactions: r.rows.slice(0, 50),
      page,
      hasMore: r.rows.length > 50,
      asOf: new Date().toISOString(),
    };
  });
}
export async function importMinistryHistory(
  p: AdminActor,
  input: MinistryHistoryInput,
): Promise<MinistryPublicationResult> {
  validateTarget(input.ministry, input.measure, input.scope);
  if (
    [
      "attendance",
      "volunteers",
      "first_known",
      "first_time_givers",
      "lapsed_givers",
      "recurring_schedules",
    ].includes(input.measure)
  )
    throw new AccessError(
      409,
      "Workbook counts cannot establish unique PCO people, current-formula giver identities or recurring schedules. Choose the corresponding workbook/source-defined measure.",
    );
  return adminTransaction(p, async (c) => {
    const accepted = await c.query(
      `SELECT b.sha256,b.snapshot_date FROM import_batches b
      JOIN workbook_source_authorities a ON a.batch_id=b.id AND a.sha256=b.sha256 WHERE b.id=$1 AND b.state='active'`,
      [input.batchId],
    );
    if (!accepted.rowCount) throw new AccessError(409, "Workbook source has not been accepted");
    const mapping = await c.query(
      `SELECT definition FROM import_mappings WHERE id=$1 AND batch_id=$2 AND status='approved'`,
      [input.mappingId, input.batchId],
    );
    if (!mapping.rowCount)
      throw new AccessError(409, "Approve the source mapping in Imports first");
    const definition = mapping.rows[0].definition;
    if (definition.target !== input.measure || definition.ministry !== input.ministry)
      throw new AccessError(
        409,
        "Choose the ministry and measure that were explicitly approved on the source mapping",
      );
    const monetary = MEASURES[input.measure].unit.endsWith("_minor");
    if (monetary && !["USD", "USD_minor", "currency_usd"].includes(definition.unit))
      throw new AccessError(409, "Approve the mapping's USD currency/unit before monetary import");
    if (!monetary && !["attendance_count", MEASURES[input.measure].unit].includes(definition.unit))
      throw new AccessError(409, "The source mapping unit does not match this measure");
    const rows = (
      await c.query(
        `SELECT id,source_row,data FROM import_staged_rows WHERE mapping_id=$1 ORDER BY source_row::integer LIMIT 1001`,
        [input.mappingId],
      )
    ).rows;
    if (!rows.length || rows.length > 1000)
      throw new AccessError(409, "Stage up to 1,000 mapped rows in Imports first");
    const values: MetricFact[] = [],
      issues = new Set<string>(),
      weeks = new Set<string>();
    const snapshot = accepted.rows[0].snapshot_date;
    let axisYear: number | null = null;
    for (const r of rows) {
      const row = r.data;
      // Use a real mapped date or an explicitly selected ordinal-year alignment.
      if (!sunday(row.sundayDate)) {
        issues.add("unreadable_source_date");
        continue;
      }
      let week = row.sundayDate;
      if (input.year !== null) {
        const sourceYear = Number(row.sundayDate.slice(0, 4));
        if (axisYear !== null && axisYear !== sourceYear)
          throw new AccessError(409, "Ordinal alignment requires a single-year date axis");
        axisYear = sourceYear;
        const ordinal = Math.round(
          (+new Date(row.sundayDate) - +new Date(ordinalSunday(sourceYear, 0))) / (7 * 86400000),
        );
        try {
          week = ordinalSunday(input.year, ordinal);
        } catch {
          issues.add("year_has_no_matching_sunday");
          continue;
        }
      }
      if (week > snapshot || week > chicagoDate(new Date())) {
        issues.add("future_at_snapshot");
        continue;
      }
      if (weeks.has(week))
        throw new AccessError(
          409,
          "Mapping contains duplicate source weeks; choose a single source series",
        );
      weeks.add(week);
      const unsafe = (row.flags ?? []).some((f: string) =>
        /forecast|conflict|duplicate|unsafe_numeric|invalid|non_numeric|error|non_sunday|merged/.test(
          f,
        ),
      );
      let value: number | null = null;
      const blankAttendanceIsZero =
        !unsafe && acceptedBlankAttendanceIsZero(input.measure, row);
      if (blankAttendanceIsZero) {
        value = 0;
      } else if (
        !unsafe &&
        typeof row.value === "number" &&
        Number.isFinite(row.value) &&
        row.value >= 0
      ) {
        try {
          value =
            monetary && definition.unit !== "USD_minor" ? exactMinorUnits(row.value) : row.value;
        } catch {
          issues.add("monetary_precision");
        }
        if (value !== null && !Number.isSafeInteger(value)) value = null;
      }
      if (value === null) issues.add("unreadable_or_unsafe_values_remain_missing");
      values.push({
        ministry: input.ministry,
        measure: input.measure,
        scope: input.scope,
        week,
        value,
        unit: monetary ? "USD_minor" : MEASURES[input.measure].unit,
        quality: value === null ? "missing" : "complete",
        denominator: null,
        flags:
          [
            "workbook_source_defined",
            ...(input.year === null ? [] : ["explicit_ordinal_year_alignment"]),
            ...(blankAttendanceIsZero ? ["past_blank_attendance_as_zero"] : []),
          ],
      });
    }
    if (!values.length)
      throw new AccessError(409, "No readable dated observations before the snapshot");
    values.sort((a, b) => a.week.localeCompare(b.week));
    return publish(c, p, {
      product: `workbook:${input.ministry}:${input.measure}:${input.scope}`,
      account: input.batchId,
      key: digest(
        canonical({
          input,
          sha256: accepted.rows[0].sha256,
          definition,
          rows,
          version: MINISTRY_DEFINITION_VERSION,
        }),
      ),
      kind: "workbook",
      asOf: new Date(`${snapshot}T12:00:00Z`),
      start: values[0].week,
      end: values.at(-1)!.week,
      values,
      issues: [...issues].sort(),
      evidence: {
        input,
        sha256: accepted.rows[0].sha256,
        snapshotDate: snapshot,
        mapping: definition,
        stagedSnapshot: rows,
      },
    });
  });
}
