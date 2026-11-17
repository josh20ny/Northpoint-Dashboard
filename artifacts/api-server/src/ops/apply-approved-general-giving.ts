/**
 * Apply the owner's General Giving trend decision to already-staged records.
 * Read-only preview by default; --apply appends the audited fund mapping and
 * republishes stored PCO history. Never starts a scan or edits source records.
 */
import { pool } from "@workspace/db";
import type { AdminActor } from "../lib/administration";
import { completedSunday } from "../lib/attendance-calculation";
import { logger } from "../lib/logger";
import { createMinistryMapping, publishMinistryData } from "../lib/ministry-data";
import { reportingWeekEnding } from "../lib/reporting-calendar";

class GeneralGivingError extends Error {}

async function main() {
  const c = await pool.connect();
  let actor: AdminActor;
  let fundId: string;
  let mappingNeeded: boolean;
  let start: string;
  const end = completedSunday(new Date());
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    const owner = await c.query(
      `SELECT p.account_ref,u.id FROM pco_connections p JOIN users u ON u.id=p.connected_by
       WHERE p.id='planning_center' AND p.state='connected'
         AND u.role='admin' AND u.status='active'`,
    );
    if (owner.rowCount !== 1)
      throw new GeneralGivingError("An active Admin integration authorizer is required");
    const account = owner.rows[0].account_ref;
    actor = { userId: owner.rows[0].id, role: "admin" };
    if ((await c.query(
      `SELECT 1 FROM pco_sync_runs WHERE account_ref=$1 AND product='giving'
       AND status IN ('running','retry') LIMIT 1`, [account],
    )).rowCount)
      throw new GeneralGivingError("Wait for the active Giving scan before publishing");
    if (!(await c.query(
      `SELECT 1 FROM pco_sync_runs WHERE account_ref=$1 AND product='giving'
       AND mode='backfill' AND status='complete' LIMIT 1`, [account],
    )).rowCount)
      throw new GeneralGivingError("A completed Giving backfill is required");
    const fund = await c.query(
      `SELECT external_id FROM pco_source_entities WHERE account_ref=$1 AND product='giving'
       AND object_type='Fund' AND missing_run_id IS NULL
       AND normalized->'attributes'->>'name'='General Giving'`, [account],
    );
    if (fund.rowCount !== 1)
      throw new GeneralGivingError("The General Giving fund is missing or ambiguous");
    fundId = fund.rows[0].external_id;
    const existing = await c.query(
      `SELECT m.external_id,m.object_type,m.scope,m.effective_from::text,m.effective_to
       FROM ministry_source_mappings m
       WHERE account_ref=$1 AND product='giving' AND measure='giving_total' AND enabled
         AND NOT EXISTS(SELECT 1 FROM ministry_source_mappings n WHERE n.supersedes_id=m.id)`,
      [account],
    );
    mappingNeeded = existing.rows.length === 0;
    if (existing.rows.length > 1 || existing.rows.some((row) =>
      row.external_id !== fundId || row.object_type !== "Fund" || row.scope !== "all" ||
      row.effective_from > "2013-01-01" || row.effective_to !== null))
      throw new GeneralGivingError("Existing General Giving mappings need review; none were replaced");
    const coverage = await c.query(
      `SELECT min(normalized->'attributes'->>'received_at') AS first_received
       FROM pco_source_entities WHERE account_ref=$1 AND product='giving'
         AND object_type='Donation' AND missing_run_id IS NULL`, [account],
    );
    if (!coverage.rows[0]?.first_received)
      throw new GeneralGivingError("No staged Giving receipt dates are available");
    start = reportingWeekEnding(new Date(coverage.rows[0].first_received));
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
  if (!process.argv.includes("--apply")) {
    logger.info({ mappingNeeded, start, end, scanStarted: false }, "General Giving mapping preview");
    return;
  }
  if (mappingNeeded)
    await createMinistryMapping(actor, {
      product: "giving",
      objectType: "Fund",
      externalId: fundId,
      ministry: "giving",
      measure: "giving_total",
      scope: "all",
      effectiveFrom: "2013-01-01",
      effectiveTo: null,
      enabled: true,
      note: "Owner chose General Giving throughout the main historical trend. " +
        "Use only designations to the PCO General Giving fund. All-fund receipts " +
        "remain a separate KPI; accepted workbook General Giving fills historical gaps.",
    });
  const started = Date.now();
  const result = await publishMinistryData(actor, { product: "giving", start, end });
  const v = await pool.connect();
  try {
    await v.query("BEGIN READ ONLY");
    await v.query("SELECT set_config('np.role','admin',true)");
    await v.query("SELECT set_config('np.user_id',$1,true)", [actor.userId]);
    const valid = (await v.query(
      "SELECT np_ministry_publication_valid($1) AS valid", [result.publicationId],
    )).rows[0]?.valid === true;
    const coverage = (await v.query(
      `SELECT measure,quality,count(*)::int AS weeks,count(value)::int AS populated
       FROM ministry_metric_values WHERE publication_id=$1
       AND measure IN ('giving_total','all_fund_giving')
       GROUP BY measure,quality ORDER BY measure,quality`, [result.publicationId],
    )).rows;
    await v.query("COMMIT");
    logger.info({
      ...result, start, end, publicationValid: valid, coverage,
      elapsedMs: Date.now() - started, scanStarted: false,
    }, "Published General Giving history");
    if (!valid || result.issues.length || !coverage.some((row) =>
      row.measure === "giving_total" && row.quality === "complete" && row.populated > 0))
      throw new GeneralGivingError("Publication saved; General Giving coverage needs review");
  } finally {
    v.release();
  }
}

main().catch((error: unknown) => {
  logger.error(
    { reason: error instanceof Error ? error.message : "unknown failure" },
    "General Giving operation failed",
  );
  process.exitCode = 1;
}).finally(() => pool.end());
