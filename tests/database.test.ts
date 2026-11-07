import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Principal } from "../artifacts/api-server/src/lib/auth";

// Explicit opt-in: normal unit tests need no secrets, network or live providers.
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "Phase 1 database integration (rolled back synthetic fixtures)",
  () => {
    let database: typeof import("../lib/db/src/index");
    let c: Awaited<ReturnType<typeof import("pg").Pool.prototype.connect>>;
    let auth: typeof import("../artifacts/api-server/src/lib/session-store");
    let admin: typeof import("../artifacts/api-server/src/lib/administration");
    let principal: Principal;
    const email = () => `${randomUUID()}@example.invalid`;
    beforeAll(async () => {
      database = await import("../lib/db/src/index");
      c = await database.pool.connect();
      // Route repository transactions through SAVEPOINTs inside a per-test outer
      // transaction. Even append-only audit fixtures are rolled back, never deleted.
      vi.spyOn(database.pool, "connect").mockImplementation(
        async () =>
          ({
            query: async (sql: string, args?: unknown[]) => {
              if (sql === "BEGIN") return c.query("SAVEPOINT operation");
              if (sql === "COMMIT") return c.query("RELEASE SAVEPOINT operation");
              if (sql === "ROLLBACK") {
                await c.query("ROLLBACK TO SAVEPOINT operation");
                return c.query("RELEASE SAVEPOINT operation");
              }
              return c.query(sql, args);
            },
            release() {},
          }) as never,
      );
      vi.spyOn(database.pool, "query").mockImplementation(((sql: string, args?: unknown[]) =>
        c.query(sql, args)) as never);
      auth = await import("../artifacts/api-server/src/lib/session-store");
      admin = await import("../artifacts/api-server/src/lib/administration");
    });
    beforeEach(async () => {
      await c.query("BEGIN");
      const id = randomUUID();
      const address = email();
      await c.query(
        "INSERT INTO users(id,provider,auth_subject,email,role) VALUES ($1,'replit',$2,$3,'admin')",
        [id, randomUUID(), address],
      );
      principal = {
        userId: id,
        role: "admin",
        identity: { subject: id, provider: "replit", verifiedEmail: address },
      };
    });
    afterEach(async () => {
      await c.query("ROLLBACK");
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      c?.release();
      await database?.pool.end();
    });
    it("finds the Phase 1 migration marker", async () => {
      expect(
        (await c.query("SELECT version FROM foundation_metadata WHERE key=$1", ["application"]))
          .rows,
      ).toEqual([{ version: "phase-1" }]);
    });
    it("admits only a verified invited identity, consumes invite, links subject, and audits without email", async () => {
      const address = email(),
        subject = randomUUID();
      await admin.reserveInvitation(principal, address, "leadership");
      const identity = { subject, provider: "replit" as const, verifiedEmail: address };
      const user = await auth.admitIdentity(identity);
      expect(user?.role).toBe("leadership");
      expect((await auth.admitIdentity(identity))?.id).toBe(user?.id);
      expect(await auth.admitIdentity({ ...identity, subject: randomUUID() })).toBeNull();
      const audit = await c.query(
        "SELECT action,target_type,target_id,outcome FROM audit_events WHERE actor_user_id=$1",
        [user!.id],
      );
      expect(JSON.stringify(audit.rows)).not.toContain(address);
      expect(audit.rows.some((r) => r.action === "invitation.accepted")).toBe(true);
    });
    it("rejects missing, expired, revoked invitations and subject/email collisions", async () => {
      const address = email(),
        identity = { subject: randomUUID(), provider: "replit" as const, verifiedEmail: address };
      expect(await auth.admitIdentity(identity)).toBeNull();
      await c.query(
        "INSERT INTO access_invitations(email,role,expires_at) VALUES ($1,'admin',now()-interval '1 second')",
        [address],
      );
      expect(await auth.admitIdentity(identity)).toBeNull();
      await admin.reserveInvitation(principal, address, "staff");
      const invite = await c.query(
        "SELECT id FROM access_invitations WHERE email=$1 AND revoked_at IS NULL AND expires_at>now()",
        [address],
      );
      await admin.revokeInvitation(principal, invite.rows[0].id);
      expect(await auth.admitIdentity(identity)).toBeNull();
      expect(
        await auth.admitIdentity({ ...identity, verifiedEmail: principal.identity.verifiedEmail }),
      ).toBeNull();
    });
    it("hashes session handles, checks expiry/status/role on reads, and revokes changed accounts", async () => {
      const session = await auth.createSession(
        principal.userId!,
        Math.floor(Date.now() / 1000) + 3600,
      );
      const row = (
        await c.query("SELECT token_hash FROM auth_sessions WHERE user_id=$1", [principal.userId])
      ).rows[0];
      expect(row.token_hash).not.toBe(session.token);
      expect((await auth.readSession(session.token))?.role).toBe("admin");
      await c.query("UPDATE users SET status='suspended' WHERE id=$1", [principal.userId]);
      expect(await auth.readSession(session.token)).toBeNull();
      await c.query("UPDATE users SET status='active' WHERE id=$1", [principal.userId]);
      await c.query(
        "UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",
        [principal.userId],
      );
      expect(await auth.readSession(session.token)).toBeNull();
      await auth.revokeSession(session.token);
      expect(await auth.readSession(session.token)).toBeNull();
    });
    it("blocks the last active Admin and bypassing repository role checks", async () => {
      // Outer transaction only; no real production account is affected.
      await c.query("UPDATE users SET status='suspended' WHERE role='admin' AND id<>$1", [
        principal.userId,
      ]);
      await expect(
        admin.updateUserAccess(principal, principal.userId!, "staff", "active"),
      ).rejects.toMatchObject({ status: 409 });
      await expect(admin.adminWorkspace({ ...principal, role: "staff" }, 1)).rejects.toMatchObject({
        status: 403,
      });
      await c.query("UPDATE users SET role='staff' WHERE id=$1", [principal.userId]);
      await expect(admin.adminWorkspace(principal, 1)).rejects.toMatchObject({ status: 403 });
    });
    it("revokes sessions when another account changes role", async () => {
      const id = randomUUID();
      await c.query(
        "INSERT INTO users(id,provider,auth_subject,email,role) VALUES ($1,'replit',$2,$3,'staff')",
        [id, randomUUID(), email()],
      );
      const session = await auth.createSession(id, Math.floor(Date.now() / 1000) + 3600);
      await admin.updateUserAccess(principal, id, "leadership", "active");
      expect(await auth.readSession(session.token)).toBeNull();
    });
    it("writes ministry/service and audit atomically; preserves Chicago effective dates and NULL capacity", async () => {
      const code = `test-${randomUUID()}`;
      await admin.saveMinistry(principal, null, {
        code,
        name: "Synthetic test",
        activeFrom: "2020-01-01",
        activeTo: null,
      });
      const id = (await c.query("SELECT id FROM ministries WHERE code=$1", [code])).rows[0].id;
      const service = {
        ministryId: id,
        serviceDate: "2026-11-08",
        startAt: new Date("2026-11-08T09:00:00-06:00"),
        capacity: null,
        locationRef: null,
        planExternalId: null,
        specialEventRef: null,
      };
      await admin.saveService(principal, null, service);
      const row = (
        await c.query(
          "SELECT capacity,service_date::text FROM service_occurrences WHERE ministry_id=$1",
          [id],
        )
      ).rows[0];
      expect(row).toEqual({ capacity: null, service_date: "2026-11-08" });
      await expect(admin.saveService(principal, null, service)).rejects.toMatchObject({
        code: "23505",
      });
      await expect(
        admin.saveService(principal, null, { ...service, serviceDate: "2026-11-09" }),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        admin.saveMinistry(principal, id, {
          code,
          name: "Changed",
          activeFrom: "2026-11-09",
          activeTo: null,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect((await c.query("SELECT name FROM ministries WHERE id=$1", [id])).rows[0].name).toBe(
        "Synthetic test",
      );
    });
    it("blocks audit update/delete/truncate and raw history changes at database level", async () => {
      for (const statement of [
        "UPDATE audit_events SET outcome='changed'",
        "DELETE FROM audit_events",
        "TRUNCATE audit_events",
        "UPDATE raw_source_records SET payload_hash='changed'",
        "DELETE FROM raw_source_records",
      ]) {
        await c.query("SAVEPOINT immutability");
        await expect(c.query(statement)).rejects.toMatchObject({ code: "42501" });
        await c.query("ROLLBACK TO SAVEPOINT immutability");
        await c.query("RELEASE SAVEPOINT immutability");
      }
    });
    it("enforces raw-source RLS independently for a non-owner database role", async () => {
      // Role/grants exist only inside this rolled-back transaction.
      const role = `np_test_${randomUUID().replaceAll("-", "")}`;
      await c.query(`CREATE ROLE ${role} NOLOGIN`);
      await c.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await c.query(`GRANT SELECT,INSERT ON raw_source_records TO ${role}`);
      await c.query(`SET LOCAL ROLE ${role}`);
      for (const permission of ["staff", "leadership"]) {
        await c.query("SELECT set_config('np.role',$1,true)", [permission]);
        expect((await c.query("SELECT id FROM raw_source_records")).rows).toEqual([]);
        await c.query("SAVEPOINT raw_deny");
        await expect(
          c.query(`INSERT INTO raw_source_records(provider,account_ref,object_type,external_id,payload_json,payload_hash)
        VALUES ('test','test','restricted','test','{}','test')`),
        ).rejects.toMatchObject({ code: "42501" });
        await c.query("ROLLBACK TO SAVEPOINT raw_deny");
      }
      await c.query("SELECT set_config('np.role','admin',true)");
      await c.query(`INSERT INTO raw_source_records(provider,account_ref,object_type,external_id,payload_json,payload_hash)
      VALUES ('test','test','restricted','test','{}','test')`);
      expect(
        (await c.query("SELECT id FROM raw_source_records WHERE provider='test'")).rowCount,
      ).toBe(1);
      for (const permission of ["staff", "leadership"]) {
        await c.query("SELECT set_config('np.role',$1,true)", [permission]);
        expect(
          (await c.query("SELECT id FROM raw_source_records WHERE provider='test'")).rowCount,
        ).toBe(0);
      }
      await c.query("RESET ROLE");
    });
  },
);
