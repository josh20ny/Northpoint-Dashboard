import type { PoolClient } from "pg";
import { SetPlanningCenterScheduleBody, type PlanningCenterSchedule } from "@workspace/api-zod";
import type { Principal } from "./auth";
import { AccessError, adminTransaction } from "./administration";
import { recordAudit } from "./audit";
import { incrementalSinceDate, scanRoots } from "./planning-center-source";
import { requireConfiguration, productScope, type Product } from "./planning-center-client";
import { defaultSchedule, nextScheduledAt, validTimeZone } from "./planning-center-calendar";

const PRODUCTS: Product[] = ["people", "services", "check_ins"];
// Retained as a convenience for the default cadence.
export function nextNightlyAt(now: Date): Date {
  return nextScheduledAt(now, defaultSchedule);
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
  products?: Product[];
  status: PlanningCenterSchedule["status"];
  error: string | null;
  time_zone: string;
  local_time: string;
  frequency: PlanningCenterSchedule["frequency"];
  week_days: number[];
  interval_count: number;
  interval_unit: PlanningCenterSchedule["intervalUnit"];
  anchor_date: string;
}
const iso = (v: Date | null | undefined) => v?.toISOString() ?? null;
function view(s?: Schedule): PlanningCenterSchedule {
  return {
    enabled: s?.enabled ?? false,
    products: s?.products ?? PRODUCTS,
    timeZone: s?.time_zone ?? defaultSchedule.timeZone,
    localTime: s?.local_time ?? defaultSchedule.localTime,
    frequency: s?.frequency ?? defaultSchedule.frequency,
    weekDays: s?.week_days ?? defaultSchedule.weekDays,
    intervalCount: s?.interval_count ?? defaultSchedule.intervalCount,
    intervalUnit: s?.interval_unit ?? defaultSchedule.intervalUnit,
    anchorDate: s?.anchor_date ?? defaultSchedule.anchorDate,
    nextRunAt: s?.enabled ? iso(s.next_run_at) : null,
    lastStartedAt: iso(s?.last_started_at),
    lastFinishedAt: iso(s?.last_finished_at),
    activeRunId: s?.active_run_id ?? null,
    status: s?.status ?? "idle",
    error: s?.error ?? null,
  };
}
export async function scheduleView(c: PoolClient, account: string) {
  const s = await c.query<Schedule>(
    "SELECT *,anchor_date::text AS anchor_date FROM pco_sync_schedules WHERE account_ref=$1",
    [account],
  );
  return view(s.rows[0]);
}
export async function setSchedule(
  p: Principal,
  input:
    | boolean
    | {
        enabled: boolean;
        products?: Product[];
        timeZone?: string;
        localTime?: string;
        frequency?: PlanningCenterSchedule["frequency"];
        weekDays?: number[];
        intervalCount?: number;
        intervalUnit?: PlanningCenterSchedule["intervalUnit"];
        anchorDate?: string;
      },
) {
  const parsed = SetPlanningCenterScheduleBody.strict().safeParse(
    typeof input === "boolean" ? { enabled: input } : input,
  );
  if (!parsed.success) throw new AccessError(400, "Invalid refresh schedule");
  const b = parsed.data;
  const { enabled } = b;
  if (b.timeZone && !validTimeZone(b.timeZone))
    throw new AccessError(400, "Choose a valid IANA time zone");
  if (b.weekDays && new Set(b.weekDays).size !== b.weekDays.length)
    throw new AccessError(400, "Choose each weekday only once");
  if (
    b.anchorDate &&
    (b.anchorDate < "1900-01-01" ||
      b.anchorDate > "9998-12-31" ||
      !Number.isFinite(Date.parse(`${b.anchorDate}T00:00:00Z`)) ||
      new Date(`${b.anchorDate}T00:00:00Z`).toISOString().slice(0, 10) !== b.anchorDate)
  )
    throw new AccessError(400, "Choose a valid start date");
  if (enabled) requireConfiguration();
  return adminTransaction(p, async (c) => {
    const v = (
      await c.query<{ account_ref: string; state: string; scopes: string[] }>(
        "SELECT account_ref,state,scopes FROM pco_connections WHERE id='planning_center' FOR UPDATE",
      )
    ).rows[0];
    if (!v || (enabled && v.state !== "connected"))
      throw new AccessError(409, "A confirmed Planning Center connection is required");
    const old = (
      await c.query<Schedule>(
        "SELECT *,anchor_date::text AS anchor_date FROM pco_sync_schedules WHERE id='planning_center' FOR UPDATE",
      )
    ).rows[0];
    // A paused cycle retains its current run and remaining products. Reauthorizing
    // adopts only this schedule's run, never unrelated manual work.
    const same = old?.account_ref === v.account_ref;
    const previous = view(same ? old : undefined);
    const products = b.products ?? (same ? old?.products : undefined) ?? PRODUCTS;
    if (enabled) {
      if (products.some((product) => !v.scopes.includes(productScope(product))))
        throw new AccessError(409, "Authorize each selected product before scheduling it");
      const baseline = await c.query<{ product: string }>(
        `SELECT DISTINCT product FROM pco_sync_runs WHERE account_ref=$1 AND status='complete'
         AND (mode='backfill' OR (mode='current' AND coverage_start IS NOT NULL))`,
        [v.account_ref],
      );
      if (products.some((product) => !baseline.rows.some((r) => r.product === product)))
        throw new AccessError(
          409,
          "Complete a backfill or current-window scan for each selected product first",
        );
    }
    if (
      same &&
      old.active_run_id &&
      JSON.stringify(products) !== JSON.stringify(old.products ?? PRODUCTS)
    )
      throw new AccessError(409, "Finish the paused or active cycle before changing its products");
    const settings = {
      timeZone: b.timeZone ?? previous.timeZone,
      localTime: b.localTime ?? previous.localTime,
      frequency: b.frequency ?? previous.frequency,
      weekDays: (b.weekDays ?? previous.weekDays).slice().sort((a, b) => a - b),
      intervalCount: b.intervalCount ?? previous.intervalCount,
      intervalUnit: b.intervalUnit ?? previous.intervalUnit,
      anchorDate: b.anchorDate ?? previous.anchorDate,
    };
    const changed =
      JSON.stringify(products) !== JSON.stringify(previous.products) ||
      settings.timeZone !== previous.timeZone ||
      settings.localTime !== previous.localTime ||
      settings.frequency !== previous.frequency ||
      settings.intervalCount !== previous.intervalCount ||
      settings.intervalUnit !== previous.intervalUnit ||
      settings.anchorDate !== previous.anchorDate ||
      JSON.stringify(settings.weekDays) !== JSON.stringify(previous.weekDays);
    if (same && old.active_run_id) {
      await c.query(
        `UPDATE pco_sync_runs SET automatic=CASE WHEN $4 THEN $2 ELSE automatic END,
         automatic_requested_by=CASE WHEN $2 THEN $3 ELSE automatic_requested_by END
         WHERE id=$1 AND status IN ('running','retry')`,
        [old.active_run_id, enabled, p.userId, old.enabled !== enabled],
      );
    }
    const next =
      same && old.enabled && enabled && !changed
        ? old.next_run_at
        : nextScheduledAt(new Date(), settings);
    const updated = await c.query<Schedule>(
      `INSERT INTO pco_sync_schedules(id,account_ref,enabled,authorized_by,next_run_at,time_zone,local_time,frequency,week_days,interval_count,interval_unit,anchor_date,products)
       VALUES ('planning_center',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(id) DO UPDATE SET account_ref=$1,enabled=$2,authorized_by=$3,next_run_at=$4,
       time_zone=$5,local_time=$6,frequency=$7,week_days=$8,
       interval_count=$9,interval_unit=$10,anchor_date=$11,products=$12,
       active_run_id=CASE WHEN pco_sync_schedules.account_ref=$1 THEN pco_sync_schedules.active_run_id END,
       remaining=CASE WHEN pco_sync_schedules.account_ref=$1 THEN pco_sync_schedules.remaining ELSE '[]'::jsonb END,
       status=CASE WHEN pco_sync_schedules.account_ref=$1 THEN pco_sync_schedules.status ELSE 'idle' END,
       last_started_at=CASE WHEN pco_sync_schedules.account_ref=$1 THEN pco_sync_schedules.last_started_at END,
       last_finished_at=CASE WHEN pco_sync_schedules.account_ref=$1 THEN pco_sync_schedules.last_finished_at END,
       error=NULL RETURNING *,anchor_date::text AS anchor_date`,
      [
        v.account_ref,
        enabled,
        p.userId,
        enabled ? next : null,
        settings.timeZone,
        settings.localTime,
        settings.frequency,
        JSON.stringify(settings.weekDays),
        settings.intervalCount,
        settings.intervalUnit,
        settings.anchorDate,
        JSON.stringify(products),
      ],
    );
    await recordAudit(
      p.userId!,
      changed
        ? "planning_center.schedule_updated"
        : enabled
          ? "planning_center.schedule_enabled"
          : "planning_center.schedule_paused",
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
      "SELECT *,anchor_date::text AS anchor_date FROM pco_sync_schedules WHERE id='planning_center' AND enabled FOR UPDATE",
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
         last_finished_at=$2,error='Scheduled cycle stopped; review the sync before the next scheduled attempt'
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
  const products = s.active_run_id ? s.remaining : (s.products ?? PRODUCTS);
  const product = products[0]!;
  const baseline = await c.query(
    `SELECT id,mode,coverage_start FROM pco_sync_runs WHERE account_ref=$1 AND product=$2
     AND status='complete' AND (mode='backfill' OR (mode='current' AND coverage_start IS NOT NULL))
     ORDER BY CASE mode WHEN 'backfill' THEN 0 ELSE 1 END,started_at DESC LIMIT 1`,
    [s.account_ref, product],
  );
  if (!baseline.rowCount) {
    await c.query(
      "UPDATE pco_sync_schedules SET enabled=false,next_run_at=NULL,error='Complete the required backfill before resuming the schedule' WHERE id='planning_center'",
    );
    return;
  }
  const mode = baseline.rows[0].mode === "current" ? "current" : "incremental";
  const latestSuccessful =
    mode === "incremental"
      ? await c.query<{ finished_at: Date | string | null }>(
          `SELECT finished_at FROM pco_sync_runs
           WHERE account_ref=$1 AND product=$2 AND status='complete'
             AND mode IN ('backfill','incremental') AND finished_at IS NOT NULL
           ORDER BY finished_at DESC,started_at DESC LIMIT 1`,
          [s.account_ref, product],
        )
      : null;
  const incrementalSince = incrementalSinceDate(latestSuccessful?.rows[0]?.finished_at);
  const coverageStart =
    mode === "current"
      ? String(baseline.rows[0].coverage_start)
      : product === "groups"
        ? null
        : incrementalSince;
  const run = (
    await c.query<{ id: string }>(
      `INSERT INTO pco_sync_runs(account_ref,product,mode,queue,started_by,automatic,automatic_requested_by,coverage_start,lifecycle_version)
     VALUES ($1,$2,$5,$3,$4,true,$4,$6,$7) RETURNING id`,
      [
        s.account_ref,
        product,
        JSON.stringify(
          scanRoots(product, mode === "current" ? coverageStart : incrementalSince, mode),
        ),
        s.authorized_by,
        mode,
        coverageStart,
        mode === "current" ? 2 : 1,
      ],
    )
  ).rows[0]!;
  await c.query(
    `UPDATE pco_sync_schedules SET active_run_id=$1,remaining=$2,status='running',error=NULL,
     last_started_at=CASE WHEN $3 THEN $4 ELSE last_started_at END,
     last_finished_at=CASE WHEN $3 THEN NULL ELSE last_finished_at END,
     next_run_at=CASE WHEN $3 THEN $5 ELSE next_run_at END WHERE id='planning_center'`,
    [
      run.id,
      JSON.stringify(products.slice(1)),
      !s.active_run_id,
      now,
      nextScheduledAt(now, view(s)),
    ],
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
