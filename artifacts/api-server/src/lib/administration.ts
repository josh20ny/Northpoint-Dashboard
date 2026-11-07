import { pool } from "@workspace/db";
import type { PoolClient } from "pg";
import type { Principal } from "./auth";
import { recordAudit } from "./audit";

export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assertAdmin(p: Principal | null): asserts p is Principal & { userId: string } {
  if (!p?.userId || p.role !== "admin") throw new AccessError(403, "Forbidden");
}
export async function adminTransaction<T>(p: Principal, fn: (c: PoolClient) => Promise<T>) {
  assertAdmin(p);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(716102)");
    const current = await c.query(
      "SELECT id FROM users WHERE id=$1 AND status='active' AND role='admin'",
      [p.userId],
    );
    if (!current.rowCount) throw new AccessError(403, "Forbidden");
    await c.query("SELECT set_config('np.role','admin',true)");
    const value = await fn(c);
    await c.query("COMMIT");
    return value;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function adminWorkspace(p: Principal, page: number) {
  return adminTransaction(p, async (c) => {
    await recordAudit(p.userId!, "administration.read", "workspace", null, "success", c);
    const paging = [51, (page - 1) * 50];
    const users = await c.query(
      "SELECT id,email,role,status FROM users ORDER BY created_at,id LIMIT $1 OFFSET $2",
      paging,
    );
    const invitations = await c.query(
      `SELECT id,email,role,expires_at AS "expiresAt",consumed_at AS "consumedAt",revoked_at AS "revokedAt"
      FROM access_invitations ORDER BY created_at DESC,id LIMIT $1 OFFSET $2`,
      paging,
    );
    const ministries = await c.query(
      `SELECT id,code,name,active_from::text AS "activeFrom",active_to::text AS "activeTo"
      FROM ministries ORDER BY code,id LIMIT $1 OFFSET $2`,
      paging,
    );
    const services = await c.query(
      `SELECT id,ministry_id AS "ministryId",service_date::text AS "serviceDate",start_at AS "startAt",
      timezone,capacity,location_ref AS "locationRef",plan_external_id AS "planExternalId",special_event_ref AS "specialEventRef"
      FROM service_occurrences ORDER BY start_at DESC,id LIMIT $1 OFFSET $2`,
      paging,
    );
    const audit = await c.query(
      `SELECT id,actor_user_id AS "actorUserId",action,target_type AS "targetType",
      target_id AS "targetId",outcome,timestamp FROM audit_events ORDER BY timestamp DESC,id LIMIT $1 OFFSET $2`,
      paging,
    );
    const collections = [users, invitations, ministries, services, audit];
    // JSON serialization makes timestamps explicit ISO strings before response validation.
    return JSON.parse(
      JSON.stringify({
        users: users.rows.slice(0, 50),
        invitations: invitations.rows.slice(0, 50),
        ministries: ministries.rows.slice(0, 50),
        services: services.rows.slice(0, 50),
        audit: audit.rows.slice(0, 50),
        page,
        hasMore: collections.some((r) => r.rows.length > 50),
        asOf: new Date().toISOString(),
        quality: "configuration_only",
      }),
    ) as unknown;
  });
}
export async function reserveInvitation(p: Principal, email: string, role: string) {
  await adminTransaction(p, async (c) => {
    const normalized = email.trim().toLowerCase();
    if ((await c.query("SELECT id FROM users WHERE email=$1", [normalized])).rowCount)
      throw new AccessError(409, "Account already exists");
    await c.query(
      "UPDATE access_invitations SET revoked_at=now() WHERE email=$1 AND consumed_at IS NULL AND revoked_at IS NULL",
      [normalized],
    );
    const r = await c.query<{ id: string }>(
      "INSERT INTO access_invitations(email,role,created_by,expires_at) VALUES ($1,$2,$3,now()+interval '7 days') RETURNING id",
      [normalized, role, p.userId],
    );
    await recordAudit(p.userId!, "invitation.created", "invitation", r.rows[0]!.id, "success", c);
  });
}
export async function revokeInvitation(p: Principal, id: string) {
  await adminTransaction(p, async (c) => {
    const r = await c.query(
      "UPDATE access_invitations SET revoked_at=now() WHERE id=$1 AND consumed_at IS NULL AND revoked_at IS NULL RETURNING id",
      [id],
    );
    if (!r.rowCount) throw new AccessError(404, "Invitation not found");
    await recordAudit(p.userId!, "invitation.revoked", "invitation", id, "success", c);
  });
}
export async function updateUserAccess(p: Principal, id: string, role: string, status: string) {
  await adminTransaction(p, async (c) => {
    const previous = await c.query<{ role: string; status: string }>(
      "SELECT role,status FROM users WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!previous.rows[0]) throw new AccessError(404, "Account not found");
    if (
      previous.rows[0].role === "admin" &&
      previous.rows[0].status === "active" &&
      (role !== "admin" || status !== "active")
    ) {
      const count = await c.query<{ count: string }>(
        "SELECT count(*) FROM users WHERE role='admin' AND status='active'",
      );
      if (Number(count.rows[0]!.count) <= 1)
        throw new AccessError(409, "Keep at least one active administrator");
    }
    await c.query("UPDATE users SET role=$1,status=$2 WHERE id=$3", [role, status, id]);
    await c.query("DELETE FROM auth_sessions WHERE user_id=$1", [id]);
    await recordAudit(p.userId!, "user.access_changed", "user", id, "success", c);
  });
}
export function validCalendarDate(value: string | null) {
  if (value === null) return true;
  const d = new Date(`${value}T12:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(d.getTime()) &&
    d.toISOString().slice(0, 10) === value
  );
}
export function explicitInstant(value: unknown) {
  return (
    typeof value === "string" &&
    validCalendarDate(value.slice(0, 10)) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(new Date(value).getTime())
  );
}
export async function saveMinistry(
  p: Principal,
  id: string | null,
  input: { code: string; name: string; activeFrom: string | null; activeTo: string | null },
) {
  if (
    !input.name.trim() ||
    !validCalendarDate(input.activeFrom) ||
    !validCalendarDate(input.activeTo) ||
    (input.activeFrom && input.activeTo && input.activeTo < input.activeFrom)
  )
    throw new AccessError(400, "Invalid ministry dates or name");
  await adminTransaction(p, async (c) => {
    const args = [input.code, input.name.trim(), input.activeFrom, input.activeTo];
    const r = id
      ? await c.query<{ id: string }>(
          "UPDATE ministries SET code=$1,name=$2,active_from=$3,active_to=$4 WHERE id=$5 RETURNING id",
          [...args, id],
        )
      : await c.query<{ id: string }>(
          "INSERT INTO ministries(code,name,active_from,active_to) VALUES ($1,$2,$3,$4) RETURNING id",
          args,
        );
    if (!r.rowCount) throw new AccessError(404, "Ministry not found");
    // A date change must not invalidate already configured occurrences.
    const invalid = await c.query(
      `SELECT id FROM service_occurrences WHERE ministry_id=$1 AND
      (($2::date IS NOT NULL AND service_date<$2::date) OR ($3::date IS NOT NULL AND service_date>$3::date)) LIMIT 1`,
      [r.rows[0]!.id, input.activeFrom, input.activeTo],
    );
    if (invalid.rowCount)
      throw new AccessError(409, "Existing services fall outside these active dates");
    await recordAudit(
      p.userId!,
      id ? "ministry.updated" : "ministry.created",
      "ministry",
      r.rows[0]!.id,
      "success",
      c,
    );
  });
}
interface ServiceValues {
  ministryId: string;
  serviceDate: string;
  startAt: Date;
  capacity: number | null;
  locationRef: string | null;
  planExternalId: string | null;
  specialEventRef: string | null;
}
export async function saveService(p: Principal, id: string | null, v: ServiceValues) {
  if (!validCalendarDate(v.serviceDate)) throw new AccessError(400, "Invalid service date");
  await adminTransaction(p, async (c) => {
    const ministry = await c.query(
      `SELECT id FROM ministries WHERE id=$1
      AND (active_from IS NULL OR active_from <= $2::date)
      AND (active_to IS NULL OR active_to >= $2::date)`,
      [v.ministryId, v.serviceDate],
    );
    if (!ministry.rowCount) throw new AccessError(400, "Select an active ministry for this date");
    const args = [
      v.ministryId,
      v.serviceDate,
      v.startAt,
      v.capacity,
      v.locationRef,
      v.planExternalId,
      v.specialEventRef,
    ];
    const r = id
      ? await c.query<{ id: string }>(
          `UPDATE service_occurrences SET ministry_id=$1,service_date=$2,start_at=$3,
      capacity=$4,location_ref=$5,plan_external_id=$6,special_event_ref=$7 WHERE id=$8 RETURNING id`,
          [...args, id],
        )
      : await c.query<{ id: string }>(
          `INSERT INTO service_occurrences(ministry_id,service_date,start_at,capacity,location_ref,plan_external_id,special_event_ref)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          args,
        );
    if (!r.rowCount) throw new AccessError(404, "Service not found");
    await recordAudit(
      p.userId!,
      id ? "service.updated" : "service.created",
      "service",
      r.rows[0]!.id,
      "success",
      c,
    );
  });
}
