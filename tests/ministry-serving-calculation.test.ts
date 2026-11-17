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
  type: "Plan", id: "1", attributes: {}, relationships: {}, sourceCollection: null,
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

  it("does not fabricate an accepted zero from a missing service relationship or unknown status", () => {
    const missing = assignment("10", "8", "C");
    missing.relationships.service_times = { data: [] };
    expect(compile([missing], [mapping("8", "kids-checkin", "accepted")])).toEqual({
      values: [], issues: ["serving_plan_person_or_service_time_missing"],
    });
    expect(compile([assignment("10", "8", "unexpected")], [mapping("8", "kids-checkin")])).toEqual({
      values: [], issues: ["serving_invalid_response_status"],
    });
  });

  it("does not apply a current source interpretation to earlier historical service dates", () => {
    const route = { ...mapping("8", "kids-checkin"), effectiveFrom: "2026-11-09" };
    expect(compile([assignment("10", "8", "C")], [route]).values).toEqual([]);
  });
});
