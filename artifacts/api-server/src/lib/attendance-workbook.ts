import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { evidence } from "./imports";
import { latestRevision, requireDefinition } from "./attendance";
import { chicagoDate, sunday, UNRECORDED_SUNDAYS, SLOTS } from "./attendance-calculation";
import { recordAudit } from "./audit";
import { AccessError } from "./administration";

// Called inside a trusted Admin/system transaction with source + attendance
// locks. Never creates per-week reviews or attributes automation to a user.
export async function importAuthorizedWorkbook(
  c: PoolClient,
  batchId: string,
  definitionId: string,
  apply: boolean,
) {
  const definition = await requireDefinition(c, definitionId);
  const accepted = await c.query(
    `SELECT b.snapshot_date,a.basis FROM import_batches b
     JOIN workbook_source_authorities a ON a.batch_id=b.id AND a.sha256=b.sha256
     WHERE b.id=$1 AND b.state='active'`,
    [batchId],
  );
  if (!accepted.rowCount) throw new AccessError(409, "Workbook source has not been accepted");
  const { snapshot_date: snapshot, basis } = accepted.rows[0];
  const { report } = await evidence(c, batchId);
  const result = {
    imported: 0,
    unchanged: 0,
    excluded: [] as { week: string; slot: string; reason: string }[],
    conflicts: [] as { week: string; slot: string }[],
  };
  for (const g of report.weeks.filter((g) => SLOTS.some((slot) => slot === g.target))) {
    const exclude = (reason: string) =>
      result.excluded.push({ week: g.week, slot: g.target, reason });
    if (!sunday(g.week)) {
      exclude("invalid date");
      continue;
    }
    if (g.week > snapshot || g.week > chicagoDate(new Date())) {
      exclude("future at source snapshot");
      continue;
    }
    if (g.week < definition.effectiveFrom) {
      exclude("before definition");
      continue;
    }
    if (UNRECORDED_SUNDAYS.includes(g.week)) {
      exclude("online-only / unrecorded");
      continue;
    }
    // A trusted workbook is not permission to turn an unreadable value into a
    // number, execute Excel formulas, conflate duplicate source groups, or guess
    // historical service times.
    if (
      g.unit !== "attendance_count" ||
      g.evidence.length !== 1 ||
      !Number.isInteger(g.evidence[0].value) ||
      g.evidence[0].value! < 0 ||
      g.evidence[0].value! > 2147483647 ||
      g.flags.some((flag) =>
        /forecast|conflict|duplicate|unsafe_numeric|invalid|non_numeric|error/.test(flag),
      )
    ) {
      exclude("unreadable or conflicting source evidence");
      continue;
    }
    const prior = await latestRevision(c, definition.id, g.week, g.target);
    if (prior) {
      const same = await c.query(
        "SELECT 1 FROM attendance_lineage WHERE revision_id=$1 AND batch_id=$2 AND evidence_hash=$3",
        [prior.id, batchId, g.evidenceHash],
      );
      if (same.rowCount && prior.valid) {
        result.unchanged++;
        continue;
      }
      const sameBatch = await c.query(
        "SELECT 1 FROM attendance_lineage WHERE revision_id=$1 AND batch_id=$2",
        [prior.id, batchId],
      );
      // Never overwrite a manually corrected value or a different source.
      if (prior.source !== "workbook" || prior.valid || !sameBatch.rowCount) {
        result.conflicts.push({ week: g.week, slot: g.target });
        continue;
      }
    }
    result.imported++;
    if (!apply) continue;
    const id = randomUUID();
    await c.query(
      `INSERT INTO attendance_revisions(id,request_id,input_hash,definition_id,service_date,slot,count,status,source,review_method,note,created_by,previous_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,'recorded','workbook','workbook_authoritative',$8,NULL,$9)`,
      [
        id,
        randomUUID(),
        createHash("sha256").update(g.evidenceHash).digest("hex"),
        definition.id,
        g.week,
        g.target,
        g.evidence[0].value,
        basis,
        prior?.id ?? null,
      ],
    );
    await c.query(
      "INSERT INTO attendance_lineage(revision_id,batch_id,evidence_hash,mapping_ids,ministry) VALUES($1,$2,$3,$4,$5)",
      [
        id,
        batchId,
        g.evidenceHash,
        JSON.stringify([...new Set(g.evidence.map((e) => e.mappingId))].sort()),
        g.ministry,
      ],
    );
    await recordAudit(null, "attendance.workbook_imported", "attendance", id, "success", c);
  }
  return result;
}
