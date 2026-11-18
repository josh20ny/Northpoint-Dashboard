import { describe, expect, it } from "vitest";
import {
  compileMinistryFacts,
  type SourceFact,
  type SourceMapping,
} from "../artifacts/api-server/src/lib/ministry-calculation";

const start = "2026-11-08";
const now = new Date("2026-11-17T18:00:00Z");
const relationship = (type: string, id: string) => ({ data: { type, id } });
const plan: SourceFact = {
  type: "Plan", id: "1", attributes: { sort_date: "2026-11-08" }, relationships: {}, sourceCollection: null,
};
const time: SourceFact = {
  type: "PlanTime", id: "2", attributes: { starts_at: "2026-11-08T15:00:00Z", time_type: "service" },
  relationships: {}, sourceCollection: "/services/v2/service_types/8/plans/1/plan_times",
};
const assignment = (id: string, source: string, status: string, person = "700"): SourceFact => ({
  type: "PlanPerson", id, attributes: { status },
  relationships: {
    person: relationship("Person", person), plan: relationship("Plan", "1"),
    team: relationship("Team", "6"), service_type: relationship("ServiceType", source),
    service_times: { data: [{ type: "PlanTime", id: "2" }] },
  },
  sourceCollection: "/services/v2/service_types/8/plans/1/team_members",
});
const mapping = (id: string, scope: string, measure = "scheduled", ministry = "shared-teams"): SourceMapping => ({
  id: `${id}-${scope}-${measure}`, product: "serving", objectType: "ServiceType",
  externalId: id, ministry, measure, scope, effectiveFrom: "2026-11-01", effectiveTo: null,
});
const compile = (records: SourceFact[], mappings: SourceMapping[]) =>
  compileMinistryFacts("serving", [plan, time, ...records], mappings, start, start, now);

describe("Services weekly people and shared teams", () => {
  it("keeps shared Kids’ Check-In outside child ministry totals and Safety separate within Guest Services", () => {
    const result = compile([
      assignment("10", "8", "C"),
      assignment("11", "8", "C"), // repeated assignment for the same person
      assignment("12", "9", "C"), // same person in another team must remain visible there
      assignment("13", "10", "U"),
    ], [
      mapping("8", "kids-checkin"), mapping("8", "kids-checkin", "accepted"),
      mapping("9", "safety-team"), mapping("9", "safety-team", "accepted"),
      mapping("10", "guest-services"), mapping("10", "guest-services", "accepted"),
    ]);
    expect(result.issues).toEqual([]);
    expect(result.values).toHaveLength(6);
    expect(result.values.every(row => row.ministry === "shared-teams" && row.quality === "complete")).toBe(true);
    expect(result.values.filter(row => row.measure === "scheduled").map(row => row.value)).toEqual([1, 1, 1]);
    expect(result.values.find(row => row.scope === "guest-services" && row.measure === "accepted")?.value).toBe(0);
    expect(result.values.some(row => ["upstreet", "waumba-land"].includes(row.ministry) || row.scope === "all")).toBe(false);
    expect(JSON.stringify(result.values)).not.toMatch(/700|person|PlanPerson/);
  });

  it("deduplicates people across two source types routed into one ministry", () => {
    const result = compile([assignment("10", "8", "C"), assignment("11", "9", "C")], [
      mapping("8", "all", "scheduled", "upstreet"), mapping("9", "all", "scheduled", "upstreet"),
    ]);
    expect(result.values).toEqual([expect.objectContaining({ ministry: "upstreet", value: 1 })]);
  });

  it("keeps Transit Weekend assignments separate from regular Transit totals", () => {
    const result = compile([
      assignment("10", "8", "C"),
      assignment("11", "9", "C"),
    ], [
      mapping("8", "all", "scheduled", "transit"),
      mapping("8", "all", "accepted", "transit"),
      mapping("9", "transit-weekend", "scheduled", "transit"),
      mapping("9", "transit-weekend", "accepted", "transit"),
    ]);

    expect(result.issues).toEqual([]);
    expect(result.values).toEqual(expect.arrayContaining([
      expect.objectContaining({ ministry: "transit", measure: "scheduled", scope: "all", value: 1 }),
      expect.objectContaining({ ministry: "transit", measure: "accepted", scope: "all", value: 1 }),
      expect.objectContaining({ ministry: "transit", measure: "scheduled", scope: "transit-weekend", value: 1 }),
      expect.objectContaining({ ministry: "transit", measure: "accepted", scope: "transit-weekend", value: 1 }),
    ]));
  });

  it("establishes an accepted zero from linked unconfirmed/declined assignments, not an unmapped source", () => {
    for (const status of ["U", "D"]) {
      const result = compile([assignment("10", "8", status)], [mapping("8", "kids-checkin", "accepted")]);
      expect(result.issues).toEqual([]);
      expect(result.values).toEqual([expect.objectContaining({ measure: "accepted", value: 0, quality: "complete" })]);
    }
    expect(compile([], [mapping("8", "kids-checkin", "accepted")]).values).toEqual([]);
  });

  it("retains the documented all-response scheduled definition without inferring actual participation", () => {
    const result = compile([assignment("10", "8", "D")], [
      mapping("8", "kids-checkin"), mapping("8", "kids-checkin", "accepted"),
    ]);
    expect(result.values).toEqual(expect.arrayContaining([
      expect.objectContaining({ measure: "scheduled", value: 1 }),
      expect.objectContaining({ measure: "accepted", value: 0 }),
    ]));
    expect(result.values.some(row => row.measure === "volunteers")).toBe(false);
  });

  it("shows an unknown count when a mapped assignment has no service-time link", () => {
    const missing = assignment("10", "8", "C");
    missing.relationships.service_times = { data: [] };
    expect(compile([missing], [mapping("8", "kids-checkin", "accepted")])).toMatchObject({
      issues: ["serving_plan_person_or_service_time_missing"],
      values: [
        expect.objectContaining({
          measure: "accepted",
          value: null,
          quality: "partial",
          flags: ["incomplete_source_linkage"],
        }),
      ],
    });
    expect(compile([assignment("10", "8", "unexpected")], [mapping("8", "kids-checkin")])).toEqual({
      values: [
        expect.objectContaining({
          measure: "scheduled",
          value: null,
          quality: "partial",
          flags: ["incomplete_source_linkage"],
        }),
      ],
      issues: ["serving_invalid_response_status"],
    });
  });

  it("keeps linked Serving totals visible as partial when other assignments lack service times", () => {
    const missing = assignment("11", "8", "C");
    missing.relationships.service_times = { data: [] };
    const result = compile(
      [assignment("10", "8", "C"), missing],
      [mapping("8", "all"), mapping("8", "all", "accepted")],
    );
    expect(result.issues).toEqual(["serving_plan_person_or_service_time_missing"]);
    expect(result.values).toEqual(expect.arrayContaining([
      expect.objectContaining({
        measure: "scheduled",
        value: 1,
        quality: "partial",
        flags: expect.arrayContaining(["incomplete_source_linkage"]),
      }),
      expect.objectContaining({
        measure: "accepted",
        value: 1,
        quality: "partial",
        flags: expect.arrayContaining(["incomplete_source_linkage"]),
      }),
    ]));
  });

  it("limits missing-link partial quality to the affected reporting week", () => {
    const nextPlan: SourceFact = {
      type: "Plan", id: "2", attributes: { sort_date: "2026-11-15" },
      relationships: {}, sourceCollection: null,
    };
    const nextTime: SourceFact = {
      type: "PlanTime", id: "next-time",
      attributes: { starts_at: "2026-11-15T15:00:00Z", time_type: "service" },
      relationships: {},
      sourceCollection: "/services/v2/service_types/8/plans/2/plan_times",
    };
    const nextAssignment = assignment("next-assignment", "8", "C");
    nextAssignment.relationships.plan = relationship("Plan", "2");
    nextAssignment.relationships.service_times = {
      data: [{ type: "PlanTime", id: "next-time" }],
    };
    nextAssignment.sourceCollection =
      "/services/v2/service_types/8/plans/2/team_members";
    const missing = assignment("missing", "8", "C");
    missing.relationships.service_times = { data: [] };

    const result = compileMinistryFacts(
      "serving",
      [plan, time, nextPlan, nextTime, assignment("valid", "8", "C"), nextAssignment, missing],
      [mapping("8", "all"), mapping("8", "all", "accepted")],
      "2026-11-08",
      "2026-11-15",
      now,
    );
    expect(result.issues).toEqual(["serving_plan_person_or_service_time_missing"]);
    expect(result.values).toEqual(expect.arrayContaining([
      expect.objectContaining({ measure: "scheduled", week: "2026-11-08", value: 1, quality: "partial" }),
      expect.objectContaining({ measure: "accepted", week: "2026-11-08", value: 1, quality: "partial" }),
      expect.objectContaining({ measure: "scheduled", week: "2026-11-15", value: 1, quality: "complete" }),
      expect.objectContaining({ measure: "accepted", week: "2026-11-15", value: 1, quality: "complete" }),
    ]));
  });

  it("keeps out-of-window historical linkage gaps from invalidating current totals", () => {
    const oldPlan: SourceFact = {
      type: "Plan", id: "old-plan", attributes: { sort_date: "2026-11-01" },
      relationships: {}, sourceCollection: null,
    };
    const oldTime: SourceFact = {
      type: "PlanTime", id: "old-time",
      attributes: { starts_at: "2026-11-01T15:00:00Z", time_type: "service" },
      relationships: {},
      sourceCollection: "/services/v2/service_types/9/plans/old-plan/plan_times",
    };
    const oldUnmapped = assignment("old-unmapped", "9", "C");
    oldUnmapped.relationships.plan = relationship("Plan", "old-plan");
    oldUnmapped.relationships.service_times = {
      data: [{ type: "PlanTime", id: "old-time" }],
    };
    const oldMissingTime = assignment("old-missing-time", "9", "C");
    oldMissingTime.relationships.plan = relationship("Plan", "old-plan");
    oldMissingTime.relationships.service_times = { data: [] };

    const result = compileMinistryFacts(
      "serving",
      [plan, time, oldPlan, oldTime, assignment("current", "8", "C"), oldUnmapped, oldMissingTime],
      [mapping("8", "all")],
      start,
      start,
      now,
    );
    expect(result.issues).toEqual([]);
    expect(result.values).toEqual([
      expect.objectContaining({ ministry: "shared-teams", value: 1, quality: "complete" }),
    ]);
  });

  it("does not apply a current source interpretation to earlier historical service dates", () => {
    const route = { ...mapping("8", "kids-checkin"), effectiveFrom: "2026-11-09" };
    expect(compile([assignment("10", "8", "C")], [route]).values).toEqual([]);
  });
});
