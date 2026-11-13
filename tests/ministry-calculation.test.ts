import { describe, it, expect } from "vitest";
import {
  compileMinistryFacts,
  exactMinorUnits,
  ordinalSunday,
  type SourceFact,
  type SourceMapping,
} from "../artifacts/api-server/src/lib/ministry-calculation";
import {
  ministryPagePath,
  parseMinistryPage,
  ministryEntity,
} from "../artifacts/api-server/src/lib/ministry-source";

describe("collection-only Giving joint-giver linkage", () => {
  const summary = {
    type: "DonorSummary",
    id: "7",
    attributes: { first_donated: "2022-01-02T12:00:00Z" },
    relationships: { joint_giver: { data: { type: "Person", id: "8" } } },
  };
  const page = { type: "DonorSummary", path: "/giving/v2/donor_summaries" };
  it("requests explicit sparse linkage and only safe fields for included people", () => {
    const path = ministryPagePath(page, "giving");
    expect(path).toContain("include=joint_giver");
    expect(
      new URL(path, "https://api.planningcenteronline.com").searchParams.get(
        "fields[DonorSummary]",
      ),
    ).toContain("joint_giver");
    const parsed = parseMinistryPage(
      {
        data: [summary],
        included: [
          {
            type: "Person",
            id: "8",
            attributes: { first_donated_at: "2020-01-05T12:00:00Z", name: "must not persist" },
          },
        ],
      },
      page,
      "giving",
    );
    expect(parsed.entities.find((e) => e.type === "JointGiver")).toMatchObject({
      id: "7",
      relationships: { primary: { data: { id: "7" } }, joint_giver: { data: { id: "8" } } },
    });
    expect(JSON.stringify(parsed)).not.toContain("must not persist");
    expect(parsed.nextPages.some((p) => p.type === "JointGiver")).toBe(false);
  });
  it("resolves persisted old association pages through a filtered collection without resetting their run", () => {
    const old = { type: "JointGiver", path: "/giving/v2/donor_summaries/7/joint_giver" };
    const url = new URL(ministryPagePath(old, "giving"), "https://api.planningcenteronline.com");
    expect(url.pathname).toBe("/giving/v2/donor_summaries");
    expect(url.searchParams.get("where[person_id]")).toBe("7");
    const parsed = parseMinistryPage({ data: [summary] }, old, "giving");
    expect(parsed.entities).toHaveLength(1);
    expect(parsed.entities[0].type).toBe("JointGiver");
    expect(parsed.nextPages).toEqual([]);
    expect(() => parseMinistryPage({ data: [{ ...summary, id: "9" }] }, old, "giving")).toThrow();
    expect(
      parseMinistryPage({ data: [] }, old, "giving").entities[0].attributes.linkage_unavailable,
    ).toBe(true);
  });
  it("distinguishes explicit null from absent linkage and rejects unrelated included people", () => {
    expect(
      parseMinistryPage(
        { data: [{ ...summary, relationships: { joint_giver: { data: null } } }] },
        page,
        "giving",
      ).entities.find((e) => e.type === "JointGiver")?.relationships.joint_giver.data,
    ).toBeNull();
    expect(() =>
      parseMinistryPage({ data: [{ ...summary, relationships: {} }] }, page, "giving"),
    ).toThrow();
    expect(() =>
      parseMinistryPage(
        { data: [summary], included: [{ type: "Person", id: "99", attributes: {} }] },
        page,
        "giving",
      ),
    ).toThrow();
  });
});
const now = new Date("2026-11-10T12:00:00Z"),
  start = "2026-11-01",
  end = "2026-11-15";
const r = (type: string, id: string) => ({ data: { type, id } });
const e = (
  type: string,
  id: string,
  attributes: Record<string, unknown>,
  relationships: SourceFact["relationships"] = {},
  sourceCollection: string | null = null,
): SourceFact => ({ type, id, attributes, relationships, sourceCollection });
const mapping = (
  product: string,
  objectType: string,
  externalId: string,
  measure: string,
  ministry = "transit",
): SourceMapping => ({
  id: `${objectType}-${measure}`,
  product,
  objectType,
  externalId,
  measure,
  ministry,
  scope: "all",
  effectiveFrom: "2020-01-01",
  effectiveTo: null,
});
const giving = (id: string, attrs: Record<string, unknown> = {}) =>
  e(
    "Donation",
    id,
    {
      amount_cents: 10555,
      amount_currency: "USD",
      payment_status: "succeeded",
      refunded: false,
      received_at: "2026-11-09T05:30:00Z",
      ...attrs,
    },
    { person: r("Person", "998877665544"), recurring_donation: { data: null } },
  );
describe("ministry source-to-metric semantics", () => {
  it("uses Chicago received dates, cents and succeeded/nonrefunded gifts, not future schedules", () => {
    const result = compileMinistryFacts(
      "giving",
      [
        giving("1"),
        giving("2", { payment_status: "pending" }),
        giving("3", { payment_status: "failed" }),
        giving("4", { refunded: true }),
        giving("1"),
        e("RecurringDonation", "5", { status: "active", amount_cents: 99999 }),
      ],
      [],
      start,
      end,
      now,
    );
    const received = result.values.find((v) => v.measure === "giving_total")!;
    expect(received).toMatchObject({ week: "2026-11-08", value: 10555, unit: "USD_minor" });
    expect(result.values.find((v) => v.measure === "recurring_schedules")).toMatchObject({
      value: 1,
      week: "2026-11-15",
    });
    expect(JSON.stringify(result)).not.toContain("998877665544");
  });
  it("keeps currencies separate and never folds refunds or funds into church totals twice", () => {
    const result = compileMinistryFacts(
      "giving",
      [
        giving("1"),
        giving("2", { amount_currency: "EUR", amount_cents: 100 }),
        e(
          "Designation",
          "10",
          { amount_cents: 10555, amount_currency: "USD" },
          { fund: r("Fund", "8") },
          "/giving/v2/donations/1/designations",
        ),
        e("Refund", "11", {
          amount_cents: 500,
          amount_currency: "USD",
          refunded_at: "2026-11-02T10:00:00Z",
        }),
      ],
      [mapping("giving", "Fund", "8", "fund_giving", "giving")],
      start,
      end,
      now,
    );
    expect(
      result.values.filter((v) => v.measure === "giving_total").map((v) => [v.unit, v.value]),
    ).toEqual([
      ["USD_minor", 10555],
      ["EUR_minor", 100],
    ]);
    expect(result.values.find((v) => v.measure === "refund_total")?.value).toBe(500);
    expect(result.values.find((v) => v.measure === "fund_giving")?.value).toBe(10555);
  });
  it("rejects unsafe monetary precision instead of rounding arbitrary fractions", () => {
    expect(exactMinorUnits(123.45)).toBe(12345);
    expect(exactMinorUnits(0.29)).toBe(29);
    expect(() => exactMinorUnits(1.234)).toThrow();
    expect(() => exactMinorUnits(Number.MAX_SAFE_INTEGER)).toThrow();
  });
  it("does not treat memberships, cancelled meetings or RSVPs as attendance", () => {
    const records = [
      e("Group", "1", { archived_at: null }),
      e(
        "Membership",
        "2",
        { role: "leader" },
        { group: r("Group", "1"), person: r("Person", "3") },
      ),
      e(
        "Event",
        "4",
        { starts_at: "2026-11-04T12:00:00Z", ends_at: "2026-11-04T13:00:00Z", canceled: false },
        { group: r("Group", "1") },
      ),
      e(
        "Event",
        "5",
        { starts_at: "2026-11-04T12:00:00Z", ends_at: "2026-11-04T13:00:00Z", canceled: true },
        { group: r("Group", "1") },
      ),
      e(
        "Attendance",
        "6",
        { attended: true },
        { event: r("Event", "4"), person: r("Person", "3") },
      ),
      e(
        "Attendance",
        "7",
        { attended: true },
        { event: r("Event", "4"), person: r("Person", "3") },
      ),
      e(
        "Attendance",
        "8",
        { attended: false },
        { event: r("Event", "4"), person: r("Person", "9") },
      ),
      e(
        "Attendance",
        "9",
        { attended: true },
        { event: r("Event", "5"), person: r("Person", "9") },
      ),
    ];
    const result = compileMinistryFacts(
      "groups",
      records,
      [mapping("groups", "Group", "1", "group_attendance", "connection")],
      start,
      end,
      now,
    );
    expect(result.values.find((v) => v.measure === "group_attendance")?.value).toBe(1);
    expect(result.values.find((v) => v.measure === "group_memberships")).toMatchObject({
      value: 1,
      week: "2026-11-15",
    });
  });
  it("counts guest attendance, deduplicates rechecks and bounds first-known by imported history", () => {
    const records = [
      e("EventPeriod", "1", { starts_at: "2026-11-08T15:00:00Z" }, { event: r("Event", "9") }),
      e(
        "CheckIn",
        "2",
        { kind: "Regular" },
        {
          event_period: r("EventPeriod", "1"),
          person: r("Person", "3"),
          locations: { data: [] },
          event_times: { data: [] },
        },
      ),
      e(
        "CheckIn",
        "4",
        { kind: "Regular" },
        {
          event_period: r("EventPeriod", "1"),
          person: r("Person", "3"),
          locations: { data: [] },
          event_times: { data: [] },
        },
      ),
      e(
        "CheckIn",
        "5",
        { kind: "Volunteer" },
        {
          event_period: r("EventPeriod", "1"),
          person: r("Person", "6"),
          locations: { data: [] },
          event_times: { data: [] },
        },
      ),
      e(
        "CheckIn",
        "6",
        { kind: "Guest" },
        {
          event_period: r("EventPeriod", "1"),
          person: r("Person", "10"),
          locations: { data: [] },
          event_times: { data: [] },
        },
      ),
    ];
    const result = compileMinistryFacts(
      "check_ins",
      records,
      ["attendance", "volunteers", "first_known"].map((m) => mapping("check_ins", "Event", "9", m)),
      start,
      end,
      now,
      new Map([["4", "exclude"]]),
    );
    expect(result.values.find((v) => v.measure === "attendance")?.value).toBe(2);
    expect(result.values.find((v) => v.measure === "volunteers")?.value).toBe(1);
    expect(result.values.find((v) => v.measure === "first_known")).toMatchObject({
      value: 1,
      flags: ["limited_to_imported_history"],
    });
  });
  it("uses dated linked service times and never claims schedules prove actual serving", () => {
    const records = [
      e("Plan", "1", { sort_date: "2026-11-08" }),
      e(
        "PlanTime",
        "2",
        { starts_at: "2026-11-08T15:00:00Z", time_type: "service" },
        {},
        "/services/v2/service_types/8/plans/1/plan_times",
      ),
      e(
        "PlanPerson",
        "3",
        { status: "C" },
        {
          plan: r("Plan", "1"),
          person: r("Person", "7"),
          team: r("Team", "6"),
          service_type: r("ServiceType", "8"),
          service_times: { data: [{ type: "PlanTime", id: "2" }] },
        },
      ),
      e(
        "PlanPerson",
        "4",
        { status: "D" },
        {
          plan: r("Plan", "1"),
          person: r("Person", "9"),
          team: r("Team", "6"),
          service_type: r("ServiceType", "8"),
          service_times: { data: [{ type: "PlanTime", id: "2" }] },
        },
      ),
    ];
    const result = compileMinistryFacts(
      "serving",
      records,
      ["scheduled", "accepted"].map((m) => mapping("serving", "Team", "6", m)),
      start,
      end,
      now,
    );
    expect(result.values.find((v) => v.measure === "scheduled")?.value).toBe(2);
    expect(result.values.find((v) => v.measure === "accepted")?.value).toBe(1);
    expect(result.values.some((v) => v.measure === "volunteers")).toBe(false);
  });
  it("does not invent dates or zeros from missing relationships", () => {
    const result = compileMinistryFacts(
      "check_ins",
      [e("CheckIn", "1", { created_at: "2026-11-08T12:00:00Z", kind: "Regular" })],
      [mapping("check_ins", "Event", "9", "attendance")],
      start,
      end,
      now,
    );
    expect(result.values).toEqual([]);
    expect(result.issues).toContain("checkin_date_person_or_period_missing");
  });
  it("aligns explicit historical years to their own ordinal Sundays", () => {
    expect(ordinalSunday(2013, 0)).toBe("2013-01-06");
    expect(ordinalSunday(2025, 44)).toBe("2025-11-09");
    expect(() => ordinalSunday(2025, 52)).toThrow();
  });
});
describe("minimal, allowlisted ministry provider adapters", () => {
  it("requests relationship names in sparse fieldsets, but no payment details or donor names", () => {
    const u = new URL(
      ministryPagePath({ type: "Donation", path: "/giving/v2/donations" }, "giving"),
      "https://example.invalid",
    );
    const fields = u.searchParams.get("fields[Donation]")!;
    expect(fields).toContain("person");
    expect(fields).toContain("recurring_donation");
    expect(fields).not.toMatch(/last4|memo|name|check_number|payment_brand/);
  });
  it("uses documented bounded date filters and preserves relationship specificity", () => {
    const path = ministryPagePath(
      {
        type: "Donation",
        path: "/giving/v2/donations",
        since: "2026-10-01",
        windowField: "updated_at",
      },
      "giving",
    );
    expect(
      new URL(path, "https://example.invalid").searchParams.get("where[updated_at][gte]"),
    ).toBe("2026-10-01T00:00:00Z");
    expect(
      ministryPagePath(
        { type: "Plan", path: "/services/v2/service_types/1/plans", since: "2026-10-01" },
        "serving",
      ),
    ).toContain("filter=after");
  });
  it("does not mistake omitted person relationships for explicit anonymous donations", () => {
    const raw = {
      type: "Donation",
      id: "1",
      attributes: { amount_cents: 100 },
      relationships: { recurring_donation: { data: null } },
    };
    expect(() => ministryEntity(raw, "Donation")).toThrow();
    expect(
      ministryEntity(
        { ...raw, relationships: { ...raw.relationships, person: { data: null } } },
        "Donation",
      ).relationships.person.data,
    ).toBeNull();
  });
  it("fails closed on cross-origin, wrong collection and looping pagination", () => {
    expect(() =>
      ministryPagePath(
        { type: "Donation", path: "https://attacker.invalid/giving/v2/donations" },
        "giving",
      ),
    ).toThrow();
    expect(() =>
      ministryPagePath({ type: "Donation", path: "/giving/v2/people" }, "giving"),
    ).toThrow();
    expect(() =>
      parseMinistryPage(
        { data: [], links: { next: "/giving/v2/funds?offset=1" } },
        { type: "Donation", path: "/giving/v2/donations" },
        "giving",
      ),
    ).toThrow();
    expect(() =>
      parseMinistryPage(
        { data: [], links: { next: "/giving/v2/donations?offset=0" } },
        { type: "Donation", path: "/giving/v2/donations" },
        "giving",
      ),
    ).toThrow();
  });
  it("retains child parent context without assuming included objects imply linkage", () => {
    const raw = {
      type: "Donation",
      id: "1",
      attributes: { refunded: true },
      relationships: { person: { data: null }, recurring_donation: { data: null } },
    };
    const result = parseMinistryPage(
      { data: [raw] },
      { type: "Donation", path: "/giving/v2/donations" },
      "giving",
    );
    expect(result.nextPages).toEqual([
      { type: "Designation", path: "/giving/v2/donations/1/designations" },
      { type: "Refund", path: "/giving/v2/donations/1/refund" },
    ]);
    expect(() =>
      parseMinistryPage(
        { data: [raw], included: [{ type: "Person", id: "1" }] },
        { type: "Donation", path: "/giving/v2/donations" },
        "giving",
      ),
    ).toThrow();
  });
});
