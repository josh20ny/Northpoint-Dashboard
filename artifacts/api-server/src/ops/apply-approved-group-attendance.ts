/**
 * Apply the owner-approved Groups-only Connection attendance category.
 * Preview by default; --apply writes the audited mapping and republishes only
 * the completed Groups source window. This operation never starts a PCO scan.
 */
import { pool } from "@workspace/db";
import type { AdminActor } from "../lib/administration";
import { createMinistryMapping, publishMinistryData } from "../lib/ministry-data";
import { reportingWeekEnding } from "../lib/reporting-calendar";

const apply = process.argv.includes("--apply");
const categoryName = "Groups";

class ApprovedMappingError extends Error {}

async function main() {
  const c = await pool.connect();
  let actor: AdminActor;
  let account: string;
  let runId: string;
  let sourceId: string;
  let coverageStart: string;
  let start: string;
  let end: string;
  let mappingNeeded: boolean;
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
      throw new ApprovedMappingError("An active Admin integration authorizer is required");
    account = owner.rows[0].account_ref;
    actor = { userId: owner.rows[0].id, role: "admin" };

    const active = await c.query(
      `SELECT 1 FROM pco_sync_runs WHERE account_ref=$1 AND product='groups'
       AND status IN ('running','retry') LIMIT 1`,
      [account],
    );
    if (active.rowCount) throw new ApprovedMappingError("A Groups scan is still active");

    const latest = await c.query(
      `SELECT id,finished_at,coverage_start::text AS coverage_start
       FROM pco_sync_runs WHERE account_ref=$1 AND product='groups'
         AND status='complete' AND finished_at IS NOT NULL
       ORDER BY started_at DESC,id DESC LIMIT 1`,
      [account],
    );
    if (latest.rowCount !== 1 || !latest.rows[0].coverage_start)
      throw new ApprovedMappingError("A completed, date-bounded Groups snapshot is required");
    runId = latest.rows[0].id;
    coverageStart = latest.rows[0].coverage_start;
    start = reportingWeekEnding(new Date(`${coverageStart}T18:00:00Z`));
    end = reportingWeekEnding(new Date(latest.rows[0].finished_at));
    if (end < start)
      throw new ApprovedMappingError("The completed Groups snapshot has no publishable reporting week");

    const categories = await c.query(
      `SELECT external_id AS id FROM pco_source_entities
       WHERE account_ref=$1 AND product='groups' AND object_type='GroupType'
         AND observed_run_id=$2 AND missing_run_id IS NULL
         AND normalized->'attributes'->>'name'=$3`,
      [account, runId, categoryName],
    );
    if (categories.rowCount !== 1)
      throw new ApprovedMappingError("The approved Groups category is missing or ambiguous");
    sourceId = categories.rows[0].id;

    const conflictingGroupMappings = await c.query(
      `SELECT 1 FROM ministry_source_mappings m
       WHERE account_ref=$1 AND product='groups' AND object_type='Group'
         AND measure='group_attendance' AND enabled
         AND NOT EXISTS (SELECT 1 FROM ministry_source_mappings n WHERE n.supersedes_id=m.id)
         AND daterange(effective_from,effective_to,'[]') && daterange($2::date,NULL,'[]')
       LIMIT 1`,
      [account, coverageStart],
    );
    if (conflictingGroupMappings.rowCount)
      throw new ApprovedMappingError(
        "An individual Group attendance mapping conflicts with the approved category-only rule",
      );

    const existing = await c.query<{
      ministry: string;
      scope: string;
      effective_from: string;
      effective_to: string | null;
    }>(
      `SELECT ministry,scope,effective_from::text,effective_to::text
       FROM ministry_source_mappings m
       WHERE account_ref=$1 AND product='groups' AND object_type='GroupType'
         AND external_id=$2 AND measure='group_attendance' AND enabled
         AND NOT EXISTS (SELECT 1 FROM ministry_source_mappings n WHERE n.supersedes_id=m.id)
         AND daterange(effective_from,effective_to,'[]') && daterange($3::date,NULL,'[]')`,
      [account, sourceId, coverageStart],
    );
    mappingNeeded = existing.rowCount === 0;
    if (
      existing.rows.length > 1 ||
      (existing.rows.length === 1 &&
        (existing.rows[0].ministry !== "connection" ||
          existing.rows[0].scope !== "all" ||
          existing.rows[0].effective_from > coverageStart ||
          existing.rows[0].effective_to !== null))
    )
      throw new ApprovedMappingError("The Groups category has a conflicting interpretation");

    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }

  if (!apply) {
    console.log(JSON.stringify({
      mode: "preview",
      category: categoryName,
      mappingNeeded,
      effectiveFrom: coverageStart!,
      reportingWeeks: { start: start!, end: end! },
      scanStarted: false,
      metricsPublished: false,
    }));
    return;
  }

  if (mappingNeeded)
    await createMinistryMapping(actor!, {
      product: "groups",
      objectType: "GroupType",
      externalId: sourceId!,
      ministry: "connection",
      measure: "group_attendance",
      scope: "all",
      effectiveFrom: coverageStart!,
      effectiveTo: null,
      enabled: true,
      note:
        "Owner approved the PCO Groups category only for Connection meeting attendance. " +
        "Effective from the earliest date in this completed Groups source window; no older history is inferred.",
    });

  const publication = await publishMinistryData(actor!, {
    product: "groups",
    start: start!,
    end: end!,
  });
  const verify = await pool.connect();
  try {
    await verify.query("BEGIN READ ONLY");
    await verify.query("SELECT set_config('np.role','admin',true)");
    await verify.query("SELECT set_config('np.user_id',$1,true)", [actor!.userId]);
    const metrics = await verify.query<{
      measure: string;
      week: string;
      value: string | null;
      quality: string;
    }>(
      `SELECT measure,week::text,value::text,quality
       FROM ministry_metric_values WHERE publication_id=$1
       ORDER BY week,measure`,
      [publication.publicationId],
    );
    const validity = await verify.query(
      "SELECT np_ministry_publication_valid($1) AS valid",
      [publication.publicationId],
    );
    await verify.query("COMMIT");
    const attendance = metrics.rows.filter((row) => row.measure === "group_attendance");
    const verified = validity.rows[0]?.valid === true && attendance.length > 0;
    console.log(JSON.stringify({
      mode: "published",
      category: categoryName,
      mappingCreated: mappingNeeded,
      coverageStart: coverageStart!,
      reportingWeeks: { start: start!, end: end! },
      ...publication,
      groupAttendance: attendance,
      publicationValid: validity.rows[0]?.valid === true,
      verified,
      scanStarted: false,
    }));
    if (!verified) throw new Error("Publication saved but verification needs attention");
  } catch (error) {
    await verify.query("ROLLBACK");
    throw error;
  } finally {
    verify.release();
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof ApprovedMappingError
        ? error.message
        : error instanceof Error && error.message === "Publication saved but verification needs attention"
          ? error.message
          : "Approved group attendance operation failed",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
