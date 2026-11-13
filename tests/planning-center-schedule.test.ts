import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { pool } from "../lib/db/src/index";
import {
  advanceSchedule,
  nextNightlyAt,
  scheduleView,
  setSchedule,
} from "../artifacts/api-server/src/lib/planning-center-schedule";
import {
  defaultSchedule,
  nextScheduledAt,
} from "../artifacts/api-server/src/lib/planning-center-calendar";
import type { Principal } from "../artifacts/api-server/src/lib/auth";

const actor = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const admin = { role: "admin", userId: actor } as Principal;
const now = new Date("2026-11-09T07:00:00Z");
const saved = () => ({
  account_ref: "1",
  enabled: true,
  authorized_by: actor,
  next_run_at: now,
  last_started_at: null,
  last_finished_at: null,
  active_run_id: null as string | null,
  remaining: [] as string[],
  status: "idle",
  error: null,
  time_zone: "America/Chicago",
  local_time: "01:00",
  frequency: "daily",
  week_days: [0],
  interval_count: 1,
  interval_unit: "days",
  anchor_date: "1970-01-05",
});
let schedule: ReturnType<typeof saved> | null;
let runStatus: string;
let authorized: boolean;
let occupied: boolean;
let baseline: boolean;
const query = vi.fn();
const release = vi.fn();
const c = { query } as unknown as PoolClient;
beforeEach(() => {
  vi.clearAllMocks();
  schedule = saved();
  runStatus = "complete";
  authorized = true;
  occupied = false;
  baseline = true;
  vi.spyOn(pool, "connect").mockResolvedValue({ query, release } as never);
  vi.stubEnv("AUTH_ORIGIN", "https://example.invalid");
  vi.stubEnv("PCO_CLIENT_ID", "synthetic");
  vi.stubEnv("PCO_CLIENT_SECRET", "synthetic");
  vi.stubEnv("PCO_TOKEN_ENCRYPTION_KEY", "1".repeat(64));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No live provider requests allowed");
    }),
  );
  query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT id FROM users")) return { rows: [], rowCount: authorized ? 1 : 0 };
    if (sql.startsWith("SELECT u.id")) return { rows: [], rowCount: authorized ? 1 : 0 };
    if (sql.startsWith("SELECT account_ref,state"))
      return {
        rows: [
          { account_ref: "1", state: "connected", scopes: ["people", "services", "check_ins"] },
        ],
      };
    if (sql.startsWith("SELECT *,anchor_date::text AS anchor_date FROM pco_sync_schedules"))
      return { rows: schedule ? [schedule] : [] };
    if (sql.startsWith("SELECT status FROM pco_sync_runs"))
      return { rows: [{ status: runStatus }] };
    if (sql.startsWith("SELECT id FROM pco_sync_runs"))
      return {
        rows: [],
        rowCount: sql.includes("mode='backfill'") ? Number(baseline) : Number(occupied),
      };
    if (sql.startsWith("SELECT id,mode,coverage_start FROM pco_sync_runs"))
      return {
        rows: baseline ? [{ id, mode: "backfill", coverage_start: null }] : [],
        rowCount: Number(baseline),
      };
    if (sql.startsWith("SELECT finished_at FROM pco_sync_runs"))
      return {
        rows: baseline ? [{ finished_at: new Date("2026-11-08T20:00:00Z") }] : [],
      };
    if (sql.startsWith("SELECT DISTINCT product"))
      return {
        rows: baseline ? ["people", "services", "check_ins"].map((product) => ({ product })) : [],
      };
    if (sql.includes("RETURNING id")) return { rows: [{ id }], rowCount: 1 };
    if (sql.includes("RETURNING *")) return { rows: [schedule], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const inserts = () => query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO pco_sync_runs"));
const writes = () =>
  query.mock.calls.filter(([sql]) => sql.startsWith("UPDATE pco_sync_schedules"));

describe("nightly Central calendar", () => {
  it.each([
    ["2026-07-01T05:59:59Z", "2026-07-01T06:00:00Z"],
    ["2026-11-09T06:59:59Z", "2026-11-09T07:00:00Z"],
    ["2026-11-09T07:00:00Z", "2026-11-10T07:00:00Z"],
    ["2026-03-08T07:00:00Z", "2026-03-09T06:00:00Z"],
    ["2026-11-01T05:59:59Z", "2026-11-01T06:00:00Z"],
    ["2026-11-01T06:00:00Z", "2026-11-02T07:00:00Z"],
    ["2026-11-01T07:00:00Z", "2026-11-02T07:00:00Z"],
    ["2026-12-31T23:00:00Z", "2027-01-01T07:00:00Z"],
  ])("calculates %s → %s without repeated-hour duplicates", (input, expected) => {
    expect(nextNightlyAt(new Date(input))).toEqual(new Date(expected));
  });
});
describe("durable schedule coordinator", () => {
  it("defaults to disabled without creating a schedule or a live run", async () => {
    schedule = null;
    expect(await scheduleView(c, "1")).toMatchObject({
      enabled: false,
      nextRunAt: null,
      status: "idle",
    });
    await advanceSchedule(c, now);
    expect(inserts()).toHaveLength(0);
  });
  it("waits until due", async () => {
    schedule!.next_run_at = new Date(now.getTime() + 1);
    await advanceSchedule(c, now);
    expect(inserts()).toHaveLength(0);
  });
  it("starts People with delegated authority and saves the following products", async () => {
    await advanceSchedule(c, now);
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0]![1]).toEqual([
      "1",
      "people",
      expect.any(String),
      actor,
      "incremental",
      "2026-11-05",
      1,
    ]);
    expect(JSON.parse(inserts()[0]![1]![2] as string)).toEqual([
      expect.objectContaining({
        path: "/people/v2/people",
        since: "2026-11-05",
        windowField: "updated_at",
      }),
      expect.objectContaining({ path: "/people/v2", type: "Grade" }),
    ]);
    expect(writes()[0]![1]).toEqual([
      id,
      '["services","check_ins"]',
      true,
      now,
      nextNightlyAt(now),
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("collapses missed dates into one run with a future next start", async () => {
    schedule!.next_run_at = new Date("2026-11-01T06:00:00Z");
    await advanceSchedule(c, now);
    expect(inserts()).toHaveLength(1);
    expect(writes()[0]![1]![4]).toEqual(nextNightlyAt(now));
  });
  it("does not overlap existing work, even when it is paused", async () => {
    occupied = true;
    await advanceSchedule(c, now);
    expect(inserts()).toHaveLength(0);
  });
  it.each(["running", "retry"])("waits for the current %s run", async (status) => {
    schedule!.active_run_id = id;
    runStatus = status;
    await advanceSchedule(c, now);
    expect(inserts()).toHaveLength(0);
    expect(writes()).toHaveLength(0);
  });
  it.each([
    [["services", "check_ins"], "services", '["check_ins"]'],
    [["check_ins"], "check_ins", "[]"],
  ])("advances remaining products in order", async (remaining, product, rest) => {
    schedule!.active_run_id = id;
    schedule!.remaining = remaining as string[];
    await advanceSchedule(c, now);
    expect(inserts()[0]![1]![1]).toBe(product);
    expect(writes()[0]![1]![1]).toBe(rest);
    expect(writes()[0]![1]![2]).toBe(false);
  });
  it("marks completion only after the final product completes", async () => {
    schedule!.active_run_id = id;
    await advanceSchedule(c, now);
    expect(writes()[0]![0]).toContain("status='complete'");
    expect(inserts()).toHaveLength(0);
  });
  it.each(["failed", "cancelled"])(
    "stops a %s cycle instead of skipping a product",
    async (status) => {
      schedule!.active_run_id = id;
      schedule!.remaining = ["services"];
      runStatus = status;
      await advanceSchedule(c, now);
      expect(writes()[0]![1]![0]).toBe(status);
      expect(inserts()).toHaveLength(0);
    },
  );
  it("disables the schedule and current automation after authority/connection loss", async () => {
    authorized = false;
    schedule!.active_run_id = id;
    await advanceSchedule(c, now);
    expect(writes()[0]![0]).toContain("enabled=false");
    expect(query).toHaveBeenCalledWith("UPDATE pco_sync_runs SET automatic=false WHERE id=$1", [
      id,
    ]);
    expect(inserts()).toHaveLength(0);
  });
  it("fails closed when a required baseline is absent", async () => {
    baseline = false;
    await advanceSchedule(c, now);
    expect(writes()[0]![0]).toContain("enabled=false");
    expect(inserts()).toHaveLength(0);
  });
  it("requires current Admin membership, not only the session role", async () => {
    authorized = false;
    await expect(setSchedule(admin, true)).rejects.toMatchObject({ status: 403 });
    expect(pool.connect).toHaveBeenCalledOnce();
    expect(inserts()).toHaveLength(0);
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
  });
  it("rejects enabling until all three baselines are complete", async () => {
    baseline = false;
    await expect(setSchedule(admin, true)).rejects.toMatchObject({ status: 409 });
  });
  it("pauses only the schedule-owned import and retains its cursor", async () => {
    schedule!.active_run_id = id;
    await setSchedule(admin, false);
    expect(pool.connect).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE pco_sync_runs SET automatic=CASE"),
      [id, false, actor, true],
    );
    expect(query.mock.calls.some(([sql]) => /SET queue|DELETE FROM/.test(sql))).toBe(false);
    expect(query).toHaveBeenLastCalledWith("COMMIT");
  });
  it("resumes its saved run with the current Admin's delegation", async () => {
    schedule!.enabled = false;
    schedule!.active_run_id = id;
    await setSchedule(admin, true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE pco_sync_runs SET automatic=CASE"),
      [id, true, actor, true],
    );
    expect(inserts()).toHaveLength(0);
  });
  it("persists edited settings while keeping a paused schedule paused", async () => {
    schedule!.enabled = false;
    await setSchedule(admin, {
      enabled: false,
      timeZone: "America/New_York",
      localTime: "09:45",
      frequency: "weekly",
      weekDays: [3, 1],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO pco_sync_schedules"), [
      "1",
      false,
      actor,
      null,
      "America/New_York",
      "09:45",
      "weekly",
      "[1,3]",
      1,
      "days",
      "1970-01-05",
      JSON.stringify(["people", "services", "check_ins"]),
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO audit_events"), [
      actor,
      "planning_center.schedule_updated",
      "integration",
      null,
      "success",
    ]);
    expect(inserts()).toHaveLength(0);
  });
  it("recalculates the next start after edits without restarting its current import", async () => {
    schedule!.active_run_id = id;
    await setSchedule(admin, { enabled: true, localTime: "16:35" });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE pco_sync_runs SET automatic=CASE"),
      [id, true, actor, false],
    );
    const call = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO pco_sync_schedules"))!;
    expect(call[1][3]).toBeInstanceOf(Date);
    expect(call[1][3]).not.toEqual(schedule!.next_run_at);
    expect(call[1][5]).toBe("16:35");
    expect(inserts()).toHaveLength(0);
  });
  it("leaves an unchanged enabled schedule's due time alone", async () => {
    await setSchedule(admin, { enabled: true, localTime: "01:00", frequency: "daily" });
    const call = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO pco_sync_schedules"))!;
    expect(call[1][3]).toEqual(now);
  });
  it.each([
    { localTime: "24:00" },
    { localTime: "1:00" },
    { localTime: "10:60" },
    { frequency: "hourly" },
    { frequency: "twice_daily" },
    { intervalCount: 0 },
    { intervalCount: 366 },
    { intervalCount: 2.5 },
    { intervalUnit: "months" },
    { anchorDate: "2026-02-30" },
    { anchorDate: "not-a-date" },
    { weekDays: [] },
    { weekDays: [7] },
    { weekDays: [1, 1] },
    { weekDays: [1.5] },
    { timeZone: "Not/AZone" },
    { enabled: "true" },
    { unexpected: "field" },
  ])("rejects invalid schedule settings before database access: %j", async (invalid) => {
    await expect(setSchedule(admin, { enabled: false, ...invalid } as never)).rejects.toMatchObject(
      { status: 400 },
    );
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

describe("configurable refresh calendar", () => {
  it.each([
    ["daily", "02:30", "2026-03-08T06:00:00Z", "2026-03-08T08:30:00Z"],
    ["daily", "01:30", "2026-11-01T06:31:00Z", "2026-11-02T07:30:00Z"],
    ["daily", "23:59", "2026-12-31T06:00:00Z", "2027-01-01T05:59:00Z"],
  ] as const)("handles %s at %s", (frequency, localTime, input, expected) => {
    expect(nextScheduledAt(new Date(input), { ...defaultSchedule, frequency, localTime })).toEqual(
      new Date(expected),
    );
  });
  it("finds the next selected weekday, including week wrap", () => {
    const settings = {
      ...defaultSchedule,
      frequency: "weekly" as const,
      weekDays: [1, 3],
      localTime: "09:45",
    };
    expect(nextScheduledAt(new Date("2026-11-09T15:45:00Z"), settings)).toEqual(
      new Date("2026-11-11T15:45:00Z"),
    );
    expect(nextScheduledAt(new Date("2026-11-12T15:45:00Z"), settings)).toEqual(
      new Date("2026-11-16T15:45:00Z"),
    );
  });
  it("uses the saved settings for future coordinator claims", async () => {
    schedule!.frequency = "weekly";
    schedule!.week_days = [3];
    schedule!.local_time = "09:45";
    await advanceSchedule(c, now);
    expect(writes()[0]![1]![4]).toEqual(new Date("2026-11-11T15:45:00Z"));
  });
  it("supports a half-hour offset zone and UTC", () => {
    expect(
      nextScheduledAt(new Date("2026-11-09T00:00:00Z"), {
        ...defaultSchedule,
        timeZone: "Asia/Kolkata",
        localTime: "06:10",
      }),
    ).toEqual(new Date("2026-11-09T00:40:00Z"));
    expect(
      nextScheduledAt(new Date("2026-11-09T00:00:00Z"), {
        ...defaultSchedule,
        timeZone: "UTC",
        localTime: "06:10",
      }),
    ).toEqual(new Date("2026-11-09T06:10:00Z"));
  });
  it.each([
    [2, "days", "2026-11-09", "2026-11-10T00:00:00Z", "2026-11-11T07:00:00Z"],
    [3, "days", "2026-11-09", "2026-11-10T00:00:00Z", "2026-11-12T07:00:00Z"],
    [2, "weeks", "2026-11-09", "2026-11-10T00:00:00Z", "2026-11-23T07:00:00Z"],
    [3, "weeks", "2026-11-09", "2026-11-10T00:00:00Z", "2026-11-30T07:00:00Z"],
    [2, "days", "2026-12-31", "2026-12-31T07:00:00Z", "2027-01-02T07:00:00Z"],
    [3, "days", "2024-02-27", "2024-02-28T00:00:00Z", "2024-03-01T07:00:00Z"],
    [2, "days", "2026-03-07", "2026-03-08T00:00:00Z", "2026-03-09T06:00:00Z"],
    [365, "weeks", "2026-11-09", "2026-11-10T00:00:00Z", "2033-11-07T07:00:00Z"],
    [2, "days", "2030-01-01", "2026-11-10T00:00:00Z", "2030-01-01T07:00:00Z"],
    [12, "hours", "1970-01-05", "2026-11-09T07:00:00Z", "2026-11-09T19:00:00Z"],
    [6, "hours", "1970-01-05", "2026-11-09T07:00:00Z", "2026-11-09T13:00:00Z"],
  ] as const)(
    "custom every %s %s from %s",
    (intervalCount, intervalUnit, anchorDate, input, expected) => {
      expect(
        nextScheduledAt(new Date(input), {
          ...defaultSchedule,
          frequency: "custom",
          intervalCount,
          intervalUnit,
          anchorDate,
          weekDays: [1],
        }),
      ).toEqual(new Date(expected));
    },
  );
  it("uses Monday-based alternate weeks and multiple selected weekdays", () => {
    const s = {
      ...defaultSchedule,
      frequency: "custom" as const,
      intervalCount: 2,
      intervalUnit: "weeks" as const,
      anchorDate: "2026-11-11",
      weekDays: [1, 3, 5],
    };
    expect(nextScheduledAt(new Date("2026-11-11T08:00:00Z"), s)).toEqual(
      new Date("2026-11-13T07:00:00Z"),
    );
    expect(nextScheduledAt(new Date("2026-11-13T08:00:00Z"), s)).toEqual(
      new Date("2026-11-23T07:00:00Z"),
    );
  });
  it("persists the interval and anchor date without moving them on pause/resume", async () => {
    schedule!.enabled = false;
    await setSchedule(admin, {
      enabled: false,
      frequency: "custom",
      intervalCount: 3,
      intervalUnit: "days",
      anchorDate: "2026-11-09",
    });
    const call = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO pco_sync_schedules"))!;
    expect(call[1].slice(8, 11)).toEqual([3, "days", "2026-11-09"]);
    expect(inserts()).toHaveLength(0);
  });
});
