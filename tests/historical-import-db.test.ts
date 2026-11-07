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
    let baselineAttempts: number;
    let fault:
      "catalog" | "catalogCommit" | "confirmation" | "catalogAndFailure" | "failureRecord" | null =
      null;
    let catalogWritten = false;
    const bytes = syntheticWorkbook();
    beforeAll(async () => {
      db = await import("../lib/db/src/index");
      c = await db.pool.connect();
      vi.spyOn(db.pool, "connect").mockImplementation(
        async () =>
          ({
            query: async (sql: string, args?: unknown[]) => {
              if (sql.includes("INSERT INTO import_batches(")) catalogWritten = true;
              if (
                (fault === "catalog" && sql.includes("INSERT INTO import_cells(")) ||
                (fault === "catalogCommit" && sql === "COMMIT" && catalogWritten) ||
                (fault === "confirmation" && sql.includes("SET storage_state='stored'")) ||
                (fault === "catalogAndFailure" && sql.includes("INSERT INTO import_cells(")) ||
                (fault === "failureRecord" && sql.includes("SET status='failed'"))
              ) {
                fault = fault === "catalogAndFailure" ? "failureRecord" : null;
                catalogWritten = false;
                return c.query("SELECT 1/0");
              }
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
      fault = null;
      catalogWritten = false;
      baselineAttempts = (await c.query("SELECT count(*)::int AS n FROM import_upload_attempts"))
        .rows[0].n;
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
      const uploads = await repo.listImportUploads(p, 1);
      expect(uploads.attempts).toHaveLength(baselineAttempts + 1);
      expect(
        uploads.attempts.find((a: { linkedBatchId: string }) => a.linkedBatchId === batchId),
      ).toMatchObject({
        status: "linked",
        storageState: "stored",
        linkedBatchId: batchId,
      });
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
      expect((await repo.listImportUploads(p, 1)).attempts[0]).toMatchObject({
        status: "failed",
        storageState: "unknown",
        failurePhase: "storage",
        linkedBatchId: null,
      });
      await c.query("UPDATE users SET role='staff' WHERE id=$1", [p.userId]);
      await expect(repo.importDetail(p, batchId)).rejects.toMatchObject({ status: 403 });
      await expect(repo.listImportUploads(p, 1)).rejects.toMatchObject({ status: 403 });
    });
    it.each(["catalog", "catalogCommit"] as const)(
      "retains stored originals after %s failure and reuses them without rewriting failure history",
      async (failure) => {
        catalogWritten = false;
        fault = failure;
        await expect(repo.catalogWorkbook(p, bytes, "failed.xlsx", "2026-09-01")).rejects.toThrow();
        const before = await repo.listImportUploads(p, 1);
        const failed = before.attempts[0];
        expect(failed).toMatchObject({
          status: "failed",
          storageState: "stored",
          failurePhase: "catalog",
          linkedBatchId: null,
        });
        expect(
          (await c.query("SELECT id FROM import_batches WHERE snapshot_date='2026-09-01'"))
            .rowCount,
        ).toBe(0);
        expect(
          (await c.query("SELECT count(*)::int AS n FROM import_cells")).rows[0].n,
        ).toBeGreaterThanOrEqual(3);
        const writes = vi.mocked(storage.preserveWorkbook).mock.calls.length;
        const retried = await repo.catalogWorkbook(p, bytes, "retry.xlsx", "2026-09-01");
        expect(storage.preserveWorkbook).toHaveBeenCalledTimes(writes);
        expect((await repo.catalogWorkbook(p, bytes, "again.xlsx", "2026-09-01")).id).toBe(
          retried.id,
        );
        const after = await repo.listImportUploads(p, 1);
        expect(after.attempts.find((a: { id: string }) => a.id === failed.id)).toMatchObject({
          status: "failed",
          objectPath: failed.objectPath,
          linkedBatchId: retried.id,
        });
        expect(after.attempts).toHaveLength(baselineAttempts + 3);
        expect((await repo.importDetail(p, retried.id)).batch.id).toBe(retried.id);
      },
    );
    it("records intent before storage and treats lost storage confirmation as unknown, not absent", async () => {
      vi.mocked(storage.preserveWorkbook).mockImplementationOnce(async (id) => {
        const intent = await c.query(
          "SELECT status,storage_state FROM import_upload_attempts WHERE id=$1",
          [id],
        );
        expect(intent.rows).toEqual([{ status: "pending", storage_state: "unknown" }]);
        return `imports/${id}.xlsx`;
      });
      fault = "confirmation";
      await expect(
        repo.catalogWorkbook(p, bytes, "uncertain.xlsx", "2026-08-01"),
      ).rejects.toThrow();
      expect((await repo.listImportUploads(p, 1)).attempts[0]).toMatchObject({
        status: "failed",
        storageState: "unknown",
        failurePhase: "storage_confirmation",
        linkedBatchId: null,
      });
    });
    it("leaves durable pending evidence when the database also rejects failure recording", async () => {
      fault = "catalogAndFailure";
      await expect(
        repo.catalogWorkbook(p, bytes, "interrupted.xlsx", "2026-06-01"),
      ).rejects.toThrow();
      const pending = (await repo.listImportUploads(p, 1)).attempts[0];
      expect(pending).toMatchObject({
        status: "pending",
        storageState: "stored",
        linkedBatchId: null,
        failurePhase: null,
      });
      const writes = vi.mocked(storage.preserveWorkbook).mock.calls.length;
      const retry = await repo.catalogWorkbook(p, bytes, "recovered.xlsx", "2026-06-01");
      expect(storage.preserveWorkbook).toHaveBeenCalledTimes(writes);
      expect(
        (await repo.listImportUploads(p, 1)).attempts.find(
          (a: { id: string }) => a.id === pending.id,
        ),
      ).toMatchObject({ status: "pending", linkedBatchId: retry.id });
    });
    it("preserves pending intents and terminal history, with paginated unlinked-first review", async () => {
      await c.query(
        `INSERT INTO import_upload_attempts(sha256,filename,snapshot_date,object_path,created_by)
         SELECT 'synthetic','pending.xlsx','2026-07-01','imports/'||gen_random_uuid()||'.xlsx',$1
         FROM generate_series(1,51)`,
        [p.userId],
      );
      const first = await repo.listImportUploads(p, 1);
      expect(first.hasMore).toBe(true);
      expect(first.attempts).toHaveLength(50);
      expect(first.attempts.every((a: { status: string }) => a.status === "pending")).toBe(true);
      expect((await repo.listImportUploads(p, 2)).attempts).toHaveLength(baselineAttempts + 2);
      const linked = (
        await c.query("SELECT id FROM import_upload_attempts WHERE batch_id=$1", [batchId])
      ).rows[0];
      for (const sql of [
        "UPDATE import_upload_attempts SET status='pending',batch_id=NULL WHERE id=$1",
        "UPDATE import_upload_attempts SET filename='changed.xlsx' WHERE id=$1",
        "DELETE FROM import_upload_attempts WHERE id=$1",
      ]) {
        await c.query("SAVEPOINT immutable_attempt");
        await expect(c.query(sql, [linked.id])).rejects.toMatchObject({ code: "42501" });
        await c.query("ROLLBACK TO SAVEPOINT immutable_attempt");
      }
    });
    it("restricts import rows independently at the database boundary", async () => {
      const role = `np_import_${randomUUID().replace(/-/g, "")}`;
      await c.query(`CREATE ROLE ${role} NOLOGIN`);
      await c.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await c.query(`GRANT SELECT ON import_batches,import_upload_attempts TO ${role}`);
      await c.query(`SET LOCAL ROLE ${role}`);
      for (const denied of ["staff", "leadership", ""]) {
        await c.query("SELECT set_config('np.role',$1,true)", [denied]);
        expect(
          (await c.query("SELECT id FROM import_batches WHERE id=$1", [batchId])).rowCount,
        ).toBe(0);
        expect(
          (await c.query("SELECT id FROM import_upload_attempts WHERE batch_id=$1", [batchId]))
            .rowCount,
        ).toBe(0);
      }
      await c.query("SELECT set_config('np.role','admin',true)");
      expect((await c.query("SELECT id FROM import_batches WHERE id=$1", [batchId])).rowCount).toBe(
        1,
      );
      expect(
        (await c.query("SELECT id FROM import_upload_attempts WHERE batch_id=$1", [batchId]))
          .rowCount,
      ).toBe(1);
      await c.query("RESET ROLE");
    });
  },
);
