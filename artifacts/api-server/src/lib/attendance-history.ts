import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AttendancePromotionInput, ImportWeek } from "@workspace/api-zod";
import type { Principal } from "./auth";
import { AccessError } from "./administration";
import { evidence, validateWeekReview } from "./imports";
import { attendanceTransaction, latestRevision, requireDefinition } from "./attendance";
import { chicagoDate, SLOTS, sunday, UNRECORDED_SUNDAYS } from "./attendance-calculation";
import { recordAudit } from "./audit";

async function activeEvidence(c: PoolClient, id: string) {
  const b = await c.query(
    "SELECT snapshot_date FROM import_batches WHERE id=$1 AND state='active'",
    [id],
  );
  if (!b.rowCount) throw new AccessError(409, "Select an active workbook batch");
  return { snapshot: b.rows[0].snapshot_date, ...(await evidence(c, id)) };
}
export function historyEligible(g: ImportWeek, snapshot: string) {
  if (
    !g.approved ||
    !g.approval ||
    g.unit !== "attendance_count" ||
    !SLOTS.some((s) => s === g.target) ||
    !sunday(g.week) ||
    g.week > snapshot ||
    g.week > chicagoDate(new Date()) ||
    UNRECORDED_SUNDAYS.includes(g.week)
  )
    return false;
  try {
    validateWeekReview(g, g.approval.note, g.approval.method, true);
    return g.evidence.every(
      (e) => Number.isInteger(e.value) && e.value! >= 0 && e.value! <= 2147483647,
    );
  } catch {
    return false;
  }
}
export async function previewHistory(p: Principal, batchId: string) {
  return attendanceTransaction(p, true, false, async (c) => {
    const { report, snapshot } = await activeEvidence(c, batchId);
    await recordAudit(
      p.userId!,
      "attendance.history_preview",
      "import_batch",
      batchId,
      "success",
      c,
    );
    return {
      candidates: report.weeks
        .filter((g) => SLOTS.some((s) => s === g.target))
        .map((g) => ({
          week: g.week,
          slot: g.target,
          count: g.evidence[0]?.value ?? null,
          evidenceHash: g.evidenceHash,
          eligible: historyEligible(g, snapshot),
          reviewMethod: g.approval?.method ?? null,
          flags: g.flags,
        })),
    };
  });
}
export async function promoteHistory(
  p: Principal,
  batchId: string,
  input: AttendancePromotionInput,
) {
  if (!input.acknowledgeAuthority || input.note.trim().length < 20 || !sunday(input.week))
    throw new AccessError(
      400,
      "Confirm authority for these historical counts and explain the publication basis",
    );
  return attendanceTransaction(p, true, true, async (c) => {
    const definition = await requireDefinition(c, input.definitionId);
    if (input.week < definition.effectiveFrom)
      throw new AccessError(400, "This date precedes the attendance definition");
    const { report, snapshot } = await activeEvidence(c, batchId);
    let promoted = 0;
    for (const [index, slot] of SLOTS.entries()) {
      const groups = report.weeks.filter((g) => g.week === input.week && g.target === slot);
      const g = groups[0],
        hash = index === 0 ? input.firstHash : input.secondHash;
      if (groups.length !== 1 || !g || g.evidenceHash !== hash || !historyEligible(g, snapshot))
        throw new AccessError(
          409,
          "Historical evidence changed, conflicts, or is not eligible; reload the preview",
        );
      const prior = await latestRevision(c, definition.id, input.week, slot);
      if (prior) {
        const same = await c.query(
          "SELECT revision_id FROM attendance_lineage WHERE revision_id=$1 AND batch_id=$2 AND evidence_hash=$3",
          [prior.id, batchId, hash],
        );
        if (same.rowCount && prior.valid) continue;
        throw new AccessError(
          409,
          "Attendance already exists for this service; review its history instead of adding another source",
        );
      }
      const id = randomUUID();
      await c.query(
        `INSERT INTO attendance_revisions(id,request_id,input_hash,definition_id,service_date,slot,count,status,source,review_method,note,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,'recorded','workbook',$8,$9,$10)`,
        [
          id,
          randomUUID(),
          createHash("sha256").update(hash).digest("hex"),
          definition.id,
          input.week,
          slot,
          g.evidence[0].value,
          g.approval!.method,
          input.note.trim(),
          p.userId,
        ],
      );
      const ids = [...new Set(g.evidence.map((e) => e.mappingId))].sort();
      await c.query(
        "INSERT INTO attendance_lineage(revision_id,batch_id,evidence_hash,mapping_ids,ministry) VALUES($1,$2,$3,$4,$5)",
        [id, batchId, hash, JSON.stringify(ids), g.ministry],
      );
      await recordAudit(p.userId!, "attendance.history_promoted", "attendance", id, "success", c);
      promoted++;
    }
    return { promoted };
  });
}
