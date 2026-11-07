import { pool } from "@workspace/db";
import type { PoolClient } from "pg";

// No payloads, emails, token contents, SQL errors, or giving attributes.
export async function recordAudit(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  outcome = "success",
  connection: Pick<PoolClient, "query"> = pool,
) {
  await connection.query(
    `INSERT INTO audit_events(actor_user_id, action, target_type, target_id, outcome)
     VALUES ($1,$2,$3,$4,$5)`,
    [actorId, action, targetType, targetId, outcome],
  );
}
