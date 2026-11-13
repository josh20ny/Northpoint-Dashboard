import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { pool } from "../lib/db/src/index";
import { stageSourcePage } from "../artifacts/api-server/src/lib/planning-center-staging";
import type { SourceEntity } from "../artifacts/api-server/src/lib/planning-center-source";

// Opt-in real PostgreSQL checks, confined to temporary copies of table schemas.
// No fixtures, rows, migrations, triggers, or permissions in public are changed.
describe.skipIf(process.env.RUN_PCO_STAGING_TESTS !== "1")("PCO page batching in isolated temporary tables", () => {
  let c: PoolClient;
  const run = "00000000-0000-4000-8000-000000000001";
  const laterRun = "00000000-0000-4000-8000-000000000002";
  const entity = (id: string, updated = "2026-11-01T12:00:00Z"): SourceEntity => ({
    type: "Person", id, attributes: { updated_at: updated }, relationships: {},
  });
  const page = (entities: SourceEntity[]) => ({ entities, nextPages: [] });
  beforeAll(async () => {
    c = await pool.connect();
    await c.query("BEGIN");
    await c.query("SET LOCAL search_path=pg_temp,public");
    for (const table of ["raw_source_records", "pco_source_entities", "pco_source_observations"])
      await c.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`);
  });
  afterAll(async () => {
    if (c) { await c.query("ROLLBACK"); c.release(); }
    await pool.end();
  });
  beforeEach(async () => { await c.query("SAVEPOINT test_case"); });
  afterEach(async () => { await c.query("ROLLBACK TO SAVEPOINT test_case"); });

  it("stages a 100-record page in four statements for every product and replays without revisions", async () => {
    for (const [product, type] of Object.entries({
      people: "Person", services: "Plan", check_ins: "CheckIn",
      giving: "Donation", groups: "Membership", serving: "PlanPerson",
    })) {
      const input = page(Array.from({ length: 100 }, (_, i) => ({ ...entity(String(i + 1)), type })));
      const query = vi.fn(c.query.bind(c));
      expect(await stageSourcePage({ query } as unknown as PoolClient, "synthetic", product, run, input, "/synthetic")).toBe(100);
      expect(query).toHaveBeenCalledTimes(4);
      expect(await stageSourcePage(c, "synthetic", product, run, input, "/synthetic")).toBe(0);
    }
    expect((await c.query("SELECT count(*)::int AS n FROM raw_source_records")).rows[0].n).toBe(600);
    expect((await c.query("SELECT count(*)::int AS n FROM pco_source_entities")).rows[0].n).toBe(600);
    expect((await c.query("SELECT count(*)::int AS n FROM pco_source_observations")).rows[0].n).toBe(600);
  });

  it("keeps all raw revisions but selects the newest duplicate and observes older replays", async () => {
    const newer = entity("1", "2026-11-02T12:00:00Z");
    const older = entity("1");
    expect(await stageSourcePage(c, "synthetic", "people", run, page([newer, older, older]), "/synthetic")).toBe(2);
    await c.query("UPDATE pco_source_entities SET missing_run_id=$1", [run]);
    expect(await stageSourcePage(c, "synthetic", "people", laterRun, page([older]), "/synthetic")).toBe(0);
    const saved = (await c.query("SELECT normalized,observed_run_id,missing_run_id FROM pco_source_entities")).rows[0];
    expect(saved.normalized.attributes.updated_at).toBe(newer.attributes.updated_at);
    expect(saved.observed_run_id).toBe(laterRun);
    expect(saved.missing_run_id).toBeNull();
    expect((await c.query("SELECT count(*)::int AS n FROM pco_source_observations")).rows[0].n).toBe(2);
  });

  it("retains each included child's parent collection rather than the page's root", async () => {
    const input = {
      ...page([entity("1"), { ...entity("2"), type: "Designation" }]),
      sourceCollections: { "Designation:2": "/giving/v2/donations/1/designations" },
    };
    await stageSourcePage(c, "synthetic", "giving", run, input, "/giving/v2/donations");
    const saved = (await c.query("SELECT normalized FROM pco_source_entities WHERE object_type='Designation'")).rows[0].normalized;
    expect(saved.sourceCollection).toBe("/giving/v2/donations/1/designations");
  });

  it("rolls the entire page back if writing positive observations fails", async () => {
    await c.query("SAVEPOINT page_under_test");
    const query = vi.fn((sql: string, values?: unknown[]) =>
      sql.startsWith("WITH observed") ? c.query("SELECT 1/0") : c.query(sql, values),
    );
    await expect(stageSourcePage(
      { query } as unknown as PoolClient, "synthetic", "people", run, page([entity("1")]), "/synthetic",
    )).rejects.toThrow();
    await c.query("ROLLBACK TO SAVEPOINT page_under_test");
    expect((await c.query("SELECT count(*)::int AS n FROM raw_source_records")).rows[0].n).toBe(0);
    expect((await c.query("SELECT count(*)::int AS n FROM pco_source_entities")).rows[0].n).toBe(0);
    expect((await c.query("SELECT count(*)::int AS n FROM pco_source_observations")).rows[0].n).toBe(0);
  });
});
