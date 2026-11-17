import type { SourceFact } from "./ministry-calculation";
import { chicagoDate, shiftDate } from "./attendance-calculation";

export const GIVING_PATTERN_VERSION = "recorded-event-three-misses-v1";
export type GivingCadence = "weekly" | "every_other_week" | "monthly" | "quarterly" | "annual";
export interface PatternPolicy {
  minimumGifts: number;
  toleranceDays: number;
  missedExpected: number;
  grouping: "person" | "joint_giving_unit";
  cadences: GivingCadence[];
}
export const DEFAULT_GIVING_POLICY: PatternPolicy = {
  minimumGifts: 4,
  toleranceDays: 2,
  missedExpected: 3,
  grouping: "joint_giving_unit",
  cadences: ["weekly", "every_other_week", "monthly", "quarterly", "annual"],
};
export interface GivingUnit {
  unitId: string;
  personIds: string[];
  firstRecordedAt: string | null;
  lastGiftDate: string | null;
  cadence: GivingCadence | null;
  expectedDates: string[];
  missedExpected: number | null;
  lapsed: boolean | null;
  reason: string;
}
export interface GivingWeekSummary {
  week: string;
  firstTimeGivers: number | null;
  lapsedGivers: number | null;
  lapsedDenominator: number;
  personMetadata: boolean;
  linkageComplete: boolean;
}
export interface GivingPatternAnalysis {
  givingUnits: GivingUnit[];
  weeks: GivingWeekSummary[];
}

type IndexedUnit = {
  unitId: string;
  personIds: string[];
  firstRecordedAt: string | null;
  giftDates: string[];
  linkageUnavailable: boolean;
};

const day = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? chicagoDate(new Date(value))
    : null;
const link = (e: SourceFact, key: string) => {
  const d = e.relationships[key]?.data;
  return d && !Array.isArray(d) ? d.id : null;
};
function nextDate(date: string, cadence: GivingCadence, times: number) {
  if (cadence === "weekly" || cadence === "every_other_week")
    return shiftDate(date, times * (cadence === "weekly" ? 7 : 14));
  const [year, month, d] = date.split("-").map(Number);
  const months = times * (cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12);
  const target = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
const distance = (a: string, b: string) =>
  Math.abs(+new Date(`${a}T12:00:00Z`) - +new Date(`${b}T12:00:00Z`)) / 86400000;

function indexGivingUnits(entities: SourceFact[], policy: PatternPolicy) {
  const parents = new Map<string, string>();
  const root = (id: string): string => {
    if (!parents.has(id)) parents.set(id, id);
    const parent = parents.get(id)!;
    if (parent === id) return id;
    const result = root(parent);
    parents.set(id, result);
    return result;
  };
  const join = (a: string, b: string) => {
    const aRoot = root(a);
    const bRoot = root(b);
    if (aRoot !== bRoot)
      parents.set(aRoot < bRoot ? bRoot : aRoot, aRoot < bRoot ? aRoot : bRoot);
  };
  const firstDates = new Map<string, string>();
  for (const entity of entities) {
    if (entity.type === "Person") {
      root(entity.id);
      const firstDate = day(entity.attributes.first_donated_at);
      if (firstDate) firstDates.set(entity.id, firstDate);
    }
    if (entity.type === "JointGiver" && policy.grouping === "joint_giving_unit") {
      const primary = link(entity, "primary");
      const joint = link(entity, "joint_giver");
      if (primary && joint) join(primary, joint);
    }
    if (entity.type === "Donation") {
      const person = link(entity, "person");
      if (person) root(person);
    }
  }

  const unavailable = new Set<string | null>(
    entities
      .filter(
        (entity) =>
          entity.type === "JointGiver" &&
          entity.attributes.linkage_unavailable === true,
      )
      .map((entity) => link(entity, "primary")),
  );
  const units = new Map<
    string,
    { personIds: string[]; firstRecordedAt: string | null; giftDates: Set<string> }
  >();
  for (const id of parents.keys()) {
    const unitId = root(id);
    const unit = units.get(unitId) ?? {
      personIds: [],
      firstRecordedAt: null,
      giftDates: new Set<string>(),
    };
    unit.personIds.push(id);
    const firstDate = firstDates.get(id);
    if (firstDate && (!unit.firstRecordedAt || firstDate < unit.firstRecordedAt))
      unit.firstRecordedAt = firstDate;
    units.set(unitId, unit);
  }

  for (const entity of entities) {
    if (
      entity.type !== "Donation" ||
      entity.attributes.payment_status !== "succeeded" ||
      entity.attributes.refunded !== false
    )
      continue;
    const person = link(entity, "person");
    const giftDate = day(entity.attributes.received_at);
    if (!person || !giftDate) continue;
    units.get(root(person))?.giftDates.add(giftDate);
  }

  const indexed = [...units.entries()].map(([unitId, unit]): IndexedUnit => {
    const personIds = unit.personIds.sort();
    return {
      unitId,
      personIds,
      firstRecordedAt: unit.firstRecordedAt,
      giftDates: [...unit.giftDates].sort(),
      linkageUnavailable:
        policy.grouping === "joint_giving_unit" &&
        personIds.some((id) => unavailable.has(id)),
    };
  });
  return {
    units: indexed,
    personMetadata: entities.some((entity) => entity.type === "Person"),
    linkageComplete: indexed.every((unit) => !unit.linkageUnavailable),
    cadences: DEFAULT_GIVING_POLICY.cadences.filter((cadence) =>
      policy.cadences.includes(cadence),
    ),
  };
}

function datesThrough(dates: string[], through: string) {
  let low = 0;
  let high = dates.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (dates[middle]! <= through) low = middle + 1;
    else high = middle;
  }
  return low;
}

function cadenceFor(recent: string[], cadences: GivingCadence[], policy: PatternPolicy) {
  return (
    cadences.find((cadence) =>
      recent
        .slice(1)
        .every(
          (date, index) =>
            distance(date, nextDate(recent[index]!, cadence, 1)) <=
            policy.toleranceDays,
        ),
    ) ?? null
  );
}

function classifyUnit(
  unit: IndexedUnit,
  through: string,
  historyComplete: boolean,
  policy: PatternPolicy,
  cadences: GivingCadence[],
  closedWeek?: string,
): GivingUnit {
  const unitResult: GivingUnit = {
    unitId: unit.unitId,
    personIds: unit.personIds,
    firstRecordedAt: unit.firstRecordedAt,
    lastGiftDate: null,
    cadence: null,
    expectedDates: [],
    missedExpected: null,
    lapsed: null,
    reason: "insufficient_history",
  };
  const count = datesThrough(unit.giftDates, through);
  const dates = unit.giftDates.slice(0, count);
  unitResult.lastGiftDate = dates.at(-1) ?? null;
  if (unit.linkageUnavailable) {
    unitResult.firstRecordedAt = null;
    unitResult.reason = "joint_giver_linkage_unavailable";
    return unitResult;
  }
  if (!historyComplete) {
    unitResult.reason = "historical_backfill_required";
    return unitResult;
  }
  if (dates.length < policy.minimumGifts) {
    unitResult.reason = "insufficient_distinct_gift_dates";
    return unitResult;
  }
  const recent = dates.slice(-policy.minimumGifts);
  unitResult.cadence = cadenceFor(recent, cadences, policy);
  if (!unitResult.cadence) {
    unitResult.reason = "irregular_giving_pattern";
    return unitResult;
  }
  unitResult.expectedDates = Array.from({ length: policy.missedExpected }, (_, index) =>
    nextDate(recent.at(-1)!, unitResult.cadence!, index + 1),
  );
  unitResult.missedExpected = unitResult.expectedDates.filter((date) =>
    closedWeek ? date <= through : date < through,
  ).length;
  unitResult.lapsed = unitResult.missedExpected === policy.missedExpected;
  unitResult.reason = unitResult.lapsed
    ? "expected_gifts_missed"
    : "fewer_than_required_expected_gifts_missed";
  return unitResult;
}

/** Restricted donor signals; absent classifications are not healthy donors. */
export function analyzeGivingPatterns(
  entities: SourceFact[],
  asOf: Date,
  historyComplete: boolean,
  policy: PatternPolicy = DEFAULT_GIVING_POLICY,
  closedWeek?: string,
) {
  const index = indexGivingUnits(entities, policy);
  const through = closedWeek ?? chicagoDate(asOf);
  return index.units
    .map((unit) =>
      classifyUnit(unit, through, historyComplete, policy, index.cadences, closedWeek),
    )
    .sort((a, b) => a.unitId.localeCompare(b.unitId));
}

/**
 * Calculates repeated weekly giving signals after indexing each source fact
 * once. The previous per-week call path rebuilt joint units and rescanned every
 * donation for each Sunday in the publication range.
 */
export function summarizeGivingPatternsByWeeks(
  entities: SourceFact[],
  asOf: Date,
  historyComplete: boolean,
  policy: PatternPolicy,
  weeks: string[],
): GivingPatternAnalysis {
  const index = indexGivingUnits(entities, policy);
  const today = chicagoDate(asOf);
  const givingUnits = index.units
    .map((unit) =>
      classifyUnit(unit, today, historyComplete, policy, index.cadences),
    )
    .sort((a, b) => a.unitId.localeCompare(b.unitId));
  const summaries = weeks.map((week) => {
    let firstTimeGivers = 0;
    let lapsedGivers = 0;
    let lapsedDenominator = 0;
    const firstTimeWindowStart = shiftDate(week, -6);
    for (const unit of index.units) {
      if (
        index.personMetadata &&
        index.linkageComplete &&
        unit.firstRecordedAt &&
        unit.firstRecordedAt <= week &&
        unit.firstRecordedAt >= firstTimeWindowStart
      )
        firstTimeGivers++;
      if (!historyComplete || unit.linkageUnavailable) continue;
      const count = datesThrough(unit.giftDates, week);
      if (count < policy.minimumGifts) continue;
      const recent = unit.giftDates.slice(Math.max(0, count - policy.minimumGifts), count);
      const cadence = cadenceFor(recent, index.cadences, policy);
      if (!cadence) continue;
      lapsedDenominator++;
      const missedExpected = Array.from({ length: policy.missedExpected }, (_, index) =>
        nextDate(recent.at(-1)!, cadence, index + 1),
      ).filter((date) => date <= week).length;
      if (missedExpected === policy.missedExpected) lapsedGivers++;
    }
    return {
      week,
      firstTimeGivers:
        index.personMetadata && index.linkageComplete ? firstTimeGivers : null,
      lapsedGivers:
        historyComplete && lapsedDenominator > 0 ? lapsedGivers : null,
      lapsedDenominator,
      personMetadata: index.personMetadata,
      linkageComplete: index.linkageComplete,
    };
  });
  return { givingUnits, weeks: summaries };
}
