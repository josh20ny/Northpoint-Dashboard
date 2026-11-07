import { expect, it } from "vitest";
import { formatDate } from "../artifacts/northpoint-dashboard/src/lib/reporting-format";

it("preserves a calendar-only Sunday independently of browser timezone", () => {
  expect(formatDate("2026-11-08")).toBe("Nov 8, 2026");
});
it("renders timestamps in Chicago with an explicit timezone label", () => {
  const output = formatDate("2026-11-07T03:59:00Z", true);
  expect(output).toContain("Nov 6, 2026");
  expect(output).toContain("9:59 PM");
  expect(output).toContain("CST");
});
it("keeps unavailable dates distinct from data", () => {
  expect(formatDate()).toBe("—");
  expect(formatDate("invalid")).toBe("invalid");
});
