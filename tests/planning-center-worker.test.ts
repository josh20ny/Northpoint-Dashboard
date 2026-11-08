import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  connect: vi.fn(),
  warn: vi.fn(),
}));
import { pool } from "../lib/db/src/index";
import { logger } from "../artifacts/api-server/src/lib/logger";
import * as pco from "../artifacts/api-server/src/lib/planning-center";
import {
  processAutomaticPage,
  startPlanningCenterWorker,
} from "../artifacts/api-server/src/lib/planning-center-worker";
import type { Principal } from "../artifacts/api-server/src/lib/auth";

const admin: Principal = {
  role: "admin",
  userId: "00000000-0000-4000-8000-000000000001",
  identity: {
    provider: "replit",
    subject: "synthetic",
    verifiedEmail: "synthetic@example.invalid",
  },
};
const id = "00000000-0000-4000-8000-000000000002";
const run = () => ({
  id,
  account_ref: "1",
  product: "people",
  mode: "backfill",
  status: "running",
  queue: [{ path: "/people/v2/people?offset=10000", type: "Person" }],
  visited: [],
  fetched: 10000,
  revised: 10000,
  pages: 100,
  started_at: new Date("2026-11-08T12:00:00Z"),
  finished_at: null,
  retry_at: null,
  error: null,
  automatic: false,
  automatic_requested_by: null,
  last_automatic_at: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  vi.spyOn(pool, "connect").mockImplementation(mocks.connect as never);
  vi.spyOn(logger, "warn").mockImplementation(mocks.warn);
  vi.stubEnv("AUTH_ORIGIN", "https://example.invalid");
  vi.stubEnv("PCO_CLIENT_ID", "synthetic-client");
  vi.stubEnv("PCO_CLIENT_SECRET", "synthetic-secret");
  vi.stubEnv("PCO_TOKEN_ENCRYPTION_KEY", "1".repeat(64));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected provider request in synthetic test");
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("durable Planning Center automation controls", () => {
  function setup(current = run()) {
    mocks.query.mockImplementation(async (sql: string, args?: unknown[]) => {
      if (sql.startsWith("SELECT id FROM users"))
        return { rows: [{ id: admin.userId }], rowCount: 1 };
      if (sql.startsWith("SELECT * FROM pco_connections"))
        return { rows: [{ account_ref: "1", state: "connected", token_ciphertext: "not-read" }] };
      if (sql.startsWith("SELECT * FROM pco_sync_runs")) return { rows: [current] };
      if (sql.startsWith("UPDATE pco_sync_runs SET automatic=")) {
        if (args?.[0] !== id || !["running", "retry"].includes(current.status)) return { rows: [] };
        current.automatic = args[2] as boolean;
        return { rows: [{ ...current, automatic_requested_by: admin.userId }] };
      }
      return { rows: [], rowCount: 0 };
    });
    return current;
  }
  it("enables an existing 100-page run without changing its saved cursor or counts", async () => {
    const current = setup();
    const before = JSON.stringify(current.queue);
    const result = await pco.setAutomation(admin, id, true);
    expect(result).toMatchObject({ automatic: true, pages: 100, fetched: 10000, pendingPages: 1 });
    expect(JSON.stringify(current.queue)).toBe(before);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("automatic_requested_by=CASE"),
      [id, "1", true, admin.userId],
    );
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO audit_events"), [
      admin.userId,
      "planning_center.automation_enabled",
      "sync_run",
      id,
      "success",
    ]);
  });
  it("pauses without cancelling the run or discarding progress", async () => {
    const current = setup();
    current.automatic = true;
    expect(await pco.setAutomation(admin, id, false)).toMatchObject({
      automatic: false,
      status: "running",
      fetched: 10000,
      pages: 100,
    });
  });
  it("does not enable completed or unknown runs", async () => {
    setup({ ...run(), status: "complete" });
    await expect(pco.setAutomation(admin, id, true)).rejects.toMatchObject({ status: 409 });
    setup();
    await expect(pco.setAutomation(admin, "unknown", true)).rejects.toMatchObject({ status: 409 });
  });
  it("rechecks current database membership before recording a delegation", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(pco.setAutomation(admin, id, true)).rejects.toMatchObject({ status: 403 });
    expect(mocks.query).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE pco_sync_runs"),
      expect.anything(),
    );
  });
  it("rejects a Staff actor before opening a transaction", async () => {
    await expect(pco.setAutomation({ ...admin, role: "staff" }, id, true)).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("blocks manual advance while the server owns automatic processing", async () => {
    const current = setup();
    current.automatic = true;
    await expect(pco.advanceSync(admin, id)).rejects.toMatchObject({ status: 409 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("blocks a worker whose delegation no longer matches the saved request", async () => {
    const current = setup();
    current.automatic = true;
    await expect(
      pco.advancePage(
        { query: mocks.query } as never,
        { role: "admin", userId: admin.userId },
        id,
        true,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not fetch again before a provider retry deadline", async () => {
    const current = setup() as ReturnType<typeof run> & {
      automatic_requested_by: string;
      retry_at: Date;
    };
    current.automatic = true;
    current.automatic_requested_by = admin.userId!;
    current.retry_at = new Date(Date.now() + 60000);
    await expect(
      pco.advancePage(
        { query: mocks.query } as never,
        { role: "admin", userId: admin.userId },
        id,
        true,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("server page executor", () => {
  function setup(
    candidate: { id: string; automatic_requested_by: string } | null = {
      id,
      automatic_requested_by: admin.userId!,
    },
  ) {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: true }] };
      if (sql.startsWith("SELECT r.id,r.automatic_requested_by"))
        return { rows: candidate ? [candidate] : [] };
      return { rows: [], rowCount: 0 };
    });
    return vi.spyOn(pco, "advancePage").mockResolvedValue({} as never);
  }
  it("processes one page under the shared transaction lock with a persisted delegation", async () => {
    const advance = setup();
    expect(await processAutomaticPage()).toBe(true);
    expect(advance).toHaveBeenCalledWith(
      expect.objectContaining({ query: mocks.query }),
      { userId: admin.userId, role: "admin" },
      id,
      true,
    );
    expect(mocks.query).toHaveBeenLastCalledWith("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("only selects explicit, active-Admin grants for connected, due, unfinished runs", async () => {
    setup(null);
    expect(await processAutomaticPage()).toBe(false);
    const sql = mocks.query.mock.calls.find(([s]) =>
      String(s).startsWith("SELECT r.id,r.automatic_requested_by"),
    )![0];
    for (const condition of [
      "r.automatic",
      "u.status='active'",
      "u.role='admin'",
      "v.state='connected'",
      "r.status IN ('running','retry')",
      "r.retry_at<=now()",
      "FOR UPDATE OF r",
    ])
      expect(sql).toContain(condition);
  });
  it("does not process or block on another page owner", async () => {
    const advance = setup();
    mocks.query.mockResolvedValue({ rows: [{ acquired: false }] });
    expect(await processAutomaticPage()).toBe(false);
    expect(advance).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
  it("rolls back unexpected failures instead of committing partial page progress", async () => {
    const advance = setup();
    advance.mockRejectedValue(new Error("synthetic failure"));
    await expect(processAutomaticPage()).rejects.toThrow("synthetic failure");
    expect(mocks.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("audits automatic pause when the delegating Admin is no longer authorized", async () => {
    setup(null);
    const previous = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, ...args: unknown[]) => {
      if (sql.startsWith("UPDATE pco_sync_runs r SET automatic=false"))
        return { rows: [{ id, automatic_requested_by: admin.userId }] };
      return previous(sql, ...args);
    });
    await processAutomaticPage();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO audit_events"), [
      admin.userId,
      "planning_center.automation_authority_revoked",
      "sync_run",
      id,
      "denied",
    ]);
  });
  it("picks up persisted work on every new executor call without browser state", async () => {
    const advance = setup();
    await processAutomaticPage();
    await processAutomaticPage();
    expect(advance).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls.filter(([s]) => s === "COMMIT")).toHaveLength(2);
  });
  it("paces pages, avoids overlapping ticks and stops scheduling on shutdown", async () => {
    vi.useFakeTimers();
    const advance = setup();
    const stop = startPlanningCenterWorker();
    await vi.advanceTimersByTimeAsync(1999);
    expect(advance).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(advance).toHaveBeenCalledOnce();
    stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(advance).toHaveBeenCalledOnce();
  });
  it("logs only a fixed safe message and retries a failed tick later", async () => {
    vi.useFakeTimers();
    setup();
    mocks.connect.mockRejectedValue(new Error("do-not-log-synthetic-credential"));
    const stop = startPlanningCenterWorker();
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.warn).toHaveBeenCalledWith(
      "Planning Center automatic page could not commit; saved progress retained",
    );
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("do-not-log");
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    stop();
  });
});
