import { chicagoDate } from "./attendance-calculation";
import type { SourceFact } from "./ministry-calculation";

export type CheckInResolutionAction = "include" | "exclude";

export type CheckInIssueReason =
  | "missing_person_profile"
  | "missing_service_period"
  | "missing_service_date"
  | "unknown_checkin_kind"
  | "possible_duplicate_checkin";

export interface CheckInReviewCandidate {
  checkInId: string;
  serviceDate: string | null;
  eventId: string | null;
  locationIds: string[];
  issueReasons: CheckInIssueReason[];
  canInclude: boolean;
}

export interface CheckInSourceDetails {
  serviceDate: string | null;
  eventId: string | null;
  locationIds: string[];
  canInclude: boolean;
}

function relationIds(fact: SourceFact | undefined, key: string): string[] {
  const data = fact?.relationships[key]?.data;
  if (!data) return [];
  return (Array.isArray(data) ? data : [data]).map((item) => item.id);
}

const relationId = (fact: SourceFact | undefined, key: string) => relationIds(fact, key)[0] ?? null;
const dateInstant = (value: unknown): Date | null =>
  typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value))
    ? new Date(value)
    : null;

function sourceDetailsFromMaps(
  fact: SourceFact,
  periods: Map<string, SourceFact>,
  times: Map<string, SourceFact>,
): CheckInSourceDetails {
  const periodId = relationId(fact, "event_period");
  const period = periodId ? periods.get(periodId) : undefined;
  const eventTimeFacts = relationIds(fact, "event_times")
    .map((id) => times.get(id))
    .filter((item): item is SourceFact => !!item);
  const date =
    eventTimeFacts
      .map((item) => dateInstant(item.attributes.starts_at))
      .filter((item): item is Date => !!item)
      .sort((a, b) => +a - +b)[0] ??
    (period ? dateInstant(period.attributes.starts_at) : null);
  const eventId =
    relationId(period, "event") ??
    eventTimeFacts.map((item) => relationId(item, "event")).find(Boolean) ??
    null;
  const locationIds = relationIds(fact, "locations").sort();
  return {
    serviceDate: date ? chicagoDate(date) : null,
    eventId,
    locationIds,
    canInclude: !!date && !!period && (!!eventId || locationIds.length > 0),
  };
}

export function checkInSourceDetails(fact: SourceFact, facts: SourceFact[]): CheckInSourceDetails {
  return sourceDetailsFromMaps(
    fact,
    new Map(facts.filter((item) => item.type === "EventPeriod").map((item) => [item.id, item])),
    new Map(facts.filter((item) => item.type === "EventTime").map((item) => [item.id, item])),
  );
}

export function findCheckInReviewCandidates(facts: SourceFact[]): CheckInReviewCandidate[] {
  const checkIns = facts.filter((fact) => fact.type === "CheckIn");
  const periods = new Map(
    facts.filter((fact) => fact.type === "EventPeriod").map((fact) => [fact.id, fact]),
  );
  const times = new Map(
    facts.filter((fact) => fact.type === "EventTime").map((fact) => [fact.id, fact]),
  );
  const duplicateGroups = new Map<string, string[]>();

  for (const fact of checkIns) {
    const personId = relationId(fact, "person");
    const periodId = relationId(fact, "event_period");
    if (!personId || !periodId) continue;
    const key = JSON.stringify([
      personId,
      periodId,
      String(fact.attributes.kind ?? "").toLowerCase(),
      relationIds(fact, "event_times").sort(),
      relationIds(fact, "locations").sort(),
    ]);
    const group = duplicateGroups.get(key) ?? [];
    group.push(fact.id);
    duplicateGroups.set(key, group);
  }

  const duplicateIds = new Set<string>();
  for (const ids of duplicateGroups.values()) {
    if (ids.length < 2) continue;
    ids.sort((a, b) => a.localeCompare(b));
    for (const id of ids.slice(1)) duplicateIds.add(id);
  }

  const candidates: CheckInReviewCandidate[] = [];
  for (const fact of checkIns) {
    const personId = relationId(fact, "person");
    const periodId = relationId(fact, "event_period");
    const period = periodId ? periods.get(periodId) : undefined;
    const details = sourceDetailsFromMaps(fact, periods, times);
    const kind = String(fact.attributes.kind ?? "").toLowerCase();
    const reasons: CheckInIssueReason[] = [];
    if (!personId) reasons.push("missing_person_profile");
    if (!period) reasons.push("missing_service_period");
    if (!details.serviceDate) reasons.push("missing_service_date");
    if (!["regular", "guest", "volunteer"].includes(kind))
      reasons.push("unknown_checkin_kind");
    if (duplicateIds.has(fact.id)) reasons.push("possible_duplicate_checkin");
    if (!reasons.length) continue;

    candidates.push({
      checkInId: fact.id,
      serviceDate: details.serviceDate,
      eventId: details.eventId,
      locationIds: details.locationIds,
      issueReasons: reasons,
      canInclude: details.canInclude,
    });
  }
  return candidates.sort((a, b) => {
    const dateOrder = (b.serviceDate ?? "").localeCompare(a.serviceDate ?? "");
    return dateOrder || a.checkInId.localeCompare(b.checkInId);
  });
}
