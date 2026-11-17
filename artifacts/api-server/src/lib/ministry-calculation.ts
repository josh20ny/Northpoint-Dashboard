import type { SourceEntity } from "./planning-center-source";
import { chicagoDate, completedSunday, shiftDate, sunday } from "./attendance-calculation";
import {
  findCheckInReviewCandidates,
  type CheckInResolutionAction,
} from "./ministry-checkin-review";
import { gradeLabelFor, ministryForGradeLabel } from "./ministry-grade-classification";
import { reportingWeekEnding } from "./reporting-calendar";

export const MINISTRY_DEFINITION_VERSION = "source-native-v7";
export const MAPPING_ONLY_MEASURES = new Set(["service_session", "student_group_classification"]);
export const MINISTRY_SLUGS = [
  "giving",
  "connection",
  "waumba-land",
  "upstreet",
  "transit",
  "insideout",
  "service-programming",
  // Reporting bucket, not an additional ministry or a component attendance total.
  "shared-teams",
] as const;
export const SHARED_SERVING_SCOPES = ["kids-checkin", "guest-services", "safety-team"] as const;
export const SAFE_SCOPES = [
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
  "fuel-2023",
  "fuel-2024",
  "fuel-2026",
  "fuel-2027",
  "mosaic",
  "for",
  ...SHARED_SERVING_SCOPES,
] as const;
export const MEASURES: Record<string, { title: string; unit: string; definition: string }> = {
  giving_total: {
    title: "General Giving",
    unit: "USD_minor",
    definition:
      "Received designations to the explicitly mapped General Giving fund, dated by the parent gift's received_at in Chicago. Succeeded, non-refunded gifts only; not all-fund totals. Accepted workbook General Giving fills historical gaps; sources are never added together.",
  },
  all_fund_giving: {
    title: "Received giving (all funds)",
    unit: "USD_minor",
    definition:
      "Succeeded gifts dated by received_at in Chicago; fully refunded gifts excluded. Not net cash flow; refunds reported separately by refunded_at. Currencies never combined.",
  },
  refund_total: {
    title: "Refunds",
    unit: "USD_minor",
    definition:
      "Refund magnitude (absolute source minor units) dated by refunded_at in Chicago, not subtracted again from received giving. Signed PCO source values are retained unchanged.",
  },
  fund_giving: {
    title: "Fund giving",
    unit: "USD_minor",
    definition:
      "Succeeded, non-refunded donation designations for an explicitly mapped fund; never added again to church giving.",
  },
  recurring_schedules: {
    title: "Active recurring schedules",
    unit: "schedules",
    definition:
      "Source status=active recurring donation schedules as observed at scan time; not donations received or historical donor counts.",
  },
  first_time_givers: {
    title: "First-time giving units",
    unit: "giving_units",
    definition:
      "First recorded lifetime gift from PCO Giving metadata, grouped only by explicit joint-giver relationships. Current giving units; historical family membership is not reconstructed.",
  },
  lapsed_givers: {
    title: "Known lapsed giving units",
    unit: "giving_units",
    definition:
      "A consistent giving unit misses three consecutive expected gifts. Requires approved cadence detection and accessible-history backfill; irregular or insufficient histories remain unclassified. Person-linked details are Admin-only.",
  },
  attendance: {
    title: "Weekly unique participants",
    unit: "people",
    definition:
      "Distinct people with regular or linked guest Check-Ins on Sunday within the selected ministry/scope/week. Anonymous check-ins need an explicit Admin resolution.",
  },
  attendance_headcount: {
    title: "Attendance (workbook headcount)",
    unit: "attendances",
    definition:
      "Accepted workbook source-defined attendance headcounts, not unique weekly PCO participants. Keep per-service and total scopes separate; never splice these into a unique-person series.",
  },
  volunteer_headcount: {
    title: "Volunteers (workbook count)",
    unit: "source_count",
    definition:
      "Accepted workbook volunteer counts; not assumed unique across services and not merged with unique PCO checked-in volunteers.",
  },
  legacy_first_time_givers: {
    title: "First-time givers (workbook)",
    unit: "source_count",
    definition:
      "Accepted historical workbook first-time-giver counts under their source-era definition, not newly inferred person/family identities.",
  },
  legacy_recurring_givers: {
    title: "Recurring givers (workbook)",
    unit: "source_count",
    definition:
      "Accepted historical workbook recurring-giver counts, not active recurring schedules or scheduled payments.",
  },
  legacy_lapsed_givers: {
    title: "Lapsed givers (workbook)",
    unit: "source_count",
    definition:
      "Accepted historical workbook lapse counts under their source-era definition; not retroactively treated as classifications from the current adjustable formula.",
  },
  volunteers: {
    title: "Checked-in volunteers",
    unit: "people",
    definition:
      "Distinct Check-Ins person IDs with kind=Volunteer in the selected ministry/scope/week. Not inferred from Services schedules.",
  },
  first_known: {
    title: "First-known participants",
    unit: "people",
    definition:
      "Regular check-in participants whose earliest observed regular check-in in the same ministry/scope is this week. Limited to imported history, never first-ever attendance.",
  },
  scheduled: {
    title: "Scheduled volunteers",
    unit: "people",
    definition:
      "Distinct Services product person IDs scheduled on a dated plan; includes unconfirmed and declined schedules. This is not actual serving.",
  },
  accepted: {
    title: "Accepted volunteers",
    unit: "people",
    definition:
      "Distinct Services people with PlanPerson status=C; accepted scheduling response, not proof of actual serving.",
  },
  group_attendance: {
    title: "Group meeting attendances",
    unit: "attendances",
    definition:
      "Distinct event/person pairs explicitly marked attended=true on non-cancelled, ended Groups events. Membership and RSVP are not attendance.",
  },
  group_count: {
    title: "Active groups",
    unit: "groups",
    definition:
      "Non-archived Groups records at scan time; snapshot, not a reconstructed historical weekly count.",
  },
  group_memberships: {
    title: "Group memberships",
    unit: "memberships",
    definition:
      "Membership records as observed, not unique church-wide people or meeting attendance. Snapshot only.",
  },
  group_leaders: {
    title: "Group leaders",
    unit: "memberships",
    definition:
      "Membership records whose PCO role is leader, observed at scan time. Snapshot only; not a coach definition.",
  },
  volunteer_rally: {
    title: "Volunteer rally",
    unit: "people",
    definition:
      "Accepted workbook-defined rally counts, kept separate from actual serving and scheduling.",
  },
  large_group: {
    title: "Large group",
    unit: "count",
    definition:
      "Accepted workbook source-defined large-group count; does not infer attendance units or sum it with small group.",
  },
  small_group: {
    title: "Small group",
    unit: "count",
    definition:
      "Accepted workbook source-defined small-group count; not automatically distinct people.",
  },
  new_guests: {
    title: "New guests",
    unit: "people",
    definition:
      "Accepted workbook-defined new guests; not equivalent to first-known PCO attendance.",
  },
  new_families: {
    title: "New families",
    unit: "families",
    definition:
      "Accepted workbook-defined family count; not a count of children or canonical households.",
  },
  coaches: {
    title: "Coaches",
    unit: "people",
    definition:
      "Accepted workbook-defined coaches; PCO leader membership is not automatically a coach.",
  },
  guest_services_volunteers: {
    title: "Guest services volunteers",
    unit: "people",
    definition: "Accepted workbook-defined guest services volunteers.",
  },
  total_volunteers: {
    title: "Total volunteers",
    unit: "people",
    definition:
      "Accepted workbook-defined total. Do not add component ministries to this total without source-defined deduplication.",
  },
  groups_reported: {
    title: "Groups reported",
    unit: "groups",
    definition: "Accepted workbook-defined groups reporting attendance; not total active groups.",
  },
  member_attendance: {
    title: "Member attendance",
    unit: "attendances",
    definition: "Accepted workbook-defined attendance; not active memberships.",
  },
};
export interface SourceFact extends SourceEntity {
  sourceCollection: string | null;
}
export interface SourceMapping {
  id: string;
  product: string;
  objectType: string;
  externalId: string;
  ministry: string;
  measure: string;
  scope: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}
export interface MetricFact {
  ministry: string;
  measure: string;
  scope: string;
  week: string;
  value: number | null;
  unit: string;
  quality: string;
  denominator: number | null;
  flags: string[];
}
function refs(e: SourceEntity, key: string): string[] {
  const d = e.relationships[key]?.data;
  return d == null ? [] : (Array.isArray(d) ? d : [d]).map((v) => v.id);
}
const ref = (e: SourceEntity, key: string) => refs(e, key)[0] ?? null;
const instant = (v: unknown): Date | null =>
  typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v))
    ? new Date(v)
    : null;
const chicagoTime = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
const integer = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);
const currency = (v: unknown) => (typeof v === "string" && /^[A-Z]{3}$/.test(v) ? v : null);
const activeMapping = (m: SourceMapping, date: string) =>
  m.effectiveFrom <= date && (!m.effectiveTo || m.effectiveTo >= date);
export function ordinalSunday(year: number, ordinal: number) {
  const jan = `${year}-01-01`;
  const first = shiftDate(jan, (7 - new Date(`${jan}T12:00:00Z`).getUTCDay()) % 7);
  const day = shiftDate(first, ordinal * 7);
  if (day.slice(0, 4) !== String(year))
    throw new Error("Source has more Sunday rows than selected year");
  return day;
}
export function exactMinorUnits(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)
    throw new Error("Unsafe monetary value");
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-6)
    throw new Error("Amount has more than two decimal places");
  return cents;
}
export function compileMinistryFacts(
  product: string,
  entities: SourceFact[],
  mappings: SourceMapping[],
  start: string,
  end: string,
  asOf: Date,
  checkInResolutions: ReadonlyMap<string, CheckInResolutionAction> = new Map(),
  groupFacts: SourceFact[] = [],
  groupMappings: SourceMapping[] = [],
  groupSnapshotAt: Date | null = null,
  gradeFacts: SourceFact[] = [],
  historyComplete = true,
) {
  if (!sunday(start) || !sunday(end) || end < start) throw new Error("Invalid Sunday range");
  const issues = new Set<string>();
  const output = new Map<string, MetricFact>();
  const identities = new Map<string, Set<string>>();
  const add = (
    ministry: string,
    measure: string,
    scope: string,
    date: Date,
    amount: number,
    identity?: string,
    unit?: string,
  ) => {
    const week = reportingWeekEnding(date);
    if (week < start || week > end) return;
    const u = unit ?? MEASURES[measure].unit;
    const key = [ministry, measure, scope, week, u].join("|");
    const row = output.get(key) ?? {
      ministry,
      measure,
      scope,
      week,
      value: 0,
      unit: u,
      quality: "complete",
      denominator: null,
      flags: [],
    };
    const seen = identities.get(key) ?? new Set<string>();
    if (!identity || !seen.has(identity)) row.value = (row.value ?? 0) + amount;
    if (!Number.isSafeInteger(row.value)) throw new Error("Metric exceeds safe integer precision");
    if (identity) seen.add(identity);
    identities.set(key, seen);
    output.set(key, row);
  };
  const match = (type: string, id: string | null, date: Date, measure?: string) =>
    mappings.filter(
      (m) =>
        m.product === product &&
        !MAPPING_ONLY_MEASURES.has(m.measure) &&
        m.objectType === type &&
        m.externalId === id &&
        activeMapping(m, chicagoDate(date)) &&
        (!measure || m.measure === measure),
    );
  const eventTimeTemplates = new Map(
    entities.filter((e) => e.type === "EventTime").map((e) => [e.id, e]),
  );
  const serviceMappings = mappings.filter(
    (m) =>
      m.product === "check_ins" &&
      m.objectType === "EventTime" &&
      m.measure === "service_session",
  );
  const serviceSessions = (time: SourceFact, date: Date) => {
    const eventId = ref(time, "event");
    if (!eventId) return [];
    const timeOfDay = chicagoTime(date);
    return serviceMappings.filter((m) => {
      if (!activeMapping(m, chicagoDate(date))) return false;
      const template = eventTimeTemplates.get(m.externalId);
      if (!template) {
        issues.add("service_time_template_missing");
        return false;
      }
      const templateDate = instant(template.attributes.starts_at);
      return (
        !!templateDate &&
        ref(template, "event") === eventId &&
        chicagoTime(templateDate) === timeOfDay
      );
    });
  };
  const apply = (matches: SourceMapping[], date: Date, count: number, id: string) => {
    const unique = new Map<string, SourceMapping>();
    for (const m of matches) unique.set([m.ministry, m.measure, m.scope].join("|"), m);
    for (const m of unique.values()) add(m.ministry, m.measure, m.scope, date, count, id);
  };
  if (product === "giving") {
    const donations = new Map(entities.filter((e) => e.type === "Donation").map((e) => [e.id, e]));
    const allocations = new Map<string, Map<string, number>>();
    for (const e of entities.filter((row) => row.type === "Designation")) {
      const parentId = e.sourceCollection?.match(/\/donations\/(\d+)\/designations$/)?.[1];
      const parent = parentId && donations.get(parentId);
      const amount = integer(e.attributes.amount_cents);
      if (!parent || amount === null || amount < 0 ||
        e.attributes.amount_currency !== parent.attributes.amount_currency ||
        !ref(e, "fund")) continue;
      const gifts = allocations.get(parent.id) ?? new Map<string, number>();
      gifts.set(e.id, amount);
      allocations.set(parent.id, gifts);
    }
    for (const e of entities) {
      const a = e.attributes;
      if (e.type === "Donation") {
        const d = instant(a.received_at),
          n = integer(a.amount_cents),
          c = currency(a.amount_currency);
        if (
          !d ||
          n === null ||
          n < 0 ||
          !c ||
          typeof a.refunded !== "boolean" ||
          !["succeeded", "pending", "failed"].includes(String(a.payment_status))
        ) {
          issues.add("giving_invalid_fields");
          continue;
        }
        if (a.payment_status === "succeeded" && a.refunded === false) {
          add("giving", "all_fund_giving", "all", d, n, e.id, `${c}_minor`);
          const giftDay = chicagoDate(d);
          const fundMappings = mappings.filter((m) => m.product === "giving" &&
            m.objectType === "Fund" && ["giving_total", "fund_giving"].includes(m.measure) &&
            activeMapping(m, giftDay));
          if (fundMappings.length && reportingWeekEnding(d) >= start &&
            reportingWeekEnding(d) <= end) {
            const allocated = [...(allocations.get(e.id)?.values() ?? [])]
              .reduce((sum, amount) => sum + amount, 0);
            if (!allocations.has(e.id) || !Number.isSafeInteger(allocated) || allocated !== n)
              issues.add("designation_coverage_incomplete");
            else
              // Complete allocations establish an observed zero for mapped
              // funds receiving none of this gift; unknown allocations do not.
              for (const m of fundMappings)
                add("giving", m.measure, m.scope, d, 0, undefined, `${c}_minor`);
          }
        }
      }
      if (e.type === "Refund") {
        const d = instant(a.refunded_at),
          n = integer(a.amount_cents),
          c = currency(a.amount_currency);
        if (!d || n === null || !c) {
          issues.add("refund_invalid_fields");
          continue;
        }
        add("giving", "refund_total", "all", d, Math.abs(n), e.id, `${c}_minor`);
      }
      if (e.type === "Designation") {
        const parent = donations.get(
          e.sourceCollection?.match(/\/donations\/(\d+)\/designations$/)?.[1] ?? "",
        );
        const d = parent && instant(parent.attributes.received_at),
          n = integer(a.amount_cents),
          c = currency(a.amount_currency);
        if (!parent || !d || n === null || !c || n < 0 ||
          c !== parent.attributes.amount_currency || !ref(e, "fund")) {
          issues.add("designation_parent_or_fields_missing");
          continue;
        }
        if (
          parent.attributes.payment_status !== "succeeded" ||
          parent.attributes.refunded !== false
        )
          continue;
        for (const m of match("Fund", ref(e, "fund"), d, "fund_giving"))
          add("giving", "fund_giving", m.scope, d, n, e.id, `${c}_minor`);
        for (const m of match("Fund", ref(e, "fund"), d, "giving_total"))
          add("giving", "giving_total", m.scope, d, n, e.id, `${c}_minor`);
      }
      if (e.type === "RecurringDonation" && a.status === "active")
        add("giving", "recurring_schedules", "all", asOf, 1, e.id);
    }
  }
  if (product === "groups") {
    const events = new Map(entities.filter((e) => e.type === "Event").map((e) => [e.id, e]));
    const groups = new Map(entities.filter((e) => e.type === "Group").map((e) => [e.id, e]));
    for (const e of entities) {
      if (e.type === "Group" && e.attributes.archived_at === null)
        add("connection", "group_count", "all", asOf, 1, e.id);
      if (e.type === "Membership") {
        const group = groups.get(ref(e, "group") ?? "");
        if (!group) {
          issues.add("group_membership_parent_missing");
          continue;
        }
        if (group.attributes.archived_at !== null) continue;
        add("connection", "group_memberships", "all", asOf, 1, e.id);
        if (e.attributes.role === "leader")
          add("connection", "group_leaders", "all", asOf, 1, e.id);
        const ms = match("Group", ref(e, "group"), asOf).filter((m) =>
          ["group_memberships", "group_leaders"].includes(m.measure),
        );
        apply(
          ms.filter((m) => m.measure !== "group_leaders" || e.attributes.role === "leader"),
          asOf,
          1,
          e.id,
        );
      }
      if (e.type !== "Attendance" || e.attributes.attended !== true) continue;
      const event = events.get(ref(e, "event") ?? ""),
        person = ref(e, "person");
      const d = event && instant(event.attributes.starts_at),
        finished = event && instant(event.attributes.ends_at);
      if (!event || !d || !finished || event.attributes.canceled !== false || finished > asOf) {
        issues.add("group_event_not_eligible");
        continue;
      }
      const groupId = ref(event, "group");
      const group = groups.get(groupId ?? "");
      const ms = [
        ...match("Group", groupId, d, "group_attendance"),
        ...match("GroupType", group ? ref(group, "group_type") : null, d, "group_attendance"),
      ];
      if (!ms.length) {
        issues.add("unmapped_group_attendance");
        continue;
      }
      if (!person) {
        issues.add("anonymous_group_attendance_excluded");
        continue;
      }
      apply(ms, d, 1, `${event.id}:${person}`);
    }
  }
  if (product === "serving") {
    const plans = new Map(entities.filter((e) => e.type === "Plan").map((e) => [e.id, e]));
    const times = entities.filter((e) => e.type === "PlanTime");
    for (const e of entities.filter((e) => e.type === "PlanPerson")) {
      const planId = ref(e, "plan"),
        person = ref(e, "person"),
        plan = plans.get(planId ?? "");
      // Do not invent a service instant from plan sort_date (a local date).
      const scheduledTimes = refs(e, "service_times");
      const t = times.filter(
        (v) =>
          scheduledTimes.includes(v.id) &&
          v.sourceCollection?.match(/\/plans\/(\d+)\/plan_times$/)?.[1] === planId &&
          v.attributes.time_type === "service",
      );
      if (!plan || !person || !t.length) {
        issues.add("serving_plan_person_or_service_time_missing");
        continue;
      }
      for (const time of t) {
        const d = instant(time.attributes.starts_at);
        if (!d) {
          issues.add("serving_invalid_service_time");
          continue;
        }
        const ms = [
          ...match("Team", ref(e, "team"), d),
          ...match("ServiceType", ref(e, "service_type"), d),
        ].filter((m) => ["scheduled", "accepted"].includes(m.measure));
        if (!ms.length) issues.add("unmapped_serving");
        if (!["C", "U", "D"].includes(String(e.attributes.status))) {
          issues.add("serving_invalid_response_status");
          continue;
        }
        // A fully linked dated assignment establishes coverage for this
        // mapped team/week, including zero accepted responses. Never invent
        // zeros for weeks with no assignments or missing source linkage.
        apply(ms.filter((m) => m.measure === "accepted"), d, 0, "");
        apply(ms.filter((m) =>
          m.measure === "scheduled" || e.attributes.status === "C"), d, 1, person);
      }
    }
  }
  if (product === "check_ins") {
    const reviewItems = findCheckInReviewCandidates(entities).filter(
      (item) => !item.serviceDate || sunday(item.serviceDate),
    );
    const reviewById = new Map(reviewItems.map((item) => [item.checkInId, item]));
    const pendingReviews = reviewItems.filter((item) => !checkInResolutions.has(item.checkInId));
    if (pendingReviews.length) {
      issues.add(`unresolved_checkins_pending:${pendingReviews.length}`);
      for (const item of pendingReviews)
        for (const reason of item.issueReasons) issues.add(`checkin_${reason}`);
    }
    const periods = new Map(entities.filter((e) => e.type === "EventPeriod").map((e) => [e.id, e]));
    const times = new Map(entities.filter((e) => e.type === "EventTime").map((e) => [e.id, e]));
    const locations = new Map(entities.filter((e) => e.type === "Location").map((e) => [e.id, e]));
    const people = new Map(entities.filter((e) => e.type === "Person").map((e) => [e.id, e]));
    const gradeFallbackWeeks = new Set<string>();
    const serviceRouteFallbackRows = new Set<string>();
    const first = new Map<string, string>();
    const groupSnapshots = new Map(
      groupFacts.filter((e) => e.type === "Group").map((e) => [e.id, e]),
    );
    const membershipsByPerson = new Map<
      string,
      { groupId: string; groupTypeId: string | null; joinedAt: string | null }[]
    >();
    for (const membership of groupFacts.filter((e) => e.type === "Membership")) {
      const person = ref(membership, "person");
      const groupId = ref(membership, "group");
      const group = groupId ? groupSnapshots.get(groupId) : null;
      if (!person || !groupId || !group || group.attributes.archived_at !== null) continue;
      if (membership.attributes.role === "leader") continue;
      const rows = membershipsByPerson.get(person) ?? [];
      rows.push({
        groupId,
        groupTypeId: ref(group, "group_type"),
        joinedAt:
          typeof membership.attributes.joined_at === "string"
            ? membership.attributes.joined_at.slice(0, 10)
            : null,
      });
      membershipsByPerson.set(person, rows);
    }
    const classifiedMinistries = (person: string, date: Date) => {
      const day = chicagoDate(date);
      const ministries = new Set<string>();
      for (const membership of membershipsByPerson.get(person) ?? []) {
        if (membership.joinedAt && membership.joinedAt > day) continue;
        for (const mapping of groupMappings) {
          if (
            mapping.product === "groups" &&
            mapping.measure === "student_group_classification" &&
            ((mapping.objectType === "Group" && mapping.externalId === membership.groupId) ||
              (mapping.objectType === "GroupType" &&
                mapping.externalId === membership.groupTypeId)) &&
            activeMapping(mapping, day)
          )
            ministries.add(mapping.ministry);
        }
      }
      return [...ministries];
    };
    const candidates: {
      m: SourceMapping;
      d: Date;
      person: string | null;
      kind: string;
      identity: string;
    }[] = [];
    for (const e of entities.filter((e) => e.type === "CheckIn")) {
      const resolution = checkInResolutions.get(e.id);
      if (resolution === "exclude") continue;
      const review = reviewById.get(e.id);
      const person = ref(e, "person"),
        period = periods.get(ref(e, "event_period") ?? "");
      const eventTimes = refs(e, "event_times")
        .map((id) => times.get(id))
        .filter((v): v is SourceFact => !!v);
      const starts = eventTimes
        .map((time) => ({ time, date: instant(time.attributes.starts_at) }))
        .filter((v): v is { time: SourceFact; date: Date } => !!v.date);
      const fallback = period && instant(period.attributes.starts_at);
      const d = starts.sort((a, b) => +a.date - +b.date)[0]?.date ?? fallback;
      // Attendance uses actual event dates, never check-in creation/import date.
      if (!d || !period) {
        issues.add("checkin_date_person_or_period_missing");
        continue;
      }
      if (!sunday(chicagoDate(d))) {
        issues.add("non_sunday_checkins_excluded");
        continue;
      }
      if (review && !resolution) continue;
      if (!person && resolution !== "include") {
        issues.add("checkin_date_person_or_period_missing");
        continue;
      }
      const eventId = ref(period, "event");
      const routed = new Map<string, SourceMapping>();
      for (const { time, date } of starts)
        for (const session of serviceSessions(time, date))
          routed.set(`${session.ministry}|${session.scope}`, session);
      let sessions = [...routed.values()];
      const routeConfigured = serviceMappings.some((mapping) => {
        if (!activeMapping(mapping, chicagoDate(d))) return false;
        const template = eventTimeTemplates.get(mapping.externalId);
        return !!template && ref(template, "event") === eventId;
      });
      const rawMatches = [
        ...match("Event", eventId, d),
        ...refs(e, "locations").flatMap((id) => match("Location", id, d)),
      ];
      // Owner-confirmed Transit convention: these room prefixes describe the
      // service actually attended, not a roster assignment. Resolve against
      // active Transit templates for this same event, never a hardcoded scope.
      // Children's mapped rooms must not inherit this student-only convention.
      if (!rawMatches.some((m) => ["upstreet", "waumba-land"].includes(m.ministry))) {
        const roomClocks = new Set(
          refs(e, "locations").flatMap((id) => {
            const name = locations.get(id)?.attributes.name;
            const prefix = typeof name === "string" ? /^(9:00|11:00)\b/.exec(name.trim()) : null;
            return prefix ? [prefix[1] === "9:00" ? "09:00" : "11:00"] : [];
          }),
        );
        if (roomClocks.size) {
          const roomSessions = serviceMappings.filter((mapping) => {
            if (mapping.ministry !== "transit" || !activeMapping(mapping, chicagoDate(d))) return false;
            const template = eventTimeTemplates.get(mapping.externalId);
            const start = template && instant(template.attributes.starts_at);
            return !!template && !!start && ref(template, "event") === eventId &&
              roomClocks.has(chicagoTime(start));
          });
          // Do not silently revert to a conflicting EventTime when a room's
          // actual service has no configured route.
          const matchedClocks = new Set(roomSessions.map((mapping) =>
            chicagoTime(instant(eventTimeTemplates.get(mapping.externalId)!.attributes.starts_at)!)));
          if ([...roomClocks].some((clock) => !matchedClocks.has(clock))) {
            issues.add("unmapped_transit_location_service_time");
            continue;
          }
          sessions = [
            ...sessions.filter((m) => !["transit", "insideout"].includes(m.ministry)),
            ...roomSessions,
          ];
        }
      }
      if (routeConfigured && sessions.length === 0) {
        issues.add("unmapped_checkin_service_time");
        continue;
      }
      const routedScopes = new Map<string, Set<string>>();
      for (const session of sessions) {
        const scopes = routedScopes.get(session.ministry) ?? new Set<string>();
        scopes.add(session.scope);
        routedScopes.set(session.ministry, scopes);
      }
      const ms = routeConfigured
        ? rawMatches.flatMap((m) => {
            const scopes = routedScopes.get(m.ministry);
            if (!scopes) return [];
            return [...scopes]
              .filter((scope) => m.scope === "all" || m.scope === scope)
              .map((scope) => ({ ...m, scope }));
          })
        : rawMatches;
      if (!ms.length && !sessions.length) {
        issues.add("unmapped_checkins");
        continue;
      }
      const unique = new Map<string, SourceMapping>();
      for (const m of ms) unique.set(`${m.ministry}|${m.measure}|${m.scope}`, m);
      let directMatches = [...unique.values()];
      if (
        person &&
        reportingWeekEnding(d) === completedSunday(asOf) &&
        new Set(directMatches.map((m) => m.ministry)).size > 1
      ) {
        const gradeMinistry = ministryForGradeLabel(
          gradeLabelFor(people.get(person), gradeFacts),
        );
        if (gradeMinistry && directMatches.some((m) => m.ministry === gradeMinistry)) {
          directMatches = directMatches.filter((m) => m.ministry === gradeMinistry);
          gradeFallbackWeeks.add(reportingWeekEnding(d));
        }
      }
      for (const m of directMatches) {
        const sourceKind = String(e.attributes.kind).toLowerCase();
        const kind =
          resolution === "include" && !["regular", "guest", "volunteer"].includes(sourceKind)
            ? "guest"
            : sourceKind;
        if (!["regular", "volunteer", "guest"].includes(kind)) {
          issues.add("unknown_checkin_kind");
          continue;
        }
        const identity = resolution === "include" && review ? `checkin:${e.id}` : person!;
        candidates.push({ m, d, person, kind, identity });
        if (kind === "regular" && person) {
          const k = `${m.ministry}|${m.scope}|${person}`,
            w = reportingWeekEnding(d);
          if (!first.has(k) || first.get(k)! > w) first.set(k, w);
        }
      }
      const studentSessions = sessions.filter((m) => ["transit", "insideout"].includes(m.ministry));
      const routedStudentMinistries = new Set(studentSessions.map((m) => m.ministry));
      const hasDirectChildAttendance = directMatches.some(
        (mapping) =>
          ["upstreet", "waumba-land"].includes(mapping.ministry) &&
          mapping.measure === "attendance",
      );
      for (const session of studentSessions) {
        // A mapped children's room is not a student-service Check-In merely
        // because Transit runs at the same clock time.
        if (hasDirectChildAttendance) continue;
        if (!person) {
          issues.add("unmapped_student_group_person");
          continue;
        }
        const memberships = classifiedMinistries(person, d);
        // Memberships disambiguate shared routes; a unique student service can
        // establish ministry attendance without establishing any group split.
        let ministries = memberships.filter((ministry) => routedStudentMinistries.has(ministry));
        if (ministries.length > 1) {
          const gradeMinistry = ministryForGradeLabel(
            gradeLabelFor(people.get(person), gradeFacts),
          );
          if (
            gradeMinistry &&
            ministries.includes(gradeMinistry) &&
            groupSnapshotAt &&
            reportingWeekEnding(d) === completedSunday(groupSnapshotAt)
          ) {
            ministries = [gradeMinistry];
            gradeFallbackWeeks.add(reportingWeekEnding(d));
          }
        }
        const routeMinistries = [...routedStudentMinistries];
        const isCurrentGroupSnapshot =
          !!groupSnapshotAt && reportingWeekEnding(d) === completedSunday(groupSnapshotAt);
        if (
          routeMinistries.length === 1 &&
          !hasDirectChildAttendance
        ) {
          ministries = routeMinistries;
          if (!memberships.includes(session.ministry) || !isCurrentGroupSnapshot)
            serviceRouteFallbackRows.add(
              `${session.ministry}|${session.scope}|${reportingWeekEnding(d)}`,
            );
        }
        if (routeMinistries.length > 1 && !isCurrentGroupSnapshot) {
          issues.add("unmapped_student_group_snapshot");
          continue;
        }
        if (memberships.length && !ministries.length) continue;
        if (ministries.length !== 1) {
          issues.add(
            ministries.length > 1
              ? "unmapped_student_group_ambiguous"
              : "unmapped_student_group_membership",
          );
          continue;
        }
        if (ministries[0] !== session.ministry) continue;
        const kind = String(e.attributes.kind).toLowerCase();
        if (!["regular", "guest"].includes(kind)) continue;
        candidates.push({
          m: {
            ...session,
            ministry: ministries[0],
            measure: "attendance",
          },
          d,
          person,
          kind,
          identity: person,
        });
        if (kind === "regular") {
          const key = `${ministries[0]}|${session.scope}|${person}`;
          const week = reportingWeekEnding(d);
          if (!first.has(key) || first.get(key)! > week) first.set(key, week);
        }
      }
    }
    for (const { m, d, person, kind, identity } of candidates) {
      if (
        (m.measure === "attendance" && ["regular", "guest"].includes(kind)) ||
        (m.measure === "volunteers" && kind === "volunteer") ||
        (m.measure === "first_known" &&
          !!person &&
          kind === "regular" &&
          first.get(`${m.ministry}|${m.scope}|${person}`) === reportingWeekEnding(d))
      )
        apply([m], d, 1, identity);
    }
    for (const row of output.values()) {
      if (row.measure === "first_known") {
        row.flags.push("limited_to_imported_history");
        if (!historyComplete) {
          row.value = null;
          row.quality = "missing";
          row.flags.push("prior_history_not_loaded_for_windowed_publication");
        }
      }
      if (gradeFallbackWeeks.has(row.week) && row.measure === "attendance")
        row.flags.push("ministry_classified_from_pco_grade");
      if (
        serviceRouteFallbackRows.has(`${row.ministry}|${row.scope}|${row.week}`) &&
        row.measure === "attendance"
      )
        row.flags.push("ministry_classified_from_unique_service_route");
    }
  }
  // Any bad/incomplete source linkage must not silently produce a complete
  // partial number. Source absence is not an automatic zero.
  const incomplete = [...issues].some(
    (x) =>
      !x.startsWith("unmapped_") &&
      x !== "group_event_not_eligible" &&
      x !== "non_sunday_checkins_excluded",
  );
  if (incomplete)
    for (const r of output.values()) {
      // Fund linkage cannot change an independently valid all-fund total or
      // refund. Only withhold the financial measures that depend on it.
      if (product === "giving" && [...issues].every((issue) => issue.startsWith("designation_")) &&
        !["giving_total", "fund_giving"].includes(r.measure)) continue;
      r.quality = "partial";
      r.flags.push("incomplete_source_linkage");
      if (product !== "check_ins") r.value = null;
    }
  return { values: [...output.values()], issues: [...issues].sort() };
}
