import type { PoolClient } from "pg";
import type { SourceFact, SourceMapping } from "./ministry-calculation";

type NormalizedFact = {
  sourceType: string;
  sourceId: string;
  attributes: Record<string, unknown>;
  sourceRelationships: SourceFact["relationships"];
  sourceCollection?: string | null;
};

function factFromRow(row: { normalized: NormalizedFact }): SourceFact {
  return {
    type: row.normalized.sourceType,
    id: row.normalized.sourceId,
    attributes: row.normalized.attributes ?? {},
    relationships: row.normalized.sourceRelationships ?? {},
    sourceCollection: row.normalized.sourceCollection ?? null,
  };
}

const CHECK_IN_SOURCE_WINDOW_DAYS = 56;
const CHECK_IN_SOURCE_FACT_LIMIT = 500_000;

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function loadCheckInFactsForWindow(
  c: Pick<PoolClient, "query">,
  account: string,
  start: string | null,
  end: string | null,
  templateIds: string[] = [],
  includeUndated = false,
): Promise<SourceFact[]> {
  if (includeUndated || !start || !end)
    return loadCheckInFactsSingleWindow(c, account, start, end, templateIds, includeUndated);

  // Keep each relationship-index lookup below the database's short per-query
  // timeout, then merge the bounded slices into one compiler input.
  const combined = new Map<string, SourceFact>();
  let windowStart = start;
  while (windowStart <= end) {
    const candidateEnd = shiftDate(windowStart, CHECK_IN_SOURCE_WINDOW_DAYS - 1);
    const windowEnd = candidateEnd < end ? candidateEnd : end;
    const facts = await loadCheckInFactsSingleWindow(
      c,
      account,
      windowStart,
      windowEnd,
      templateIds,
      false,
    );
    if (process.env.NP_CHECKIN_SOURCE_PROGRESS === "1")
      console.info(
        JSON.stringify({
          event: "checkin_source_window_loaded",
          start: windowStart,
          end: windowEnd,
          facts: facts.length,
        }),
      );
    for (const fact of facts) {
      combined.set(`${fact.type}\u0000${fact.id}`, fact);
      if (combined.size > CHECK_IN_SOURCE_FACT_LIMIT)
        throw new Error("Check-In publication window exceeds the safe source limit");
    }
    windowStart = shiftDate(windowEnd, 1);
  }
  return [...combined.values()];
}

async function loadCheckInFactsSingleWindow(
  c: Pick<PoolClient, "query">,
  account: string,
  start: string | null,
  end: string | null,
  templateIds: string[],
  includeUndated: boolean,
): Promise<SourceFact[]> {
  // Match the partial relationship index before expanding linkage. Keep the final
  // MIN/fallback date check: a candidate may link to times outside this window too.
  // The undated exception queue intentionally considers the full active source set.
  const result = await c.query(
    `WITH context_dates AS MATERIALIZED (
      SELECT object_type, external_id,
        ((normalized->'attributes'->>'starts_at')::timestamptz
          AT TIME ZONE 'America/Chicago')::date AS service_date
      FROM pco_source_entities
      WHERE account_ref=$1 AND product='check_ins'
        AND object_type IN ('EventTime','EventPeriod') AND missing_run_id IS NULL
    ), candidate_dates AS MATERIALIZED (
      SELECT * FROM context_dates
      WHERE NOT $4::boolean AND service_date BETWEEN $2::date AND $3::date
    ), candidate_ids AS MATERIALIZED (
      SELECT c.external_id
      FROM candidate_dates d
      JOIN pco_source_entities c ON c.account_ref=$1
        AND c.product='check_ins' AND c.object_type='CheckIn'
        AND c.observed_run_id IS NOT NULL AND c.missing_run_id IS NULL
        AND (
          (c.normalized->'sourceRelationships') @> jsonb_build_object(
            CASE d.object_type WHEN 'EventTime' THEN 'event_times' ELSE 'event_period' END,
            jsonb_build_object('data', jsonb_build_object('id', d.external_id)))
          OR (d.object_type='EventTime' AND
            (c.normalized->'sourceRelationships') @> jsonb_build_object('event_times',
              jsonb_build_object('data', jsonb_build_array(jsonb_build_object('id', d.external_id)))))
        )
      UNION
      SELECT external_id FROM pco_source_entities
      WHERE $4::boolean AND account_ref=$1 AND product='check_ins' AND object_type='CheckIn'
        AND observed_run_id IS NOT NULL AND missing_run_id IS NULL
    ), checkin_rows AS MATERIALIZED (
      SELECT c.external_id, c.normalized,
        c.normalized->'sourceRelationships'->'event_period'->'data'->>'id' AS period_id,
        c.normalized->'sourceRelationships'->'person'->'data'->>'id' AS person_id
      FROM pco_source_entities c
      JOIN candidate_ids i ON i.external_id=c.external_id
      WHERE c.account_ref=$1 AND c.product='check_ins' AND c.object_type='CheckIn'
        AND c.observed_run_id IS NOT NULL AND c.missing_run_id IS NULL
    ), linked_dates AS MATERIALIZED (
      SELECT c.external_id, MIN(t.service_date) AS service_date
      FROM checkin_rows c
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE jsonb_typeof(c.normalized->'sourceRelationships'->'event_times'->'data')
          WHEN 'array' THEN c.normalized->'sourceRelationships'->'event_times'->'data'
          WHEN 'object' THEN jsonb_build_array(c.normalized->'sourceRelationships'->'event_times'->'data')
          ELSE '[]'::jsonb
        END
      ) AS linked(item)
      JOIN context_dates t ON t.object_type='EventTime'
        AND t.external_id=linked.item->>'id'
      GROUP BY c.external_id
    ), checkins AS (
      SELECT c.*, COALESCE(t.service_date, p.service_date) AS service_date
      FROM checkin_rows c
      LEFT JOIN linked_dates t ON t.external_id=c.external_id
      LEFT JOIN context_dates p ON p.object_type='EventPeriod' AND p.external_id=c.period_id
    ), selected AS MATERIALIZED (
      SELECT * FROM checkins
      WHERE ($4::boolean AND service_date IS NULL)
        OR (NOT $4::boolean AND service_date BETWEEN $2::date AND $3::date)
    ), timed_period_ids AS (
      SELECT 'EventPeriod'::text AS object_type, period_id AS external_id
      FROM selected WHERE period_id IS NOT NULL
      UNION
      SELECT 'EventTime', linked.item->>'id'
      FROM selected s
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE jsonb_typeof(s.normalized->'sourceRelationships'->'event_times'->'data')
          WHEN 'array' THEN s.normalized->'sourceRelationships'->'event_times'->'data'
          WHEN 'object' THEN jsonb_build_array(s.normalized->'sourceRelationships'->'event_times'->'data')
          ELSE '[]'::jsonb
        END
      ) AS linked(item)
      WHERE linked.item->>'id' IS NOT NULL
    ), referenced_ids AS (
      SELECT 'CheckIn'::text AS object_type, external_id FROM selected
      UNION SELECT object_type, external_id FROM timed_period_ids
      UNION
      SELECT 'Location', linked.item->>'id'
      FROM selected s
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE jsonb_typeof(s.normalized->'sourceRelationships'->'locations'->'data')
          WHEN 'array' THEN s.normalized->'sourceRelationships'->'locations'->'data'
          WHEN 'object' THEN jsonb_build_array(s.normalized->'sourceRelationships'->'locations'->'data')
          ELSE '[]'::jsonb
        END
      ) AS linked(item)
      WHERE linked.item->>'id' IS NOT NULL
      UNION
      SELECT 'Person', person_id FROM selected WHERE person_id IS NOT NULL
      UNION
      SELECT 'Event', e.normalized->'sourceRelationships'->'event'->'data'->>'id'
      FROM pco_source_entities e
      JOIN timed_period_ids ids ON ids.object_type=e.object_type
        AND ids.external_id=e.external_id
      WHERE e.account_ref=$1 AND e.product='check_ins'
        AND e.object_type IN ('EventPeriod','EventTime')
        AND e.normalized->'sourceRelationships'->'event'->'data'->>'id' IS NOT NULL
      UNION SELECT 'EventTime', unnest($5::text[])
    )
    SELECT e.normalized
    FROM pco_source_entities e
    JOIN referenced_ids i ON i.object_type=e.object_type AND i.external_id=e.external_id
    WHERE e.account_ref=$1 AND e.product='check_ins' AND e.missing_run_id IS NULL
      AND e.observed_run_id IS NOT NULL
    LIMIT 500001`,
    [account, start, end, includeUndated, templateIds],
  );
  if (result.rows.length > 500000)
    throw new Error("Check-In publication window exceeds the safe source limit");
  return result.rows.map(factFromRow);
}

export async function loadCheckInGradeFacts(
  c: Pick<PoolClient, "query">,
  account: string,
): Promise<SourceFact[]> {
  const result = await c.query(
    `SELECT e.normalized
    FROM pco_source_entities e
    JOIN pco_sync_runs r ON r.id=e.observed_run_id AND r.account_ref=e.account_ref
      AND r.product='people' AND r.status='complete'
    WHERE e.account_ref=$1 AND e.product='people' AND e.object_type='Grade'
      AND e.missing_run_id IS NULL
    ORDER BY r.finished_at DESC, e.external_id
    LIMIT 1001`,
    [account],
  );
  if (result.rows.length > 1000)
    throw new Error("Planning Center grade list exceeds the safe size");
  return result.rows.map(factFromRow);
}

export function checkInTemplateIds(mappings: SourceMapping[]) {
  return mappings
    .filter(
      (mapping) =>
        mapping.product === "check_ins" &&
        mapping.objectType === "EventTime" &&
        mapping.measure === "service_session",
    )
    .map((mapping) => mapping.externalId);
}
