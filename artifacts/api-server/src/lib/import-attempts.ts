import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import type { PoolClient } from "pg";
import type { Principal } from "./auth";
import { adminTransaction } from "./administration";
import { recordAudit } from "./audit";
import { preserveWorkbook } from "./import-storage";
import { logger } from "./logger";

// Session lock spans the independently committed intent, storage and catalog steps.
// A disconnected process releases the lock, but its pending intent remains reviewable.
export async function withImportLock<T>(
  key: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  let locked = false;
  try {
    await c.query("SELECT pg_advisory_lock(716103,hashtext($1))", [key]);
    locked = true;
    return await fn(c);
  } finally {
    try {
      if (locked) {
        await c.query("SELECT pg_advisory_unlock(716103,hashtext($1))", [key]);
        c.release();
      } else {
        c.release(true);
      }
    } catch {
      // Never return a connection that may still hold the session lock to the pool.
      c.release(true);
    }
  }
}

export async function trackedOriginal<T>(
  p: Principal,
  connection: PoolClient,
  input: { sha256: string; filename: string; snapshotDate: string },
  bytes: Buffer,
  catalog: (c: PoolClient, objectPath: string) => Promise<{ id: string } & T>,
): Promise<{ id: string } & T> {
  const id = randomUUID();
  const { objectPath, reused } = await adminTransaction(
    p,
    async (c) => {
      const previous = await c.query<{ objectPath: string }>(
        `SELECT object_path AS "objectPath" FROM import_upload_attempts
       WHERE sha256=$1 AND snapshot_date=$2 AND storage_state='stored'
       ORDER BY created_at,id LIMIT 1`,
        [input.sha256, input.snapshotDate],
      );
      const reused = Boolean(previous.rows[0]);
      const objectPath = previous.rows[0]?.objectPath ?? `imports/${id}.xlsx`;
      await c.query(
        `INSERT INTO import_upload_attempts
       (id,sha256,filename,snapshot_date,object_path,storage_state,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          id,
          input.sha256,
          input.filename,
          input.snapshotDate,
          objectPath,
          reused ? "stored" : "unknown",
          p.userId,
        ],
      );
      await recordAudit(
        p.userId!,
        "import.upload_pending",
        "import_upload_attempt",
        id,
        "success",
        c,
      );
      return { objectPath, reused };
    },
    connection,
  );
  let phase = reused ? "catalog" : "storage";
  try {
    if (!reused) {
      await preserveWorkbook(id, bytes);
      // If this acknowledgement fails the intent stays unknown, never falsely absent.
      phase = "storage_confirmation";
      await adminTransaction(
        p,
        async (c) => {
          await c.query(
            `UPDATE import_upload_attempts SET storage_state='stored',updated_at=now() WHERE id=$1`,
            [id],
          );
        },
        connection,
      );
    }
    phase = "catalog";
    return await adminTransaction(
      p,
      async (c) => {
        const result = await catalog(c, objectPath);
        await c.query(
          `UPDATE import_upload_attempts SET status='linked',batch_id=$2,updated_at=now() WHERE id=$1`,
          [id, result.id],
        );
        await recordAudit(
          p.userId!,
          "import.upload_linked",
          "import_upload_attempt",
          id,
          "success",
          c,
        );
        return result;
      },
      connection,
    );
  } catch (error) {
    try {
      await adminTransaction(
        p,
        async (c) => {
          // A lost COMMIT acknowledgement may mean linking actually committed.
          await c.query(
            `UPDATE import_upload_attempts SET status='failed',failure_phase=$2,updated_at=now()
           WHERE id=$1 AND status='pending'`,
            [id, phase],
          );
          await recordAudit(
            p.userId!,
            "import.upload_failed",
            "import_upload_attempt",
            id,
            "failure",
            c,
          );
        },
        connection,
      );
    } catch {
      // Only opaque identifiers go to logs, not SQL, filenames or workbook data.
      logger.error({ attemptId: id }, "Upload tracking update failed; review pending attempt");
    }
    throw error;
  }
}
