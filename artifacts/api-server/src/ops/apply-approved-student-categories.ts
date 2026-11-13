/**
 * Save the owner-confirmed student ministry categories. Preview by default.
 * No PCO writes, sync changes, or metric publications.
 */
import { pool } from "@workspace/db";
import type { AdminActor } from "../lib/administration";
import { createMinistryMapping } from "../lib/ministry-data";

const approved = [
  ["Transit General", "transit"],
  ["Transit Leaders", "transit"],
  ["InsideOut General", "insideout"],
  ["InsideOut Leaders", "insideout"],
] as const;
const effectiveFrom = "2026-11-08";
const apply = process.argv.includes("--apply");
class CategoryMappingError extends Error {}

async function main() {
  const c = await pool.connect();
  let actor: AdminActor;
  const pending: { externalId: string; ministry: string }[] = [];
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    const owner = await c.query(
      `SELECT p.account_ref,u.id FROM pco_connections p
       JOIN users u ON u.id=p.connected_by
       WHERE p.id='planning_center' AND p.state='connected'
         AND u.role='admin' AND u.status='active'`,
    );
    if (owner.rowCount !== 1)
      throw new CategoryMappingError("An active Admin integration authorizer is required");
    actor = { userId: owner.rows[0].id, role: "admin" };
    const account = owner.rows[0].account_ref;
    const sources = await c.query<{ id: string; name: string }>(
      `SELECT external_id AS id,normalized->'attributes'->>'name' AS name
       FROM pco_source_entities WHERE account_ref=$1 AND product='groups'
         AND object_type='GroupType' AND missing_run_id IS NULL
         AND normalized->'attributes'->>'name'=ANY($2::text[])`,
      [account, approved.map(([name]) => name)],
    );
    const existing = await c.query<{
      external_id: string; ministry: string; scope: string;
      effective_from: string; effective_to: string | null;
    }>(
      `SELECT external_id,ministry,scope,effective_from::text,effective_to::text
       FROM ministry_source_mappings m
       WHERE account_ref=$1 AND product='groups' AND object_type='GroupType'
         AND measure='student_group_classification' AND enabled
         AND NOT EXISTS(SELECT 1 FROM ministry_source_mappings n WHERE n.supersedes_id=m.id)
         AND (effective_to IS NULL OR effective_to >= $2::date)`,
      [account, effectiveFrom],
    );
    for (const [name, ministry] of approved) {
      const source = sources.rows.filter((row) => row.name === name);
      if (source.length !== 1)
        throw new CategoryMappingError("An approved category is missing or ambiguous");
      const externalId = source[0]!.id;
      const matches = existing.rows.filter((row) => row.external_id === externalId);
      if (!matches.length) pending.push({ externalId, ministry });
      else if (!(matches.length === 1 && matches[0]!.ministry === ministry &&
        matches[0]!.scope === "all" && matches[0]!.effective_from <= effectiveFrom &&
        matches[0]!.effective_to === null))
        throw new CategoryMappingError("A category has a conflicting interpretation");
    }
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
  let created = 0;
  if (apply)
    for (const target of pending) {
      await createMinistryMapping(actor!, {
        product: "groups", objectType: "GroupType",
        externalId: target.externalId, ministry: target.ministry,
        measure: "student_group_classification", scope: "all",
        effectiveFrom, effectiveTo: null, enabled: true,
        note: "Owner confirmed student ministry categories include both students and volunteers. " +
          "Use General and Leaders categories for classification only; retain membership-role " +
          "and Check-In volunteer exclusions. Service routing remains separate. No historical backcasting.",
      });
      created++;
    }
  console.log(JSON.stringify({
    mode: apply ? "applied" : "preview", categories: approved.length,
    pending: pending.length, created, metricsPublished: false,
  }));
}

main().catch((error: unknown) => {
  console.error(error instanceof CategoryMappingError ? error.message : "Category mapping failed");
  process.exitCode = 1;
}).finally(() => pool.end());
