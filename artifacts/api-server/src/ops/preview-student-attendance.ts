/** Read-only November 8 calculation using the publisher's staged sources. */
import { pool } from "@workspace/db";
import {
  compileMinistryFacts, type SourceFact, type SourceMapping,
} from "../lib/ministry-calculation";
import { readCheckInResolutions } from "../lib/ministry-checkin-review-store";
import {
  checkInTemplateIds,
  loadCheckInFactsForWindow,
  loadCheckInGradeFacts,
} from "../lib/ministry-checkin-source";

let stage = "connect";
async function main() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    stage = "connection";
    const connection = await c.query(
      "SELECT account_ref FROM pco_connections WHERE id='planning_center' AND state='connected'",
    );
    if (connection.rowCount !== 1) throw new Error("No connected organization");
    const account = connection.rows[0].account_ref;
    stage = "completed_snapshots";
    const runs = await c.query(
      `SELECT DISTINCT ON(product) product,id,finished_at
       FROM pco_sync_runs WHERE account_ref=$1 AND product IN ('check_ins','groups')
         AND status='complete' AND finished_at IS NOT NULL
       ORDER BY product,started_at DESC,id DESC`, [account],
    );
    const checkRun = runs.rows.find((run) => run.product === "check_ins");
    const groupRun = runs.rows.find((run) => run.product === "groups");
    if (!checkRun || !groupRun) throw new Error("Completed source snapshots required");
    stage = "source_mappings";
    const mappings = await c.query<SourceMapping>(
      `SELECT id,product,object_type AS "objectType",external_id AS "externalId",
       ministry,measure,scope,effective_from::text AS "effectiveFrom",
       effective_to::text AS "effectiveTo",enabled
       FROM ministry_source_mappings m WHERE account_ref=$1
         AND product IN ('check_ins','groups') AND enabled
         AND NOT EXISTS(SELECT 1 FROM ministry_source_mappings n WHERE n.supersedes_id=m.id)`,
      [account],
    );
    const checkInMappings = mappings.rows.filter((mapping) => mapping.product === "check_ins");
    const groupMappings = mappings.rows.filter((mapping) => mapping.product === "groups");
    stage = "checkin_sources";
    const checkInFacts = await loadCheckInFactsForWindow(
      c, account, "2026-11-08", "2026-11-08", checkInTemplateIds(checkInMappings),
    );
    stage = "grade_sources";
    const gradeFacts = await loadCheckInGradeFacts(c, account);
    stage = "group_sources";
    const groupSources = await c.query(
      `SELECT normalized FROM pco_source_entities
       WHERE account_ref=$1 AND product='groups' AND observed_run_id=$2
         AND missing_run_id IS NULL AND object_type IN ('Group','Membership')
       LIMIT 500001`,
      [account, groupRun.id],
    );
    if (groupSources.rows.length > 500000) throw new Error("Groups preview size exceeded");
    const groupFacts: SourceFact[] = groupSources.rows.map(({ normalized: n }) => ({
      type: n.sourceType, id: n.sourceId, attributes: n.attributes ?? {},
      relationships: n.sourceRelationships ?? {}, sourceCollection: n.sourceCollection ?? null,
    }));
    stage = "review_decisions";
    const resolutions = await readCheckInResolutions(c, account);
    stage = "calculation";
    const result = compileMinistryFacts(
      "check_ins", checkInFacts, checkInMappings,
      "2026-11-08", "2026-11-08", new Date(checkRun.finished_at),
      resolutions, groupFacts, groupMappings,
      new Date(groupRun.finished_at),
      gradeFacts,
    );
    await c.query("COMMIT");
    console.log(JSON.stringify({
      mode: "read_only_preview", date: "2026-11-08",
      studentAttendance: result.values.filter((value) =>
        ["transit","insideout"].includes(value.ministry) && value.measure === "attendance"),
      issues: result.issues, metricsPublished: false,
    }));
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error &&
    typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : null;
  console.error(JSON.stringify({ error: "Read-only attendance preview failed", stage, code }));
  process.exitCode = 1;
}).finally(() => pool.end());
