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

/** Restricted donor signals. An absent classification is NOT a healthy donor.
 * Four distinct giving dates/three matching intervals and +/-2 calendar days
 * are the proposed consistency rule; publication must explicitly approve it.
 * A two-day consistency tolerance is not an added lapse grace period.
 */
export function analyzeGivingPatterns(
  entities: SourceFact[],
  asOf: Date,
  historyComplete: boolean,
  policy: PatternPolicy = DEFAULT_GIVING_POLICY,
  closedWeek?: string,
) {
  const today = closedWeek ?? chicagoDate(asOf);
  const parents = new Map<string, string>();
  const root = (id: string): string => {
    if (!parents.has(id)) parents.set(id, id);
    const p = parents.get(id)!;
    if (p === id) return id;
    const r = root(p);
    parents.set(id, r);
    return r;
  };
  const join = (a: string, b: string) => {
    const ra = root(a),
      rb = root(b);
    if (ra !== rb) parents.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  const first = new Map<string, string>();
  for (const e of entities) {
    if (e.type === "Person") {
      root(e.id);
      const date = day(e.attributes.first_donated_at);
      if (date) first.set(e.id, date);
    }
    if (e.type === "JointGiver" && policy.grouping === "joint_giving_unit") {
      const primary = link(e, "primary"),
        joint = link(e, "joint_giver");
      if (primary && joint) join(primary, joint);
    }
    if (e.type === "Donation") {
      const person = link(e, "person");
      if (person) root(person);
    }
  }
  const units = new Map<string, GivingUnit>(),
    giftDates = new Map<string, Set<string>>();
  for (const id of parents.keys()) {
    const key = root(id),
      u = units.get(key) ?? {
        unitId: key,
        personIds: [],
        firstRecordedAt: null,
        lastGiftDate: null,
        cadence: null,
        expectedDates: [],
        missedExpected: null,
        lapsed: null,
        reason: "insufficient_history",
      };
    u.personIds.push(id);
    const f = first.get(id);
    if (f && (!u.firstRecordedAt || f < u.firstRecordedAt)) u.firstRecordedAt = f;
    units.set(key, u);
  }
  for (const e of entities) {
    if (
      e.type !== "Donation" ||
      e.attributes.payment_status !== "succeeded" ||
      e.attributes.refunded !== false
    )
      continue;
    const person = link(e, "person"),
      date = day(e.attributes.received_at);
    if (!person || !date || date > today) continue;
    const key = root(person),
      dates = giftDates.get(key) ?? new Set<string>();
    dates.add(date);
    giftDates.set(key, dates);
  }
  const cadences: GivingCadence[] = DEFAULT_GIVING_POLICY.cadences.filter((c) =>
    policy.cadences.includes(c),
  );
  for (const [key, u] of units) {
    u.personIds.sort();
    const dates = [...(giftDates.get(key) ?? [])].sort();
    u.lastGiftDate = dates.at(-1) ?? null;
    if (!historyComplete) {
      u.reason = "historical_backfill_required";
      continue;
    }
    if (dates.length < policy.minimumGifts) {
      u.reason = "insufficient_distinct_gift_dates";
      continue;
    }
    const recent = dates.slice(-policy.minimumGifts);
    u.cadence =
      cadences.find((c) =>
        recent
          .slice(1)
          .every((d, i) => distance(d, nextDate(recent[i], c, 1)) <= policy.toleranceDays),
      ) ?? null;
    if (!u.cadence) {
      u.reason = "irregular_giving_pattern";
      continue;
    }
    u.expectedDates = Array.from({ length: policy.missedExpected }, (_, i) =>
      nextDate(recent.at(-1)!, u.cadence!, i + 1),
    );
    u.missedExpected = u.expectedDates.filter((d) => (closedWeek ? d <= today : d < today)).length;
    u.lapsed = u.missedExpected === policy.missedExpected;
    u.reason = u.lapsed ? "expected_gifts_missed" : "fewer_than_required_expected_gifts_missed";
  }
  return [...units.values()].sort((a, b) => a.unitId.localeCompare(b.unitId));
}
