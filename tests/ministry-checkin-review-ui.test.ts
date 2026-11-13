import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { CheckInReviewTable } from "../artifacts/northpoint-dashboard/src/components/ministry-checkin-review-table";

const appRequire = createRequire(
  new URL("../artifacts/northpoint-dashboard/package.json", import.meta.url),
);
const React = appRequire("react");
const { renderToStaticMarkup } = appRequire("react-dom/server");

describe("Admin Check-In review table", () => {
  it("shows only safe source fields with clear include and exclude actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckInReviewTable, {
        items: [
          {
            checkInId: "300",
            serviceDate: "2026-11-08",
            eventId: "11",
            locationIds: ["33"],
            issueReasons: ["missing_person_profile"],
            canInclude: true,
            resolution: null,
          },
        ],
        pending: false,
        onResolve: vi.fn(),
      }),
    );
    expect(html).toContain("Check-In ID");
    expect(html).toContain("2026-11-08");
    expect(html).toContain("33");
    expect(html).toContain("No linked person profile");
    expect(html).toContain(">Include</button>");
    expect(html).toContain(">Exclude</button>");
    expect(html).not.toContain("childName");
    expect(html).not.toContain("personId");
  });

  it("disables inclusion when a usable service date and source are unavailable", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckInReviewTable, {
        items: [
          {
            checkInId: "301",
            serviceDate: null,
            eventId: null,
            locationIds: [],
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
