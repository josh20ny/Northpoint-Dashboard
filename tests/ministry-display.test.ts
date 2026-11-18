import { describe, expect, it } from "vitest";
import type { MinistryMetric } from "@workspace/api-zod";
import {
  buildSeries,
  scopeLabel,
  seriesScopeLabel,
  isGuestServicesSeries,
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
  it("shows only LU weekly and Safety scheduling on Connection, never shared Kids’ Check-In or workbook totals", () => {
    for (const measure of ["scheduled", "accepted"]) {
      expect(isGuestServicesSeries({ measure, scope: "guest-services" })).toBe(true);
      expect(isGuestServicesSeries({ measure, scope: "safety-team" })).toBe(true);
      expect(isGuestServicesSeries({ measure, scope: "kids-checkin" })).toBe(false);
      expect(isGuestServicesSeries({ measure, scope: "all" })).toBe(false);
    }
    expect(isGuestServicesSeries({ measure: "guest_services_volunteers", scope: "guest-services" })).toBe(false);
  });
  it("keeps shared Kids’ Check-In and the Guest Services teams distinctly labelled", () => {
    expect(scopeLabel("kids-checkin", "pco")).toBe("Kids’ Check-In · shared team");
    expect(scopeLabel("guest-services", "pco")).toBe("Guest Services · LU weekly team");
    expect(scopeLabel("safety-team", "pco")).toBe("Guest Services · Safety team");
  });
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

  it("keeps source-labeled workbook metrics as separate titled series", () => {
    const measures = [
      ["workbook_total_group_attendance", "Total group attendance · workbook"],
      ["workbook_group_member_attendance", "Group member attendance · workbook"],
      ["workbook_group_count_2025", "Group count · 2025 workbook"],
      ["workbook_group_count_2026", "Group count · 2026 workbook"],
    ] as const;
    const series = buildSeries(
      measures.map(([measure, title]) => ({
        ...metric("2026-11-01", "workbook"),
        measure,
        title,
      })),
    );

    expect(series.map(({ measure, title }) => [measure, title])).toEqual(
      expect.arrayContaining(measures.map(([measure, title]) => [measure, title])),
    );
    expect(series).toHaveLength(measures.length);
  });
});
