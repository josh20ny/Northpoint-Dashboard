import { createHash } from "node:crypto";
import type { AttendanceWeeklyInput, AttendanceWeeklyResult } from "@workspace/api-zod";
import type { Principal } from "./auth";
import { AccessError } from "./administration";
import { sunday, chicagoDate } from "./attendance-calculation";
import {
  attendanceTransaction,
  latestRevision,
  requireDefinition,
  revisionSelect,
  serializeRevision,
  saveManualInTransaction,
} from "./attendance";

function slotRequest(requestId: string, slot: string) {
  const hash = createHash("sha256").update(`weekly-attendance:${requestId}:${slot}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function saveWeekly(
  p: Principal,
  input: AttendanceWeeklyInput,
): Promise<AttendanceWeeklyResult> {
  if (!sunday(input.serviceDate) || input.serviceDate > chicagoDate(new Date()))
    throw new AccessError(400, "Choose a Sunday that is not in the future");
  return attendanceTransaction(p, false, true, async (c) => {
    const ids = [slotRequest(input.requestId, "first"), slotRequest(input.requestId, "second")];
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    // Replay before resolving mutable service configuration. The same logical
    // request remains idempotent even after service metadata changes.
    const receipts = await c.query(
      "SELECT id,request_id,input_hash,created_by FROM attendance_revisions WHERE request_id=ANY($1::uuid[])",
      [ids],
    );
    if (receipts.rowCount) {
      if (
        receipts.rowCount !== 2 ||
        receipts.rows.some((r) => r.input_hash !== hash || r.created_by !== p.userId)
      )
        throw new AccessError(409, "This save identifier was already used for different input");
      const saved = await c.query(`${revisionSelect} WHERE r.request_id=ANY($1::uuid[])`, [ids]);
      // revisionSelect deliberately doesn't expose request IDs in public output.
      const firstId = receipts.rows.find((r) => r.request_id === ids[0]).id;
      return {
        first: serializeRevision(saved.rows.find((r) => r.id === firstId)),
        second: serializeRevision(saved.rows.find((r) => r.id !== firstId)),
      };
    }
    const definition = await requireDefinition(c, input.definitionId);
    const previous = await Promise.all(
      ["adult_service_1", "adult_service_2"].map((slot) =>
        latestRevision(c, definition.id, input.serviceDate, slot),
      ),
    );
    const services = await c.query(
      "SELECT id,start_at FROM service_occurrences WHERE ministry_id=$1 AND service_date=$2 ORDER BY start_at,id FOR SHARE",
      [definition.ministryId, input.serviceDate],
    );
    const links = previous.map((r) => r?.occurrenceId ?? null);
    if (links.some((id) => id && !services.rows.some((s) => s.id === id)))
      throw new AccessError(
        409,
        "The service setup changed; review the existing service links before correcting this date",
      );
    if (
      services.rowCount === 2 &&
      services.rows[0].start_at.getTime() !== services.rows[1].start_at.getTime()
    ) {
      for (let i = 0; i < links.length; i++)
        if (!links[i]) links[i] = services.rows.find((s) => !links.includes(s.id))?.id ?? null;
    }
    const note = input.note?.trim() || "Weekly auditorium counts saved through quick entry";
    const first = await saveManualInTransaction(
      c,
      p,
      {
        ...input.first,
        requestId: ids[0],
        definitionId: definition.id,
        serviceDate: input.serviceDate,
        slot: "adult_service_1",
        occurrenceId: input.first.status === "recorded" ? links[0] : null,
        note,
      },
      { slotOnly: true, inputHash: hash },
    );
    const second = await saveManualInTransaction(
      c,
      p,
      {
        ...input.second,
        requestId: ids[1],
        definitionId: definition.id,
        serviceDate: input.serviceDate,
        slot: "adult_service_2",
        occurrenceId: input.second.status === "recorded" ? links[1] : null,
        note,
      },
      { slotOnly: true, inputHash: hash },
    );
    return { first, second };
  });
}
