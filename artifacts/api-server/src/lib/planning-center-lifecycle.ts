import type { PoolClient } from "pg";
import type { PlanningCenterLifecycle } from "@workspace/api-zod";

// Called inside the page savepoint: a failed page cannot leave observations.
// Independent of the newer-payload guard in the source projection upsert.
export async function observeSource(
  c: PoolClient,
  account: string,
  product: string,
  type: string,
  externalId: string,
  runId: string,
) {
  await c.query(
    `WITH observed AS (
      UPDATE pco_source_entities SET observed_run_id=$5,missing_run_id=NULL,seen_at=now()
      WHERE account_ref=$1 AND product=$2 AND object_type=$3 AND external_id=$4 RETURNING id
    ) INSERT INTO pco_source_observations(run_id,entity_id)
      SELECT $5,id FROM observed ON CONFLICT DO NOTHING`,
    [account, product, type, externalId, runId],
  );
}

// Must run in the same transaction as marking the run complete. Never called
// for retries, failed/cancelled scans, or pre-tracking runs resumed after upgrade.
export async function assessCompletedScan(c: PoolClient, runId: string) {
  await c.query(
    `UPDATE pco_source_entities e SET missing_run_id=r.id
      FROM pco_sync_runs r
      WHERE r.id=$1 AND r.status='complete' AND r.lifecycle_version=1
        AND e.account_ref=r.account_ref AND e.product=r.product
        AND NOT EXISTS (SELECT 1 FROM pco_source_observations o
          WHERE o.run_id=r.id AND o.entity_id=e.id)`,
    [runId],
  );
}

export async function lifecycleSummary(c: PoolClient, account: string) {
  const result = await c.query<PlanningCenterLifecycle>(
    `SELECT p.product,
      count(e.id)::int AS total,
      count(e.id) FILTER (WHERE e.observed_run_id IS NOT NULL AND e.missing_run_id IS NULL)::int AS observed,
      count(e.id) FILTER (WHERE e.missing_run_id IS NOT NULL)::int AS "notSeen",
      count(e.id) FILTER (WHERE e.observed_run_id IS NULL AND e.missing_run_id IS NULL)::int AS unassessed,
      count(e.id) FILTER (WHERE lower(e.normalized->'attributes'->>'status')='inactive'
        OR e.normalized->'attributes'->>'inactivated_at' IS NOT NULL)::int AS inactive,
      count(e.id) FILTER (WHERE e.normalized->'attributes'->>'archived_at' IS NOT NULL)::int AS archived,
      count(e.id) FILTER (WHERE e.normalized->'attributes'->>'deleted_at' IS NOT NULL)::int AS "deletionMarkers",
      (SELECT max(r.finished_at) FROM pco_sync_runs r WHERE r.account_ref=$1
        AND r.product=p.product AND r.status='complete' AND r.lifecycle_version=1) AS "lastAssessedAt"
    FROM (VALUES ('people'),('services'),('check_ins')) p(product)
    LEFT JOIN pco_source_entities e ON e.account_ref=$1 AND e.product=p.product
    GROUP BY p.product ORDER BY p.product`,
    [account],
  );
  return result.rows;
}
