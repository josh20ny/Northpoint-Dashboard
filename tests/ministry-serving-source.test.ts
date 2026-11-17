import { describe, expect, it } from "vitest";
import { scanRoots } from "../artifacts/api-server/src/lib/planning-center-source";
import { ministryPagePath, parseMinistryPage } from "../artifacts/api-server/src/lib/ministry-source";

function planPage(since: string, until: string) {
  const root = scanRoots("serving", since, "current", until)[0]!;
  return parseMinistryPage({
    data: [{ type: "ServiceType", id: "3", attributes: { name: "Sunday" } }],
  }, root, "serving").nextPages[0]!;
}

describe("bounded Services source discovery", () => {
  it("includes linked PlanTimes on paged plan reads and requests only allowlisted time attributes", () => {
    const params = new URL(ministryPagePath(planPage("2026-11-09", "2026-11-15"), "serving"),
      "https://api.planningcenteronline.com").searchParams;
    expect(params.get("include")).toBe("plan_times");
    expect(params.get("fields[Plan]")).toContain("plan_times");
    expect(params.get("fields[PlanTime]")?.split(",")).toEqual(
      expect.arrayContaining(["starts_at", "ends_at", "time_type"]),
    );
    expect(params.get("fields[PlanTime]")).not.toMatch(/name|notes|person/);
  });

  it("stages only fully linked included PlanTimes with their nested plan provenance", () => {
    const page = planPage("2026-11-09", "2026-11-15");
    const parsed = parseMinistryPage({
      data: [{
        type: "Plan", id: "31", attributes: { sort_date: "2026-11-15T15:00:00Z" },
        relationships: {
          service_type: { data: { type: "ServiceType", id: "3" } },
          plan_times: { data: [{ type: "PlanTime", id: "41" }, { type: "PlanTime", id: "42" }] },
        },
      }],
      included: [
        { type: "PlanTime", id: "41", attributes: { starts_at: "2026-11-15T15:00:00Z", time_type: "service" } },
        { type: "PlanTime", id: "42", attributes: { starts_at: "2026-11-15T16:00:00Z", time_type: "rehearsal" } },
      ],
    }, page, "serving");
    expect(parsed.entities.map(e => e.type)).toEqual(["Plan", "PlanTime", "PlanTime"]);
    expect(parsed.sourceCollections).toEqual({
      "PlanTime:41": "/services/v2/service_types/3/plans/31/plan_times",
      "PlanTime:42": "/services/v2/service_types/3/plans/31/plan_times",
    });
    expect(parsed.nextPages).toHaveLength(1);
    expect(parsed.nextPages[0]).toMatchObject({
      type: "PlanPerson",
      path: "/services/v2/service_types/3/plans/31/team_members",
      since: "2026-11-09",
      until: "2026-11-15",
    });
  });

  it("falls back to the plan-time association when an included relationship is incomplete", () => {
    const page = planPage("2026-11-09", "2026-11-15");
    const parsed = parseMinistryPage({
      data: [{
        type: "Plan", id: "31", attributes: {},
        relationships: {
          service_type: { data: { type: "ServiceType", id: "3" } },
          plan_times: { data: [{ type: "PlanTime", id: "41" }, { type: "PlanTime", id: "42" }] },
        },
      }],
      included: [
        { type: "PlanTime", id: "41", attributes: { starts_at: "2026-11-15T15:00:00Z", time_type: "service" } },
      ],
    }, page, "serving");
    expect(parsed.entities.map(e => e.type)).toEqual(["Plan"]);
    expect(parsed.nextPages.map(e => e.type)).toEqual(["PlanTime", "PlanPerson"]);
  });

  it("rejects included PlanTimes that are not linked from a returned plan", () => {
    const page = planPage("2026-11-09", "2026-11-15");
    expect(() => parseMinistryPage({
      data: [{
        type: "Plan", id: "31", attributes: {},
        relationships: {
          service_type: { data: { type: "ServiceType", id: "3" } },
          plan_times: { data: [] },
        },
      }],
      included: [{ type: "PlanTime", id: "41", attributes: { starts_at: "2026-11-15T15:00:00Z", time_type: "service" } }],
    }, page, "serving")).toThrow();
  });

  it("carries inclusive Chicago dates from the root into both documented PCO plan filters", () => {
    const page = planPage("2026-11-09", "2026-11-15");
    expect(page).toMatchObject({ since: "2026-11-09", until: "2026-11-15" });
    const params = new URL(ministryPagePath(page, "serving"),
      "https://api.planningcenteronline.com").searchParams;
    expect(params.get("filter")).toBe("after,before");
    expect(params.get("after")).toBe("2026-11-09T05:59:59.999Z");
    expect(params.get("before")).toBe("2026-11-16T06:00:00.000Z");
  });

  it.each([
    ["2026-03-08", "2026-03-08T05:59:59.999Z", "2026-03-09T05:00:00.000Z"],
    ["2026-11-01", "2026-11-01T04:59:59.999Z", "2026-11-02T06:00:00.000Z"],
  ])("keeps the full Chicago day across the %s clock change", (day, after, before) => {
    const params = new URL(ministryPagePath(planPage(day, day), "serving"),
      "https://api.planningcenteronline.com").searchParams;
    expect(params.get("after")).toBe(after);
    expect(params.get("before")).toBe(before);
  });

  it("retains bounds on pagination and assignment/time discovery", () => {
    const page = planPage("2026-11-09", "2026-11-15");
    const parsed = parseMinistryPage({
      data: [{
        type: "Plan", id: "31",
        attributes: { sort_date: "2026-11-15T15:00:00Z" },
        relationships: { service_type: { data: { type: "ServiceType", id: "3" } } },
      }],
      links: { next: "/services/v2/service_types/3/plans?offset=100" },
    }, page, "serving");
    expect(parsed.nextPages).toHaveLength(3);
    for (const child of parsed.nextPages)
      expect(child).toMatchObject({ since: "2026-11-09", until: "2026-11-15" });
    const next = parsed.nextPages.find(child => child.type === "Plan")!;
    const params = new URL(ministryPagePath(next, "serving"),
      "https://api.planningcenteronline.com").searchParams;
    expect(params.get("offset")).toBe("100");
    expect(params.get("before")).toBe("2026-11-16T06:00:00.000Z");
    const assignments = parsed.nextPages.find(child => child.type === "PlanPerson")!;
    const fields = new URL(ministryPagePath(assignments, "serving"),
      "https://api.planningcenteronline.com").searchParams.get("fields[PlanPerson]")!.split(",");
    expect(fields).toEqual(expect.arrayContaining(["status", "person", "plan", "team", "service_times"]));
    expect(fields).not.toEqual(expect.arrayContaining(["name", "notes"]));
    expect(fields).not.toContain("name");
    expect(fields).not.toContain("notes");
  });
});
