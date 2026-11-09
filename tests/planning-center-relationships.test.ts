import { describe, expect, it } from "vitest";
import {
  fields,
  normalized,
  pagePath,
  parsePage,
  roots,
  sourceEntity,
  sourceHash,
} from "../artifacts/api-server/src/lib/planning-center-source";

const checkIn = {
  type: "CheckIn",
  id: "1",
  attributes: { kind: "Regular", one_time_guest: false, medical_notes: "not collected" },
  relationships: {
    person: { data: { type: "Person", id: "2" } },
    event_period: { data: { type: "EventPeriod", id: "3" } },
    event_times: { data: [{ type: "EventTime", id: "4" }] },
    locations: { data: [{ type: "Location", id: "5" }] },
  },
};
const included = [
  {
    type: "EventPeriod",
    id: "3",
    attributes: { starts_at: "2026-01-04T15:00:00Z" },
    relationships: { event: { data: { type: "Event", id: "6" } } },
  },
  {
    type: "EventTime",
    id: "4",
    attributes: { starts_at: "2026-01-04T15:00:00Z" },
    relationships: {
      event: { data: { type: "Event", id: "6" } },
      event_period: { data: { type: "EventPeriod", id: "3" } },
    },
  },
  { type: "Location", id: "5", attributes: { name: "Synthetic location" } },
];
// Model JSON:API's filtering of BOTH attributes and relationships. Fixtures
// which always return relationships would not catch the original request bug.
function sparseResponse(query: URLSearchParams) {
  return [checkIn, ...included].map((resource) => {
    const selected = query.get(`fields[${resource.type}]`)!.split(",");
    const relationships = "relationships" in resource ? resource.relationships : {};
    return {
      type: resource.type,
      id: resource.id,
      attributes: Object.fromEntries(
        Object.entries(resource.attributes).filter(([key]) => selected.includes(key)),
      ),
      relationships: Object.fromEntries(
        Object.entries(relationships).filter(([key]) => selected.includes(key)),
      ),
    };
  });
}

describe("Planning Center relationship request and ingestion regression", () => {
  it("requests linkage in primary and included sparse fieldsets on first and continuation pages", () => {
    for (const offset of [0, 100]) {
      const url = new URL(
        pagePath(
          {
            type: "CheckIn",
            path: `/check-ins/v2/check_ins?offset=${offset}&include=person&fields[CheckIn]=medical_notes`,
          },
          "check_ins",
        ),
        "https://api.planningcenteronline.com",
      );
      expect(url.searchParams.get("include")).toBe("event_period,event_times,locations");
      expect(url.searchParams.get("fields[CheckIn]")!.split(",")).toEqual([
        ...fields.CheckIn!,
        "person",
        "event_period",
        "event_times",
        "locations",
      ]);
      expect(url.searchParams.get("fields[EventPeriod]")).toContain(",event");
      expect(url.searchParams.get("fields[EventTime]")).toContain(",event,event_period");
      expect(url.searchParams.get("fields[Plan]")).toContain(",service_type");
      expect(url.searchParams.get("fields[CheckIn]")).not.toContain("medical_notes");
      expect(url.searchParams.get("fields[Person]")).not.toContain("first_name");
      expect(url.searchParams.get("offset")).toBe(String(offset));
    }
  });

  it("preserves each check-in's own links and related event links under real sparse-field semantics", () => {
    const page = roots("check_ins")[1]!;
    const query = new URL(pagePath(page, "check_ins"), "https://api.planningcenteronline.com")
      .searchParams;
    const [primary, ...related] = sparseResponse(query);
    const result = parsePage({ data: [primary], included: related }, page, "check_ins");
    const saved = normalized(result.entities[0]!, "/check-ins/v2/check_ins");
    expect(saved.sourceRelationships).toEqual(checkIn.relationships);
    expect(saved.attributes).toEqual({ kind: "Regular", one_time_guest: false });
    expect(saved.canonicalLink).toBe("unresolved");
    expect(saved.metricPublication).toBe("not_published");
    expect(
      result.entities.find((e) => e.type === "EventPeriod")!.relationships.event!.data,
    ).toEqual({ type: "Event", id: "6" });
    expect(
      result.entities.find((e) => e.type === "EventTime")!.relationships.event_period!.data,
    ).toEqual({ type: "EventPeriod", id: "3" });
    expect(JSON.stringify(result)).not.toContain("medical_notes");
  });

  it("rejects the old attributes-only response rather than silently storing empty relationships", () => {
    const query = new URLSearchParams();
    for (const [type, attrs] of Object.entries(fields))
      query.set(`fields[${type}]`, attrs.join(","));
    const [primary, ...related] = sparseResponse(query);
    expect(() =>
      parsePage({ data: [primary], included: related }, roots("check_ins")[1]!, "check_ins"),
    ).toThrow("unsupported source shape");
  });

  it("accepts explicit null guest/person links and empty collections without inferring an identity", () => {
    const guest = sourceEntity({
      ...checkIn,
      attributes: { kind: "Guest", one_time_guest: true },
      relationships: {
        person: { data: null },
        event_period: checkIn.relationships.event_period,
        event_times: { data: [] },
        locations: { data: [] },
      },
    });
    expect(guest.relationships.person!.data).toBeNull();
    expect(guest.relationships.locations!.data).toEqual([]);
    expect(normalized(guest).canonicalLink).toBe("unresolved");
  });

  it.each(Object.keys(checkIn.relationships))(
    "fails closed if requested %s linkage is missing",
    (key) => {
      const relationships = { ...checkIn.relationships };
      delete relationships[key as keyof typeof relationships];
      expect(() => sourceEntity({ ...checkIn, relationships })).toThrow("unsupported source shape");
    },
  );

  it.each([
    { person: { data: { type: "Donation", id: "2" } } },
    { person: { data: [] } },
    { person: { data: { type: "Person", id: "../2" } } },
    { locations: { data: { type: "Location", id: "5" } } },
    { locations: { data: null } },
    { event_times: { data: [{ type: "Person", id: "4" }] } },
  ])("rejects malformed, wrongly typed or wrongly shaped relationship data", (override) => {
    expect(() =>
      sourceEntity({ ...checkIn, relationships: { ...checkIn.relationships, ...override } }),
    ).toThrow("unsupported source shape");
  });

  it("also rejects missing linkage on included resources before a page can be committed", () => {
    expect(() =>
      parsePage(
        { data: [checkIn], included: [{ ...included[0], relationships: {} }] },
        roots("check_ins")[1]!,
        "check_ins",
      ),
    ).toThrow("unsupported source shape");
  });

  it("changes a legacy revision hash once when links arrive and reuses it on an unchanged replay", () => {
    const repaired = sourceEntity(checkIn);
    const legacy = { ...repaired, relationships: {} };
    expect(sourceHash(repaired)).not.toBe(sourceHash(legacy));
    expect(sourceHash(sourceEntity(checkIn))).toBe(sourceHash(repaired));
    expect(repaired.id).toBe(legacy.id);
  });

  it("retains service type linkage while using the collection path for PlanTime parents", () => {
    const plan = sourceEntity({
      type: "Plan",
      id: "7",
      attributes: {},
      relationships: { service_type: { data: { type: "ServiceType", id: "8" } } },
    });
    expect(plan.relationships.service_type!.data).toEqual({ type: "ServiceType", id: "8" });
    const collection = "/services/v2/service_types/8/plans/7/plan_times";
    const time = sourceEntity({ type: "PlanTime", id: "9", attributes: {} });
    expect(normalized(time, collection).sourceCollection).toBe(collection);
    expect(time.relationships).toEqual({});
  });
});
