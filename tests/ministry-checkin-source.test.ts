import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { loadCheckInFactsForWindow } from "../artifacts/api-server/src/lib/ministry-checkin-source";

describe("bounded Check-In source loading", () => {
  it("filters by linked Chicago service dates and carries only related context", async () => {
    const calls: { sql: string; args: unknown[] }[] = [];
    const client = {
      query: async (sql: string, args: unknown[]) => {
        calls.push({ sql, args });
        return { rows: [] };
      },
    } as unknown as Pick<PoolClient, "query">;

    await loadCheckInFactsForWindow(
      client,
      "account",
      "2026-11-08",
      "2026-11-15",
      ["event-time-template"],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual([
      "account",
      "2026-11-08",
      "2026-11-15",
      false,
      ["event-time-template"],
    ]);
    expect(calls[0]!.sql).toContain("service_date BETWEEN $2::date AND $3::date");
    expect(calls[0]!.sql).toContain("AT TIME ZONE 'America/Chicago'");
    expect(calls[0]!.sql).toContain("UNION SELECT 'EventTime', unnest($5::text[])");
    expect(calls[0]!.sql).not.toContain("creation_date");
    expect(calls[0]!.sql).toContain("candidate_ids AS MATERIALIZED");
    expect(calls[0]!.sql).toContain("JOIN candidate_ids");
    expect(calls[0]!.sql).toContain("(c.normalized->'sourceRelationships') @>");
    expect(calls[0]!.sql).toContain("MIN(t.service_date)");
    expect(calls[0]!.sql).toContain("COALESCE(t.service_date, p.service_date)");
  });

  it("can isolate records with no usable service date for the Admin exception queue", async () => {
    const calls: { args: unknown[] }[] = [];
    const client = {
      query: async (_sql: string, args: unknown[]) => {
        calls.push({ args });
        return { rows: [] };
      },
    } as unknown as Pick<PoolClient, "query">;

    await loadCheckInFactsForWindow(client, "account", null, null, [], true);
    expect(calls[0]!.args).toEqual(["account", null, null, true, []]);
  });
});
