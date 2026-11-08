import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect, vi } from "vitest";
import type { Principal } from "../artifacts/api-server/src/lib/auth";
import { GetPlanningCenterResponse } from "../lib/api-zod/src/generated/api";

describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "Planning Center rollback-only database invariants",
  () => {
    let db: typeof import("../lib/db/src/index");
    let pco: typeof import("../artifacts/api-server/src/lib/planning-center");
    let client: typeof import("../artifacts/api-server/src/lib/planning-center-client");
    let c: Awaited<ReturnType<typeof import("pg").Pool.prototype.connect>>;
    let p: Principal;
    const account = "999999999999999999999999999999";
    const session = "synthetic-session";
    const payload = (id = "1", status = "active") => ({
      type: "Person",
      id,
      attributes: { status, updated_at: "2026-01-04T15:00:00Z" },
    });
    const response = (body: unknown, status = 200, headers?: Record<string, string>) =>
      new Response(JSON.stringify(body), { status, headers });
    beforeAll(async () => {
      db = await import("../lib/db/src/index");
      c = await db.pool.connect();
      vi.spyOn(db.pool, "connect").mockImplementation(
        async () =>
          ({
            query: (sql: string, args?: unknown[]) => {
              if (sql === "BEGIN") return c.query("SAVEPOINT operation");
              if (sql === "COMMIT") return c.query("RELEASE SAVEPOINT operation");
              if (sql === "ROLLBACK") return c.query("ROLLBACK TO SAVEPOINT operation");
              return c.query(sql, args);
            },
            release() {},
          }) as never,
      );
      pco = await import("../artifacts/api-server/src/lib/planning-center");
      client = await import("../artifacts/api-server/src/lib/planning-center-client");
    });
    beforeEach(async () => {
      vi.stubEnv("AUTH_ORIGIN", "https://example.invalid");
      vi.stubEnv("PCO_CLIENT_ID", "synthetic-client");
      vi.stubEnv("PCO_CLIENT_SECRET", "synthetic-secret");
      vi.stubEnv("PCO_TOKEN_ENCRYPTION_KEY", "2".repeat(64));
      await c.query("BEGIN");
      await c.query("SELECT set_config('np.role','admin',true)");
      const id = randomUUID();
      await c.query(
        "INSERT INTO users(id,provider,auth_subject,email,role) VALUES($1,'replit',$2,$3,'admin')",
        [id, id, `${id}@example.invalid`],
      );
      p = {
        role: "admin",
        userId: id,
        identity: { subject: id, provider: "replit", verifiedEmail: `${id}@example.invalid` },
      };
      // Never overwrite a real connection, even in an eventually rolled-back test.
      const existing = await c.query("SELECT id FROM pco_connections");
      if (existing.rowCount)
        throw new Error(
          "Database checks require a database with no Planning Center connection; use isolated CI",
        );
    });
    afterEach(async () => {
      await c.query("ROLLBACK");
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      c.release();
    });
    async function seed(state = "connected", expiresAt = Date.now() + 3_600_000) {
      const t = {
        accessToken: "synthetic-access",
        refreshToken: "synthetic-refresh",
        expiresAt,
        scopes: [...client.PCO_SCOPES],
      };
      await c.query(
        `INSERT INTO pco_connections(account_ref,account_name,state,scopes,token_ciphertext,connected_by)
      VALUES($1,'Synthetic church',$2,$3,$4,$5)`,
        [
          account,
          state,
          JSON.stringify(t.scopes),
          client.encrypt(t, `tokens:${account}`),
          p.userId,
        ],
      );
    }
    it("automatically resumes saved pages, pauses and finishes without a browser session", async () => {
      await seed();
      const worker = await import("../artifacts/api-server/src/lib/planning-center-worker");
      const run = await pco.startSync(p, "people", "backfill");
      const f = vi
        .fn()
        .mockResolvedValueOnce(
          response({ data: [payload()], links: { next: "/people/v2/people?offset=100" } }),
        )
        .mockResolvedValueOnce(response({ data: [payload("2")] }));
      vi.stubGlobal("fetch", f);
      await pco.advanceSync(p, run.id);
      await pco.setAutomation(p, run.id, true);
      await expect(pco.advanceSync(p, run.id)).rejects.toThrow(/Pause automatic/);
      await pco.setAutomation(p, run.id, false);
      expect(await worker.processAutomaticPage()).toBe(false);
      expect(f).toHaveBeenCalledTimes(1);
      await pco.setAutomation(p, run.id, true);
      expect(await worker.processAutomaticPage()).toBe(true);
      const ws = GetPlanningCenterResponse.parse(await pco.workspace(p));
      expect(ws.syncs[0]).toMatchObject({
        status: "complete",
        automatic: false,
        fetched: 2,
        revised: 2,
        pages: 2,
        pendingPages: 0,
      });
      expect(ws.syncs[0]!.lastAutomaticAt).not.toBeNull();
      expect(await worker.processAutomaticPage()).toBe(false);
      expect(f).toHaveBeenCalledTimes(2);
    });
    it("keeps rate-limited automatic work durable and revokes inactive Admin delegation", async () => {
      await seed();
      const worker = await import("../artifacts/api-server/src/lib/planning-center-worker");
      const run = await pco.startSync(p, "people", "backfill");
      const f = vi.fn(async () => response({}, 429, { "retry-after": "60" }));
      vi.stubGlobal("fetch", f);
      await pco.setAutomation(p, run.id, true);
      expect(await worker.processAutomaticPage()).toBe(true);
      const ws = GetPlanningCenterResponse.parse(await pco.workspace(p));
      expect(ws.syncs[0]).toMatchObject({ automatic: true, status: "retry", pages: 0, fetched: 0 });
      expect(await worker.processAutomaticPage()).toBe(false);
      expect(f).toHaveBeenCalledTimes(1);
      await c.query("UPDATE users SET status='suspended' WHERE id=$1", [p.userId]);
      expect(await worker.processAutomaticPage()).toBe(false);
      expect(
        (await c.query("SELECT automatic FROM pco_sync_runs WHERE id=$1", [run.id])).rows[0]
          .automatic,
      ).toBe(false);
      expect(f).toHaveBeenCalledTimes(1);
    });
    it("persists only public status fields and enforces forced RLS and retained history", async () => {
      await seed();
      const result = GetPlanningCenterResponse.parse(await pco.workspace(p));
      expect(result.connection?.accountRef).toBe(account);
      expect(JSON.stringify(result)).not.toMatch(/ciphertext|synthetic-access|synthetic-refresh/);
      const security = await c.query(`SELECT count(*)::int AS n FROM pg_class WHERE relname IN
      ('pco_connections','pco_oauth_flows','pco_sync_runs','pco_source_entities') AND relrowsecurity AND relforcerowsecurity`);
      expect(security.rows[0].n).toBe(4);
      await c.query("SAVEPOINT deletion");
      await expect(c.query("DELETE FROM pco_connections")).rejects.toThrow();
      await c.query("ROLLBACK TO SAVEPOINT deletion");
    });
    it("binds one-time PKCE state to the actual Admin and browser session", async () => {
      const auth = await pco.authorize(p, session);
      const url = new URL(auth.url),
        state = url.searchParams.get("state")!;
      expect(url.searchParams.get("scope")).toBe("people services check_ins");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("code_challenge")).toHaveLength(43);
      vi.stubGlobal("fetch", vi.fn());
      await expect(pco.complete(p, "different-session", state, "code")).rejects.toThrow(
        /does not match/,
      );
      expect(fetch).not.toHaveBeenCalled();
      const f = vi
        .fn()
        .mockResolvedValueOnce(
          response({
            access_token: "synthetic",
            refresh_token: "refresh",
            token_type: "bearer",
            expires_in: 7200,
            scope: "people services check_ins",
          }),
        )
        .mockResolvedValueOnce(
          response({
            data: { type: "Organization", id: account, attributes: { name: "Synthetic church" } },
          }),
        );
      vi.stubGlobal("fetch", f);
      await pco.complete(p, session, state, "code");
      expect(f.mock.calls[0]![1].body.get("code_verifier")).toBeTruthy();
      expect((await c.query("SELECT state FROM pco_connections")).rows[0].state).toBe("pending");
      await expect(pco.complete(p, session, state, "code")).rejects.toThrow(/does not match/);
      expect(f).toHaveBeenCalledTimes(2);
    });
    it("requires explicit organization confirmation, verifies product collections and blocks replacement", async () => {
      await seed("pending");
      await expect(pco.startSync(p, "people", "backfill")).rejects.toThrow(/Confirm/);
      await expect(pco.confirm(p, "wrong")).rejects.toThrow(/does not match/);
      const f = vi.fn(async () => response({ data: [] }));
      vi.stubGlobal("fetch", f);
      await pco.confirm(p, account);
      expect(f).toHaveBeenCalledTimes(3);
      expect((await c.query("SELECT state FROM pco_connections")).rows[0].state).toBe("connected");
      await expect(pco.authorize(p, session)).rejects.toThrow(/Disconnect/);
    });
    it("stages pagination atomically, resumes after reload and replays revisions idempotently", async () => {
      await seed();
      await expect(pco.startSync(p, "people", "incremental")).rejects.toThrow(/backfill/);
      const run = await pco.startSync(p, "people", "backfill");
      await expect(pco.startSync(p, "people", "backfill")).rejects.toThrow();
      const f = vi
        .fn()
        .mockResolvedValueOnce(
          response({ data: [payload()], links: { next: "/people/v2/people?offset=100" } }),
        )
        .mockResolvedValueOnce(response({ data: [payload("2")] }));
      vi.stubGlobal("fetch", f);
      const first = await pco.advanceSync(p, run.id);
      expect(first).toMatchObject({
        status: "running",
        pages: 1,
        fetched: 1,
        revised: 1,
        pendingPages: 1,
      });
      const ws = GetPlanningCenterResponse.parse(await pco.workspace(p));
      expect(ws.syncs[0]).toMatchObject({ id: run.id, pendingPages: 1 });
      const end = await pco.advanceSync(p, run.id);
      expect(end).toMatchObject({ status: "complete", pages: 2, fetched: 2, revised: 2 });
      expect(f.mock.calls[1]![0]).toContain("offset=100");
      const replay = await pco.startSync(p, "people", "incremental");
      f.mockResolvedValueOnce(response({ data: [payload(), payload("2")] }));
      expect(await pco.advanceSync(p, replay.id)).toMatchObject({ status: "complete", revised: 0 });
      expect(
        (
          await c.query(
            "SELECT count(*)::int AS n FROM raw_source_records WHERE provider='planning_center' AND account_ref=$1",
            [account],
          )
        ).rows[0].n,
      ).toBe(2);
    });
    it("retains page progress on 429 and honors retry time without fetching again", async () => {
      await seed();
      const run = await pco.startSync(p, "people", "backfill");
      const f = vi.fn().mockResolvedValueOnce(response({}, 429, { "retry-after": "60" }));
      vi.stubGlobal("fetch", f);
      expect(await pco.advanceSync(p, run.id)).toMatchObject({
        status: "retry",
        pages: 0,
        fetched: 0,
        pendingPages: 1,
      });
      await expect(pco.advanceSync(p, run.id)).rejects.toThrow(/retry time/);
      expect(f).toHaveBeenCalledTimes(1);
      expect(
        (
          await c.query("SELECT count(*)::int AS n FROM pco_source_entities WHERE account_ref=$1", [
            account,
          ])
        ).rows[0].n,
      ).toBe(0);
    });
    it("fails malformed pages without partial writes and retains the previous successful state", async () => {
      await seed();
      const good = await pco.startSync(p, "people", "backfill");
      const f = vi.fn().mockResolvedValueOnce(response({ data: [payload()] }));
      vi.stubGlobal("fetch", f);
      await pco.advanceSync(p, good.id);
      const stamp = (await c.query("SELECT last_success_at FROM pco_connections")).rows[0]
        .last_success_at;
      const bad = await pco.startSync(p, "people", "incremental");
      f.mockResolvedValueOnce(
        response({
          data: [payload("2"), { type: "Person", id: "3", attributes: { updated_at: "invalid" } }],
        }),
      );
      expect(await pco.advanceSync(p, bad.id)).toMatchObject({
        status: "failed",
        fetched: 0,
        pages: 0,
      });
      expect(
        (
          await c.query("SELECT count(*)::int AS n FROM pco_source_entities WHERE account_ref=$1", [
            account,
          ])
        ).rows[0].n,
      ).toBe(1);
      expect(
        (await c.query("SELECT last_success_at FROM pco_connections")).rows[0].last_success_at,
      ).toEqual(stamp);
    });
    it("persists token rotation even when the page is unavailable and marks revoked access", async () => {
      await seed("connected", Date.now() - 1000);
      const run = await pco.startSync(p, "people", "backfill");
      const f = vi
        .fn()
        .mockResolvedValueOnce(
          response({
            access_token: "new-access",
            refresh_token: "new-refresh",
            token_type: "bearer",
            expires_in: 7200,
          }),
        )
        .mockResolvedValueOnce(response({}, 500));
      vi.stubGlobal("fetch", f);
      expect(await pco.advanceSync(p, run.id)).toMatchObject({ status: "retry", pages: 0 });
      const encrypted = (await c.query("SELECT token_ciphertext FROM pco_connections")).rows[0]
        .token_ciphertext;
      expect(client.decrypt(encrypted, `tokens:${account}`)).toMatchObject({
        refreshToken: "new-refresh",
      });
      await c.query("UPDATE pco_sync_runs SET retry_at=now()-interval '1 second' WHERE id=$1", [
        run.id,
      ]);
      f.mockResolvedValueOnce(response({}, 401));
      expect(await pco.advanceSync(p, run.id)).toMatchObject({ status: "failed" });
      expect((await c.query("SELECT state FROM pco_connections")).rows[0].state).toBe(
        "reconnect_required",
      );
    });
    it("handles refresh rejection before a page savepoint and does not corrupt cursors", async () => {
      await seed("connected", Date.now() - 1000);
      const run = await pco.startSync(p, "people", "backfill");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({}, 400)));
      expect(await pco.advanceSync(p, run.id)).toMatchObject({
        status: "failed",
        pages: 0,
        pendingPages: 1,
      });
      expect((await c.query("SELECT state FROM pco_connections")).rows[0].state).toBe(
        "reconnect_required",
      );
    });
    it("revokes credentials before disconnecting and cancels active work without deleting sources", async () => {
      await seed();
      const run = await pco.startSync(p, "people", "backfill");
      const f = vi
        .fn()
        .mockResolvedValueOnce(
          response({ data: [payload()], links: { next: "/people/v2/people?offset=100" } }),
        );
      vi.stubGlobal("fetch", f);
      await pco.advanceSync(p, run.id);
      f.mockResolvedValueOnce(response({}, 503));
      await expect(pco.disconnect(p)).rejects.toThrow();
      expect((await c.query("SELECT state FROM pco_connections")).rows[0].state).toBe("connected");
      f.mockResolvedValueOnce(response({}));
      await pco.disconnect(p);
      expect((await c.query("SELECT state,token_ciphertext FROM pco_connections")).rows[0]).toEqual(
        { state: "disconnected", token_ciphertext: null },
      );
      expect(
        (await c.query("SELECT status FROM pco_sync_runs WHERE id=$1", [run.id])).rows[0].status,
      ).toBe("cancelled");
      expect(
        (
          await c.query("SELECT count(*)::int AS n FROM pco_source_entities WHERE account_ref=$1", [
            account,
          ])
        ).rows[0].n,
      ).toBe(1);
      expect(f.mock.calls.at(-1)![0]).toContain("/oauth/revoke");
    });
    it("enforces current Admin status even for a previously authorized principal", async () => {
      await seed();
      await c.query("UPDATE users SET status='suspended' WHERE id=$1", [p.userId]);
      await expect(pco.workspace(p)).rejects.toThrow("Forbidden");
      await expect(pco.startSync(p, "people", "backfill")).rejects.toThrow("Forbidden");
    });
    it("ingests Services plans/times and Check-Ins source links without assigning a ministry or canonical identity", async () => {
      await seed();
      const run = await pco.startSync(p, "services", "backfill");
      const f = vi
        .fn()
        .mockResolvedValueOnce(
          response({ data: [{ type: "ServiceType", id: "1", attributes: { name: "Sunday" } }] }),
        )
        .mockResolvedValueOnce(
          response({
            data: [
              { type: "Plan", id: "2", attributes: { title: "Sunday", sort_date: "2026-01-04" } },
            ],
          }),
        )
        .mockResolvedValueOnce(
          response({
            data: [
              {
                type: "PlanTime",
                id: "3",
                attributes: { starts_at: "2026-01-04T15:00:00Z", time_type: "service" },
              },
            ],
          }),
        );
      vi.stubGlobal("fetch", f);
      expect(await pco.advanceSync(p, run.id)).toMatchObject({ status: "running" });
      expect(await pco.advanceSync(p, run.id)).toMatchObject({ status: "running" });
      expect(await pco.advanceSync(p, run.id)).toMatchObject({ status: "complete", fetched: 3 });
      expect(f.mock.calls[2]![0]).toContain("/service_types/1/plans/2/plan_times");
      const checkins = await pco.startSync(p, "check_ins", "backfill");
      f.mockResolvedValueOnce(
        response({ data: [{ type: "Event", id: "1", attributes: { name: "Synthetic" } }] }),
      );
      f.mockResolvedValueOnce(
        response({
          data: [
            {
              type: "CheckIn",
              id: "2",
              attributes: { kind: "Guest", created_at: "2026-01-04T15:00:00Z" },
              relationships: { person: { data: { type: "Person", id: "9" } } },
            },
          ],
          included: [
            { type: "EventTime", id: "3", attributes: { starts_at: "2026-01-04T15:00:00Z" } },
          ],
        }),
      );
      await pco.advanceSync(p, checkins.id);
      expect(await pco.advanceSync(p, checkins.id)).toMatchObject({
        status: "complete",
        fetched: 3,
      });
      const check = (
        await c.query(
          "SELECT normalized FROM pco_source_entities WHERE account_ref=$1 AND object_type='CheckIn'",
          [account],
        )
      ).rows[0].normalized;
      expect(check).toMatchObject({
        canonicalLink: "unresolved",
        metricPublication: "not_published",
      });
      expect(check.sourceRelationships.person.data.id).toBe("9");
      expect(check.ministry).toBeUndefined();
    });
    it("enforces connection and source RLS for a non-owner database role", async () => {
      await seed();
      const role = `pco_test_${randomUUID().replaceAll("-", "")}`;
      await c.query(`CREATE ROLE ${role} NOLOGIN`);
      await c.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await c.query(
        `GRANT SELECT,INSERT,UPDATE ON pco_connections,pco_oauth_flows,pco_sync_runs,pco_source_entities TO ${role}`,
      );
      await c.query(`SET LOCAL ROLE ${role}`);
      for (const denied of ["staff", "leadership", ""]) {
        await c.query("SELECT set_config('np.role',$1,true)", [denied]);
        expect((await c.query("SELECT id FROM pco_connections")).rowCount).toBe(0);
        expect(
          (await c.query("UPDATE pco_connections SET error='test' RETURNING id")).rowCount,
        ).toBe(0);
      }
      await c.query("SELECT set_config('np.role','admin',true)");
      expect((await c.query("SELECT id FROM pco_connections")).rowCount).toBe(1);
      await c.query("RESET ROLE");
    });
  },
);
