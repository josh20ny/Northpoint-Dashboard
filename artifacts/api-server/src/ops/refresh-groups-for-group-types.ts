/**
 * Start one current Groups scan after adding the documented GroupType source
 * and Group.group_type relationship. Preview by default; --start queues and
 * enables the existing page-by-page worker. This never publishes metrics.
 */
import { pool } from "@workspace/db";
import type { AdminActor } from "../lib/administration";
import { setAutomation, startSync } from "../lib/planning-center";
import * as provider from "../lib/planning-center-client";
import { ministryEntity, ministryPagePath, parseMinistryPage } from "../lib/ministry-source";

const start = process.argv.includes("--start");
const effectiveFrom = "2026-11-08";
class GroupsRefreshError extends Error {}

async function main() {
  const c = await pool.connect();
  let actor: AdminActor;
  let accountRef: string;
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    const owner = await c.query<{ account_ref: string; id: string }>(
      `SELECT p.account_ref,u.id FROM pco_connections p
       JOIN users u ON u.id=p.connected_by
       WHERE p.id='planning_center' AND p.state='connected'
         AND u.role='admin' AND u.status='active'`,
    );
    if (owner.rowCount !== 1)
      throw new GroupsRefreshError("An active Admin Planning Center connection is required");
    actor = { userId: owner.rows[0]!.id, role: "admin" };
    accountRef = owner.rows[0]!.account_ref;
    if (process.argv.includes("--inspect-contract")) {
      const credentials = await c.query(
        "SELECT token_ciphertext FROM pco_connections WHERE id='planning_center'",
      );
      const token = provider.decrypt<provider.Tokens>(
        credentials.rows[0].token_ciphertext,
        `tokens:${accountRef}`,
      );
      if (token.expiresAt <= Date.now()) throw new GroupsRefreshError("Wait for token renewal");
      const page = { type: "GroupType", path: "/groups/v2/group_types" };
      const payload = await provider.apiGet(ministryPagePath(page, "groups"), token.accessToken, "groups");
      const rows = Array.isArray(payload.data) ? payload.data : [];
      let valid = true;
      try { parseMinistryPage(payload, page, "groups"); } catch { valid = false; }
      console.log(JSON.stringify({
        mode: "contract",
        valid,
        count: rows.length,
        included: Array.isArray(payload.included) ? payload.included.length : null,
        resources: rows.map((row) => {
          let accepted = true;
          try { ministryEntity(row, "GroupType"); } catch { accepted = false; }
          return {
            type: row.type,
            numericId: typeof row.id === "string" && /^\d+$/.test(row.id),
            nonNumericCategoryId: /^\d+$/.test(String(row.id)) ? null : row.id,
            attributes: Object.keys(row.attributes ?? {}),
            relationships: Object.keys(row.relationships ?? {}),
            accepted,
          };
        }),
      }));
      await c.query("COMMIT");
      return;
    }
    const activeRun = await c.query(
      `SELECT id FROM pco_sync_runs
       WHERE account_ref=$1 AND product='groups' AND status IN ('running','retry')
       LIMIT 1`,
      [accountRef],
    );
    if (activeRun.rowCount)
      throw new GroupsRefreshError("A Groups scan is already active; do not start a second one");
    const scheduled = await c.query(
      `SELECT active_run_id FROM pco_sync_schedules
       WHERE account_ref=$1 AND enabled AND active_run_id IS NOT NULL LIMIT 1`,
      [accountRef],
    );
    if (scheduled.rowCount)
      throw new GroupsRefreshError("The nightly PCO cycle is active; avoid overlapping scans");
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }

  if (start) {
    const run = await startSync(actor!, "groups", "current", effectiveFrom);
    const automatic = await setAutomation(actor!, run.id, true);
    console.log(
      JSON.stringify({
        mode: "started",
        product: "groups",
        from: effectiveFrom,
        status: automatic.status,
        pages: automatic.pages,
        pendingPages: automatic.pendingPages,
        automatic: automatic.automatic,
        metricsPublished: false,
      }),
    );
  } else {
    console.log(
      JSON.stringify({
        mode: "preview",
        product: "groups",
        from: effectiveFrom,
        sourceChange: "GroupType root and Group.group_type relationship",
        metricsPublished: false,
      }),
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof GroupsRefreshError
        ? error.message
        : "Groups refresh could not be started",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
