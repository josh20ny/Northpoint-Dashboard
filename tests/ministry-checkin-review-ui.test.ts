import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { CheckInReviewTable } from "../artifacts/northpoint-dashboard/src/components/ministry-checkin-review-table";

const appRequire = createRequire(
  new URL("../artifacts/northpoint-dashboard/package.json", import.meta.url),
);
const React = appRequire("react");
const { renderToStaticMarkup } = appRequire("react-dom/server");

describe("Admin Check-In review table", () => {
  it("shows the Admin-only child name and location with clear actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckInReviewTable, {
        items: [
          {
            checkInId: "300",
            serviceDate: "2026-11-08",
            eventId: "11",
            eventName: "Normal Service Times",
            locationIds: ["33"],
            locationNames: ["UpStreet"],
            childName: "Casey Jones",
            gradeLabel: "5th Grade",
            assumedMinistry: null,
            ministry: "upstreet",
            ministryBasis: "mapped",
            issueReasons: ["missing_person_profile"],
            canInclude: true,
            resolution: null,
          },
        ],
        pending: false,
        onResolve: vi.fn(),
      }),
    );
    expect(html).toContain("Child");
    expect(html).toContain("Casey Jones");
    expect(html).toContain("UpStreet");
    expect(html).toContain("2026-11-08");
    expect(html).toContain("No linked person profile");
    expect(html).toContain(">Include</button>");
    expect(html).toContain(">Exclude</button>");
    expect(html).not.toContain("Check-In ID");
    expect(html).not.toContain(">300<");
  });

  it("disables inclusion when a usable service date and source are unavailable", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckInReviewTable, {
        items: [
          {
            checkInId: "301",
            serviceDate: null,
            eventId: null,
            eventName: null,
            locationIds: [],
            locationNames: [],
            childName: null,
            gradeLabel: null,
            assumedMinistry: null,
            ministry: null,
            ministryBasis: "unresolved",
            issueReasons: ["missing_service_date"],
            canInclude: false,
            resolution: null,
          },
        ],
        pending: false,
        onResolve: vi.fn(),
      }),
    );
    expect(html).toContain("A usable service date and source are required");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Include<\/button>/);
  });
});
