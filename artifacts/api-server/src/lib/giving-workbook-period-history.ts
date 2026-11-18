import {
  exactMinorUnits,
  ordinalSunday,
  type MetricFact,
} from "./ministry-calculation";
import type { WorkbookCell } from "@workspace/api-zod";
import { excelDate, type Catalog } from "./workbook";

type SourceCell = Pick<WorkbookCell, "value" | "cachedValue" | "formula" | "flags">;
type PeriodFact = MetricFact & { period: "week" | "month" };
export type GivingWorkbookPeriodSeries = {
  key: "monthly-recurring" | "weekly-giving-people" | "monthly-giving-people";
  label: string;
  measure: string;
  period: "week" | "month";
  unit: string;
  values: PeriodFact[];
  evidence: {
    week: string;
    coordinate: string;
    formula: string | null;
    rawValue: string | null;
    flags: string[];
  }[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NUMBER = new Map(MONTHS.map((month, index) => [month, index + 1]));
const MONTH_TEXT = new Map(
  MONTHS.flatMap((month, index) => [
    [month, index + 1] as const,
    [new Date(Date.UTC(2020, index, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" }), index + 1] as const,
  ]),
);
const PERIOD_FLAGS = new Set([
  "spreadsheet_error",
  "external_dependency",
  "missing_formula_cache",
  "invalid_shared_string",
]);

function sourceValue(cell: SourceCell | undefined) {
  if (!cell) return { raw: null, flags: ["missing_source_value"] };
  const raw = cell.formula !== null ? cell.cachedValue : cell.value;
  const flags = [...(cell.flags ?? [])];
  if (cell.formula !== null) flags.push("cached_formula_value");
  return {
    raw: raw?.trim() || null,
    flags: [...new Set(flags)],
  };
}

function parseMonth(raw: string | null): number | null {
  if (!raw) return null;
  const value = raw.trim();
  if (MONTH_NUMBER.has(value)) return MONTH_NUMBER.get(value) ?? null;
  return MONTH_TEXT.get(value) ?? null;
}

function parseMetricValue(
  cell: SourceCell | undefined,
  kind: "money" | "count",
): { value: number | null; rawValue: string | null; flags: string[] } {
  const { raw, flags } = sourceValue(cell);
  if (!raw || flags.some((flag) => PERIOD_FLAGS.has(flag)))
    return { value: null, rawValue: raw, flags: [...new Set([...flags, "missing_or_invalid_source_value"])] };
  if (!/^[+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw))
    return { value: null, rawValue: raw, flags: [...new Set([...flags, "non_numeric_source_value"])] };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0)
    return { value: null, rawValue: raw, flags: [...new Set([...flags, "unsafe_source_value"])] };
  if (kind === "count" && !Number.isSafeInteger(parsed))
    return { value: null, rawValue: raw, flags: [...new Set([...flags, "non_integer_count"])] };
  try {
    const value = kind === "money" ? exactMinorUnits(parsed) : parsed;
    if (!Number.isSafeInteger(value))
      return { value: null, rawValue: raw, flags: [...new Set([...flags, "unsafe_numeric_precision"])] };
    return { value, rawValue: raw, flags: [...new Set(flags)] };
  } catch {
    return { value: null, rawValue: raw, flags: [...new Set([...flags, "invalid_currency_precision"])] };
  }
}

function makeSeries(
  key: GivingWorkbookPeriodSeries["key"],
  label: string,
  measure: string,
  period: "week" | "month",
  unit: string,
) {
  return {
    key,
    label,
    measure,
    period,
    unit,
    values: [] as PeriodFact[],
    evidence: [] as GivingWorkbookPeriodSeries["evidence"],
  };
}

export function buildGivingWorkbookPeriodHistory(
  cells: ReadonlyMap<string, SourceCell>,
  catalog: Catalog,
  snapshotDate: string,
) {
  const getRaw = (coordinate: string) => sourceValue(cells.get(coordinate)).raw;
  const assertCell = (coordinate: string, expected: string) => {
    if (getRaw(coordinate) !== expected)
      throw new Error(`Accepted Giving workbook changed at ${coordinate}`);
  };
  const assertYearCell = (coordinate: string, expected: number) => {
    if (Number(getRaw(coordinate)) !== expected)
      throw new Error(`Accepted Giving workbook changed at ${coordinate}`);
  };

  assertCell("B99", "Monthly Recurring Gifts");
  assertCell("A100", "Month");
  for (const [coordinate, year] of Object.entries({
    B100: 2022,
    C100: 2023,
    E100: 2024,
    G100: 2025,
  }))
    assertYearCell(coordinate, year!);
  assertCell("B116", "Giving Units per week");
  assertCell("I116", "Giving Units per month");
  assertCell("A117", "Date");
  assertCell("I117", "Month");

  const recurring = makeSeries(
    "monthly-recurring",
    "Monthly recurring gifts (workbook)",
    "legacy_monthly_recurring_giving",
    "month",
    "USD_minor",
  );
  for (const [column, year] of [
    ["B", 2022],
    ["C", 2023],
    ["E", 2024],
    ["G", 2025],
  ] as const) {
    for (let row = 101; row <= 112; row++) {
      const month = parseMonth(getRaw(`A${row}`));
      if (!month) throw new Error(`Invalid recurring-gift month label at A${row}`);
      const date = `${year}-${String(month).padStart(2, "0")}-01`;
      if (date > snapshotDate.slice(0, 7) + "-01") continue;
      const coordinate = `${column}${row}`;
      const parsed = parseMetricValue(cells.get(coordinate), "money");
      recurring.values.push({
        ministry: "giving",
        measure: recurring.measure,
        scope: "all",
        week: date,
        period: "month",
        value: parsed.value,
        unit: recurring.unit,
        quality: parsed.value === null ? "missing" : "complete",
        denominator: null,
        flags: ["workbook_source_defined", ...parsed.flags],
      });
      recurring.evidence.push({
        week: date,
        coordinate,
        formula: cells.get(coordinate)?.formula ?? null,
        rawValue: parsed.rawValue,
        flags: parsed.flags,
      });
    }
  }

  const monthlyPeople = makeSeries(
    "monthly-giving-people",
    "Giving people per month (workbook)",
    "legacy_giving_people",
    "month",
    "people",
  );
  const monthlyYearColumns = [
    ["J", 2021],
    ["K", 2022],
    ["L", 2023],
    ["M", 2024],
    ["N", 2025],
    ["O", 2026],
  ] as const;
  for (const [column, year] of monthlyYearColumns) {
    assertYearCell(`${column}117`, year);
    for (let row = 118; row <= 129; row++) {
      const month = parseMonth(getRaw(`I${row}`));
      if (!month) throw new Error(`Invalid giving-unit month label at I${row}`);
      const date = `${year}-${String(month).padStart(2, "0")}-01`;
      if (date > snapshotDate.slice(0, 7) + "-01") continue;
      const coordinate = `${column}${row}`;
      const parsed = parseMetricValue(cells.get(coordinate), "count");
      monthlyPeople.values.push({
        ministry: "giving",
        measure: monthlyPeople.measure,
        scope: "all",
        week: date,
        period: "month",
        value: parsed.value,
        unit: monthlyPeople.unit,
        quality: parsed.value === null ? "missing" : "complete",
        denominator: null,
        flags: ["workbook_source_defined", ...parsed.flags],
      });
      monthlyPeople.evidence.push({
        week: date,
        coordinate,
        formula: cells.get(coordinate)?.formula ?? null,
        rawValue: parsed.rawValue,
        flags: parsed.flags,
      });
    }
  }

  const weeklyPeople = makeSeries(
    "weekly-giving-people",
    "Giving people per week (workbook)",
    "legacy_giving_people",
    "week",
    "people",
  );
  const weeklyYearColumns = [
    ["B", 2021],
    ["C", 2022],
    ["D", 2023],
    ["E", 2024],
    ["F", 2025],
    ["G", 2026],
  ] as const;
  const axisDates: string[] = [];
  for (let row = 118; row <= 169; row++) {
    const axis = excelDate(getRaw(`A${row}`), catalog.dateSystem);
    if (!axis) throw new Error(`Invalid weekly Giving axis at A${row}`);
    axisDates.push(axis);
  }
  const axisStart = axisDates[0];
  if (
    axisStart !== "2026-01-04" ||
    axisDates.length !== 52 ||
    axisDates.some(
      (date, index) =>
        date !== new Date(Date.parse(`${axisStart}T12:00:00Z`) + index * 7 * 86400000).toISOString().slice(0, 10),
    )
  )
    throw new Error("Giving units do not have the reviewed 52-week 2026 axis");

  for (const [column, year] of weeklyYearColumns) {
    assertYearCell(`${column}117`, year);
    for (const [ordinal, axisDate] of axisDates.entries()) {
      const date = ordinalSunday(year, ordinal);
      if (date > snapshotDate) continue;
      const row = 118 + ordinal;
      const coordinate = `${column}${row}`;
      const parsed = parseMetricValue(cells.get(coordinate), "count");
      weeklyPeople.values.push({
        ministry: "giving",
        measure: weeklyPeople.measure,
        scope: "all",
        week: date,
        period: "week",
        value: parsed.value,
        unit: weeklyPeople.unit,
        quality: parsed.value === null ? "missing" : "complete",
        denominator: null,
        flags: [
          "workbook_source_defined",
          "explicit_ordinal_year_alignment",
          ...(cells.get(`A${row}`) ? [] : ["missing_axis_cell"]),
          ...parsed.flags,
        ],
      });
      weeklyPeople.evidence.push({
        week: date,
        coordinate,
        formula: cells.get(coordinate)?.formula ?? null,
        rawValue: parsed.rawValue,
        flags: parsed.flags,
      });
      if (!axisDate) throw new Error("Weekly date axis contains an empty value");
    }
  }

  return [recurring, weeklyPeople, monthlyPeople] satisfies GivingWorkbookPeriodSeries[];
}
