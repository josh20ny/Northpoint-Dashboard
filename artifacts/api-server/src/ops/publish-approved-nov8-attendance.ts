/**
 * Owner-approved November 8 partial attendance publication.
 * Uses the audited repository and persisted active Admin integration authorizer.
 * Preview by default; --apply publishes. Never changes Check-In resolutions.
 */
import { pool } from "@workspace/db";
import { publishMinistryData } from "../lib/ministry-data";
import type { AdminActor } from "../lib/administration";

const date = "2026-11-08";
const expected = new Map([
  ["upstreet|service-1", 98], ["upstreet|service-2", 76],
  ["waumba-land|service-1", 46], ["waumba-land|service-2", 31],
  ["transit|service-1", 70], ["transit|service-2", 39],
  ["insideout|service-3", 88],
]);

async function main() {
  const c = await pool.connect();
  let actor: AdminActor;
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    const authorizer = await c.query(
      `SELECT u.id FROM pco_connections p JOIN users u ON u.id=p.connected_by
       WHERE p.id='planning_center' AND p.state='connected'
         AND u.role='admin' AND u.status='active'`,
    );
    if (authorizer.rowCount !== 1)
      throw new Error("An active Admin integration authorizer is required");
    actor = { userId: authorizer.rows[0].id, role: "admin" };
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }

  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ mode: "preview", date, expectedAttendance:
      Object.fromEntries(expected), metricsPublished: false }));
    return;
  }

  const result = await publishMinistryData(actor!, {
    product: "check_ins", start: date, end: date,
  });
  const verify = await pool.connect();
  try {
    await verify.query("BEGIN READ ONLY");
    await verify.query("SELECT set_config('np.role','admin',true)");
    await verify.query("SELECT set_config('np.user_id',$1,true)", [actor!.userId]);
    const values = await verify.query<{
      ministry: string; scope: string; value: string | null; quality: string;
    }>(
      `SELECT ministry,scope,value::text,quality FROM ministry_metric_values
       WHERE publication_id=$1 AND measure='attendance' AND week=$2::date
       ORDER BY ministry,scope`, [result.publicationId, date],
    );
    const validity = await verify.query(
      "SELECT np_ministry_publication_valid($1) AS valid", [result.publicationId],
    );
    await verify.query("COMMIT");
    const matches = values.rows.length === expected.size && values.rows.every(row =>
      row.value !== null && expected.get(`${row.ministry}|${row.scope}`) === Number(row.value) &&
      row.quality === "partial");
    console.log(JSON.stringify({
      mode: "published", date, ...result, attendance: values.rows,
      verified: matches && validity.rows[0]?.valid === true,
      metricsPublished: true,
    }));
    if (!matches || validity.rows[0]?.valid !== true)
      throw new Error("Publication saved but verification needs attention");
  } catch (error) {
    await verify.query("ROLLBACK");
    throw error;
  } finally {
    verify.release();
  }
}

main().catch((error: unknown) => {
  // Do not emit database details or child data from an operational error.
  console.error(error instanceof Error && error.message ===
    "Publication saved but verification needs attention"
    ? error.message : "Approved attendance publication failed");
  process.exitCode = 1;
}).finally(() => pool.end());
