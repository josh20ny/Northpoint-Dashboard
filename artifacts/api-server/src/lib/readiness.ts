export async function databaseReadiness() {
  if (!process.env.DATABASE_URL) {
    return { status: "not_ready", connectivity: "not_configured", migration: "not_verified" };
  }
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{ version: string }>(
      "SELECT version FROM foundation_metadata WHERE key = $1",
      ["application"],
    );
    return {
      status: result.rows[0]?.version === "phase-0" ? "ready" : "not_ready",
      connectivity: "connected",
      migration: result.rows[0]?.version === "phase-0" ? "applied" : "pending",
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
