import type { PoolClient } from "pg";
import type { PlanningCenterSchedule } from "@workspace/api-zod";
import type { Principal } from "./auth";
import { AccessError, adminTransaction } from "./administration";
import { recordAudit } from "./audit";
import { roots } from "./planning-center-source";
import { requireConfiguration, type Product } from "./planning-center-client";

const PRODUCTS: Product[] = ["people", "services", "check_ins"];
const zone = "America/Chicago";
const local = new Intl.DateTimeFormat("en-CA", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});
function parts(date: Date) {
  return Object.fromEntries(local.formatToParts(date).map((p) => [p.type, p.value]));
}
// First 1 AM on the next eligible local date. On fall-back day, run only
// at the first 1 AM; never schedule the repeated hour as a second nightly run.
export function nextNightlyAt(now: Date): Date {
  const p = parts(now);
  const day = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  if (Number(p.hour) >= 1) day.setUTCDate(day.getUTCDate() + 1);
  const target = day.toISOString().slice(0, 10);
  const start = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
  for (let i = 0; i < 50; i++) {
    const candidate = new Date(start + i * 3_600_000);
    const c = parts(candidate);
    if (candidate > now && `${c.year}-${c.month}-${c.day}` === target && c.hour === "01")
      return candidate;
  }
  throw new Error("Could not calculate nightly sync time");
}
interface Schedule {
  account_ref: string;
  enabled: boolean;
  authorized_by: string;
  next_run_at: Date | null;
  last_started_at: Date | null;
  last_finished_at: Date | null;
  active_run_id: string | null;
  remaining: Product[];
  status: PlanningCenterSchedule["status"];
  error: string | null;
}
const iso = (v: Date | null | undefined) => v?.toISOString() ?? null;
function view(s?: Schedule): PlanningCenterSchedule {
  return {
    enabled: s?.enabled ?? false,
    timeZone: zone,
    localTime: "01:00",
    nextRunAt: s?.enabled ? iso(s.next_run_at) : null,
    lastStartedAt: iso(s?.last_started_at),
    lastFinishedAt: iso(s?.last_finished_at),
    activeRunId: s?.active_run_id ?? null,
    status: s?.status ?? "idle",
    error: s?.error ?? null,
  };
}
export async function scheduleView(c: PoolClient, account: string) {
  const s = await c.query<Schedule>("SELECT * FROM pco_sync_schedules WHERE account_ref=$1", [
    account,
  ]);
  return view(s.rows[0]);
}
export async function setSchedule(p: Principal, enabled: boolean) {
  if (enabled) requireConfiguration();
  return adminTransaction(p, async (c) => {
    const v = (
      await c.query<{ account_ref: string; state: string }>(
        "SELECT account_ref,state FROM pco_connections WHERE id='planning_center' FOR UPDATE",
      )
    ).rows[0];
    if (!v || (enabled && v.state !== "connected"))
      throw new AccessError(409, "A confirmed Planning Center connection is required");
    if (enabled) {
      const baseline = await c.query<{ product: string }>(
        "SELECT DISTINCT product FROM pco_sync_runs WHERE account_ref=$1 AND mode='backfill' AND status='complete'",
        [v.account_ref],
      );
      if (PRODUCTS.some((product) => !baseline.rows.some((r) => r.product === product)))
        throw new AccessError(409, "Complete all three backfills before enabling nightly syncs");
    }
    const old = (
      await c.query<Schedule>(
        "SELECT * FROM pco_sync_schedules WHERE id='planning_center' FOR UPDATE",
      )
    ).rows[0];
    // A paused cycle retains its current run and remaining products. Reauthorizing
    // adopts only this schedule's run, never unrelated manual work.
    const same = old?.account_ref === v.account_ref;
    if (same && old.active_run_id) {
      await c.query(
        `UPDATE pco_sync_runs SET automatic=$2,
         automatic_requested_by=CASE WHEN $2 THEN $3 ELSE automatic_requested_by END
         WHERE id=$1 AND status IN ('running','retry')`,
        [old.active_run_id, enabled, p.userId],
      );
    }
    const next = same && old.enabled && enabled ? old.next_run_at : nextNightlyAt(new Date());
    const updated = await c.query<Schedule>(
      `INSERT INTO pco_sync_schedules(id,account_ref,enabled,authorized_by,next_run_at)
       VALUES ('planning_center',$1,$2,$3,$4)
       ON CONFLICT(id) DO UPDATE SET account_ref=$1,enabled=$2,authorized_by=$3,next_run_at=$4,
       active_run_id=CASE WHEN pco_sync_schedules.account_ref=$1 THEN pco_sync_schedules.active_run_id END,
       remaining=CASE WHEN pco_sync_schedules.account_ref=$1 THEN pco_sync_schedules.remaining ELSE '[]'::jsonb END,
       status=CASE WHEN pco_sync_schedules.account_ref=$1 THEN pco_sync_schedules.status ELSE 'idle' END,
       last_started_at=CASE WHEN pco_sync_schedules.account_ref=$1 THEN pco_sync_schedules.last_started_at END,
       last_finished_at=CASE WHEN pco_sync_schedules.account_ref=$1 THEN pco_sync_schedules.last_finished_at END,
       error=NULL RETURNING *`,
      [v.account_ref, enabled, p.userId, enabled ? next : null],
    );
    await recordAudit(
      p.userId!,
      enabled ? "planning_center.schedule_enabled" : "planning_center.schedule_paused",
      "integration",
      null,
      "success",
      c,
    );
    return view(updated.rows[0]);
  });
}

// Called within the worker's existing Admin transaction/advisory lock. Selection,
// claims and run creation commit atomically; no timer state is authoritative.
export async function advanceSchedule(c: PoolClient, now = new Date()) {
  const s = (
    await c.query<Schedule>(
      "SELECT * FROM pco_sync_schedules WHERE id='planning_center' AND enabled FOR UPDATE",
    )
  ).rows[0];
  if (!s) return;
  const authorized = await c.query(
    `SELECT u.id FROM users u JOIN pco_connections v ON v.id='planning_center'
     WHERE u.id=$1 AND u.role='admin' AND u.status='active'
       AND v.account_ref=$2 AND v.state='connected'`,
    [s.authorized_by, s.account_ref],
  );
  if (!authorized.rowCount) {
    await c.query(
      `UPDATE pco_sync_schedules SET enabled=false,next_run_at=NULL,
       error='Schedule paused: reconnect or have an active Admin enable it again' WHERE id='planning_center'`,
    );
    if (s.active_run_id)
      await c.query("UPDATE pco_sync_runs SET automatic=false WHERE id=$1", [s.active_run_id]);
    await recordAudit(
      s.authorized_by,
      "planning_center.schedule_authority_revoked",
      "integration",
      null,
      "denied",
      c,
    );
    return;
  }
  if (s.active_run_id) {
    const run = (
      await c.query<{ status: string }>("SELECT status FROM pco_sync_runs WHERE id=$1", [
        s.active_run_id,
      ])
    ).rows[0];
    if (run && ["running", "retry"].includes(run.status)) return;
    if (!run || run.status !== "complete") {
      await c.query(
        `UPDATE pco_sync_schedules SET active_run_id=NULL,remaining='[]',status=$1,
         last_finished_at=$2,error='Nightly cycle stopped; review the sync before the next scheduled attempt'
         WHERE id='planning_center'`,
        [run?.status === "cancelled" ? "cancelled" : "failed", now],
      );
      await recordAudit(
        s.authorized_by,
        "planning_center.scheduled_cycle_stopped",
        "integration",
        null,
        "failed",
        c,
      );
      return;
    }
    if (!s.remaining.length) {
      await c.query(
        `UPDATE pco_sync_schedules SET active_run_id=NULL,status='complete',
         last_finished_at=$1,error=NULL WHERE id='planning_center'`,
        [now],
      );
      await recordAudit(
        s.authorized_by,
        "planning_center.scheduled_cycle_completed",
        "integration",
        null,
        "success",
        c,
      );
      return;
    }
  } else if (!s.next_run_at || s.next_run_at > now) return;

  // Do not run a scheduled import alongside any unfinished manual/automatic run.
  // A paused manual run deliberately blocks the cycle until an Admin resolves it.
  if (
    (
      await c.query(
        "SELECT id FROM pco_sync_runs WHERE account_ref=$1 AND status IN ('running','retry') LIMIT 1",
        [s.account_ref],
      )
    ).rowCount
  )
    return;
  const products = s.active_run_id ? s.remaining : PRODUCTS;
  const product = products[0]!;
  const baseline = await c.query(
    "SELECT id FROM pco_sync_runs WHERE account_ref=$1 AND product=$2 AND mode='backfill' AND status='complete' LIMIT 1",
    [s.account_ref, product],
  );
  if (!baseline.rowCount) {
    await c.query(
      "UPDATE pco_sync_schedules SET enabled=false,next_run_at=NULL,error='Complete the required backfill before resuming the schedule' WHERE id='planning_center'",
    );
    return;
  }
  const run = (
    await c.query<{ id: string }>(
      `INSERT INTO pco_sync_runs(account_ref,product,mode,queue,started_by,automatic,automatic_requested_by)
     VALUES ($1,$2,'incremental',$3,$4,true,$4) RETURNING id`,
      [s.account_ref, product, JSON.stringify(roots(product)), s.authorized_by],
    )
  ).rows[0]!;
  await c.query(
    `UPDATE pco_sync_schedules SET active_run_id=$1,remaining=$2,status='running',error=NULL,
     last_started_at=CASE WHEN $3 THEN $4 ELSE last_started_at END,
     last_finished_at=CASE WHEN $3 THEN NULL ELSE last_finished_at END,
     next_run_at=CASE WHEN $3 THEN $5 ELSE next_run_at END WHERE id='planning_center'`,
    [run.id, JSON.stringify(products.slice(1)), !s.active_run_id, now, nextNightlyAt(now)],
  );
  await recordAudit(
    s.authorized_by,
    "planning_center.scheduled_sync_started",
    "sync_run",
    run.id,
    "success",
    c,
  );
}
