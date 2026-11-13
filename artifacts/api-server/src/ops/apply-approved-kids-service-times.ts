/**
 * Apply the owner-confirmed recurring service-time routes for Normal Service
 * Times. Preview by default; --apply writes through the audited repository.
 *
 * The dated November 8 EventTime rows are templates only. The publisher
 * matches future EventTimes by the same event and Chicago-local start time.
 * This operation does not fetch PCO or publish metrics.
 */
import { pool } from "@workspace/db";
import { createMinistryMapping } from "../lib/ministry-data";
import type { AdminActor } from "../lib/administration";

const effectiveFrom = "2026-11-08";
const approvedRoutes = [
  { time: "09:00", scope: "service-1", ministries: ["upstreet", "waumba-land", "transit"] },
  { time: "11:00", scope: "service-2", ministries: ["upstreet", "waumba-land", "transit"] },
  { time: "16:30", scope: "service-3", ministries: ["insideout"] },
] as const;
const apply = process.argv.includes("--apply");
class ApprovedServiceRouteError extends Error {}

async function main() {
  const c = await pool.connect();
  let actor: AdminActor;
  let targets: { externalId: string; time: string; scope: string; ministry: string }[] = [];
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    const owner = await c.query(
      `SELECT p.account_ref,u.id FROM pco_connections p
       JOIN users u ON u.id=p.connected_by
       WHERE p.id='planning_center' AND u.role='admin' AND u.status='active'`,
    );
    if (owner.rowCount !== 1)
      throw new ApprovedServiceRouteError("An active Admin integration authorizer is required");
    actor = { userId: owner.rows[0].id, role: "admin" };
    const account = owner.rows[0].account_ref;
    const events = await c.query<{ id: string }>(
      `SELECT external_id AS id FROM pco_source_entities
       WHERE account_ref=$1 AND product='check_ins' AND object_type='Event'
         AND missing_run_id IS NULL
         AND normalized->'attributes'->>'name'='Normal Service Times'`,
      [account],
    );
    if (events.rowCount !== 1)
      throw new ApprovedServiceRouteError("The approved Check-Ins event is not uniquely staged");
    const eventId = events.rows[0].id;
    const times = await c.query<{ id: string; time: string }>(
      `SELECT external_id AS id,
        to_char((normalized->'attributes'->>'starts_at')::timestamptz
          AT TIME ZONE 'America/Chicago','HH24:MI') AS time
       FROM pco_source_entities WHERE account_ref=$1 AND product='check_ins'
         AND object_type='EventTime' AND missing_run_id IS NULL
         AND normalized->'sourceRelationships'->'event'->'data'->>'id'=$2
         AND ((normalized->'attributes'->>'starts_at')::timestamptz
           AT TIME ZONE 'America/Chicago')::date=$3::date`,
      [account, eventId, effectiveFrom],
    );
    const timeIds = new Map(times.rows.map((row) => [row.time, row.id]));
    if (
      approvedRoutes.some((route) => !timeIds.has(route.time)) ||
      timeIds.size !== times.rows.length
    )
      throw new ApprovedServiceRouteError(
        "Approved November 8 service-time templates are missing or ambiguous",
      );

    targets = approvedRoutes.flatMap((route) =>
      route.ministries.map((ministry) => ({
        externalId: timeIds.get(route.time)!,
        time: route.time,
        scope: route.scope,
        ministry,
      })),
    );
    const existing = await c.query<{
      external_id: string;
      ministry: string;
      scope: string;
      effective_from: string;
      effective_to: string | null;
      enabled: boolean;
    }>(
      `SELECT external_id,ministry,scope,effective_from::text,effective_to::text,enabled
       FROM ministry_source_mappings m WHERE account_ref=$1 AND product='check_ins'
         AND object_type='EventTime' AND measure='service_session'
         AND external_id=ANY($2::text[]) AND enabled
         AND NOT EXISTS(SELECT 1 FROM ministry_source_mappings n WHERE n.supersedes_id=m.id)
         AND (effective_to IS NULL OR effective_to >= $3::date)`,
      [account, [...new Set(targets.map((item) => item.externalId))], effectiveFrom],
    );
    for (const target of targets) {
      const matches = existing.rows.filter(
        (row) => row.external_id === target.externalId && row.ministry === target.ministry,
      );
      if (
        matches.length === 1 &&
        matches[0].scope === target.scope &&
        matches[0].effective_from <= effectiveFrom &&
        matches[0].effective_to === null
      )
        continue;
      if (matches.length)
        throw new ApprovedServiceRouteError(
          "An active service route differs from owner-confirmed routing",
        );
    }
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }

  let created = 0;
  if (apply) {
    for (const target of targets) {
      await createMinistryMapping(actor!, {
        product: "check_ins",
        objectType: "EventTime",
        externalId: target.externalId,
        ministry: target.ministry,
        measure: "service_session",
        scope: target.scope,
        effectiveFrom,
        effectiveTo: null,
        note:
          `Owner-confirmed recurring Normal Service Times route: ${target.time} Chicago time ` +
          `for ${target.ministry}. November 8 EventTime is a recurring template; future dated ` +
          "EventTimes match by event and local clock time. No historical backcasting.",
        enabled: true,
      });
      created++;
    }
  }
  console.log(
    JSON.stringify({
      mode: apply ? "applied" : "preview",
      approvedRoutes: targets.length,
      created,
      services: approvedRoutes.map(({ time, scope, ministries }) => ({
        time,
        scope,
        ministries: ministries.length,
      })),
      metricsPublished: false,
    }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof ApprovedServiceRouteError
        ? error.message
        : "Approved service routing failed",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
