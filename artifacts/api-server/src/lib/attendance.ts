import { createHash, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import type { PoolClient } from "pg";
import type {
  AttendanceInput,
  AttendanceDefinitionInput,
  AttendanceRevision,
  AttendanceDefinition,
  AttendanceWorkspace,
} from "@workspace/api-zod";
import type { Principal } from "./auth";
import { AccessError, validCalendarDate } from "./administration";
import { recordAudit } from "./audit";
import {
  calculateWeeks,
  chicagoDate,
  completedSunday,
  DEFINITION_TEXT,
  shiftDate,
  sunday,
  UNRECORDED_SUNDAYS,
} from "./attendance-calculation";
import { reportingWeekEnding } from "./reporting-calendar";

export async function attendanceTransaction<T>(
  p: Principal,
  admin: boolean,
  write: boolean,
  fn: (c: PoolClient) => Promise<T>,
) {
  if (
    !p.userId ||
    !["staff", "leadership", "admin"].includes(p.role) ||
    (admin && p.role !== "admin")
  )
    throw new AccessError(403, "Forbidden");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'UTC'");
    // Same lock as source edits for Admin publication, but no global Admin lock
    // for Staff writes or aggregate reads.
    if (admin) await c.query("SELECT pg_advisory_xact_lock(716102)");
    if (write) await c.query("SELECT pg_advisory_xact_lock(716104)");
    const user = await c.query("SELECT role FROM users WHERE id=$1 AND status='active' FOR SHARE", [
      p.userId,
    ]);
    if (user.rows[0]?.role !== p.role)
      throw new AccessError(403, "Your access changed; sign in again");
    await c.query("SELECT set_config('np.role',$1,true),set_config('np.user_id',$2,true)", [
      p.role,
      p.userId,
    ]);
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const definitionSelect = `SELECT id,ministry_id AS "ministryId",effective_from::text AS "effectiveFrom",version,note,created_at AS "createdAt" FROM attendance_definitions ORDER BY version DESC LIMIT 1`;
export async function currentDefinition(c: PoolClient): Promise<AttendanceDefinition | null> {
  const r = await c.query(definitionSelect);
  return r.rowCount ? JSON.parse(JSON.stringify(r.rows[0])) : null;
}
export async function requireDefinition(c: PoolClient, id: string) {
  const definition = await currentDefinition(c);
  if (!definition || definition.id !== id)
    throw new AccessError(409, "Attendance setup changed; reload before saving");
  return definition;
}
export const revisionSelect = `SELECT r.id,r.definition_id AS "definitionId",r.service_date::text AS "serviceDate",
 r.slot,r.occurrence_id AS "occurrenceId",r.count,r.status,r.note,r.source,r.review_method AS "reviewMethod",
 r.created_at AS "createdAt",r.previous_id AS "previousId",
 (np_attendance_source_valid(r.id) AND
 (r.occurrence_id IS NULL OR EXISTS (SELECT 1 FROM service_occurrences s
 WHERE s.id=r.occurrence_id AND jsonb_build_object('ministryId',s.ministry_id,'serviceDate',s.service_date::text,'startAt',s.start_at)=r.occurrence_snapshot))) AS valid
 FROM attendance_revisions r`;
export function serializeRevision(row: unknown): AttendanceRevision {
  return JSON.parse(JSON.stringify(row));
}
export async function latestRevision(
  c: PoolClient,
  definitionId: string,
  date: string,
  slot: string,
) {
  const r = await c.query(
    `${revisionSelect} WHERE r.definition_id=$1 AND r.service_date=$2 AND r.slot=$3 AND NOT EXISTS (SELECT 1 FROM attendance_revisions child WHERE child.previous_id=r.id) LIMIT 1`,
    [definitionId, date, slot],
  );
  return r.rowCount ? serializeRevision(r.rows[0]) : null;
}
export async function readAttendance(
  p: Principal,
  start?: string,
  end?: string,
  definitionId?: string,
): Promise<AttendanceWorkspace> {
  const now = new Date(),
    latest = completedSunday(now);
  const from = start ?? shiftDate(latest, -84),
    to = end ?? reportingWeekEnding(now);
  if (!sunday(from) || !sunday(to) || from > to || shiftDate(from, 735) < to)
    throw new AccessError(400, "Choose Sunday dates spanning no more than two years");
  return attendanceTransaction(p, false, false, async (c) => {
    const definitions: AttendanceDefinition[] = JSON.parse(
      JSON.stringify((await c.query(definitionSelect.replace(" LIMIT 1", ""))).rows),
    );
    const definition = definitionId
      ? (definitions.find((d) => d.id === definitionId) ?? null)
      : (definitions[0] ?? null);
    if (definitionId && !definition) throw new AccessError(404, "Attendance definition not found");
    const ministries =
      p.role === "admin"
        ? (await c.query("SELECT id,name FROM ministries ORDER BY name")).rows
        : [];
    const services = definition
      ? (
          await c.query(
            `SELECT id,service_date::text AS "serviceDate",start_at AS "startAt" FROM service_occurrences WHERE ministry_id=$1 AND service_date BETWEEN $2 AND $3 ORDER BY start_at LIMIT 1000`,
            [definition.ministryId, from, to],
          )
        ).rows
      : [];
    // Fetch current observations independently of bounded revision history so an
    // extensively corrected week cannot hide another week's current value.
    const allCurrent = definition
      ? (
          await c.query(
            `SELECT r.id FROM attendance_revisions r WHERE r.definition_id=$1 AND r.service_date BETWEEN $2 AND $3 AND NOT EXISTS (SELECT 1 FROM attendance_revisions child WHERE child.previous_id=r.id)`,
            [definition.id, from, to],
          )
        ).rows.map((r) => r.id)
      : [];
    const current: AttendanceRevision[] = allCurrent.length
      ? (
          await c.query(
            `${revisionSelect} WHERE r.id=ANY($1::uuid[]) ORDER BY r.created_at DESC,r.id DESC`,
            [allCurrent],
          )
        ).rows.map(serializeRevision)
      : [];
    const history = definition
      ? (
          await c.query(
            `${revisionSelect} WHERE r.definition_id=$1 AND r.service_date BETWEEN $2 AND $3 ORDER BY r.created_at DESC,r.id DESC LIMIT 1001`,
            [definition.id, from, to],
          )
        ).rows.map(serializeRevision)
      : [];
    const revisions = [
      ...current,
      ...history.slice(0, 1000).filter((h) => !current.some((r) => r.id === h.id)),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    await recordAudit(p.userId!, "attendance.read", "attendance", null, "success", c);
    return JSON.parse(
      JSON.stringify({
        definition,
        definitions,
        isCurrentDefinition: !!definition && definition.id === definitions[0]?.id,
        ministries,
        services,
        revisions,
        weeks: calculateWeeks(
          current,
          from,
          to,
          chicagoDate(now),
          definition?.effectiveFrom ?? "9999-12-31",
        ),
        asOf: now.toISOString(),
        timezone: "America/Chicago",
        metricSlug: "adult_in_person_attendance",
        definitionText: DEFINITION_TEXT,
        fourWeek:
          "Unavailable: averaging and incomplete-week policies need owner approval. Unrecorded Sundays are never zero-filled.",
        yoy: "Unavailable: year-over-year alignment policy is not approved.",
        latestCompletedWeek: latest,
        start: from,
        end: to,
        historyTruncated: history.length > 1000,
      }),
    );
  });
}
export async function saveDefinition(p: Principal, input: AttendanceDefinitionInput) {
  if (!validCalendarDate(input.effectiveFrom) || input.note.trim().length < 20)
    throw new AccessError(400, "Enter a valid effective date and source-basis note");
  return attendanceTransaction(p, true, true, async (c) => {
    const m = await c.query(
      "SELECT id FROM ministries WHERE id=$1 AND (active_from IS NULL OR active_from<=$2) AND (active_to IS NULL OR active_to>=$2)",
      [input.ministryId, input.effectiveFrom],
    );
    if (!m.rowCount) throw new AccessError(400, "Select a ministry active on the effective date");
    // No arbitrary formula editor; each new definition deliberately invalidates
    // prior current read models while retaining their facts and version history.
    const version = (await currentDefinition(c))?.version ?? 0;
    await c.query(
      "INSERT INTO attendance_definitions(ministry_id,effective_from,version,note,created_by) VALUES($1,$2,$3,$4,$5)",
      [input.ministryId, input.effectiveFrom, version + 1, input.note.trim(), p.userId],
    );
    await recordAudit(p.userId!, "attendance.definition_created", "attendance", null, "success", c);
    return (await currentDefinition(c))!;
  });
}
export async function saveManual(p: Principal, input: AttendanceInput) {
  if (!sunday(input.serviceDate) || input.serviceDate > chicagoDate(new Date()))
    throw new AccessError(400, "Actual attendance requires a Sunday that is not in the future");
  if (
    input.note.trim().length < 3 ||
    (input.status === "recorded"
      ? !Number.isInteger(input.count) || input.count! < 0 || !input.occurrenceId
      : input.count !== null)
  )
    throw new AccessError(
      400,
      "Recorded attendance needs an eligible service and count; unrecorded attendance must have no count",
    );
  if (UNRECORDED_SUNDAYS.includes(input.serviceDate) && input.status !== "unrecorded")
    throw new AccessError(400, "This online-only Sunday is unrecorded, not zero");
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return attendanceTransaction(p, false, true, async (c) => {
    const def = await requireDefinition(c, input.definitionId);
    const replay = await c.query(`${revisionSelect} WHERE r.request_id=$1`, [input.requestId]);
    if (replay.rowCount) {
      const original = await c.query(
        "SELECT input_hash,created_by FROM attendance_revisions WHERE request_id=$1",
        [input.requestId],
      );
      if (original.rows[0].input_hash !== inputHash || original.rows[0].created_by !== p.userId)
        throw new AccessError(409, "This request identifier was already used for different input");
      return serializeRevision(replay.rows[0]);
    }
    if (input.serviceDate < def.effectiveFrom)
      throw new AccessError(400, "This date precedes the attendance definition");
    const previous = await latestRevision(c, def.id, input.serviceDate, input.slot);
    if ((previous?.id ?? null) !== input.expectedRevision)
      throw new AccessError(409, "Attendance changed; reload before correcting it");
    let snapshot = null;
    if (input.occurrenceId) {
      const service = await c.query(
        `SELECT jsonb_build_object('ministryId',ministry_id,'serviceDate',service_date::text,'startAt',start_at) AS snapshot FROM service_occurrences WHERE id=$1 AND ministry_id=$2 AND service_date=$3`,
        [input.occurrenceId, def.ministryId, input.serviceDate],
      );
      if (!service.rowCount)
        throw new AccessError(400, "Select a configured adult service on this Sunday");
      const other = await latestRevision(
        c,
        def.id,
        input.serviceDate,
        input.slot === "adult_service_1" ? "adult_service_2" : "adult_service_1",
      );
      if (other?.occurrenceId === input.occurrenceId)
        throw new AccessError(409, "The same service cannot fill both attendance slots");
      snapshot = service.rows[0].snapshot;
    }
    const id = randomUUID();
    await c.query(
      `INSERT INTO attendance_revisions(id,request_id,input_hash,definition_id,service_date,slot,occurrence_id,occurrence_snapshot,count,status,source,note,previous_id,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual',$11,$12,$13)`,
      [
        id,
        input.requestId,
        inputHash,
        def.id,
        input.serviceDate,
        input.slot,
        input.occurrenceId,
        snapshot,
        input.count,
        input.status,
        input.note.trim(),
        input.expectedRevision,
        p.userId,
      ],
    );
    await recordAudit(
      p.userId!,
      previous ? "attendance.corrected" : "attendance.recorded",
      "attendance",
      id,
      "success",
      c,
    );
    return (await latestRevision(c, def.id, input.serviceDate, input.slot))!;
  });
}
