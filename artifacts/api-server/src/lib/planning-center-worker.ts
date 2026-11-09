import { pool } from "@workspace/db";
import { advancePage } from "./planning-center";
import { recordAudit } from "./audit";
import { logger } from "./logger";
import { advanceSchedule } from "./planning-center-schedule";

// A bounded executor for explicit runs and Admin-authorized nightly schedules.
// Durable flags/cursors survive API restarts; a transaction lock coordinates
// replicas and all existing Admin/manual operations without expiring leases.
export async function processAutomaticPage(): Promise<boolean> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const lock = await c.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_xact_lock(716102) AS acquired",
    );
    if (!lock.rows[0]?.acquired) {
      await c.query("ROLLBACK");
      return false;
    }
    await c.query("SELECT set_config('np.role','admin',true)");
    await advanceSchedule(c);
    const revoked = await c.query<{ id: string; automatic_requested_by: string | null }>(
      `UPDATE pco_sync_runs r SET automatic=false
       WHERE automatic AND NOT EXISTS (
         SELECT 1 FROM users u WHERE u.id=r.automatic_requested_by AND u.role='admin' AND u.status='active'
       ) RETURNING id,automatic_requested_by`,
    );
    for (const r of revoked.rows)
      await recordAudit(
        r.automatic_requested_by,
        "planning_center.automation_authority_revoked",
        "sync_run",
        r.id,
        "denied",
        c,
      );
    const run = await c.query<{ id: string; automatic_requested_by: string }>(
      `SELECT r.id,r.automatic_requested_by FROM pco_sync_runs r
       JOIN pco_connections v ON v.account_ref=r.account_ref AND v.id='planning_center' AND v.state='connected'
       JOIN users u ON u.id=r.automatic_requested_by AND u.status='active' AND u.role='admin'
       WHERE r.automatic AND r.status IN ('running','retry')
         AND (r.retry_at IS NULL OR r.retry_at<=now())
       ORDER BY r.last_automatic_at ASC NULLS FIRST,r.started_at,r.id LIMIT 1 FOR UPDATE OF r`,
    );
    const r = run.rows[0];
    if (r) {
      await c.query("UPDATE pco_sync_runs SET last_automatic_at=now() WHERE id=$1", [r.id]);
      await advancePage(c, { userId: r.automatic_requested_by, role: "admin" }, r.id, true);
    }
    await c.query("COMMIT");
    return !!r;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

export function startPlanningCenterWorker() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    try {
      await processAutomaticPage();
    } catch {
      // Do not log provider bodies, tokens, SQL parameters or source payloads.
      logger.warn("Planning Center automatic page could not commit; saved progress retained");
    }
    if (!stopped) timer = setTimeout(() => void tick(), 2000);
  };
  timer = setTimeout(() => void tick(), 2000);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
