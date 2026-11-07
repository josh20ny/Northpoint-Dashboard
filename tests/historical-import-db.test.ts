import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Principal } from "../artifacts/api-server/src/lib/auth";
import { syntheticWorkbook, mappingInput } from "./fixtures/workbook";

vi.mock("../artifacts/api-server/src/lib/import-storage", () => ({
  importStorageReady: () => true,
  preserveWorkbook: vi.fn(async (id: string) => `imports/${id}.xlsx`),
  originalWorkbook: vi.fn(async () => Buffer.from("synthetic original")),
}));
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "Phase 2 database invariants (rollback-only synthetic fixtures)",
  () => {
    let db: typeof import("../lib/db/src/index");
    let repo: typeof import("../artifacts/api-server/src/lib/imports");
    let storage: typeof import("../artifacts/api-server/src/lib/import-storage");
    let c: Awaited<ReturnType<typeof import("pg").Pool.prototype.connect>>;
    let p: Principal;
    let batchId: string;
    const bytes = syntheticWorkbook();
    beforeAll(async () => {
      db = await import("../lib/db/src/index");
      c = await db.pool.connect();
      vi.spyOn(db.pool, "connect").mockImplementation(
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
      repo = await import("../artifacts/api-server/src/lib/imports");
      storage = await import("../artifacts/api-server/src/lib/import-storage");
    });
    beforeEach(async () => {
      await c.query("BEGIN");
      vi.mocked(storage.preserveWorkbook).mockClear();
      const id = randomUUID(),
        email = `${id}@example.invalid`;
      await c.query(
        "INSERT INTO users(id,provider,auth_subject,email,role) VALUES($1,'replit',$2,$3,'admin')",
        [id, id, email],
      );
      p = {
        userId: id,
        role: "admin",
        identity: { subject: id, provider: "replit", verifiedEmail: email },
      };
      batchId = (await repo.catalogWorkbook(p, bytes, "synthetic.xlsx", "2026-10-01")).id;
    });
    afterEach(async () => {
      await c.query("ROLLBACK");
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      c?.release();
      await db?.pool.end();
    });
    it("preserves SHA/cell lineage, idempotent re-import and immutable originals", async () => {
      const repeated = await repo.catalogWorkbook(p, bytes, "copy.xlsx", "2026-10-01");
      expect(repeated.id).toBe(batchId);
      expect(storage.preserveWorkbook).toHaveBeenCalledTimes(1);
      const detail = await repo.importDetail(p, batchId);
      expect(detail.sheets).toHaveLength(1);
      expect(JSON.stringify(detail)).not.toContain("objectPath");
      expect((await repo.importCells(p, batchId, "Test", 1)).cells).toHaveLength(3);
      await c.query("SAVEPOINT immutable");
      await expect(
        c.query("UPDATE import_cells SET cell='{}' WHERE batch_id=$1", [batchId]),
      ).rejects.toMatchObject({ code: "42501" });
      await c.query("ROLLBACK TO SAVEPOINT immutable");
      await expect(
        c.query("UPDATE import_batches SET sha256='bad' WHERE id=$1", [batchId]),
      ).rejects.toMatchObject({ code: "42501" });
      await c.query("ROLLBACK TO SAVEPOINT immutable");
      await expect(
        c.query("DELETE FROM import_batches WHERE id=$1", [batchId]),
      ).rejects.toMatchObject({ code: "42501" });
      await c.query("ROLLBACK TO SAVEPOINT immutable");
    });
    it("requires explicit mapping approval, stages idempotently, reviews exact evidence and preserves superseded versions", async () => {
      const a = await repo.createMapping(p, batchId, mappingInput);
      await expect(repo.stageMapping(p, batchId, a.id)).rejects.toMatchObject({ status: 409 });
      await repo.reviewMapping(p, batchId, a.id, "approved", "Reviewed synthetic source semantics");
      await repo.stageMapping(p, batchId, a.id);
      await repo.stageMapping(p, batchId, a.id);
      expect((await repo.stagedRows(p, batchId, a.id, 1)).rows).toHaveLength(1);
      const b = await repo.createMapping(p, batchId, { ...mappingInput, valueColumn: "C" });
      await repo.reviewMapping(
        p,
        batchId,
        b.id,
        "approved",
        "Cached result checked against source",
      );
      await repo.stageMapping(p, batchId, b.id);
      const report = await repo.importReport(p, batchId);
      expect(report.weeks[0]!.variance).toBe(0);
      const w = report.weeks[0]!;
      await repo.approveWeek(
        p,
        batchId,
        w.week,
        w.evidenceHash,
        "Synthetic source pair reconciled",
      );
      expect((await repo.importReport(p, batchId)).approvedWeeks).toBe(1);
      const replacement = await repo.createMapping(p, batchId, {
        ...mappingInput,
        supersedes: a.id,
        semantics: "Replacement synthetic mapping version",
      });
      await repo.reviewMapping(
        p,
        batchId,
        replacement.id,
        "approved",
        "Reviewed changed source semantics",
      );
      await repo.stageMapping(p, batchId, replacement.id);
      expect((await repo.importReport(p, batchId)).approvedWeeks).toBe(0);
      expect(
        (await repo.importDetail(p, batchId)).mappings.find((m) => m.id === a.id)?.status,
      ).toBe("superseded");
      await expect(
        repo.approveWeek(p, batchId, w.week, w.evidenceHash, "Old evidence cannot be approved"),
      ).rejects.toMatchObject({ status: 409 });
      expect((await repo.exportReport(p, batchId, "mappings")).content).not.toContain(a.id);
    });
    it("withdraws without deleting, rejects work until restored and does not revive on re-import", async () => {
      await repo.changeImportState(p, batchId, "withdrawn", "Synthetic rollback check");
      await expect(repo.importReport(p, batchId)).rejects.toMatchObject({ status: 409 });
      await expect(repo.downloadOriginal(p, batchId)).rejects.toMatchObject({ status: 409 });
      expect((await repo.catalogWorkbook(p, bytes, "synthetic.xlsx", "2026-10-01")).state).toBe(
        "withdrawn",
      );
      await repo.changeImportState(p, batchId, "active", "Synthetic restore check");
      expect((await repo.importCells(p, batchId, "Test", 1)).cells).toHaveLength(3);
    });
    it("rolls back failures and rechecks a demoted Admin before touching raw data", async () => {
      vi.mocked(storage.preserveWorkbook).mockRejectedValueOnce(
        new Error("synthetic storage failure"),
      );
      await expect(
        repo.catalogWorkbook(p, bytes, "synthetic.xlsx", "2026-09-01"),
      ).rejects.toThrow();
      expect(
        (await c.query("SELECT id FROM import_batches WHERE created_by=$1", [p.userId])).rows,
      ).toHaveLength(1);
      await c.query("UPDATE users SET role='staff' WHERE id=$1", [p.userId]);
      await expect(repo.importDetail(p, batchId)).rejects.toMatchObject({ status: 403 });
    });
    it("restricts import rows independently at the database boundary", async () => {
      const role = `np_import_${randomUUID().replace(/-/g, "")}`;
      await c.query(`CREATE ROLE ${role} NOLOGIN`);
      await c.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await c.query(`GRANT SELECT ON import_batches TO ${role}`);
      await c.query(`SET LOCAL ROLE ${role}`);
      for (const denied of ["staff", "leadership", ""]) {
        await c.query("SELECT set_config('np.role',$1,true)", [denied]);
        expect(
          (await c.query("SELECT id FROM import_batches WHERE id=$1", [batchId])).rowCount,
        ).toBe(0);
      }
      await c.query("SELECT set_config('np.role','admin',true)");
      expect((await c.query("SELECT id FROM import_batches WHERE id=$1", [batchId])).rowCount).toBe(
        1,
      );
      await c.query("RESET ROLE");
    });
  },
);
