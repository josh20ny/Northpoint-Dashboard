import type { PoolClient } from "pg";

// Most Check-Ins have one room and one service. Avoid invoking a sorted
// set-returning subquery for those; canonicalize multi-link rows to match the
// review calculator's order-independent duplicate identity.
function relationshipIdsSql(key: "event_times" | "locations") {
  const data = `e.normalized->'sourceRelationships'->'${key}'->'data'`;
  return `CASE jsonb_typeof(${data})
    WHEN 'object' THEN ARRAY[${data}->>'id']
    WHEN 'array' THEN CASE jsonb_array_length(${data})
      WHEN 1 THEN ARRAY[${data}->0->>'id']
      ELSE ARRAY(SELECT item->>'id' FROM jsonb_array_elements(${data}) linked(item) ORDER BY 1)
    END
    ELSE ARRAY[]::text[] END`;
}

/**
 * Discover review dates without repeating source-table lookups for every
 * historical Check-In. Rank minimal identifiers once, then resolve service
 * dates only for possible exceptions. No names/grades leave this query.
 */
export async function loadCheckInReviewDates(
  c: Pick<PoolClient, "query">,
  account: string,
): Promise<(string | null)[]> {
  const result = await c.query<{ serviceDate: string | null }>(
    `WITH periods AS MATERIALIZED (
      SELECT external_id,
        ((normalized->'attributes'->>'starts_at')::timestamptz
          AT TIME ZONE 'America/Chicago')::date AS service_date
      FROM pco_source_entities
      WHERE account_ref=$1 AND product='check_ins'
        AND object_type='EventPeriod' AND missing_run_id IS NULL
    ), source AS MATERIALIZED (
      SELECT e.external_id,
        e.normalized->'sourceRelationships'->'person'->'data'->>'id' AS person_id,
        e.normalized->'sourceRelationships'->'event_period'->'data'->>'id' AS period_id,
        lower(coalesce(e.normalized->'attributes'->>'kind','')) AS kind,
        ${relationshipIdsSql("event_times")} AS event_time_ids,
        ${relationshipIdsSql("locations")} AS location_ids
      FROM pco_source_entities e
      WHERE e.account_ref=$1 AND e.product='check_ins' AND e.object_type='CheckIn'
        AND e.observed_run_id IS NOT NULL AND e.missing_run_id IS NULL
    ), ranked AS (
      SELECT source.*,
        row_number() OVER (
          PARTITION BY person_id,period_id,kind,event_time_ids,location_ids
          ORDER BY external_id
        ) AS duplicate_rank
      FROM source
    ), possible_exceptions AS MATERIALIZED (
      SELECT r.*,p.service_date AS period_date,
        (person_id IS NULL OR period_id IS NULL OR p.external_id IS NULL
          OR kind NOT IN ('regular','guest','volunteer')
          OR (person_id IS NOT NULL AND period_id IS NOT NULL AND duplicate_rank>1))
          AS structural_issue
      FROM ranked r LEFT JOIN periods p ON p.external_id=r.period_id
      WHERE (
        person_id IS NULL OR period_id IS NULL OR p.external_id IS NULL
        OR p.service_date IS NULL OR kind NOT IN ('regular','guest','volunteer')
        OR (person_id IS NOT NULL AND period_id IS NOT NULL AND duplicate_rank>1)
      )
      AND NOT EXISTS (
        SELECT 1 FROM audit_events a
        WHERE a.target_type='pco_checkin_resolution'
          AND a.target_id=($1 || ':' || r.external_id)
          AND a.action IN ('ministry.checkin_include','ministry.checkin_exclude')
      )
    ), times AS MATERIALIZED (
      SELECT external_id,
        ((normalized->'attributes'->>'starts_at')::timestamptz
          AT TIME ZONE 'America/Chicago')::date AS service_date
      FROM pco_source_entities
      WHERE account_ref=$1 AND product='check_ins'
        AND object_type='EventTime' AND missing_run_id IS NULL
    ), linked_dates AS (
      SELECT e.external_id,MIN(t.service_date) AS service_date
      FROM possible_exceptions e
      CROSS JOIN LATERAL unnest(e.event_time_ids) linked(id)
      JOIN times t ON t.external_id=linked.id
      GROUP BY e.external_id
    ), exceptions AS (
      SELECT e.structural_issue,coalesce(t.service_date,e.period_date) AS service_date
      FROM possible_exceptions e LEFT JOIN linked_dates t ON t.external_id=e.external_id
    )
    SELECT DISTINCT service_date::text AS "serviceDate"
    FROM exceptions
    WHERE (structural_issue OR service_date IS NULL)
      AND (service_date IS NULL OR extract(dow FROM service_date)=0)
    ORDER BY "serviceDate" DESC NULLS LAST
    LIMIT 520`,
    [account],
  );
  return result.rows.map((row) => row.serviceDate);
}
