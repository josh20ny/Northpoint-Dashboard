import { describe, expect, it } from "vitest";

// Explicit opt-in: normal unit tests need no secrets, network or live providers.
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")("development database integration", () => {
  it("connects and finds the Phase 0 migration marker", async () => {
    const { pool } = await import("../lib/db/src/index");
    try {
      const result = await pool.query("SELECT version FROM foundation_metadata WHERE key = $1", [
        "application",
      ]);
      expect(result.rows).toEqual([{ version: "phase-0" }]);
    } finally {
      await pool.end();
    }
  });
});
