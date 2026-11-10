import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { AttendanceRevision } from "../lib/api-zod/src/index";
import {
  attendanceComparisons,
  comparisonDates,
} from "../artifacts/api-server/src/lib/attendance-comparisons";

function facts(date: string, total: number): AttendanceRevision[] {
  return ["adult_service_1", "adult_service_2"].map((slot, i) => ({
    id: randomUUID(),
    definitionId: randomUUID(),
    serviceDate: date,
    slot,
    count: i ? total - Math.floor(total / 2) : Math.floor(total / 2),
    occurrenceId: null,
    status: "recorded",
    note: "Synthetic fixture",
    source: "manual",
    reviewMethod: null,
    createdAt: `${date}T18:00:00Z`,
    previousId: null,
    valid: true,
  }));
}
const reference = (value: number) => ({
  batch_id: randomUUID(),
  source_cell: "Historical - Adults!P37",
  source_value: String(value),
});
const calc = (rows: AttendanceRevision[], anchor = "2026-01-18", n = 4, refs = [reference(1000)]) =>
  attendanceComparisons(rows, anchor, n, "2030-01-01", "2026-01-01", refs);

describe("rolling adult-attendance comparisons", () => {
  it("averages complete totals in a calendar-week window, not last N available observations", () => {
    const rows = [
      ...facts("2026-01-04", 910),
      ...facts("2026-01-11", 910),
      ...facts("2026-01-18", 831),
    ];
    expect(calc(rows).rollingAverage).toMatchObject({
      windowWeeks: 4,
      start: "2025-12-28",
      end: "2026-01-18",
      recordedWeeks: 3,
      value: 2651 / 3,
      excludedWeeks: [{ week: "2025-12-28", reason: "missing" }],
    });
    expect(calc(rows, "2026-01-18", 2).rollingAverage).toMatchObject({
      recordedWeeks: 2,
      value: 870.5,
    });
    expect(calc(rows, "2026-01-18", 1).rollingAverage.value).toBe(831);
  });
  it("includes actual zero but excludes partial, invalidated and unrecorded Sundays", () => {
    const rows = [
      ...facts("2026-03-29", 0),
      ...facts("2026-04-05", 100),
      ...facts("2026-04-12", 900),
    ];
    expect(calc(rows, "2026-04-12", 3).rollingAverage).toMatchObject({
      recordedWeeks: 2,
      value: 50,
      excludedWeeks: [{ week: "2026-04-12", reason: "unrecorded" }],
    });
    rows.push(
      ...facts("2026-04-19", 200).slice(0, 1),
      ...facts("2026-04-26", 200).map((r) => ({ ...r, valid: false })),
    );
    expect(calc(rows, "2026-04-26", 2).rollingAverage.value).toBeNull();
  });
  it("returns null for no recorded Sundays instead of zero or NaN", () => {
    expect(calc([]).rollingAverage).toMatchObject({ value: null, recordedWeeks: 0 });
    expect(calc([]).yearComparison.status).toBe("missing_current");
  });
  it("uses the accepted in-person baseline without synthesizing service observations", () => {
    const rows = facts("2026-01-18", 831);
    const y = calc(rows).yearComparison;
    expect(y).toMatchObject({
      status: "available",
      baselineYear: 2025,
      weekNumber: 3,
      baselineWeek: "2025-01-19",
      baselineValue: 1000,
      change: -169,
      percentChange: -16.900000000000002,
      source: "workbook",
      sourceCell: "Historical - Adults!P37",
    });
    expect(rows).toHaveLength(2);
  });
  it("makes missing and zero baselines explicit and refuses conflicting accepted sources", () => {
    const rows = facts("2026-01-18", 831);
    expect(calc(rows, undefined, undefined, []).yearComparison).toMatchObject({
      status: "missing_baseline",
      baselineValue: null,
      percentChange: null,
    });
    expect(calc(rows, undefined, undefined, [reference(0)]).yearComparison).toMatchObject({
      status: "zero_baseline",
      change: 831,
      percentChange: null,
    });
    expect(
      calc(rows, undefined, undefined, [reference(5), reference(6)]).yearComparison.status,
    ).toBe("conflicting_baselines");
    expect(
      calc(rows, undefined, undefined, [reference(5), reference(5)]).yearComparison.status,
    ).toBe("available");
  });
  it("will use recorded prior-year totals first and will not conceal partial corrections with workbook values", () => {
    const current = facts("2027-01-03", 900);
    const prior = facts("2026-01-04", 800);
    expect(calc([...prior, ...current], "2027-01-03").yearComparison).toMatchObject({
      source: "recorded",
      baselineValue: 800,
      change: 100,
      percentChange: 12.5,
    });
    expect(calc([prior[0], ...current], "2027-01-03").yearComparison).toMatchObject({
      status: "missing_baseline",
      source: "none",
    });
  });
  it("aligns ordinal Sundays across leap years and does not spill a 53rd Sunday into the wrong baseline year", () => {
    expect(comparisonDates("2024-01-07", 4)).toMatchObject({ prior: "2023-01-01", weekNumber: 1 });
    expect(comparisonDates("2028-12-31", 4)).toMatchObject({ prior: null, weekNumber: 53 });
  });
});
