import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { pool } from "../lib/db/src/index";
import {
  advanceSchedule,
  nextNightlyAt,
  scheduleView,
  setSchedule,
} from "../artifacts/api-server/src/lib/planning-center-schedule";
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
      return { rows: [{ account_ref: "1", state: "connected" }] };
    if (sql.startsWith("SELECT * FROM pco_sync_schedules"))
      return { rows: schedule ? [schedule] : [] };
    if (sql.startsWith("SELECT status FROM pco_sync_runs"))
      return { rows: [{ status: runStatus }] };
    if (sql.startsWith("SELECT id FROM pco_sync_runs"))
      return {
        rows: [],
        rowCount: sql.includes("mode='backfill'") ? Number(baseline) : Number(occupied),
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
    expect(inserts()[0]![1]).toEqual(["1", "people", expect.any(String), actor]);
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
      expect.stringContaining("UPDATE pco_sync_runs SET automatic=$2"),
      [id, false, actor],
    );
    expect(query.mock.calls.some(([sql]) => /SET queue|DELETE FROM/.test(sql))).toBe(false);
    expect(query).toHaveBeenLastCalledWith("COMMIT");
  });
  it("resumes its saved run with the current Admin's delegation", async () => {
    schedule!.enabled = false;
    schedule!.active_run_id = id;
    await setSchedule(admin, true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE pco_sync_runs SET automatic=$2"),
      [id, true, actor],
    );
    expect(inserts()).toHaveLength(0);
  });
});
