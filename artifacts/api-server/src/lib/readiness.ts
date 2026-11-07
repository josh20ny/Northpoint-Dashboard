export async function databaseReadiness() {
  if (!process.env.DATABASE_URL) {
    return { status: "not_ready", connectivity: "not_configured", migration: "not_verified" };
  }
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{ version: string; schema_ready: boolean }>(
      `SELECT version,
        to_regclass('users') IS NOT NULL AND to_regclass('auth_sessions') IS NOT NULL
        AND to_regclass('people') IS NOT NULL AND to_regclass('service_occurrences') IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='audit_append_only' AND tgenabled<>'D')
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='raw_append_only' AND tgenabled<>'D')
        AND EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('raw_source_records') AND relrowsecurity AND relforcerowsecurity)
        AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('raw_source_records') AND polname='raw_admin_only')
        AS schema_ready FROM foundation_metadata WHERE key = $1`,
      ["application"],
    );
    const ready = result.rows[0]?.version === "phase-1" && result.rows[0]?.schema_ready;
    return {
      status: ready ? "ready" : "not_ready",
      connectivity: "connected",
      migration: ready ? "applied" : "pending",
    };
  } catch (error) {
    // SQLSTATE only, never error.message (which can contain SQL or connection data).
    const code = (error as { code?: string }).code;
    return {
      status: "not_ready",
      connectivity: code === "42P01" ? "connected" : "unavailable",
      migration: code === "42P01" ? "pending" : "not_verified",
    };
  }
}
