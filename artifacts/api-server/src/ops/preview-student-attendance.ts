/** Read-only November 8 calculation using the publisher's staged sources. */
import { pool } from "@workspace/db";
import {
  compileMinistryFacts, type SourceFact, type SourceMapping,
} from "../lib/ministry-calculation";
import { readCheckInResolutions } from "../lib/ministry-checkin-review-store";
import { findCheckInReviewCandidates } from "../lib/ministry-checkin-review";
import {
  checkInTemplateIds,
  loadCheckInFactsForWindow,
  loadCheckInGradeFacts,
} from "../lib/ministry-checkin-source";

let stage = "connect";
async function main() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('np.role','admin',true)");
    stage = "connection";
    const connection = await c.query(
      "SELECT account_ref FROM pco_connections WHERE id='planning_center' AND state='connected'",
    );
    if (connection.rowCount !== 1) throw new Error("No connected organization");
    const account = connection.rows[0].account_ref;
    stage = "completed_snapshots";
    const runs = await c.query(
      `SELECT DISTINCT ON(product) product,id,finished_at
       FROM pco_sync_runs WHERE account_ref=$1 AND product IN ('check_ins','groups')
         AND status='complete' AND finished_at IS NOT NULL
       ORDER BY product,started_at DESC,id DESC`, [account],
    );
    const checkRun = runs.rows.find((run) => run.product === "check_ins");
    const groupRun = runs.rows.find((run) => run.product === "groups");
    if (!checkRun || !groupRun) throw new Error("Completed source snapshots required");
    stage = "source_mappings";
    const mappings = await c.query<SourceMapping>(
      `SELECT id,product,object_type AS "objectType",external_id AS "externalId",
       ministry,measure,scope,effective_from::text AS "effectiveFrom",
       effective_to::text AS "effectiveTo",enabled
       FROM ministry_source_mappings m WHERE account_ref=$1
         AND product IN ('check_ins','groups') AND enabled
         AND NOT EXISTS(SELECT 1 FROM ministry_source_mappings n WHERE n.supersedes_id=m.id)`,
      [account],
    );
    const checkInMappings = mappings.rows.filter((mapping) => mapping.product === "check_ins");
    const groupMappings = mappings.rows.filter((mapping) => mapping.product === "groups");
    stage = "checkin_sources";
    const checkInFacts = await loadCheckInFactsForWindow(
      c, account, "2026-11-08", "2026-11-08", checkInTemplateIds(checkInMappings),
    );
    stage = "grade_sources";
    const gradeFacts = await loadCheckInGradeFacts(c, account);
    stage = "group_sources";
    const groupSources = await c.query(
      `SELECT normalized FROM pco_source_entities
       WHERE account_ref=$1 AND product='groups' AND observed_run_id=$2
         AND missing_run_id IS NULL AND object_type IN ('Group','Membership')
       LIMIT 500001`,
      [account, groupRun.id],
    );
    if (groupSources.rows.length > 500000) throw new Error("Groups preview size exceeded");
    const groupFacts: SourceFact[] = groupSources.rows.map(({ normalized: n }) => ({
      type: n.sourceType, id: n.sourceId, attributes: n.attributes ?? {},
      relationships: n.sourceRelationships ?? {}, sourceCollection: n.sourceCollection ?? null,
    }));
    stage = "review_decisions";
    const resolutions = await readCheckInResolutions(c, account);
    stage = "calculation";
    const result = compileMinistryFacts(
      "check_ins", checkInFacts, checkInMappings,
      "2026-11-08", "2026-11-08", new Date(checkRun.finished_at),
      resolutions, groupFacts, groupMappings,
      new Date(groupRun.finished_at),
      gradeFacts,
    );
    // Diagnostic aggregates only: no names, profile IDs or persisted decisions.
    const reconciliation: Record<string, { rows: number; people: Set<string>; pending: number;
      classifiedStudents: Set<string> }> = {};
    const combined: Record<string, { rows: number; people: Set<string>; missingPeople: number;
      multiTimeRows: number }> = {};
    const roomBranches: Record<string, { rows: number; people: Set<string>; missing: number }> = {};
    const transitEvidence: Record<string, { rows: number; people: Set<string>; pending: number }> = {};
    const kidsRooms: Record<string, { rows: number; people: Set<string>; missing: number;
      pending: number }> = {};
    const kidsPeople: Record<string, Set<string>> = {};
    const countedKids: Record<string, Set<string>> = {};
    if (process.argv.includes("--reconcile")) {
      const links = (f: SourceFact, key: string) => {
        const data = f.relationships[key]?.data;
        return (Array.isArray(data) ? data : data ? [data] : []).map(r => r.id);
      };
      const context = checkInFacts.filter(f => f.type !== "CheckIn");
      const times = new Map(context.filter(f => f.type === "EventTime").map(f => [f.id, f]));
      const pending = new Set(findCheckInReviewCandidates(checkInFacts)
        .filter(r => !resolutions.has(r.checkInId)).map(r => r.checkInId));
      for (const fact of checkInFacts.filter(f => f.type === "CheckIn")) {
        const children = [...new Set(checkInMappings.filter(m => m.objectType === "Location" &&
          m.measure === "attendance" && links(fact, "locations").includes(m.externalId))
          .map(m => m.ministry))].sort().join("+") || "no_kids_room_mapping";
        const locationIds = links(fact, "locations");
        const hangoutIds = new Set(context.filter(f => f.type === "Location" &&
          f.attributes.name === "Hangout").map(f => f.id));
        const hasHangout = locationIds.some(id => hangoutIds.has(id));
        const hasClassroom = checkInMappings.some(m => m.objectType === "Location" &&
          m.measure === "attendance" && m.ministry === "upstreet" &&
          !hangoutIds.has(m.externalId) && locationIds.includes(m.externalId));
        for (const locationId of locationIds) {
          const mapped = checkInMappings.find(m => m.objectType === "Location" &&
            m.measure === "attendance" && ["upstreet", "waumba-land"].includes(m.ministry) &&
            m.externalId === locationId);
          if (!mapped) continue;
          const room = context.find(f => f.type === "Location" && f.id === locationId);
          // Children's room labels only; never emit child names or identifiers.
          const key = `${mapped.ministry}|${String(room?.attributes.name ?? "unnamed")}`;
          const bucket = kidsRooms[key] ??= { rows: 0, people: new Set(), missing: 0, pending: 0 };
          bucket.rows++;
          const p = links(fact, "person")[0];
          if (p) bucket.people.add(p); else bucket.missing++;
          if (pending.has(fact.id)) bucket.pending++;
        }
        for (const branch of [
          ...(hasHangout ? ["hangout"] : []), ...(hasClassroom ? ["upstreet_classrooms"] : []),
          ...(hasHangout && hasClassroom ? ["hangout_and_classroom"] : []),
        ]) {
          const b = roomBranches[branch] ??= { rows: 0, people: new Set(), missing: 0 };
          b.rows++;
          const p = links(fact, "person")[0];
          if (p) {
            b.people.add(p);
            (kidsPeople[branch] ??= new Set()).add(p);
          } else b.missing++;
        }
        const combinedKey = `${children}|${String(fact.attributes.kind).toLowerCase()}`;
        const total = combined[combinedKey] ??= { rows: 0, people: new Set(), missingPeople: 0,
          multiTimeRows: 0 };
        total.rows++;
        const person = links(fact, "person")[0];
        if (person) total.people.add(person);
        else total.missingPeople++;
        if (links(fact, "event_times").length > 1) total.multiTimeRows++;
        const isolated = pending.has(fact.id) ? null : compileMinistryFacts(
          "check_ins", [...context, fact], checkInMappings, "2026-11-08", "2026-11-08",
          new Date(checkRun.finished_at), resolutions, groupFacts, groupMappings,
          new Date(groupRun.finished_at), gradeFacts,
        );
        const linkedPerson = links(fact, "person")[0];
        if (linkedPerson) {
          for (const value of isolated?.values ?? []) {
            if (value.measure !== "attendance" ||
                !["upstreet", "waumba-land"].includes(value.ministry)) continue;
            (countedKids[`${value.ministry}|${value.scope}`] ??= new Set()).add(linkedPerson);
          }
        }
        for (const timeId of links(fact, "event_times")) {
          const starts = times.get(timeId)?.attributes.starts_at;
          const clock = typeof starts === "string" ? new Intl.DateTimeFormat("en-GB", {
            timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit",
          }).format(new Date(starts)) : "unknown";
          const kind = String(fact.attributes.kind).toLowerCase();
          const key = `${clock}|${children}|${kind}`;
          const bucket = reconciliation[key] ??= { rows: 0, people: new Set(),
            pending: 0, classifiedStudents: new Set() };
          bucket.rows++;
          const person = links(fact, "person")[0];
          if (person) bucket.people.add(person);
          if (pending.has(fact.id)) bucket.pending++;
          if (person && isolated?.values.some(v => ["transit", "insideout"].includes(v.ministry) &&
            v.measure === "attendance" && v.value === 1)) bucket.classifiedStudents.add(person);
          {
            const labels = context.filter(f => f.type === "Location" && locationIds.includes(f.id))
              .map(f => String(f.attributes.name ?? ""));
            const locationClocks = [...new Set(labels.flatMap(label => {
              if (/^9:00\b/.test(label)) return ["09:00"];
              if (/^11:00\b/.test(label)) return ["11:00"];
              return [];
            }))].sort().join("+") || "not_time_labelled";
            if (locationClocks === "not_time_labelled" && children !== "no_kids_room_mapping")
              continue;
            const evidence = transitEvidence[`${clock}|location:${locationClocks}|${children}|${kind}`] ??=
              { rows: 0, people: new Set(), pending: 0 };
            evidence.rows++;
            if (person) evidence.people.add(person);
            if (pending.has(fact.id)) evidence.pending++;
          }
        }
      }
    }
    await c.query("COMMIT");
    console.log(JSON.stringify({
      mode: "read_only_preview", date: "2026-11-08",
      studentAttendance: result.values.filter((value) =>
        ["transit","insideout"].includes(value.ministry) && value.measure === "attendance"),
      issues: result.issues, metricsPublished: false,
      ...(process.argv.includes("--reconcile") ? {
        attendance: result.values.filter(v => v.measure === "attendance"),
        reconciliation: Object.fromEntries(Object.entries(reconciliation).map(([key, v]) =>
          [key, { rows: v.rows, distinctPeople: v.people.size, pendingRows: v.pending,
            classifiedStudents: v.classifiedStudents.size }])),
        combined: Object.fromEntries(Object.entries(combined).map(([key, v]) =>
          [key, { rows: v.rows, distinctPeople: v.people.size, missingPeople: v.missingPeople,
            multiTimeRows: v.multiTimeRows }])),
        roomBranches: Object.fromEntries(Object.entries(roomBranches).map(([key, v]) =>
          [key, { rows: v.rows, distinctPeople: v.people.size, missingPeople: v.missing }])),
        kidsRooms: Object.fromEntries(Object.entries(kidsRooms).map(([key, v]) =>
          [key, { rows: v.rows, distinctPeople: v.people.size, missingPeople: v.missing,
            pendingRows: v.pending }])),
        hangoutClassroomPeopleOverlap: [...(kidsPeople.hangout ?? [])]
          .filter(p => kidsPeople.upstreet_classrooms?.has(p)).length,
        kidsWeeklyAttendance: Object.fromEntries(["upstreet", "waumba-land"].map(ministry => {
          const morning = countedKids[`${ministry}|service-1`] ?? new Set<string>();
          const late = countedKids[`${ministry}|service-2`] ?? new Set<string>();
          return [ministry, {
            distinctPeople: new Set([...morning, ...late]).size,
            attendedBothServices: [...morning].filter(p => late.has(p)).length,
          }];
        })),
        transitEvidence: Object.fromEntries(Object.entries(transitEvidence).map(([key, v]) =>
          [key, { rows: v.rows, distinctPeople: v.people.size, pending: v.pending }])),
      } : {}),
    }));
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error &&
    typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : null;
  console.error(JSON.stringify({ error: "Read-only attendance preview failed", stage, code }));
  process.exitCode = 1;
}).finally(() => pool.end());
