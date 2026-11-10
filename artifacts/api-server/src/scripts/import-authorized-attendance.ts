import { pool } from "@workspace/db";
import { importAuthorizedWorkbook } from "../lib/attendance-workbook";
import { recordAudit } from "../lib/audit";

// Explicit management job, never startup DDL, a scheduler or an HTTP auth bypass.
// Dry-run by default. --apply records the owner's source-level instruction.
const basis =
  "Owner instruction: everything pulled from the provided workbook is accurate and should be imported and displayed where appropriate, without per-week publication steps. Retain unrecorded Sundays and source snapshot cutoff.";
const apply = process.argv.includes("--apply");
const c = await pool.connect();
try {
  await c.query("BEGIN");
  await c.query("SELECT pg_advisory_xact_lock(716102)");
  await c.query("SELECT pg_advisory_xact_lock(716104)");
  await c.query("SELECT set_config('np.role','admin',true)");
  const batches = await c.query("SELECT id,sha256 FROM import_batches WHERE state='active'");
  const definitions = await c.query(
    "SELECT id FROM attendance_definitions ORDER BY version DESC LIMIT 1",
  );
  if (batches.rowCount !== 1 || definitions.rowCount !== 1)
    throw new Error("Select exactly one active workbook and configure the adult definition first");
  const batch = batches.rows[0];
  const authority = await c.query(
    `INSERT INTO workbook_source_authorities(batch_id,sha256,basis,origin)
     VALUES($1,$2,$3,'owner_instruction') ON CONFLICT(batch_id) DO NOTHING RETURNING batch_id`,
    [batch.id, batch.sha256, basis],
  );
  const result = await importAuthorizedWorkbook(c, batch.id, definitions.rows[0].id, apply);
  // Any disagreement needs investigation, not silent overwriting/partial success.
  if (result.conflicts.length)
    throw new Error(`Import conflicts: ${JSON.stringify(result.conflicts)}`);
  if (apply && authority.rowCount)
    await recordAudit(
      null,
      "workbook.owner_source_instruction",
      "import_batch",
      batch.id,
      "success",
      c,
    );
  console.log(JSON.stringify({ applied: apply, ...result }, null, 2));
  await c.query(apply ? "COMMIT" : "ROLLBACK");
} catch (error) {
  await c.query("ROLLBACK");
  console.error(error instanceof Error ? error.message : "Import failed");
  process.exitCode = 1;
} finally {
  c.release();
  await pool.end();
}
