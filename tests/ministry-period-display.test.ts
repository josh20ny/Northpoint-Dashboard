import { describe, expect, it } from "vitest";
import type { MinistryMetric } from "@workspace/api-client-react";
import { buildSeries, formatMonthLabel, monthsDesc, seriesKey } from "../artifacts/northpoint-dashboard/src/lib/ministry-data";

function metric(period: "week" | "month", week: string): MinistryMetric {
  return {
    measure: "legacy_giving_people",
    title: "Giving people (workbook)",
    scope: "all",
    week,
    period,
    value: 10,
    unit: "people",
    quality: "complete",
    denominator: null,
    flags: [],
    source: "workbook",
    sourceAsOf: "2026-11-07T12:00:00.000Z",
    definitionVersion: "test",
  };
}

describe("ministry history periods", () => {
  it("does not merge weekly and monthly series with the same measure and unit", () => {
    const weekly = metric("week", "2026-01-04");
    const monthly = metric("month", "2026-01-01");

    expect(seriesKey(weekly)).not.toBe(seriesKey(monthly));
    expect(buildSeries([weekly, monthly])).toHaveLength(2);
    expect(monthsDesc(buildSeries([monthly]))).toEqual(["2026-01-01"]);
    expect(formatMonthLabel("2026-01-01")).toBe("January 2026");
  });
});
