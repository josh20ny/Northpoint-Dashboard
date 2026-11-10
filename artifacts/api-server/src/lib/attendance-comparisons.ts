import type {
  AttendanceRevision,
  AttendanceRollingAverage,
  AttendanceYearComparison,
} from "@workspace/api-zod";
import { calculateWeeks, shiftDate } from "./attendance-calculation";

export type YearReference = { batch_id: string; source_cell: string; source_value: string };

export function comparisonDates(anchor: string, windowWeeks: number) {
  const year = Number(anchor.slice(0, 4));
  const firstSunday = (y: number) => {
    const jan = `${y}-01-01`;
    return shiftDate(jan, (7 - new Date(`${jan}T12:00:00Z`).getUTCDay()) % 7);
  };
  const weekNumber =
    Math.round((Date.parse(anchor) - Date.parse(firstSunday(year))) / (7 * 86400000)) + 1;
  const candidate = shiftDate(firstSunday(year - 1), (weekNumber - 1) * 7);
  return {
    start: shiftDate(anchor, -(windowWeeks - 1) * 7),
    prior: candidate.startsWith(`${year - 1}-`) ? candidate : null,
    baselineYear: year - 1,
    weekNumber,
  };
}

export function attendanceComparisons(
  revisions: AttendanceRevision[],
  anchor: string,
  windowWeeks: number,
  today: string,
  effectiveFrom: string,
  references: YearReference[],
): {
  rollingAverage: AttendanceRollingAverage;
  yearComparison: AttendanceYearComparison;
  fourWeek: string;
  yoy: string;
} {
  const dates = comparisonDates(anchor, windowWeeks);
  const weeks = calculateWeeks(revisions, dates.start, anchor, today, effectiveFrom);
  const recorded = weeks.filter((w) => w.value !== null);
  const rollingAverage: AttendanceRollingAverage = {
    windowWeeks,
    start: dates.start,
    end: anchor,
    value: recorded.length
      ? recorded.reduce((sum, w) => sum + w.value!, 0) / recorded.length
      : null,
    recordedWeeks: recorded.length,
    excludedWeeks: weeks
      .filter((w) => w.value === null)
      .map((w) => ({ week: w.week, reason: w.quality })),
  };
  const current = weeks.at(-1)?.value ?? null;
  const canonical = dates.prior
    ? calculateWeeks(revisions, dates.prior, dates.prior, today, effectiveFrom)[0].value
    : null;
  // A partial/invalidated recorded baseline must not silently fall back to an older workbook.
  const priorFactsExist = !!dates.prior && revisions.some((r) => r.serviceDate === dates.prior);
  const candidates = dates.prior && !priorFactsExist ? references : [];
  const conflict = new Set(candidates.map((r) => Number(r.source_value))).size > 1;
  const ref = conflict ? undefined : candidates[0];
  const baseline = canonical ?? (ref ? Number(ref.source_value) : null);
  const change = current !== null && baseline !== null ? current - baseline : null;
  const status =
    current === null
      ? "missing_current"
      : conflict
        ? "conflicting_baselines"
        : baseline === null
          ? "missing_baseline"
          : baseline === 0
            ? "zero_baseline"
            : "available";
  const yearComparison: AttendanceYearComparison = {
    status,
    currentWeek: anchor,
    currentValue: current,
    baselineYear: dates.baselineYear,
    weekNumber: dates.weekNumber,
    baselineWeek: dates.prior,
    baselineValue: baseline,
    change,
    percentChange:
      change !== null && baseline !== null && baseline !== 0 ? (change / baseline) * 100 : null,
    source: canonical !== null ? "recorded" : ref ? "workbook" : "none",
    sourceCell: ref?.source_cell ?? null,
    sourceBatchId: ref?.batch_id ?? null,
    alignment: ref
      ? "Workbook-aligned week; historical in-person total, not a per-service split."
      : "Same numbered Sunday in the previous calendar year; not the same calendar date.",
  };
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const fourWeek =
    rollingAverage.value === null
      ? `No complete recorded Sundays in this ${windowWeeks}-week window.`
      : `${fmt(rollingAverage.value)} · ${recorded.length} of ${windowWeeks} Sundays recorded`;
  const yoy =
    status === "available"
      ? `${yearComparison.percentChange! > 0 ? "+" : ""}${fmt(yearComparison.percentChange!)}% vs ${dates.baselineYear} week ${dates.weekNumber} (${fmt(baseline!)})`
      : status === "missing_current"
        ? "Current Sunday is incomplete or unrecorded; no year-over-year comparison."
        : status === "conflicting_baselines"
          ? "Accepted historical sources disagree; review the prior-year baseline."
          : status === "zero_baseline"
            ? `${fmt(change!)} change vs ${dates.baselineYear}; percentage is undefined from a zero baseline.`
            : `No comparable ${dates.baselineYear} attendance for week ${dates.weekNumber}. Import the prior-year workbook if needed.`;
  return { rollingAverage, yearComparison, fourWeek, yoy };
}
