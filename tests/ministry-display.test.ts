import { describe, expect, it } from "vitest";
import type { MinistryMetric } from "@workspace/api-zod";
import {
  buildSeries,
  scopeLabel,
  seriesScopeLabel,
} from "../artifacts/northpoint-dashboard/src/lib/ministry-data";

function metric(week: string, source: string): MinistryMetric {
  return {
    measure: "attendance_headcount",
    title: "Attendance (workbook headcount)",
    scope: "service-1",
    week,
    value: 20,
    unit: "attendances",
    quality: "complete",
    denominator: null,
    flags: [],
    source,
    sourceAsOf: `${week}T12:00:00.000Z`,
    definitionVersion: "source-native-v3",
  };
}

describe("ministry service scope labels", () => {
  it("uses the approved fund category names for PCO and workbook history", () => {
    for (const source of ["pco", "workbook"])
      for (const [scope, label] of Object.entries({
        strategic: "Strategic", building: "Building", care: "Care", mosaic: "Mosaic", for: "FOR",
      }))
        expect(scopeLabel(scope, source)).toBe(label);
  });
  it("labels Fuel campaigns individually without assigning an unspecified workbook category", () => {
    for (const year of [2023, 2024, 2026, 2027])
      expect(scopeLabel(`fuel-${year}`, "pco")).toBe(`Fuel ${year}`);
    expect(scopeLabel("fuel", "workbook")).toBe("Fuel (campaign unspecified)");
  });
  it("shows the workbook's 9:30 first service without mislabelling current PCO data", () => {
    expect(scopeLabel("service-1", "workbook")).toBe("9:30 AM (workbook)");
    expect(scopeLabel("service-1", "pco")).toBe("9:00 AM");
  });

  it("identifies both service-time eras when a history table spans both sources", () => {
    const weeks = ["2026-11-01", "2026-11-08"];
    const [series] = buildSeries([
      metric(weeks[0]!, "workbook"),
      metric(weeks[1]!, "pco"),
    ]);

    expect(seriesScopeLabel(series!, weeks)).toBe(
      "First service · 9:30 AM workbook / 9:00 AM PCO",
    );
  });
});
