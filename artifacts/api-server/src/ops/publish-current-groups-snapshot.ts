/**
 * Preview or publish safe Connection-wide Groups snapshot totals from the
 * latest completed staged run. Preview is the default; pass --apply to publish.
 * Emits only aggregate counts and never starts a PCO scan.
 */
import { pool } from "@workspace/db";
import { publishMinistryData } from "../lib/ministry-data";
import type { AdminActor } from "../lib/administration";
import {
  compileMinistryFacts,
  type SourceFact,
  type SourceMapping,
} from "../lib/ministry-calculation";
import { reportingWeekEnding } from "../lib/reporting-calendar";

const snapshotMeasures = new Set(["group_count", "group_memberships", "group_leaders"]);

async function main() {
  const c = await pool.connect();
  let actor: AdminActor;
  let account: string;
  let runId: string;
  let finishedAt: Date;
  let coverageStart: string | null;
  let facts: SourceFact[];
  let mappings: SourceMapping[];
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    const authorization = await c.query(
      `SELECT p.account_ref,u.id FROM pco_connections p
       JOIN users u ON u.id=p.connected_by
       WHERE p.id='planning_center' AND p.state='connected'
         AND u.role='admin' AND u.status='active'`,
    );
    if (authorization.rowCount !== 1)
      throw new Error("An active Admin integration authorizer is required");
    account = authorization.rows[0].account_ref;
    actor = { userId: authorization.rows[0].id, role: "admin" };

    const active = await c.query(
      `SELECT 1 FROM pco_sync_runs WHERE account_ref=$1 AND product='groups'
       AND status IN ('running','retry') LIMIT 1`, [account],
    );
    if (active.rowCount) throw new Error("A Groups scan is still active");

    const latest = await c.query(
      `SELECT id,finished_at,coverage_start::text AS coverage_start
       FROM pco_sync_runs WHERE account_ref=$1 AND product='groups'
         AND status='complete' AND finished_at IS NOT NULL
       ORDER BY started_at DESC,id DESC LIMIT 1`, [account],
    );
    if (latest.rowCount !== 1) throw new Error("No completed Groups snapshot is available");
    runId = latest.rows[0].id;
    finishedAt = new Date(latest.rows[0].finished_at);
    coverageStart = latest.rows[0].coverage_start;

    const sourceRows = await c.query(
      `SELECT normalized FROM pco_source_entities
       WHERE account_ref=$1 AND product='groups' AND observed_run_id=$2
         AND missing_run_id IS NULL
       LIMIT 200001`, [account, runId],
    );
    if (sourceRows.rows.length > 200000)
      throw new Error("Groups snapshot exceeds the safe aggregate limit");
    facts = sourceRows.rows.map(({ normalized: n }) => ({
      type: n.sourceType,
      id: n.sourceId,
      attributes: n.attributes ?? {},
      relationships: n.sourceRelationships ?? {},
      sourceCollection: n.sourceCollection ?? null,
    }));
    mappings = (await c.query<SourceMapping>(
      `SELECT id,product,object_type AS "objectType",external_id AS "externalId",
       ministry,measure,scope,effective_from::text AS "effectiveFrom",
       effective_to::text AS "effectiveTo"
       FROM ministry_source_mappings m WHERE account_ref=$1 AND product='groups' AND enabled
         AND NOT EXISTS(SELECT 1 FROM ministry_source_mappings n WHERE n.supersedes_id=m.id)
       ORDER BY id`, [account],
    )).rows;
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }

  const sunday = reportingWeekEnding(finishedAt);
  const compiled = compileMinistryFacts(
    "groups", facts!, mappings!, sunday, sunday, finishedAt,
  );
  const totals = compiled.values.filter((row) => snapshotMeasures.has(row.measure));
  if (!totals.length) throw new Error("No Connection snapshot totals were calculated");

  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({
      mode: "preview",
      asOf: finishedAt.toISOString(),
      reportingWeek: sunday,
      coverageStart,
      snapshot: totals,
      groupAttendanceAvailable: compiled.values.some((row) => row.measure === "group_attendance"),
      issues: compiled.issues,
      metricsPublished: false,
    }));
    return;
  }

  const result = await publishMinistryData(actor!, {
    product: "groups",
    start: sunday,
    end: sunday,
  });
  const verify = await pool.connect();
  try {
    await verify.query("BEGIN READ ONLY");
    await verify.query("SELECT set_config('np.role','admin',true)");
    await verify.query("SELECT set_config('np.user_id',$1,true)", [actor!.userId]);
    const stored = await verify.query<{
      ministry: string;
      measure: string;
      value: string | null;
      quality: string;
    }>(
      `SELECT ministry,measure,value::text,quality FROM ministry_metric_values
       WHERE publication_id=$1 AND week=$2::date
       ORDER BY measure`, [result.publicationId, sunday],
    );
    const validity = await verify.query(
      "SELECT np_ministry_publication_valid($1) AS valid", [result.publicationId],
    );
    await verify.query("COMMIT");
    const storedSnapshot = stored.rows.filter((row) =>
      snapshotMeasures.has(row.measure),
    );
    const expected = totals.filter((row) => row.value !== null);
    const verified = validity.rows[0]?.valid === true &&
      storedSnapshot.length === expected.length &&
      expected.every((row) => stored.rows.some((value) =>
        value.ministry === row.ministry && value.measure === row.measure &&
        value.value === String(row.value) && value.quality === row.quality));
    console.log(JSON.stringify({
      mode: "published",
      asOf: finishedAt!.toISOString(),
      reportingWeek: sunday,
      ...result,
      snapshot: stored.rows,
      groupAttendanceAvailable: compiled.values.some((row) => row.measure === "group_attendance"),
      issues: compiled.issues,
      publicationValid: validity.rows[0]?.valid === true,
      verified,
      metricsPublished: true,
    }));
    if (!verified) throw new Error("Publication saved but verification needs attention");
  } catch (error) {
    await verify.query("ROLLBACK");
    throw error;
  } finally {
    verify.release();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error &&
    error.message === "Publication saved but verification needs attention"
    ? error.message : "Groups snapshot operation failed");
  process.exitCode = 1;
}).finally(() => pool.end());
