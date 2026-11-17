import type { Query, QueryClient } from "@tanstack/react-query";
import type { MinistryMetric } from "@workspace/api-client-react";

export const DATA_MINISTRIES = [
  { slug: "giving", name: "Giving" },
  { slug: "connection", name: "Connection" },
  { slug: "waumba-land", name: "Waumba Land" },
  { slug: "upstreet", name: "UpStreet" },
  { slug: "transit", name: "Transit" },
  { slug: "insideout", name: "InsideOut" },
] as const;

export const MAPPABLE_MINISTRIES = [
  ...DATA_MINISTRIES,
  { slug: "service-programming", name: "Service Programming" },
] as const;

export const isDataMinistry = (slug: string) => DATA_MINISTRIES.some((m) => m.slug === slug);
export const ministryName = (slug: string) =>
  MAPPABLE_MINISTRIES.find((m) => m.slug === slug)?.name ?? slug;

export const SERVING_MEASURES = new Set(["scheduled", "accepted"]);

/** Measure keys accepted by the backend registry. Titles are plain labels only. */
export const MEASURES: { key: string; label: string }[] = [
  { key: "giving_total", label: "General Giving" },
  { key: "all_fund_giving", label: "Received giving (all funds)" },
  { key: "refund_total", label: "Refunds" },
  { key: "recurring_schedules", label: "Recurring schedules snapshot" },
  { key: "fund_giving", label: "Fund giving" },
  { key: "first_time_givers", label: "First-time givers (first recorded gift)" },
  { key: "lapsed_givers", label: "Lapsed givers (classified units)" },
  { key: "legacy_first_time_givers", label: "First-time givers (workbook definition)" },
  { key: "legacy_recurring_givers", label: "Recurring givers (workbook definition)" },
  { key: "legacy_lapsed_givers", label: "Lapsed givers (workbook definition)" },
  { key: "attendance", label: "Weekly unique participants (regular + linked guests)" },
  { key: "attendance_headcount", label: "Attendance (workbook headcount)" },
  { key: "volunteer_headcount", label: "Volunteers (workbook count)" },
  { key: "volunteers", label: "Volunteers" },
  { key: "first_known", label: "First known within imported history" },
  { key: "scheduled", label: "Serving: scheduled" },
  { key: "accepted", label: "Serving: accepted" },
  { key: "group_attendance", label: "Group attendance" },
  { key: "group_leaders", label: "Group leaders" },
  { key: "group_memberships", label: "Group memberships" },
  { key: "group_count", label: "Group count" },
  { key: "volunteer_rally", label: "Volunteer rally" },
  { key: "large_group", label: "Large group" },
  { key: "small_group", label: "Small group" },
  { key: "new_guests", label: "New guests" },
  { key: "new_families", label: "New families" },
  { key: "coaches", label: "Coaches" },
  { key: "guest_services_volunteers", label: "Guest services volunteers" },
  { key: "total_volunteers", label: "Total volunteers" },
  { key: "groups_reported", label: "Groups reported" },
  { key: "member_attendance", label: "Member attendance" },
];
const MAPPING_ONLY_MEASURES: { key: string; label: string }[] = [
  { key: "service_session", label: "Service session (mapping only)" },
  {
    key: "student_group_classification",
    label: "Student ministry classification (mapping only)",
  },
];

export const PRODUCTS = ["check_ins", "serving", "groups", "giving"] as const;
export type Product = (typeof PRODUCTS)[number];
export const PRODUCT_LABEL: Record<Product, string> = {
  check_ins: "Check-Ins",
  serving: "Services (serving)",
  groups: "Groups",
  giving: "Giving",
};
export const PRODUCT_PAIRS: Record<Product, { objectTypes: string[]; measures: string[] }> = {
  check_ins: {
    objectTypes: ["Event", "EventTime", "Location"],
    measures: ["attendance", "volunteers", "first_known", "service_session"],
  },
  serving: { objectTypes: ["ServiceType", "Team"], measures: ["scheduled", "accepted"] },
  groups: {
    objectTypes: ["Group"],
    measures: [
      "group_attendance",
      "group_leaders",
      "group_memberships",
      "student_group_classification",
    ],
  },
  giving: { objectTypes: ["Fund"], measures: ["giving_total", "fund_giving"] },
};
export const measureLabel = (key: string) =>
  [...MEASURES, ...MAPPING_ONLY_MEASURES].find((m) => m.key === key)?.label ?? key;

export const ministryPolling = {
  staleTime: 30000,
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: false,
  refetchInterval: 60000,
};

const isMinistryDataKey = (q: Query) => {
  const k = q.queryKey[0];
  return (
    typeof k === "string" &&
    (k.startsWith("/api/v1/ministry-data") || k.startsWith("/api/v1/admin/ministry-data"))
  );
};
export const invalidateMinistryData = (qc: QueryClient, extraPrefixes: string[] = []) =>
  qc.invalidateQueries({
    predicate: (q) =>
      isMinistryDataKey(q) ||
      (typeof q.queryKey[0] === "string" &&
        extraPrefixes.some((p) => (q.queryKey[0] as string).startsWith(p))),
  });

export function currencyOf(unit: string): string | null {
  if (!unit.endsWith("_minor")) return null;
  const c = unit.slice(0, -"_minor".length).toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : "USD";
}

export function formatMinor(minor: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

/** Missing values stay missing; never shown as zero. */
export function formatMetricValue(value: number | null, unit: string): string {
  if (value === null) return "Missing";
  const c = currencyOf(unit);
  if (c) return formatMinor(value, c);
  return new Intl.NumberFormat("en-US").format(value);
}

/** Unit is part of the key so USD and EUR (or any units) never merge for the same week. */
export const seriesKey = (m: Pick<MinistryMetric, "measure" | "scope" | "unit">) =>
  `${m.measure}::${m.scope}::${m.unit}`;

export const SCOPES = [
  "all",
  "service-1",
  "service-2",
  "service-3",
  "rally",
  "large-group",
  "small-group",
  "strategic",
  "building",
  "care",
  "fuel",
  "mosaic",
  "for",
] as const;

export const scopeLabel = (scope: string, source?: string) => {
  if (scope === "service-1" && source === "workbook") return "9:30 AM (workbook)";
  return (
    {
      all: "All services",
      "service-1": "9:00 AM",
      "service-2": "11:00 AM",
      "service-3": "4:30 PM",
    }[scope as "all" | "service-1" | "service-2" | "service-3"] ?? scope
  );
};

export type Series = {
  key: string;
  measure: string;
  scope: string;
  title: string;
  unit: string;
  byWeek: Map<string, MinistryMetric>;
};

export function seriesScopeLabel(series: Series, weeks: string[]) {
  const sources = new Set(
    weeks
      .map((week) => series.byWeek.get(week)?.source)
      .filter((source): source is string => !!source),
  );
  if (
    series.scope === "service-1" &&
    sources.has("workbook") &&
    sources.has("pco")
  )
    return "First service · 9:30 AM workbook / 9:00 AM PCO";
  if (sources.size === 1) return scopeLabel(series.scope, [...sources][0]);
  return scopeLabel(series.scope);
}

export function buildSeries(metrics: MinistryMetric[]): Series[] {
  const map = new Map<string, Series>();
  for (const m of metrics) {
    const k = seriesKey(m);
    let s = map.get(k);
    if (!s) {
      s = {
        key: k,
        measure: m.measure,
        scope: m.scope,
        title: m.title,
        unit: m.unit,
        byWeek: new Map(),
      };
      map.set(k, s);
    }
    s.byWeek.set(m.week, m);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

const DAY = 86400000;
export const parseISODate = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const toISODate = (t: number) => new Date(t).toISOString().slice(0, 10);
export const isSunday = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(parseISODate(s)).getUTCDay() === 0;

/** Sundays from end back to start, newest first. */
export function sundaysDesc(start: string, end: string): string[] {
  const out: string[] = [];
  let t = parseISODate(end);
  while (new Date(t).getUTCDay() !== 0) t -= DAY;
  const s = parseISODate(start);
  while (t >= s && out.length < 600) {
    out.push(toISODate(t));
    t -= 7 * DAY;
  }
  return out;
}
export const previousSunday = (week: string) => toISODate(parseISODate(week) - 7 * DAY);

export function validateRange(start: string, end: string): string | null {
  if (!start || !end) return "Choose both a start Sunday and an end Sunday.";
  if (!isSunday(start)) return "Start date must be a Sunday.";
  if (!isSunday(end)) return "End date must be a Sunday.";
  if (start > end) return "Start Sunday must be on or before the end Sunday.";
  if (parseISODate(end) - parseISODate(start) > 3653 * DAY)
    return "The range can cover at most 10 years.";
  return null;
}
