import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import type { PoolClient } from "pg";
import type { Principal } from "../artifacts/api-server/src/lib/auth";
import type { AttendanceInput, AttendanceWeeklyInput } from "../lib/api-zod/src/index";
import request from "supertest";
import express from "express";
import { createAttendanceRouter } from "../artifacts/api-server/src/routes/attendance";

describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "adult attendance isolated rollback fixtures",
  () => {
    let c: PoolClient, db: typeof import("../lib/db/src/index");
    let repo: typeof import("../artifacts/api-server/src/lib/attendance");
    let historical: typeof import("../artifacts/api-server/src/lib/attendance-history");
    let imports: typeof import("../artifacts/api-server/src/lib/imports");
    let weekly: typeof import("../artifacts/api-server/src/lib/attendance-weekly");
    let admin: Principal, staff: Principal, ministryId: string, definitionId: string;
    let service1: string, service2: string;
    beforeAll(async () => {
      db = await import("../lib/db/src/index");
      c = await db.pool.connect();
      vi.spyOn(db.pool, "connect").mockImplementation(
        async () =>
          ({
            query: async (sql: string, args?: unknown[]) => {
              if (sql === "BEGIN") return c.query("SAVEPOINT attendance_operation");
              if (sql === "COMMIT") return c.query("RELEASE SAVEPOINT attendance_operation");
              if (sql === "ROLLBACK") {
                await c.query("ROLLBACK TO SAVEPOINT attendance_operation");
                return c.query("RELEASE SAVEPOINT attendance_operation");
              }
              return c.query(sql, args);
            },
            release() {},
          }) as never,
      );
      repo = await import("../artifacts/api-server/src/lib/attendance");
      historical = await import("../artifacts/api-server/src/lib/attendance-history");
      imports = await import("../artifacts/api-server/src/lib/imports");
      weekly = await import("../artifacts/api-server/src/lib/attendance-weekly");
    });
    beforeEach(async () => {
      await c.query("BEGIN");
      await c.query("SELECT set_config('np.role','admin',true)");
      const actor = async (role: "staff" | "admin") => {
        const id = randomUUID(),
          email = `${id}@example.invalid`;
        await c.query(
          "INSERT INTO users(id,provider,auth_subject,email,role) VALUES($1,'replit',$4,$2,$3)",
          [id, email, role, id],
        );
        return {
          userId: id,
          role,
          identity: { subject: id, provider: "replit" as const, verifiedEmail: email },
        };
      };
      admin = await actor("admin");
      staff = await actor("staff");
      ministryId = randomUUID();
      await c.query(
        "INSERT INTO ministries(id,code,name) VALUES($1,$2,'Synthetic attendance fixture')",
        [ministryId, randomUUID()],
      );
      const definition = await repo.saveDefinition(admin, {
        ministryId,
        effectiveFrom: "2026-01-01",
        note: "Synthetic definition for rollback-only attendance tests",
      });
      definitionId = definition.id;
      expect(db.pool.connect).toHaveBeenCalled();
      service1 = randomUUID();
      service2 = randomUUID();
      for (const [id, hour] of [
        [service1, "15"],
        [service2, "17"],
      ])
        await c.query(
          "INSERT INTO service_occurrences(id,ministry_id,service_date,start_at) VALUES($1,$2,'2026-01-04',$3)",
          [id, ministryId, `2026-01-04T${hour}:00:00Z`],
        );
    });
    afterEach(async () => {
      await c.query("ROLLBACK");
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      c?.release();
      await db?.pool.end();
    });
    it("calculates a selected window outside a narrow history filter without leaking those extra revisions", async () => {
      await weekly.saveWeekly(
        staff,
        weekInput({
          serviceDate: "2026-01-11",
          first: { count: 462, status: "recorded", expectedRevision: null },
          second: { count: 448, status: "recorded", expectedRevision: null },
        }),
      );
      await weekly.saveWeekly(
        staff,
        weekInput({
          serviceDate: "2026-01-18",
          first: { count: 421, status: "recorded", expectedRevision: null },
          second: { count: 410, status: "recorded", expectedRevision: null },
        }),
      );
      const w = await repo.readAttendance(staff, "2026-01-18", "2026-01-18", undefined, 2);
      expect(w.rollingAverage).toMatchObject({
        value: 870.5,
        recordedWeeks: 2,
        windowWeeks: 2,
        start: "2026-01-11",
        end: "2026-01-18",
      });
      expect(w.weeks).toHaveLength(1);
      expect(w.revisions.every((r) => r.serviceDate === "2026-01-18")).toBe(true);
      await expect(
        repo.readAttendance(staff, undefined, undefined, undefined, 0),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        repo.readAttendance(staff, undefined, undefined, undefined, 53),
      ).rejects.toMatchObject({ status: 400 });
    });
    it("exposes only an accepted historical aggregate to Staff and restores raw-source restrictions", async () => {
      const batch = randomUUID(),
        sha = "a".repeat(64);
      await c.query(
        "INSERT INTO import_batches(id,sha256,filename,snapshot_date,object_path,catalog,created_by) VALUES($1,$2,'Synthetic rollback-only comparison.xlsx','2026-11-07','/synthetic/comparison','{}',$3)",
        [batch, sha, admin.userId],
      );
      await c.query(
        "INSERT INTO workbook_source_authorities(batch_id,sha256,basis,origin) VALUES($1,$2,'Synthetic rollback-only accepted workbook comparison fixture','owner_instruction')",
        [batch, sha],
      );
      for (const [coordinate, value] of [
        ["P34", "2025.0"],
        ["P35", "123.0"],
        ["A35", "1.0"],
        ["B35", "46026"],
      ]) {
        await c.query(
          "INSERT INTO import_cells(batch_id,sheet,coordinate,cell) VALUES($1,'Historical - Adults',$2,$3)",
          [batch, coordinate, JSON.stringify({ type: "n", value })],
        );
      }
      const role = `attendance_compare_test_${randomUUID().replaceAll("-", "")}`;
      await c.query(`CREATE ROLE ${role} NOLOGIN`);
      await c.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await c.query(`GRANT SELECT ON import_cells TO ${role}`);
      await repo.attendanceTransaction(staff, false, false, async (tx) => {
        await tx.query(`SET LOCAL ROLE ${role}`);
        const r = await tx.query("SELECT * FROM np_attendance_year_reference('2026-01-04')");
        expect(r.rows.find((x) => x.batch_id === batch)).toMatchObject({
          source_value: "123",
          source_cell: "Historical - Adults!P35",
        });
        expect((await tx.query("SELECT current_setting('np.role') AS role")).rows[0].role).toBe(
          "staff",
        );
        expect(
          (await tx.query("SELECT * FROM import_cells WHERE batch_id=$1", [batch])).rowCount,
        ).toBe(0);
        await tx.query("RESET ROLE");
      });
      await repo.attendanceTransaction(admin, true, false, async (tx) => {
        await tx.query("UPDATE import_batches SET state='archived' WHERE id=$1", [batch]);
        expect(
          (await tx.query("SELECT * FROM np_attendance_year_reference('2026-01-04')")).rows.some(
            (x) => x.batch_id === batch,
          ),
        ).toBe(false);
      });
    });
    const input = (extras: Partial<AttendanceInput> = {}): AttendanceInput => ({
      requestId: randomUUID(),
      definitionId,
      serviceDate: "2026-01-04",
      slot: "adult_service_1",
      occurrenceId: service1,
      count: 446,
      status: "recorded",
      note: "Synthetic auditorium headcount",
      expectedRevision: null,
      ...extras,
    });
    const weekInput = (extras: Partial<AttendanceWeeklyInput> = {}): AttendanceWeeklyInput => ({
      requestId: randomUUID(),
      definitionId,
      serviceDate: "2026-01-04",
      first: { count: 446, status: "recorded", expectedRevision: null },
      second: { count: 464, status: "recorded", expectedRevision: null },
      ...extras,
    });
    it("saves both weekly counts with one authenticated API call and no required note", async () => {
      const originalOrigin = process.env.AUTH_ORIGIN;
      process.env.AUTH_ORIGIN = "https://attendance.example.invalid";
      try {
        const app = express();
        app.use(express.json());
        app.use((_req, res, next) => {
          res.locals.session = { csrfToken: "weekly-synthetic" };
          next();
        });
        app.use(
          createAttendanceRouter({
            name: "synthetic-fixture",
            enabled: true,
            authenticate: async () => staff,
          }),
        );
        const body = weekInput();
        const blocked = await request(app).post("/v1/attendance/week").send(body);
        expect(blocked.status).toBe(403);
        const response = await request(app)
          .post("/v1/attendance/week")
          .set("Origin", process.env.AUTH_ORIGIN)
          .set("X-CSRF-Token", "weekly-synthetic")
          .send(body);
        expect(response.status).toBe(200);
        expect(response.body.first).toMatchObject({
          count: 446,
          occurrenceId: service1,
          source: "manual",
          valid: true,
        });
        expect(response.body.second).toMatchObject({
          count: 464,
          occurrenceId: service2,
          source: "manual",
          valid: true,
        });
        expect((await repo.readAttendance(staff, "2026-01-04", "2026-01-04")).weeks[0].value).toBe(
          910,
        );
      } finally {
        if (originalOrigin === undefined) delete process.env.AUTH_ORIGIN;
        else process.env.AUTH_ORIGIN = originalOrigin;
      }
    });
    it("records date-level service slots when no schedule exists without creating fake times", async () => {
      const body = weekInput({ serviceDate: "2026-01-11", note: "ok" });
      const saved = await weekly.saveWeekly(staff, body);
      expect(saved.first.occurrenceId).toBeNull();
      expect(saved.second.occurrenceId).toBeNull();
      expect(
        (
          await c.query(
            "SELECT id FROM service_occurrences WHERE ministry_id=$1 AND service_date='2026-01-11'",
            [ministryId],
          )
        ).rowCount,
      ).toBe(0);
      expect((await repo.readAttendance(staff, "2026-01-11", "2026-01-11")).weeks[0].value).toBe(
        910,
      );
    });
    it("does not guess service links when more than two occurrences are configured", async () => {
      for (const hour of ["15", "17", "19"])
        await c.query(
          "INSERT INTO service_occurrences(id,ministry_id,service_date,start_at) VALUES($1,$2,'2026-01-18',$3)",
          [randomUUID(), ministryId, `2026-01-18T${hour}:00:00Z`],
        );
      const result = await weekly.saveWeekly(staff, weekInput({ serviceDate: "2026-01-18" }));
      expect([result.first.occurrenceId, result.second.occurrenceId]).toEqual([null, null]);
    });
    it("rolls back both weekly edits if the second service changed in another session", async () => {
      const saved = await weekly.saveWeekly(staff, weekInput());
      const correction = await repo.saveManual(
        staff,
        input({
          slot: "adult_service_2",
          occurrenceId: service2,
          count: 470,
          expectedRevision: saved.second.id,
        }),
      );
      await expect(
        weekly.saveWeekly(
          staff,
          weekInput({
            first: { count: 500, status: "recorded", expectedRevision: saved.first.id },
            second: { count: 490, status: "recorded", expectedRevision: saved.second.id },
          }),
        ),
      ).rejects.toMatchObject({ status: 409 });
      const current = await repo.readAttendance(staff, "2026-01-04", "2026-01-04");
      expect(current.weeks[0].value).toBe(916);
      expect(current.revisions.some((r) => r.count === 500)).toBe(false);
      expect(current.revisions.some((r) => r.id === correction.id)).toBe(true);
    });
    it("replays one weekly request safely after service metadata changes", async () => {
      const body = weekInput();
      const first = await weekly.saveWeekly(staff, body);
      await c.query("UPDATE service_occurrences SET start_at='2026-01-04T15:30:00Z' WHERE id=$1", [
        service1,
      ]);
      const retry = await weekly.saveWeekly(staff, body);
      expect(retry.first.id).toBe(first.first.id);
      expect(retry.second.id).toBe(first.second.id);
      expect(retry.first.valid).toBe(false);
      expect(
        (
          await c.query(
            "SELECT count(*)::int AS n FROM attendance_revisions WHERE definition_id=$1",
            [definitionId],
          )
        ).rows[0].n,
      ).toBe(2);
      await expect(
        weekly.saveWeekly(staff, { ...body, first: { ...body.first, count: 447 } }),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("distinguishes zero from unrecorded and rejects impossible weekly values/dates", async () => {
      const saved = await weekly.saveWeekly(
        staff,
        weekInput({
          first: { count: 0, status: "recorded", expectedRevision: null },
          second: { count: null, status: "unrecorded", expectedRevision: null },
        }),
      );
      expect(saved.first.count).toBe(0);
      expect(saved.second.count).toBeNull();
      const w = await repo.readAttendance(staff, "2026-01-04", "2026-01-04");
      expect(w.weeks[0]).toMatchObject({ value: null, knownSubtotal: 0, quality: "unrecorded" });
      await expect(
        weekly.saveWeekly(staff, weekInput({ serviceDate: "2026-02-30" })),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        weekly.saveWeekly(staff, weekInput({ serviceDate: "2099-01-04" })),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        weekly.saveWeekly(
          staff,
          weekInput({
            serviceDate: "2026-01-11",
            second: { count: -1, status: "recorded", expectedRevision: null },
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(
        (
          await c.query(
            "SELECT id FROM attendance_revisions WHERE definition_id=$1 AND service_date='2026-01-11'",
            [definitionId],
          )
        ).rowCount,
      ).toBe(0);
    });
    const deniedSql = async (sql: string, args?: unknown[]) => {
      await c.query("SAVEPOINT denied_sql");
      try {
        await expect(c.query(sql, args)).rejects.toBeDefined();
      } finally {
        await c.query("ROLLBACK TO SAVEPOINT denied_sql");
        await c.query("RELEASE SAVEPOINT denied_sql");
      }
    };
    it("makes Staff entries immediately visible, correction history immutable and stale edits conflicts", async () => {
      const first = await repo.saveManual(staff, input());
      await repo.saveManual(
        staff,
        input({ slot: "adult_service_2", occurrenceId: service2, count: 464 }),
      );
      const w = await repo.readAttendance(staff, "2026-01-04", "2026-01-04");
      expect(w.weeks[0].value).toBe(910);
      const corrected = await repo.saveManual(
        staff,
        input({ count: 447, expectedRevision: first.id }),
      );
      expect(corrected.previousId).toBe(first.id);
      expect((await repo.readAttendance(staff, "2026-01-04", "2026-01-04")).weeks[0].value).toBe(
        911,
      );
      await expect(
        repo.saveManual(staff, input({ count: 448, expectedRevision: first.id })),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await c.query("SELECT count FROM attendance_revisions WHERE id=$1", [first.id])).rows[0]
          .count,
      ).toBe(446);
      await deniedSql("UPDATE attendance_revisions SET count=99 WHERE id=$1", [first.id]);
      await deniedSql("DELETE FROM attendance_revisions WHERE id=$1", [first.id]);
    });
    it("makes identical save retries idempotent and rejects changed request payloads", async () => {
      const v = input(),
        a = await repo.saveManual(staff, v),
        b = await repo.saveManual(staff, v);
      expect(b.id).toBe(a.id);
      await expect(repo.saveManual(staff, { ...v, count: 999 })).rejects.toMatchObject({
        status: 409,
      });
    });
    it("persists the actual typed API input and returns the generated response contract", async () => {
      const originalOrigin = process.env.AUTH_ORIGIN;
      process.env.AUTH_ORIGIN = "https://attendance.example.invalid";
      try {
        const app = express();
        app.use(express.json());
        app.use((_req, res, next) => {
          res.locals.session = { csrfToken: "synthetic-token" };
          next();
        });
        app.use(
          createAttendanceRouter({
            name: "synthetic-fixture",
            enabled: true,
            authenticate: async () => staff,
          }),
        );
        const saved = await request(app)
          .post("/v1/attendance")
          .set("Origin", process.env.AUTH_ORIGIN)
          .set("X-CSRF-Token", "synthetic-token")
          .send(input());
        expect(saved.status).toBe(200);
        expect(saved.body).toMatchObject({
          count: 446,
          status: "recorded",
          source: "manual",
          valid: true,
        });
        const read = await request(app).get("/v1/attendance?start=2026-01-04&end=2026-01-04");
        expect(read.status).toBe(200);
        expect(read.body.weeks[0]).toMatchObject({
          value: null,
          knownSubtotal: 446,
          quality: "partial",
        });
        expect(read.body.revisions[0].id).toBe(saved.body.id);
      } finally {
        if (originalOrigin === undefined) delete process.env.AUTH_ORIGIN;
        else process.env.AUTH_ORIGIN = originalOrigin;
      }
    });
    it("rejects duplicate slots for a service, invalid dates, future actuals and missing counts", async () => {
      await repo.saveManual(staff, input());
      await expect(
        repo.saveManual(staff, input({ slot: "adult_service_2" })),
      ).rejects.toMatchObject({ status: 409 });
      await expect(repo.saveManual(staff, input({ count: null }))).rejects.toMatchObject({
        status: 400,
      });
      await expect(
        repo.saveManual(staff, input({ serviceDate: "2026-01-05" })),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        repo.saveManual(staff, input({ serviceDate: "2099-01-04" })),
      ).rejects.toMatchObject({ status: 400 });
      await expect(repo.saveManual(staff, input({ count: -1 }))).rejects.toMatchObject({
        status: 400,
      });
    });
    it("preserves explicit unrecorded days without a fabricated service or zero", async () => {
      const saved = await repo.saveManual(
        staff,
        input({ serviceDate: "2026-04-12", status: "unrecorded", count: null, occurrenceId: null }),
      );
      expect(saved.count).toBeNull();
      expect((await repo.readAttendance(staff, "2026-04-12", "2026-04-12")).weeks[0]).toMatchObject(
        { quality: "unrecorded", value: null },
      );
      await expect(
        repo.saveManual(staff, input({ serviceDate: "2026-04-12", count: 0 })),
      ).rejects.toMatchObject({ status: 400 });
    });
    it("invalidates an occurrence whose date/time meaning changed instead of rewriting past counts", async () => {
      await repo.saveManual(staff, input());
      await c.query(
        "UPDATE service_occurrences SET start_at=start_at+interval '1 hour' WHERE id=$1",
        [service1],
      );
      expect((await repo.readAttendance(staff, "2026-01-04", "2026-01-04")).weeks[0]).toMatchObject(
        { quality: "invalidated", value: null },
      );
    });
    it("rechecks current membership and blocks Staff definition changes", async () => {
      await expect(
        repo.saveDefinition(staff, {
          ministryId,
          effectiveFrom: "2026-01-01",
          note: "Synthetic setup must be blocked for staff",
        }),
      ).rejects.toMatchObject({ status: 403 });
      await c.query("UPDATE users SET status='suspended' WHERE id=$1", [staff.userId]);
      await expect(repo.saveManual(staff, input())).rejects.toMatchObject({ status: 403 });
    });
    it("keeps earlier definition versions inspectable and rejects writes to them", async () => {
      await repo.saveManual(staff, input());
      const next = await repo.saveDefinition(admin, {
        ministryId,
        effectiveFrom: "2026-02-01",
        note: "Synthetic new version changes the source scope",
      });
      expect(next.id).not.toBe(definitionId);
      const old = await repo.readAttendance(staff, "2026-01-04", "2026-01-04", definitionId);
      expect(old.isCurrentDefinition).toBe(false);
      expect(old.weeks[0].knownSubtotal).toBe(446);
      await expect(repo.saveManual(staff, input())).rejects.toMatchObject({ status: 409 });
    });
    async function syntheticHistory(reviewed = true) {
      await c.query("SELECT set_config('np.role','admin',true)");
      const batchId = randomUUID();
      await c.query(
        "INSERT INTO import_batches(id,sha256,filename,snapshot_date,object_path,catalog,created_by) VALUES($1,$2,'synthetic.xlsx','2026-11-07','synthetic-test-only','{}',$3)",
        [batchId, randomUUID(), admin.userId],
      );
      for (const [slot, column, value] of [
        ["adult_service_1", "B", 446],
        ["adult_service_2", "C", 464],
      ] as const) {
        const mappingId = randomUUID();
        const definition = {
          target: slot,
          unit: "attendance_count",
          ministry: "Synthetic adult",
          sheet: "Test",
        };
        await c.query(
          "INSERT INTO import_mappings(id,batch_id,definition,status) VALUES($1,$2,$3,'approved')",
          [mappingId, batchId, JSON.stringify(definition)],
        );
        await c.query(
          "INSERT INTO import_staged_rows(mapping_id,source_row,data) VALUES($1,'2',$2)",
          [
            mappingId,
            JSON.stringify({
              sundayDate: "2026-01-04",
              sheet: "Test",
              coordinate: `${column}2`,
              value,
              flags: [],
            }),
          ],
        );
      }
      const e = await imports.evidence(c, batchId);
      for (const g of reviewed ? e.report.weeks : [])
        await c.query(
          "INSERT INTO import_week_reviews(batch_id,week,evidence_hash,review_method,note,reviewed_by) VALUES($1,$2,$3,'owner_confirmed','Synthetic owner confirmed evidence for rollback test',$4)",
          [batchId, g.week, g.evidenceHash, admin.userId],
        );
      const candidates = (await historical.previewHistory(admin, batchId)).candidates;
      return {
        batchId,
        promote: {
          definitionId,
          week: "2026-01-04",
          firstHash: candidates.find((g) => g.slot === "adult_service_1")!.evidenceHash,
          secondHash: candidates.find((g) => g.slot === "adult_service_2")!.evidenceHash,
          note: "Synthetic deliberate publication for test fixture only",
          acknowledgeAuthority: true,
        },
      };
    }
    it("promotes eligible history atomically and idempotently, preserving review method", async () => {
      const { batchId, promote } = await syntheticHistory();
      expect(await historical.promoteHistory(admin, batchId, promote)).toEqual({ promoted: 2 });
      expect(await historical.promoteHistory(admin, batchId, promote)).toEqual({ promoted: 0 });
      const w = await repo.readAttendance(staff, "2026-01-04", "2026-01-04");
      expect(w.weeks[0].value).toBe(910);
      expect(
        w.revisions.every(
          (r) => r.reviewMethod === "owner_confirmed" && r.occurrenceId === null && r.valid,
        ),
      ).toBe(true);
      expect(JSON.stringify(w)).not.toContain("object_path");
      expect((await c.query("SELECT current_setting('np.role') AS role")).rows[0].role).toBe(
        "staff",
      );
    });
    const acceptWorkbook = async (batchId: string) => {
      await c.query(
        `INSERT INTO workbook_source_authorities(batch_id,sha256,basis,origin)
         SELECT id,sha256,'Synthetic owner instruction accepting all historical workbook values','owner_instruction'
         FROM import_batches WHERE id=$1`,
        [batchId],
      );
    };
    it("imports trusted history without per-week reviews, with honest system attribution and safe replay", async () => {
      const bulk = await import("../artifacts/api-server/src/lib/attendance-workbook");
      const { batchId } = await syntheticHistory(false);
      await expect(
        bulk.importAuthorizedWorkbook(c, batchId, definitionId, true),
      ).rejects.toMatchObject({ status: 409 });
      await acceptWorkbook(batchId);
      const dry = await bulk.importAuthorizedWorkbook(c, batchId, definitionId, false);
      expect(dry).toMatchObject({ imported: 2, unchanged: 0, excluded: [], conflicts: [] });
      expect(
        (
          await c.query(
            "SELECT count(*)::int AS n FROM attendance_revisions WHERE definition_id=$1",
            [definitionId],
          )
        ).rows[0].n,
      ).toBe(0);
      expect(await bulk.importAuthorizedWorkbook(c, batchId, definitionId, true)).toMatchObject({
        imported: 2,
        conflicts: [],
      });
      expect(await bulk.importAuthorizedWorkbook(c, batchId, definitionId, true)).toMatchObject({
        imported: 0,
        unchanged: 2,
      });
      expect(
        (
          await c.query("SELECT count(*)::int AS n FROM import_week_reviews WHERE batch_id=$1", [
            batchId,
          ])
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await c.query(
            "SELECT count(*)::int AS n FROM attendance_revisions WHERE definition_id=$1 AND created_by IS NULL",
            [definitionId],
          )
        ).rows[0].n,
      ).toBe(2);
      const w = await repo.readAttendance(staff, "2026-01-04", "2026-01-04");
      expect(w.weeks[0].value).toBe(910);
      expect(w.revisions.every((r) => r.valid && r.reviewMethod === "workbook_authoritative")).toBe(
        true,
      );
      expect((await c.query("SELECT current_setting('np.role') AS role")).rows[0].role).toBe(
        "staff",
      );
      const role = `attendance_bulk_test_${randomUUID().replaceAll("-", "")}`;
      await c.query(`CREATE ROLE ${role} NOLOGIN`);
      await c.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await c.query(
        `GRANT SELECT ON workbook_source_authorities,attendance_revisions,attendance_lineage,import_batches TO ${role}`,
      );
      await c.query(`SET LOCAL ROLE ${role}`);
      expect((await c.query("SELECT * FROM workbook_source_authorities")).rowCount).toBe(0);
      const protectedRows = await c.query(
        "SELECT np_attendance_source_valid(id) AS valid FROM attendance_revisions WHERE definition_id=$1",
        [definitionId],
      );
      expect(protectedRows.rows.every((r) => r.valid)).toBe(true);
      expect((await c.query("SELECT current_setting('np.role') AS role")).rows[0].role).toBe(
        "staff",
      );
      await c.query("RESET ROLE");
      await c.query("SELECT set_config('np.role','admin',true)");
      await deniedSql("UPDATE workbook_source_authorities SET basis='changed' WHERE batch_id=$1", [
        batchId,
      ]);
      await c.query("UPDATE import_batches SET state='withdrawn' WHERE id=$1", [batchId]);
      const withdrawn = await repo.readAttendance(staff, "2026-01-04", "2026-01-04");
      expect(withdrawn.weeks[0]).toMatchObject({ quality: "invalidated", value: null });
    });
    it("does not replace a manual observation during authoritative bulk import", async () => {
      const bulk = await import("../artifacts/api-server/src/lib/attendance-workbook");
      const { batchId } = await syntheticHistory(false);
      await acceptWorkbook(batchId);
      const manual = await repo.saveManual(staff, input());
      await c.query("SELECT set_config('np.role','admin',true)");
      const preview = await bulk.importAuthorizedWorkbook(c, batchId, definitionId, false);
      expect(preview.conflicts).toEqual([{ week: "2026-01-04", slot: "adult_service_1" }]);
      expect((await repo.readAttendance(staff, "2026-01-04", "2026-01-04")).revisions[0].id).toBe(
        manual.id,
      );
    });
    it("rejects changed historical hashes and rolls back partial promotion", async () => {
      const { batchId, promote } = await syntheticHistory();
      await expect(
        historical.promoteHistory(admin, batchId, { ...promote, secondHash: "b".repeat(64) }),
      ).rejects.toMatchObject({ status: 409 });
      expect((await repo.readAttendance(staff, "2026-01-04", "2026-01-04")).revisions).toHaveLength(
        0,
      );
    });
    it("invalidates withdrawn or replaced historical sources without exposing their raw evidence", async () => {
      const { batchId, promote } = await syntheticHistory();
      await historical.promoteHistory(admin, batchId, promote);
      await c.query("SELECT set_config('np.role','admin',true)");
      await c.query("UPDATE import_batches SET state='withdrawn' WHERE id=$1", [batchId]);
      expect((await repo.readAttendance(staff, "2026-01-04", "2026-01-04")).weeks[0].quality).toBe(
        "invalidated",
      );
      await c.query("SELECT set_config('np.role','admin',true)");
      await c.query("UPDATE import_batches SET state='active' WHERE id=$1", [batchId]);
      await c.query("UPDATE import_mappings SET status='superseded' WHERE batch_id=$1", [batchId]);
      expect((await repo.readAttendance(staff, "2026-01-04", "2026-01-04")).weeks[0].quality).toBe(
        "invalidated",
      );
    });
    it("never adds workbook counts to existing manual facts or accepts non-Admin promotion", async () => {
      const { batchId, promote } = await syntheticHistory();
      await repo.saveManual(staff, input());
      await expect(historical.promoteHistory(admin, batchId, promote)).rejects.toMatchObject({
        status: 409,
      });
      await expect(historical.promoteHistory(staff, batchId, promote)).rejects.toMatchObject({
        status: 403,
      });
    });
    it("enforces forced RLS with a non-owner role and restores Staff privilege after boolean lineage checks", async () => {
      const { batchId, promote } = await syntheticHistory();
      await historical.promoteHistory(admin, batchId, promote);
      const role = `attendance_test_${randomUUID().replaceAll("-", "")}`;
      await c.query(`CREATE ROLE ${role} NOLOGIN`);
      await c.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await c.query(
        `GRANT SELECT ON attendance_revisions,attendance_lineage,import_batches TO ${role}`,
      );
      await c.query(`SET LOCAL ROLE ${role}`);
      await c.query("SELECT set_config('np.role','staff',true)");
      expect((await c.query("SELECT count(*)::int AS n FROM attendance_lineage")).rows[0].n).toBe(
        0,
      );
      expect((await c.query("SELECT count(*)::int AS n FROM import_batches")).rows[0].n).toBe(0);
      const ids = (
        await c.query("SELECT id FROM attendance_revisions WHERE definition_id=$1", [definitionId])
      ).rows;
      expect(ids).toHaveLength(2);
      expect(
        (await c.query("SELECT np_attendance_source_valid($1) AS valid", [ids[0].id])).rows[0]
          .valid,
      ).toBe(true);
      expect((await c.query("SELECT current_setting('np.role') AS role")).rows[0].role).toBe(
        "staff",
      );
      await c.query("RESET ROLE");
    });
  },
);
