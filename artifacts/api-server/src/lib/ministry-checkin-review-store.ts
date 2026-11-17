import type { PoolClient } from "pg";
import type { Principal } from "./auth";
import { AccessError, adminTransaction, type AdminActor } from "./administration";
import { recordAudit } from "./audit";
import { completedSunday, sunday } from "./attendance-calculation";
import { loadCheckInReviewDates } from "./ministry-checkin-review-dates";
import {
  checkInTemplateIds,
  loadCheckInFactsForWindow,
  loadCheckInGradeFacts,
} from "./ministry-checkin-source";
import {
  checkInSourceDetails,
  findCheckInReviewCandidates,
  type CheckInResolutionAction,
} from "./ministry-checkin-review";
import {
  compileMinistryFacts,
  type SourceFact,
  type SourceMapping,
} from "./ministry-calculation";

const PAGE_SIZE = 50;
const RESOLUTION_TARGET = "pco_checkin_resolution";

type NormalizedFact = {
  sourceType: string;
  sourceId: string;
  attributes: Record<string, unknown>;
  sourceRelationships: SourceFact["relationships"];
  sourceCollection?: string | null;
};

function factFromRow(row: { normalized: NormalizedFact }): SourceFact {
  return {
    type: row.normalized.sourceType,
    id: row.normalized.sourceId,
    attributes: row.normalized.attributes ?? {},
    relationships: row.normalized.sourceRelationships ?? {},
    sourceCollection: row.normalized.sourceCollection ?? null,
  };
}

function relationshipIds(fact: SourceFact, key: string): string[] {
  const data = fact.relationships[key]?.data;
  if (!data) return [];
  return (Array.isArray(data) ? data : [data]).map((item) => item.id);
}

async function connectedAccount(c: Pick<PoolClient, "query">) {
  const result = await c.query("SELECT account_ref FROM pco_connections WHERE id='planning_center'");
  const account = result.rows[0]?.account_ref;
  if (!account) throw new AccessError(409, "No Planning Center organization");
  return String(account);
}

async function reviewMappings(
  c: Pick<PoolClient, "query">,
  account: string,
): Promise<SourceMapping[]> {
  const result = await c.query(
    `SELECT id,product,object_type AS "objectType",external_id AS "externalId",
      ministry,measure,scope,effective_from::text AS "effectiveFrom",
      effective_to::text AS "effectiveTo"
    FROM ministry_source_mappings
    WHERE account_ref=$1 AND product IN ('check_ins','groups') AND enabled
      AND id NOT IN (
        SELECT supersedes_id FROM ministry_source_mappings
        WHERE supersedes_id IS NOT NULL
      )
    ORDER BY product,object_type,external_id,id`,
    [account],
  );
  return result.rows;
}

async function latestGroupSnapshot(c: Pick<PoolClient, "query">, account: string) {
  const run = (
    await c.query(
      `SELECT id,finished_at FROM pco_sync_runs
      WHERE account_ref=$1 AND product='groups' AND status='complete'
      ORDER BY started_at DESC,id DESC LIMIT 1`,
      [account],
    )
  ).rows[0];
  if (!run?.finished_at) return { facts: [] as SourceFact[], at: null as Date | null };
  const result = await c.query(
    `SELECT jsonb_build_object(
      'sourceType',object_type,
      'sourceId',external_id,
      'attributes',CASE
        WHEN object_type='Group' THEN jsonb_build_object(
          'archived_at',normalized->'attributes'->'archived_at')
        ELSE jsonb_build_object(
          'joined_at',normalized->'attributes'->'joined_at',
          'role',normalized->'attributes'->'role')
      END,
      'sourceRelationships',normalized->'sourceRelationships',
      'sourceCollection',normalized->'sourceCollection'
    ) AS normalized
    FROM pco_source_entities
    WHERE account_ref=$1 AND product='groups'
      AND object_type IN ('Group','Membership')
      AND observed_run_id=$2 AND missing_run_id IS NULL
    LIMIT 200001`,
    [account, run.id],
  );
  if (result.rows.length > 200000)
    throw new AccessError(409, "Groups membership snapshot exceeds the safe matching limit");
  return {
    facts: result.rows.map(({ normalized: n }) => ({
      type: n.sourceType,
      id: n.sourceId,
      attributes: n.attributes ?? {},
      relationships: n.sourceRelationships ?? {},
      sourceCollection: n.sourceCollection ?? null,
    })),
    at: new Date(run.finished_at),
  };
}

function reviewMinistry(
  item: ReturnType<typeof findCheckInReviewCandidates>[number],
  mappings: SourceMapping[],
  allowGrade: boolean,
) {
  if (!item.serviceDate) return { ministry: null, ministryBasis: "unresolved" as const };
  const matched = mappings.filter(
    (mapping) =>
      mapping.product === "check_ins" &&
      mapping.measure === "attendance" &&
      mapping.effectiveFrom <= item.serviceDate! &&
      (!mapping.effectiveTo || mapping.effectiveTo >= item.serviceDate!) &&
      ((mapping.objectType === "Event" && mapping.externalId === item.eventId) ||
        (mapping.objectType === "Location" && item.locationIds.includes(mapping.externalId))),
  );
  const ministries = [...new Set(matched.map((mapping) => mapping.ministry))];
  if (ministries.length === 1)
    return { ministry: ministries[0], ministryBasis: "mapped" as const };
  if (
    allowGrade &&
    item.assumedMinistry &&
    (!ministries.length || ministries.includes(item.assumedMinistry))
  )
    return { ministry: item.assumedMinistry, ministryBasis: "grade" as const };
  return {
    ministry: null,
    ministryBasis: ministries.length > 1 ? ("ambiguous" as const) : ("unresolved" as const),
  };
}

export async function readCheckInResolutions(
  c: Pick<PoolClient, "query">,
  account: string,
): Promise<Map<string, CheckInResolutionAction>> {
  const prefix = `${account}:`;
  const result = await c.query(
    `SELECT DISTINCT ON(target_id) target_id,action
    FROM audit_events
    WHERE target_type=$1 AND target_id LIKE $2 AND action IN ($3,$4)
    ORDER BY target_id,timestamp DESC,id DESC`,
    [
      RESOLUTION_TARGET,
      `${prefix}%`,
      "ministry.checkin_include",
      "ministry.checkin_exclude",
    ],
  );
  return new Map(
    result.rows.map((row) => [
      String(row.target_id).slice(prefix.length),
      row.action === "ministry.checkin_include" ? "include" : "exclude",
    ]),
  );
}

export async function getCheckInReview(
  p: Principal,
  page: number,
  requestedDate?: string,
) {
  return adminTransaction(p, async (c) => {
    const account = await connectedAccount(c);
    const defaultDate = completedSunday(new Date());
    const selectedDate = requestedDate ?? defaultDate;
    if (
      selectedDate !== "unknown" &&
      (!/^\d{4}-\d\d-\d\d$/.test(selectedDate) || !sunday(selectedDate))
    )
      throw new AccessError(400, "Choose a Sunday or unknown service date");
    const mappings = await reviewMappings(c, account);
    const checkInRun = (
      await c.query(
        `SELECT finished_at FROM pco_sync_runs
        WHERE account_ref=$1 AND product='check_ins' AND status='complete'
        ORDER BY started_at DESC,id DESC LIMIT 1`,
        [account],
      )
    ).rows[0];
    const gradeSnapshotSunday = checkInRun?.finished_at
      ? completedSunday(new Date(checkInRun.finished_at))
      : null;
    const allowGrade = selectedDate !== "unknown" && selectedDate === gradeSnapshotSunday;
    const facts = await loadCheckInFactsForWindow(
      c,
      account,
      selectedDate === "unknown" ? null : selectedDate,
      selectedDate === "unknown" ? null : selectedDate,
      checkInTemplateIds(mappings),
      selectedDate === "unknown",
    );
    const gradeFacts = await loadCheckInGradeFacts(c, account);
    const candidates = findCheckInReviewCandidates(facts, gradeFacts);
    const resolutions = await readCheckInResolutions(c, account);
    const items = candidates.map((candidate) => {
      const displayCandidate = allowGrade
        ? candidate
        : { ...candidate, gradeLabel: null, assumedMinistry: null };
      return {
        ...displayCandidate,
        ...reviewMinistry(displayCandidate, mappings, allowGrade),
        resolution: resolutions.get(candidate.checkInId) ?? null,
      };
    });
    const groupSnapshot = await latestGroupSnapshot(c, account);
    const groupMappings = mappings.filter(
      (mapping) =>
        mapping.product === "groups" &&
        mapping.measure === "student_group_classification",
    );
    const compiledPreview =
      selectedDate === "unknown"
        ? []
        : compileMinistryFacts(
            "check_ins",
            facts,
            mappings.filter((mapping) => mapping.product === "check_ins"),
            selectedDate,
            selectedDate,
            new Date(checkInRun?.finished_at ?? Date.now()),
            resolutions,
            groupSnapshot.facts,
            groupMappings,
            groupSnapshot.at,
            gradeFacts,
            false,
          ).values.filter((value) => value.measure === "attendance");
    const attendancePreview = [...compiledPreview];
    if (selectedDate !== "unknown") {
      const previewKeys = new Set(
        attendancePreview.map((value) => `${value.ministry}|${value.scope}`),
      );
      for (const mapping of mappings) {
        if (
          mapping.product !== "check_ins" ||
          mapping.measure !== "service_session" ||
          mapping.effectiveFrom > selectedDate ||
          (mapping.effectiveTo && mapping.effectiveTo < selectedDate)
        )
          continue;
        const key = `${mapping.ministry}|${mapping.scope}`;
        if (previewKeys.has(key)) continue;
        previewKeys.add(key);
        attendancePreview.push({
          ministry: mapping.ministry,
          measure: "attendance",
          scope: mapping.scope,
          week: selectedDate,
          value: 0,
          unit: "people",
          quality: "partial",
          denominator: null,
          flags: ["checkin_attendance_subtotal"],
        });
      }
    }
    const availableSundays = await loadCheckInReviewDates(c, account);
    const dates = [
      ...new Set([
        defaultDate,
        selectedDate,
        ...availableSundays.filter((date): date is string => date !== null),
        ...(availableSundays.includes(null) ? ["unknown"] : []),
      ]),
    ].sort((a, b) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return b.localeCompare(a);
    });
    const offset = (page - 1) * PAGE_SIZE;
    await recordAudit(
      p.userId!,
      "ministry.checkin_review_read",
      "workspace",
      null,
      "success",
      c,
    );
    return {
      items: items.slice(offset, offset + PAGE_SIZE),
      page,
      pageSize: PAGE_SIZE,
      total: items.length,
      unresolved: items.filter((item) => item.resolution === null).length,
      selectedDate,
      availableSundays: dates,
      attendancePreview,
      asOf: new Date().toISOString(),
    };
  });
}

export async function resolveCheckIn(
  p: AdminActor,
  checkInId: string,
  action: CheckInResolutionAction,
) {
  return adminTransaction(p, async (c) => {
    const account = await connectedAccount(c);
    const source = await c.query(
      `SELECT normalized FROM pco_source_entities
      WHERE account_ref=$1 AND product='check_ins' AND object_type='CheckIn'
        AND external_id=$2 AND missing_run_id IS NULL LIMIT 1`,
      [account, checkInId],
    );
    if (!source.rowCount) throw new AccessError(404, "Check-In source record not found");

    if (action === "include") {
      const checkIn = factFromRow(source.rows[0]);
      const relatedIds = [
        ...relationshipIds(checkIn, "event_period"),
        ...relationshipIds(checkIn, "event_times"),
      ];
      const related = relatedIds.length
        ? await c.query(
            `SELECT normalized FROM pco_source_entities
            WHERE account_ref=$1 AND product='check_ins'
              AND object_type IN ('EventPeriod','EventTime')
              AND external_id=ANY($2::text[]) AND missing_run_id IS NULL`,
            [account, relatedIds],
          )
        : { rows: [] };
      const facts = [checkIn, ...related.rows.map(factFromRow)];
      if (!checkInSourceDetails(checkIn, facts).canInclude)
        throw new AccessError(409, "This Check-In has no usable service date or source");
    }

    await recordAudit(
      p.userId ?? null,
      action === "include" ? "ministry.checkin_include" : "ministry.checkin_exclude",
      RESOLUTION_TARGET,
      `${account}:${checkInId}`,
      "success",
      c,
    );
    return { checkInId, action };
  });
}

export const CHECK_IN_REVIEW_PAGE_SIZE = PAGE_SIZE;
