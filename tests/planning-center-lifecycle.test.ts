import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { readFileSync } from "node:fs";
import { advancePage } from "../artifacts/api-server/src/lib/planning-center";
import { encrypt } from "../artifacts/api-server/src/lib/planning-center-client";
import { planningCenterRateLimit } from "../artifacts/api-server/src/lib/planning-center-rate-limit";
import {
  assessCompletedScan,
  observeSource,
  lifecycleSummary,
} from "../artifacts/api-server/src/lib/planning-center-lifecycle";

// Explicit client injection: no real connection, account, or provider is used.
const query = vi.fn();
const c = { query } as unknown as PoolClient;
const id = "00000000-0000-4000-8000-000000000002";
const actor = { userId: "00000000-0000-4000-8000-000000000001", role: "admin" as const };
const run = () => ({
  id,
  account_ref: "synthetic",
  product: "people",
  mode: "incremental",
  status: "running",
  queue: [{ path: "/people/v2/people", type: "Person" }],
  visited: [],
  fetched: 0,
  revised: 0,
  pages: 0,
  started_at: new Date(),
  finished_at: null,
  retry_at: null,
  error: null,
  automatic: false,
  automatic_requested_by: null,
  last_automatic_at: null,
  lifecycle_version: 1,
});
let current = run();
const person = { type: "Person", id: "42", attributes: { status: "inactive" } };
const sqlCalls = () => query.mock.calls.map(([sql]) => String(sql));
const assessments = () => sqlCalls().filter((s) => s.startsWith("UPDATE pco_source_entities e"));
const observations = () => sqlCalls().filter((s) => s.startsWith("WITH observed"));

beforeEach(() => {
  query.mockReset();
  vi.spyOn(planningCenterRateLimit, "wait").mockResolvedValue();
  vi.stubEnv("AUTH_ORIGIN", "https://example.invalid");
  vi.stubEnv("PCO_CLIENT_ID", "synthetic-client");
  vi.stubEnv("PCO_CLIENT_SECRET", "synthetic-secret");
  vi.stubEnv("PCO_TOKEN_ENCRYPTION_KEY", "1".repeat(64));
  current = run();
  query.mockImplementation(async (sql: string, args?: unknown[]) => {
    if (sql.startsWith("SELECT * FROM pco_connections"))
      return {
        rows: [
          {
            account_ref: "synthetic",
            state: "connected",
            token_ciphertext: encrypt(
              {
                accessToken: "synthetic-access",
                refreshToken: "synthetic-refresh",
                expiresAt: Date.now() + 3600000,
              },
              "tokens:synthetic",
            ),
          },
        ],
      };
    if (sql.startsWith("SELECT * FROM pco_sync_runs")) return { rows: [current] };
    // Existing immutable revision; simulates replay without any new revisions.
    if (sql.startsWith("SELECT r.id,r.object_type"))
      return {
        rows: JSON.parse(args![1] as string).map((row: Record<string, unknown>) => ({
          ...row,
          id,
        })),
      };
    if (sql.startsWith("UPDATE pco_sync_runs SET queue"))
      return {
        rows: [
          {
            ...current,
            queue: JSON.parse(args![1] as string),
            status: args![5],
            fetched: current.fetched + Number(args![3]),
            revised: current.revised + Number(args![4]),
            pages: current.pages + Number(args![6] ?? 1),
            finished_at: args![5] === "complete" ? new Date() : null,
          },
        ],
      };
    if (sql.startsWith("UPDATE pco_sync_runs SET status"))
      return { rows: [{ ...current, status: args![1], error: args![2] }] };
    return { rows: [], rowCount: 0 };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [person] }))),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Planning Center lifecycle evidence", () => {
  it("observes unchanged/older payloads independently of the source-version guard", async () => {
    await advancePage(c, actor, id, false);
    const sql = sqlCalls();
    const projection = sql.findIndex((s) => s.startsWith("INSERT INTO pco_source_entities"));
    expect(sql[projection]).toContain("updated_at");
    expect(sql[projection + 1]).toContain("WITH observed");
    expect(observations()).toHaveLength(1);
    expect(sql[projection + 1]).toContain("missing_run_id=NULL");
    expect(sql[projection + 1]).not.toContain("updated_at");
    expect(sql[projection + 1]).toContain("ON CONFLICT DO NOTHING");
    const args = query.mock.calls[projection + 1][1];
    expect(args.slice(0, 3)).toEqual(["synthetic", "people", id]);
    expect(JSON.parse(args[3])[0]).toMatchObject({ object_type: "Person", external_id: "42" });
  });
  it("fetches a bounded batch of independent pages concurrently and commits all cursors together", async () => {
    current.queue = Array.from({ length: 10 }, (_, index) => ({
      path: `/people/v2/people?offset=${index * 100}`,
      type: "Person",
    }));
    let active = 0;
    let maxActive = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      active++;
      maxActive = Math.max(maxActive, active);
      const offset = new URL(String(input)).searchParams.get("offset") ?? "0";
      await new Promise((resolve) => setTimeout(resolve, 15));
      active--;
      return new Response(
        JSON.stringify({
          data: [{ ...person, id: offset || "0" }],
        }),
      );
    });

    const result = await advancePage(c, actor, id, false);
    const update = query.mock.calls.find(([sql]) =>
      String(sql).startsWith("UPDATE pco_sync_runs SET queue"),
    );
    expect(maxActive).toBe(8);
    expect(fetch).toHaveBeenCalledTimes(8);
    expect(result).toMatchObject({ status: "running", pages: 8, fetched: 8 });
    expect(JSON.parse(update![1]![1] as string)).toHaveLength(2);
    expect(JSON.parse(update![1]![2] as string)).toHaveLength(8);
  });
  it("retries the whole batch without staging partial results when one request fails", async () => {
    current.queue = [
      { path: "/people/v2/people", type: "Person" },
      { path: "/people/v2/people?offset=100", type: "Person" },
      { path: "/people/v2/people?offset=200", type: "Person" },
    ];
    vi.mocked(fetch).mockImplementation(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (new URL(String(input)).searchParams.get("offset") === "100")
        return new Response("private", { status: 429 });
      return new Response(JSON.stringify({ data: [person] }));
    });

    const result = await advancePage(c, actor, id, false);
    expect(result).toMatchObject({ status: "retry", pages: 0, fetched: 0 });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sqlCalls()).toContain("ROLLBACK TO SAVEPOINT pco_page");
    expect(sqlCalls().some((sql) => sql.startsWith("INSERT INTO pco_source_entities"))).toBe(
      false,
    );
  });
  it("assesses absence only after completion, within the page savepoint", async () => {
    await advancePage(c, actor, id, false);
    const sql = sqlCalls();
    const complete = sql.findIndex((s) => s.startsWith("UPDATE pco_sync_runs SET queue"));
    const assess = sql.findIndex((s) => s.startsWith("UPDATE pco_source_entities e"));
    expect(assess).toBeGreaterThan(complete);
    expect(assess).toBeLessThan(sql.indexOf("RELEASE SAVEPOINT pco_page"));
    expect(assessments()).toHaveLength(1);
  });
  it("a successfully completed empty result can flag absence without deleting history", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: [] })));
    await advancePage(c, actor, id, false);
    expect(observations()).toHaveLength(0);
    expect(assessments()).toHaveLength(1);
    expect(sqlCalls().join(" ")).not.toMatch(/DELETE FROM|TRUNCATE/i);
  });
  it("does not assess absence while more pages remain", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [person],
          links: { next: "https://api.planningcenteronline.com/people/v2/people?offset=100" },
        }),
      ),
    );
    expect(await advancePage(c, actor, id, false)).toMatchObject({ status: "running" });
    expect(observations()).toHaveLength(1);
    expect(assessments()).toHaveLength(0);
  });
  it.each([403, 429, 500])("does not turn provider %i into absence or zero", async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response("private", { status }));
    await advancePage(c, actor, id, false);
    expect(assessments()).toHaveLength(0);
    expect(observations()).toHaveLength(0);
    expect(sqlCalls()).toContain("ROLLBACK TO SAVEPOINT pco_page");
    if (status === 403) expect(sqlCalls().join(" ")).toContain("state='reconnect_required'");
  });
  it("rolls back positive evidence if a later step of the page fails", async () => {
    const original = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, ...args: unknown[]) => {
      if (sql.startsWith("UPDATE pco_sync_runs SET queue"))
        throw new Error("synthetic commit failure");
      return original(sql, ...args);
    });
    await expect(advancePage(c, actor, id, false)).rejects.toThrow("synthetic commit failure");
    expect(observations()).toHaveLength(1);
    expect(assessments()).toHaveLength(0);
    expect(sqlCalls()).toContain("ROLLBACK TO SAVEPOINT pco_page");
    expect(sqlCalls()).not.toContain("RELEASE SAVEPOINT pco_page");
  });
  it("scopes completed assessments to account/product and excludes observed records and legacy runs", async () => {
    await assessCompletedScan(c, id);
    const sql = sqlCalls()[0];
    for (const clause of [
      "r.status='complete'",
      "r.lifecycle_version=1",
      "e.account_ref=r.account_ref",
      "e.product=r.product",
      "NOT EXISTS",
      "o.run_id=r.id AND o.entity_id=e.id",
    ])
      expect(sql).toContain(clause);
    expect(query.mock.calls[0][1]).toEqual([id]);
  });
  it("clears a missing flag on positive reappearance without erasing source status/history", async () => {
    await observeSource(c, "synthetic", "people", "Person", "42", id);
    const sql = sqlCalls()[0];
    expect(sql).toContain("missing_run_id=NULL");
    expect(sql).toContain("INSERT INTO pco_source_observations");
    expect(sql).not.toContain("normalized=");
    expect(sql).not.toContain("raw_id=");
  });
  it("returns metadata only and separates source markers from presence", async () => {
    await lifecycleSummary(c, "synthetic");
    const sql = sqlCalls()[0];
    for (const column of ["notSeen", "unassessed", "inactive", "archived", "deletionMarkers"])
      expect(sql).toContain(column);
    expect(sql).toContain("r.lifecycle_version=1");
    expect(sql).not.toMatch(/token|account_name|external_id/i);
    expect(query.mock.calls[0][1]).toEqual(["synthetic"]);
  });
  it("migration leaves legacy evidence unassessed and protects the observation ledger", () => {
    const sql = readFileSync("lib/db/migrations/0012_nasty_chamber.sql", "utf8");
    expect(sql).toContain('"lifecycle_version" integer DEFAULT 0');
    expect(sql).toContain('"lifecycle_version" SET DEFAULT 1');
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("BEFORE UPDATE OR DELETE OR TRUNCATE");
    expect(sql).not.toMatch(/UPDATE pco_source_entities|DELETE FROM/i);
  });
});
