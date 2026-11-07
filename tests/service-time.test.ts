import { describe, expect, it } from "vitest";
import {
  chicagoDateTimeFromInstant,
  resolveChicagoServiceTime,
} from "../artifacts/northpoint-dashboard/src/lib/service-time";

describe("Chicago service time conversion", () => {
  it("converts a unique local time to its explicit instant", () => {
    expect(resolveChicagoServiceTime("2026-07-12", "09:00")).toEqual({
      kind: "valid",
      instant: "2026-07-12T14:00:00.000Z",
    });
  });

  it("rejects a local time skipped by the spring clock change", () => {
    expect(resolveChicagoServiceTime("2026-03-08", "02:30")).toEqual({
      kind: "nonexistent",
    });
  });

  it("returns both instants for a repeated fall clock time", () => {
    expect(resolveChicagoServiceTime("2026-11-01", "01:30")).toEqual({
      kind: "ambiguous",
      instants: ["2026-11-01T06:30:00.000Z", "2026-11-01T07:30:00.000Z"],
    });
  });

  it("round-trips an existing timestamp to its Chicago date and time", () => {
    expect(chicagoDateTimeFromInstant("2026-11-01T07:30:00.000Z")).toEqual({
      date: "2026-11-01",
      time: "01:30:00",
    });
  });

  it("rejects malformed dates and times", () => {
    expect(resolveChicagoServiceTime("2026-02-30", "09:00")).toEqual({ kind: "invalid" });
    expect(resolveChicagoServiceTime("2026-07-12", "25:00")).toEqual({ kind: "invalid" });
  });
});
