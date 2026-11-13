import { describe, expect, it } from "vitest";
import {
  compileMinistryFacts,
  type SourceFact,
  type SourceMapping,
} from "../artifacts/api-server/src/lib/ministry-calculation";
import { findCheckInReviewCandidates } from "../artifacts/api-server/src/lib/ministry-checkin-review";

const rel = (type: string, id: string | null) => ({
  data: id ? { type, id } : null,
});
const entity = (
  type: string,
  id: string,
  attributes: Record<string, unknown>,
  relationships: SourceFact["relationships"] = {},
): SourceFact => ({ type, id, attributes, relationships, sourceCollection: null });
const checkIn = (
  id: string,
  kind: string,
  personId: string | null,
  locations = ["33"],
) =>
  entity(
    "CheckIn",
    id,
    { kind },
    {
      person: rel("Person", personId),
      event_period: rel("EventPeriod", "22"),
      event_times: { data: [{ type: "EventTime", id: "44" }] },
      locations: { data: locations.map((location) => ({ type: "Location", id: location })) },
    },
  );
const context = [
  entity("EventPeriod", "22", { starts_at: "2026-11-08T15:00:00Z" }, {
    event: rel("Event", "11"),
  }),
  entity("EventTime", "44", { starts_at: "2026-11-08T15:00:00Z" }, {
    event: rel("Event", "11"),
  }),
];
const sourceMapping: SourceMapping = {
  id: "mapping-1",
  product: "check_ins",
  objectType: "Event",
  externalId: "11",
  ministry: "upstreet",
  measure: "attendance",
  scope: "service-1",
  effectiveFrom: "2022-01-01",
  effectiveTo: null,
};

describe("Admin Check-In review safety", () => {
  it("shows the Check-In name without exposing the linked profile identifier", () => {
    const facts = [
      ...context,
      entity(
        "CheckIn",
        "300",
        { kind: "Regular", first_name: "Casey", last_name: "Jones" },
        {
          person: rel("Person", "private-person-id"),
          event_period: rel("EventPeriod", "22"),
          event_times: { data: [{ type: "EventTime", id: "44" }] },
          locations: { data: [{ type: "Location", id: "33" }] },
        },
      ),
      entity(
        "CheckIn",
        "301",
        { kind: "Regular", first_name: "Casey", last_name: "Jones" },
        {
          person: rel("Person", null),
          event_period: rel("EventPeriod", "22"),
          event_times: { data: [{ type: "EventTime", id: "44" }] },
          locations: { data: [{ type: "Location", id: "33" }] },
        },
      ),
    ];
    const items = findCheckInReviewCandidates(facts);
    expect(items).toEqual([
      expect.objectContaining({
        checkInId: "301",
        serviceDate: "2026-11-08",
        eventId: "11",
        locationIds: ["33"],
        issueReasons: ["missing_person_profile"],
        canInclude: true,
        childName: "Casey Jones",
      }),
    ]);
    expect(JSON.stringify(items)).not.toContain("private-person-id");
  });

  it("shows a possible same-person recheck only on the later record", () => {
    const items = findCheckInReviewCandidates([
      ...context,
      checkIn("100", "Regular", "person-1"),
      checkIn("200", "Regular", "person-1"),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      checkInId: "200",
      issueReasons: ["possible_duplicate_checkin"],
    });
  });

  it("keeps unresolved records from publication until an Admin resolves them", () => {
    const facts = [
      ...context,
      checkIn("300", "Regular", "person-1"),
      checkIn("301", "Guest", null),
    ];
    const unresolved = compileMinistryFacts(
      "check_ins",
      facts,
      [sourceMapping],
      "2026-11-08",
      "2026-11-08",
      new Date("2026-11-10T12:00:00Z"),
    );
    expect(unresolved.issues).toContain("unresolved_checkins_pending:1");
    expect(unresolved.issues).toContain("checkin_missing_person_profile");
    expect(unresolved.values).toContainEqual(
      expect.objectContaining({
        measure: "attendance",
        value: 1,
        quality: "partial",
      }),
    );

    const included = compileMinistryFacts(
      "check_ins",
      facts,
      [sourceMapping],
      "2026-11-08",
      "2026-11-08",
      new Date("2026-11-10T12:00:00Z"),
      new Map([["301", "include"]]),
    );
    expect(included.issues).toEqual([]);
    expect(included.values.find((value) => value.measure === "attendance")?.value).toBe(2);

    const excluded = compileMinistryFacts(
      "check_ins",
      facts,
      [sourceMapping],
      "2026-11-08",
      "2026-11-08",
      new Date("2026-11-10T12:00:00Z"),
      new Map([["301", "exclude"]]),
    );
    expect(excluded.issues).toEqual([]);
    expect(excluded.values.find((value) => value.measure === "attendance")?.value).toBe(1);
  });
});
