/**
 * Add the owner-approved, date-bounded historical Services routes and publish
 * the already-staged Serving backfill. Preview by default; --apply creates
 * audited mappings and republishes data. This operation never starts a scan.
 */
import { pool } from "@workspace/db";
import type { AdminActor } from "../lib/administration";
import {
  compileMinistryFacts,
  type SourceFact,
  type SourceMapping,
} from "../lib/ministry-calculation";
import { logger } from "../lib/logger";
import { createMinistryMapping, publishMinistryData } from "../lib/ministry-data";
import { reportingWeekEnding } from "../lib/reporting-calendar";

const HISTORICAL_END = "2026-11-08";
const CURRENT_START = "2026-11-09";
const MEASURES = ["accepted", "scheduled"] as const;
const ROUTES = [
  { externalId: "39161", sourceName: "Sunday Morning", ministry: "service-programming", scope: "all" },
  { externalId: "159058", sourceName: "InsideOut", ministry: "insideout", scope: "all" },
  { externalId: "329713", sourceName: "Transit", ministry: "transit", scope: "all" },
  {
    externalId: "760311",
    sourceName: "Transit Weekend",
    ministry: "transit",
    scope: "transit-weekend",
    continuesAfterHistorical: true,
  },
  { externalId: "1004453", sourceName: "UpStreet Large Group", ministry: "upstreet", scope: "all" },
  { externalId: "1236986", sourceName: "Waumba Land", ministry: "waumba-land", scope: "all" },
  { externalId: "1237549", sourceName: "Kids' Check-in", ministry: "shared-teams", scope: "kids-checkin" },
  { externalId: "1359452", sourceName: "UpStreet", ministry: "upstreet", scope: "all" },
  { externalId: "1728045", sourceName: "Safety Team Schedule", ministry: "shared-teams", scope: "safety-team" },
  { externalId: "1769791", sourceName: "LU Guest Services Weekly", ministry: "shared-teams", scope: "guest-services" },
] as const;

class HistoricalServingRouteError extends Error {}

function overlaps(
  leftStart: string,
  leftEnd: string | null,
  rightStart: string,
  rightEnd: string | null,
): boolean {
  return leftStart <= (rightEnd ?? "9999-12-31") &&
    rightStart <= (leftEnd ?? "9999-12-31");
}

function shiftSundayByWeeks(value: string, weeks: number): string {
  const date = new Date(`${value}T18:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

function splitReportingWeeks(start: string, end: string): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = [];
  let windowStart = start;
  while (windowStart <= end) {
    const candidateEnd = shiftSundayByWeeks(windowStart, 468);
    const windowEnd = candidateEnd < end ? candidateEnd : end;
    windows.push({ start: windowStart, end: windowEnd });
    windowStart = shiftSundayByWeeks(windowEnd, 1);
  }
  return windows;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const c = await pool.connect();
  let stage = "validating staged Serving data";
  let actor: AdminActor;
  let account: string;
  let runId: string;
  let asOf: Date;
  let start: string;
  let end: string;
  let reportingWindows: Array<{ start: string; end: string }>;
  let sourceFacts: SourceFact[];
  let existingMappings: SourceMapping[];
  let mappingsToCreate: Array<{
    externalId: string;
    ministry: string;
    scope: string;
    measure: (typeof MEASURES)[number];
    effectiveFrom: string;
    effectiveTo: string | null;
  }>;
  let routeSummary: Array<{
    sourceName: string;
    ministry: string;
    scope: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  }>;

  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    const owner = await c.query(
      `SELECT p.account_ref,u.id FROM pco_connections p JOIN users u ON u.id=p.connected_by
       WHERE p.id='planning_center' AND p.state='connected'
         AND u.role='admin' AND u.status='active'`,
    );
    if (owner.rowCount !== 1)
      throw new HistoricalServingRouteError("An active Admin integration authorizer is required");
    account = owner.rows[0].account_ref;
    actor = { userId: owner.rows[0].id, role: "admin" };

    stage = "checking for an active Serving scan";
    if (
      (
        await c.query(
          `SELECT 1 FROM pco_sync_runs WHERE account_ref=$1 AND product='serving'
           AND status IN ('running','retry') LIMIT 1`,
          [account],
        )
      ).rowCount
    )
      throw new HistoricalServingRouteError("A Serving scan is still active");

    stage = "checking the completed Serving backfill";
    const latest = await c.query(
      `SELECT id,mode,status,finished_at FROM pco_sync_runs
       WHERE account_ref=$1 AND product='serving'
       ORDER BY started_at DESC,id DESC LIMIT 1`,
      [account],
    );
    if (
      latest.rowCount !== 1 ||
      latest.rows[0].mode !== "backfill" ||
      latest.rows[0].status !== "complete" ||
      !latest.rows[0].finished_at
    )
      throw new HistoricalServingRouteError(
        "The latest completed source run must be the full Serving backfill",
      );
    runId = latest.rows[0].id;
    asOf = new Date(latest.rows[0].finished_at);

    const ids = ROUTES.map((route) => route.externalId);
    stage = "checking imported service types";
    const sourceTypes = await c.query(
      `SELECT external_id,normalized->'attributes'->>'name' AS name
       FROM pco_source_entities WHERE account_ref=$1 AND product='serving'
         AND object_type='ServiceType' AND observed_run_id=$2 AND missing_run_id IS NULL
         AND external_id=ANY($3::text[])`,
      [account, runId, ids],
    );
    const typesById = new Map(sourceTypes.rows.map((row) => [row.external_id, row.name]));

    stage = "finding local plan-date coverage";
    const dateRows = await c.query(
      `WITH plans AS (
         SELECT normalized->'sourceRelationships'->'service_type'->'data'->>'id' AS service_type_id,
           ((normalized->'attributes'->>'sort_date')::timestamptz
             AT TIME ZONE 'America/Chicago')::date AS local_plan_date
         FROM pco_source_entities WHERE account_ref=$1 AND product='serving'
           AND object_type='Plan' AND observed_run_id=$2 AND missing_run_id IS NULL
           AND normalized->'sourceRelationships'->'service_type'->'data'->>'id'=ANY($3::text[])
       )
       SELECT service_type_id,
         (min(local_plan_date) FILTER (WHERE local_plan_date<=DATE '2026-11-08'))::text AS first_historical_date,
         max(local_plan_date)::text AS last_plan_date
       FROM plans GROUP BY service_type_id`,
      [account, runId, ids],
    );
    const datesById = new Map(dateRows.rows.map((row) => [row.service_type_id, row]));

    stage = "checking route overlaps";
    const mapRows = await c.query<SourceMapping>(
      `SELECT id,product,object_type AS "objectType",external_id AS "externalId",
        ministry,measure,scope,effective_from::text AS "effectiveFrom",
        effective_to::text AS "effectiveTo"
       FROM ministry_source_mappings m WHERE account_ref=$1 AND product='serving'
         AND enabled AND NOT EXISTS(
           SELECT 1 FROM ministry_source_mappings n WHERE n.supersedes_id=m.id
         )
       ORDER BY id`,
      [account],
    );
    existingMappings = mapRows.rows;
    mappingsToCreate = [];
    routeSummary = [];
    const proposedMappings: SourceMapping[] = [];
    const firstDates: string[] = [];
    const lastDates: string[] = [];

    for (const route of ROUTES) {
      if (typesById.get(route.externalId) !== route.sourceName)
        throw new HistoricalServingRouteError(
          `The imported PCO source ${route.sourceName} is missing or has changed`,
        );
      const dates = datesById.get(route.externalId);
      if (!dates?.first_historical_date || !dates.last_plan_date)
        throw new HistoricalServingRouteError(
          `No complete plan-date coverage was found for ${route.sourceName}`,
        );
      const effectiveFrom = String(dates.first_historical_date);
      const effectiveTo = "continuesAfterHistorical" in route && route.continuesAfterHistorical
        ? null
        : HISTORICAL_END;
      firstDates.push(effectiveFrom);
      lastDates.push(String(dates.last_plan_date));
      routeSummary.push({
        sourceName: route.sourceName,
        ministry: route.ministry,
        scope: route.scope,
        effectiveFrom,
        effectiveTo,
      });

      for (const measure of MEASURES) {
        const continuesAfterHistorical =
          "continuesAfterHistorical" in route && route.continuesAfterHistorical;
        if (!continuesAfterHistorical) {
          const current = existingMappings.filter(
            (mapping) =>
              mapping.objectType === "ServiceType" &&
              mapping.externalId === route.externalId &&
              mapping.measure === measure &&
              overlaps(mapping.effectiveFrom, mapping.effectiveTo, CURRENT_START, null),
          );
          if (
            current.length !== 1 ||
            current[0].ministry !== route.ministry ||
            current[0].scope !== route.scope ||
            current[0].effectiveFrom !== CURRENT_START ||
            current[0].effectiveTo !== null
          )
            throw new HistoricalServingRouteError(
              `The current ${route.sourceName} route needs review; no history was changed`,
            );
        }

        const overlapping = existingMappings.filter(
          (mapping) =>
            mapping.objectType === "ServiceType" &&
            mapping.externalId === route.externalId &&
            mapping.measure === measure &&
            overlaps(
              mapping.effectiveFrom,
              mapping.effectiveTo,
              effectiveFrom,
                effectiveTo,
            ),
        );
        const exact = overlapping.find(
          (mapping) =>
            mapping.ministry === route.ministry &&
            mapping.scope === route.scope &&
            mapping.effectiveFrom === effectiveFrom &&
            mapping.effectiveTo === effectiveTo,
        );
        if (overlapping.some((mapping) => mapping !== exact))
          throw new HistoricalServingRouteError(
            `An overlapping historical ${route.sourceName} route needs review`,
          );
        if (!exact)
          mappingsToCreate.push({
            externalId: route.externalId,
            ministry: route.ministry,
            scope: route.scope,
            measure,
            effectiveFrom,
            effectiveTo,
          });
        proposedMappings.push({
          id: exact?.id ?? `preview-${route.externalId}-${measure}`,
          product: "serving",
          objectType: "ServiceType",
          externalId: route.externalId,
          ministry: route.ministry,
          measure,
          scope: route.scope,
          effectiveFrom,
          effectiveTo,
        });
      }
    }

    stage = "loading the bounded Serving facts";
    sourceFacts = [];
    let cursor: { objectType: string; externalId: string } | null = null;
    const batchSize = 2_000;
    while (true) {
      type PersistedSourceRow = {
        object_type: string;
        external_id: string;
        normalized: {
          sourceType: string;
          sourceId: string;
          attributes?: SourceFact["attributes"];
          sourceRelationships?: SourceFact["relationships"];
          sourceCollection?: string | null;
        };
      };
      const sources: { rows: PersistedSourceRow[] } = cursor
        ? await c.query<PersistedSourceRow>(
            `SELECT object_type,external_id,normalized FROM pco_source_entities
             WHERE account_ref=$1 AND product='serving' AND observed_run_id=$2
               AND missing_run_id IS NULL
               AND (object_type,external_id)>($3::text,$4::text)
             ORDER BY object_type,external_id LIMIT $5`,
            [account, runId, cursor.objectType, cursor.externalId, batchSize],
          )
        : await c.query<PersistedSourceRow>(
            `SELECT object_type,external_id,normalized FROM pco_source_entities
             WHERE account_ref=$1 AND product='serving' AND observed_run_id=$2
               AND missing_run_id IS NULL
             ORDER BY object_type,external_id LIMIT $3`,
            [account, runId, batchSize],
          );
      if (!sources.rows.length) break;
      if (sourceFacts.length + sources.rows.length > 500_000)
        throw new HistoricalServingRouteError("Serving source exceeds the bounded publisher limit");
      sourceFacts.push(
        ...sources.rows.map(({ normalized: n }) => ({
          type: n.sourceType,
          id: n.sourceId,
          attributes: n.attributes ?? {},
          relationships: n.sourceRelationships ?? {},
          sourceCollection: n.sourceCollection ?? null,
        })),
      );
      if (sources.rows.length < batchSize) break;
      const last = sources.rows[sources.rows.length - 1];
      cursor = { objectType: last.object_type, externalId: last.external_id };
    }

    start = reportingWeekEnding(new Date(`${firstDates.sort()[0]}T18:00:00Z`));
    end = reportingWeekEnding(new Date(`${lastDates.sort().at(-1)}T18:00:00Z`));
    if (end < start)
      throw new HistoricalServingRouteError("The staged Serving backfill has no publishable range");
    reportingWindows = splitReportingWeeks(start, end);

    await c.query("COMMIT");

    stage = "previewing the Serving calculations";
    const metrics = new Map<
      string,
      { weeks: number; populatedWeeks: number; firstPopulatedWeek: string | null; lastPopulatedWeek: string | null }
    >();
    const issueSet = new Set<string>();
    for (const window of reportingWindows) {
      const compiled = compileMinistryFacts(
        "serving",
        sourceFacts,
        [...existingMappings, ...proposedMappings],
        window.start,
        window.end,
        asOf,
      );
      for (const issue of compiled.issues) issueSet.add(issue);
      for (const value of compiled.values) {
        const key = `${value.ministry}/${value.measure}/${value.scope}/${value.quality}`;
        const summary = metrics.get(key) ?? {
          weeks: 0,
          populatedWeeks: 0,
          firstPopulatedWeek: null,
          lastPopulatedWeek: null,
        };
        summary.weeks += 1;
        if (value.value !== null) {
          summary.populatedWeeks += 1;
          if (!summary.firstPopulatedWeek || value.week < summary.firstPopulatedWeek)
            summary.firstPopulatedWeek = value.week;
          if (!summary.lastPopulatedWeek || value.week > summary.lastPopulatedWeek)
            summary.lastPopulatedWeek = value.week;
        }
        metrics.set(key, summary);
      }
    }
    const preview = {
      mode: apply ? "apply" : "preview",
      runId,
      sourceAsOf: asOf.toISOString(),
      reportingWeeks: { start, end },
      windows: reportingWindows,
      routeRanges: routeSummary,
      transitWeekend: "separate Transit serving scope, distinct from regular Transit totals",
      mappingsAlreadyPresent: proposedMappings.length - mappingsToCreate.length,
      mappingsToCreate: mappingsToCreate.length,
      sourceRows: sourceFacts.length,
      metricCoverage: [...metrics].map(([key, summary]) => ({ key, ...summary })),
      issues: [...issueSet].sort(),
      scanStarted: false,
      metricsPublished: false,
    };
    if (!apply) {
      console.log(JSON.stringify(preview, null, 2));
      return;
    }

    for (const mapping of mappingsToCreate)
      await createMinistryMapping(actor, {
        product: "serving",
        objectType: "ServiceType",
        externalId: mapping.externalId,
        ministry: mapping.ministry,
        measure: mapping.measure,
        scope: mapping.scope,
        effectiveFrom: mapping.effectiveFrom,
        effectiveTo: mapping.effectiveTo,
        enabled: true,
        note: mapping.scope === "transit-weekend"
          ? "Owner approved Transit Weekend as a separate serving scope, distinct from regular Transit totals, from its first imported local PCO plan onward."
          : `Owner approved this historical route from the first imported local PCO plan through ${HISTORICAL_END}; the current confirmed route begins ${CURRENT_START}.`,
      });

    const publicationResults: Array<Record<string, unknown>> = [];
    const publicationIssues = new Set(issueSet);
    let allVerified = true;
    for (const window of reportingWindows) {
      const publication = await publishMinistryData(actor, {
        product: "serving",
        start: window.start,
        end: window.end,
      });
      for (const issue of publication.issues) publicationIssues.add(issue);
      const verify = await pool.connect();
      try {
        await verify.query("BEGIN READ ONLY");
        await verify.query("SELECT set_config('np.role','admin',true)");
        await verify.query("SELECT set_config('np.user_id',$1,true)", [actor.userId]);
        const validity = await verify.query(
          "SELECT np_ministry_publication_valid($1) AS valid",
          [publication.publicationId],
        );
        const coverage = await verify.query(
          `SELECT ministry,measure,scope,quality,count(*)::int AS weeks,
            count(value)::int AS populated,min(week)::text AS first_week,max(week)::text AS last_week
           FROM ministry_metric_values WHERE publication_id=$1
           GROUP BY ministry,measure,scope,quality ORDER BY ministry,measure,scope,quality`,
          [publication.publicationId],
        );
        await verify.query("COMMIT");
        const publicationValid = validity.rows[0]?.valid === true;
        const verified = publicationValid && coverage.rows.length > 0;
        allVerified = allVerified && verified;
        publicationResults.push({
          window,
          ...publication,
          coverage: coverage.rows,
          publicationValid,
          verified,
        });
        console.log(
          JSON.stringify({
            mode: "published_window",
            window,
            publicationId: publication.publicationId,
            publicationValid,
            verified,
            values: publication.values,
            issues: publication.issues,
          }),
        );
      } catch (error) {
        await verify.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        verify.release();
      }
    }
    console.log(
      JSON.stringify(
        {
          ...preview,
          mode: "published",
          publications: publicationResults,
          issues: [...publicationIssues].sort(),
          verified: allVerified,
          metricsPublished: allVerified,
          elapsedMs: Date.now() - startedAt,
        },
        null,
        2,
      ),
    );
    if (!allVerified) throw new Error("Publication saved but verification needs attention");
  } catch (error) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw new HistoricalServingRouteError(
      `${stage}: ${error instanceof Error ? error.message : "unknown failure"}`,
    );
  } finally {
    c.release();
  }
}

const startedAt = Date.now();
main()
  .catch((error: unknown) => {
    logger.error(
      { reason: error instanceof Error ? error.message : "unknown failure" },
      "Historical Serving route operation failed",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
