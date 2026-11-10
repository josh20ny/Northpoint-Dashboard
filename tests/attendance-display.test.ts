import { describe, expect, it } from "vitest";
import { yoyPercentageClass } from "../artifacts/northpoint-dashboard/src/lib/attendance";

describe("YoY percentage colors", () => {
  it.each([-100, -19.2, -0.001])("uses red for %s percent", (percent) => {
    expect(yoyPercentageClass(percent)).toBe("text-red-700");
  });
  it.each([0, 0.001, 9.9, 10])("uses normal text for %s percent", (percent) => {
    expect(yoyPercentageClass(percent)).toBe("text-foreground");
  });
  it.each([10.001, 20])("uses green for %s percent", (percent) => {
    expect(yoyPercentageClass(percent)).toBe("text-emerald-700");
  });
});
