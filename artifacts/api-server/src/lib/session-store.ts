import { pool } from "@workspace/db";
import type { Principal, Role, VerifiedIdentity } from "./auth";
import { hashToken, randomToken } from "./security";
import { recordAudit } from "./audit";

export function verifiedOidcIdentity(claims: Record<string, unknown>): VerifiedIdentity | null {
  if (
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.email !== "string" ||
    claims.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ||
    claims.email_verified !== true
  )
    return null;
  return {
    subject: claims.sub,
    provider: "replit",
    verifiedEmail: claims.email.trim().toLowerCase(),
  };
}

export async function admitIdentity(identity: VerifiedIdentity) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Serialize admission and role administration, including last-admin guard.
    await c.query("SELECT pg_advisory_xact_lock(716102)");
    const existing = await c.query<{
      id: string;
      email: string;
      role: Role;
      status: string;
      provider: string;
      auth_subject: string;
    }>(
      "SELECT id,email,role,status,provider,auth_subject FROM users WHERE provider=$1 AND auth_subject=$2 FOR UPDATE",
      [identity.provider, identity.subject],
    );
    let user = existing.rows[0];
    if (user) {
      if (user.status !== "active" || user.email !== identity.verifiedEmail) {
        await recordAudit(user.id, "login.denied", "identity", null, "denied", c);
        await c.query("COMMIT");
        return null;
      }
    } else {
      const invite = await c.query<{ id: string; role: Role }>(
        `SELECT id,role FROM access_invitations WHERE email=$1 AND consumed_at IS NULL
         AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [identity.verifiedEmail],
      );
      const collision = await c.query("SELECT id FROM users WHERE email=$1", [
        identity.verifiedEmail,
      ]);
      if (!invite.rows[0] || collision.rowCount) {
        await recordAudit(null, "login.denied", "admission", null, "denied", c);
        await c.query("COMMIT");
        return null;
      }
      const inserted = await c.query<typeof user>(
        "INSERT INTO users(provider,auth_subject,email,role) VALUES ($1,$2,$3,$4) RETURNING id,email,role,status,provider,auth_subject",
        [identity.provider, identity.subject, identity.verifiedEmail, invite.rows[0].role],
      );
      user = inserted.rows[0]!;
      await c.query("UPDATE access_invitations SET consumed_at=now() WHERE id=$1", [
        invite.rows[0].id,
      ]);
      await recordAudit(
        user.id,
        "invitation.accepted",
        "invitation",
        invite.rows[0].id,
        "success",
        c,
      );
    }
    await recordAudit(user.id, "login.allowed", "user", user.id, "success", c);
    await c.query("COMMIT");
    return { id: user.id, email: user.email, role: user.role };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function createSession(userId: string, identityExpiresAt: number) {
  const token = randomToken();
  const csrfToken = randomToken();
  // Operational security cap, not a ministry retention/business definition.
  const expiresAt = new Date(Math.min(Date.now() + 8 * 60 * 60 * 1000, identityExpiresAt * 1000));
  if (expiresAt.getTime() <= Date.now()) throw new Error("Expired identity");
  await pool.query(
    "INSERT INTO auth_sessions(token_hash,user_id,csrf_token,expires_at) VALUES ($1,$2,$3,$4)",
    [hashToken(token), userId, csrfToken, expiresAt],
  );
  return { token, csrfToken, expiresAt };
}
export async function readSession(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await pool.query<{
    id: string;
    email: string;
    role: Role;
    provider: VerifiedIdentity["provider"];
    subject: string;
    csrfToken: string;
    expiresAt: Date;
  }>(
    `SELECT u.id,u.email,u.role,u.provider,u.auth_subject AS subject,
      s.csrf_token AS "csrfToken",s.expires_at AS "expiresAt"
     FROM auth_sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'`,
    [hashToken(token)],
  );
  return result.rows[0] ?? null;
}
export async function revokeSession(token: string) {
  await pool.query("DELETE FROM auth_sessions WHERE token_hash=$1", [hashToken(token)]);
}
export function principalFromSession(
  s: NonNullable<Awaited<ReturnType<typeof readSession>>>,
): Principal {
  return {
    userId: s.id,
    role: s.role,
    identity: { subject: s.subject, provider: s.provider, verifiedEmail: s.email },
  };
}
