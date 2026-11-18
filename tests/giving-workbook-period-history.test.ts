import { describe, expect, it } from "vitest";
import { buildGivingWorkbookPeriodHistory } from "../artifacts/api-server/src/lib/giving-workbook-period-history";
import type { Catalog, WorkbookCell } from "../artifacts/api-server/src/lib/workbook";

function cell(coordinate: string, value: string | null, formula: string | null = null): WorkbookCell {
  const match = /^([A-Z]+)(\d+)$/.exec(coordinate)!;
  return {
    coordinate,
    row: Number(match[2]),
    column: match[1]!,
    type: "n",
    value: formula ? null : value,
    formula,
    cachedValue: formula ? value : null,
    style: null,
    flags: formula ? ["formula_unverified"] : [],
  };
}

function sourceCells() {
  const cells = new Map<string, WorkbookCell>();
  const set = (coordinate: string, value: string | null, formula: string | null = null) =>
    cells.set(coordinate, cell(coordinate, value, formula));
  set("B99", "Monthly Recurring Gifts");
  set("A100", "Month");
  for (const [coordinate, year] of Object.entries({ B100: 2022, C100: 2023, E100: 2024, G100: 2025 }))
    set(coordinate, String(year));
  set("B116", "Giving Units per week");
  set("I116", "Giving Units per month");
  set("A117", "Date");
  set("I117", "Month");
  for (const [column, year] of [["B", 2021], ["C", 2022], ["D", 2023], ["E", 2024], ["F", 2025], ["G", 2026]] as const) {
    set(`${column}117`, String(year));
    const monthColumn = String.fromCharCode("J".charCodeAt(0) + year - 2021);
    set(`${monthColumn}117`, String(year));
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  months.forEach((month, index) => {
    set(`A${101 + index}`, month);
    set(`I${118 + index}`, month);
  });
  for (let index = 0; index < 52; index++) {
    const date = new Date(Date.UTC(2026, 0, 4 + index * 7)).toISOString().slice(0, 10);
    set(`A${118 + index}`, date);
  }
  set("B105", "51749");
  set("C101", "60771.08");
  set("E101", "58797.89");
  set("J118", "196");
  set("K118", "217");
  set("L118", "213");
  set("M118", "243");
  set("N118", "243");
  set("B118", "136");
  set("C118", "64");
  set("D118", "79");
  set("E118", "143");
  set("F118", "155");
  set("G118", "142", "Dash!BB3");
  return cells;
}

describe("Giving workbook month and week history", () => {
  it("keeps recurring dollars, weekly people, and monthly people as separate periods", () => {
    const catalog: Catalog = {
      dateSystem: "1900",
      sheets: [{ name: "$$$", state: "visible", cellCount: 0, maxRow: 169, formulas: 0, externalFormulas: 0, errors: 0, merges: [] }],
    };
    const series = buildGivingWorkbookPeriodHistory(sourceCells(), catalog, "2026-11-07");
    const recurring = series.find((item) => item.key === "monthly-recurring")!;
    const weekly = series.find((item) => item.key === "weekly-giving-people")!;
    const monthly = series.find((item) => item.key === "monthly-giving-people")!;

    expect(recurring.values.find((value) => value.week === "2022-05-01")).toMatchObject({
      period: "month",
      value: 5_174_900,
      unit: "USD_minor",
      quality: "complete",
    });
    expect(recurring.values.find((value) => value.week === "2023-01-01")?.value).toBe(6_077_108);
    expect(weekly.values.find((value) => value.week === "2021-01-03")?.value).toBe(136);
    expect(weekly.values.find((value) => value.week === "2026-01-04")).toMatchObject({
      value: 142,
      flags: expect.arrayContaining(["cached_formula_value"]),
    });
    expect(weekly.values.every((value) => value.week <= "2026-11-07")).toBe(true);
    expect(monthly.values.find((value) => value.week === "2021-01-01")?.value).toBe(196);
    expect(monthly.values.find((value) => value.week === "2026-01-01")).toMatchObject({
      value: null,
      quality: "missing",
    });
    expect(monthly.values.some((value) => value.week === "2026-12-01")).toBe(false);
  });
});
