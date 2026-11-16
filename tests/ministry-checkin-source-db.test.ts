import { describe, expect, it } from "vitest";
import { loadCheckInFactsForWindow } from "../artifacts/api-server/src/lib/ministry-checkin-source";

describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")("Check-In window SQL semantics", () => {
  it("preserves time precedence, fallback, context, and undated exceptions", async () => {
    const { pool } = await import("../lib/db/src/index");
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      // Session-local shadow only: never insert/delete real source records.
      await c.query(`CREATE TEMP TABLE pco_source_entities (
        account_ref text, product text, object_type text, external_id text,
        normalized jsonb, observed_run_id text, missing_run_id text
      ) ON COMMIT DROP`);
      const facts: Record<string, unknown>[] = [];
      function add(type: string, id: string, attributes = {}, relationships = {},
        account = "fixture", missing: string | null = null, observed: string | null = "run") {
        facts.push({ account_ref: account, product: "check_ins", object_type: type,
          external_id: id, normalized: { sourceType: type, sourceId: id,
            attributes, sourceRelationships: relationships },
          observed_run_id: observed, missing_run_id: missing });
      }
      const one = (id: string) => ({ data: { id } });
      const many = (...ids: string[]) => ({ data: ids.map(id => ({ id })) });
      add("EventTime", "sun", { starts_at: "2026-11-08T15:00:00Z" }, { event: one("event") });
      add("EventTime", "sat", { starts_at: "2026-11-08T04:00:00Z" });
      add("EventTime", "template", { starts_at: "2026-11-01T15:00:00Z" });
      add("EventTime", "removed", { starts_at: "2026-11-08T15:00:00Z" }, {}, "fixture", "gone");
      add("EventPeriod", "period", { starts_at: "2026-11-08T15:00:00Z" }, { event: one("event") });
      add("Event", "event");
      add("Person", "child");
      add("Person", "unrelated");
      add("Location", "room");
      add("CheckIn", "array", {}, { event_times: many("sun"), person: one("child"), locations: many("room") });
      add("CheckIn", "object", {}, { event_times: one("sun"), locations: one("room") });
      add("CheckIn", "fallback", {}, { event_times: many("unknown"), event_period: one("period") });
      add("CheckIn", "null-time", {}, { event_period: one("period") });
      add("CheckIn", "earliest-outside", {}, { event_times: many("sun", "sat"), event_period: one("period") });
      add("CheckIn", "undated");
      add("CheckIn", "removed-time", {}, { event_times: many("removed") });
      add("CheckIn", "deleted", {}, { event_times: many("sun") }, "fixture", "gone");
      add("CheckIn", "unobserved", {}, { event_times: many("sun") }, "fixture", null, null);
      add("CheckIn", "other-account", {}, { event_times: many("sun") }, "other");
      await c.query(`INSERT INTO pg_temp.pco_source_entities
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS f(
          account_ref text, product text, object_type text, external_id text,
          normalized jsonb, observed_run_id text, missing_run_id text)`, [JSON.stringify(facts)]);
      const result = await loadCheckInFactsForWindow(c, "fixture", "2026-11-08", "2026-11-08", ["template"]);
      expect(result.filter(f => f.type === "CheckIn").map(f => f.id).sort())
        .toEqual(["array", "fallback", "null-time", "object"]);
      expect(result.map(f => `${f.type}:${f.id}`)).toEqual(expect.arrayContaining([
        "Event:event", "EventPeriod:period", "EventTime:sun", "EventTime:template",
        "Person:child", "Location:room",
      ]));
      expect(result.some(f => f.id === "unrelated")).toBe(false);
      const undated = await loadCheckInFactsForWindow(c, "fixture", null, null, [], true);
      expect(undated.filter(f => f.type === "CheckIn").map(f => f.id).sort())
        .toEqual(["removed-time", "undated"]);
    } finally {
      await c.query("ROLLBACK");
      c.release();
      await pool.end();
    }
  });
});
