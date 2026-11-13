/**
 * Apply the owner's November 8, 2026 Check-Ins location interpretation.
 *
 * Preview by default; --apply writes through the audited mapping repository.
 * This is an operations entry point, never an HTTP authentication shortcut.
 * It uses the recorded integration authorizer, who must still be an active
 * Admin. It does not fetch PCO, change syncs, or publish metrics.
 */
import { pool } from "@workspace/db";
import { createMinistryMapping } from "../lib/ministry-data";
import type { AdminActor } from "../lib/administration";

const approved = [
  ["1065468", "Kinder - A", "upstreet"],
  ["1067961", "Kinder - B", "upstreet"],
  ["2250846", "Kinder - C", "upstreet"],
  ["1067974", "1st - A", "upstreet"],
  ["1067976", "1st - B", "upstreet"],
  ["1067979", "2nd - A", "upstreet"],
  ["1067980", "2nd - B", "upstreet"],
  ["1426998", "2nd - C", "upstreet"],
  ["1067982", "3rd - A", "upstreet"],
  ["1067983", "3rd - B", "upstreet"],
  ["1335460", "3rd - C", "upstreet"],
  ["1067986", "4th - Girls A", "upstreet"],
  ["1067987", "4th - Boys A", "upstreet"],
  ["1727685", "4th - Girls B", "upstreet"],
  ["1727688", "4th - Boys B", "upstreet"],
  ["1067997", "5th - Boys A", "upstreet"],
  ["1067999", "5th - Girls A", "upstreet"],
  ["1727689", "5th - Girls B", "upstreet"],
  ["2250823", "5th - Boys B", "upstreet"],
  ["1069833", "Hangout", "upstreet"],
  ["1065459", "Hippos", "waumba-land"],
  ["1067962", "Giraffes", "waumba-land"],
  ["1067971", "Gators", "waumba-land"],
  ["1067966", "Monkeys", "waumba-land"],
  ["1067963", "Gazelles", "waumba-land"],
  ["1067969", "Elephants", "waumba-land"],
  ["1067968", "Zebras", "waumba-land"],
] as const;
const effectiveFrom = "2026-11-08";
const apply = process.argv.includes("--apply");

async function main() {
  const c = await pool.connect();
  let actor: AdminActor;
  let pending: typeof approved[number][] = [];
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    const owner = await c.query(
      `SELECT p.account_ref,u.id FROM pco_connections p
       JOIN users u ON u.id=p.connected_by
       WHERE p.id='planning_center' AND u.role='admin' AND u.status='active'`,
    );
    if (owner.rowCount !== 1) throw new Error("An active Admin integration authorizer is required");
    actor = { userId: owner.rows[0].id, role: "admin" };
    const account = owner.rows[0].account_ref;
    const sources = await c.query<{ id: string; name: string }>(
      `SELECT external_id AS id,normalized->'attributes'->>'name' AS name
       FROM pco_source_entities WHERE account_ref=$1 AND product='check_ins'
       AND object_type='Location' AND missing_run_id IS NULL AND external_id=ANY($2::text[])`,
      [account, approved.map(([id]) => id)],
    );
    const names = new Map(sources.rows.map((row) => [row.id, row.name]));
    for (const [id, name] of approved)
      if (names.get(id) !== name)
        throw new Error(`Approved location ${id} is unavailable or its label changed; review before applying`);
    const existing = await c.query<{
      external_id: string;
      ministry: string;
      scope: string;
      effective_from: string;
      effective_to: string | null;
    }>(
      `SELECT external_id,ministry,scope,effective_from::text,effective_to::text
       FROM ministry_source_mappings m WHERE account_ref=$1 AND product='check_ins'
       AND object_type='Location' AND measure='attendance' AND enabled
       AND external_id=ANY($2::text[]) AND NOT EXISTS
       (SELECT 1 FROM ministry_source_mappings n WHERE n.supersedes_id=m.id)
       AND (effective_to IS NULL OR effective_to >= $3::date)`,
      [account, approved.map(([id]) => id), effectiveFrom],
    );
    pending = approved.filter(([id, , ministry]) => {
      const rows = existing.rows.filter((row) => row.external_id === id);
      if (!rows.length) return true;
      if (
        rows.length === 1 && rows[0].ministry === ministry && rows[0].scope === "all" &&
        rows[0].effective_from <= effectiveFrom && rows[0].effective_to === null
      ) return false;
      throw new Error(`Location ${id} has a different interpretation; preserve it for explicit review`);
    });
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }

  let created = 0;
  if (apply)
    for (const [externalId, , ministry] of pending) {
      await createMinistryMapping(actor!, {
        product: "check_ins",
        objectType: "Location",
        externalId,
        ministry,
        measure: "attendance",
        scope: "all",
        effectiveFrom,
        effectiveTo: null,
        note:
          "Owner-approved Normal Service Times location hierarchy, verified against November 8, 2026 screenshots. " +
          (externalId === "1069833" ? "Owner explicitly assigned Hangout to UpStreet. " : "") +
          "Combined-service unique attendance only; per-service routing remains separate. No historical backcasting.",
        enabled: true,
      });
      created++;
    }
  console.log(JSON.stringify({
    mode: apply ? "applied" : "preview",
    approved: approved.length,
    pending: pending.length,
    created,
    upstreetRooms: approved.filter(([, , ministry]) => ministry === "upstreet").length,
    waumbaRooms: approved.filter(([, , ministry]) => ministry === "waumba-land").length,
    metricsPublished: false,
  }));
}

main().catch((error: unknown) => {
  // Do not emit database errors that might include connection or source data.
  console.error(error instanceof Error ? error.name + ": approved mapping operation failed" : "Approved mapping operation failed");
  process.exitCode = 1;
}).finally(() => pool.end());
