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

export async function loadCheckInFactsForWindow(
  c: Pick<PoolClient, "query">,
  account: string,
  start: string | null,
  end: string | null,
  templateIds: string[] = [],
  includeUndated = false,
): Promise<SourceFact[]> {
  const result = await c.query(
    `WITH checkins AS MATERIALIZED (
      SELECT c.external_id, c.normalized,
        c.normalized->'sourceRelationships'->'event_period'->'data'->>'id' AS period_id,
        c.normalized->'sourceRelationships'->'person'->'data'->>'id' AS person_id,
        COALESCE(
          (SELECT MIN((t.normalized->'attributes'->>'starts_at')::timestamptz
            AT TIME ZONE 'America/Chicago')::date
           FROM jsonb_array_elements(
             CASE jsonb_typeof(c.normalized->'sourceRelationships'->'event_times'->'data')
               WHEN 'array' THEN c.normalized->'sourceRelationships'->'event_times'->'data'
               WHEN 'object' THEN jsonb_build_array(c.normalized->'sourceRelationships'->'event_times'->'data')
               ELSE '[]'::jsonb
             END
           ) AS linked(item)
           JOIN pco_source_entities t ON t.account_ref=c.account_ref
             AND t.product='check_ins' AND t.object_type='EventTime'
             AND t.external_id=linked.item->>'id' AND t.missing_run_id IS NULL),
          (SELECT ((p.normalized->'attributes'->>'starts_at')::timestamptz
            AT TIME ZONE 'America/Chicago')::date
           FROM pco_source_entities p
           WHERE p.account_ref=c.account_ref AND p.product='check_ins'
             AND p.object_type='EventPeriod'
             AND p.external_id=c.normalized->'sourceRelationships'->'event_period'->'data'->>'id'
             AND p.missing_run_id IS NULL
           LIMIT 1)
        ) AS service_date
      FROM pco_source_entities c
      WHERE c.account_ref=$1 AND c.product='check_ins' AND c.object_type='CheckIn'
        AND c.observed_run_id IS NOT NULL AND c.missing_run_id IS NULL
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
