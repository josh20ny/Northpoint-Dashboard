import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanningCenterRateLimit } from "../artifacts/api-server/src/lib/planning-center-rate-limit";

const headers = (limit = 100, count = 10, period = "20 seconds") =>
  new Headers({
    "X-PCO-API-Request-Rate-Limit": String(limit),
    "X-PCO-API-Request-Rate-Count": String(count),
    "X-PCO-API-Request-Rate-Period": period,
  });
afterEach(() => vi.useRealTimers());

describe("shared PCO request pacing", () => {
  it("uses live limits with headroom and adapts to stricter deep-pagination limits", () => {
    const gate = new PlanningCenterRateLimit();
    gate.observe(headers(), 200, 30, 1000);
    expect(gate.delay(1000)).toBe(250);
    gate.observe(headers(75), 200, 30, 1000);
    expect(gate.delay(1000)).toBe(334);
    gate.observe(headers(10, 1, "60 seconds"), 200, 30, 1000);
    expect(gate.delay(1000)).toBe(7500);
  });
  it("slows near the limit and blocks a full window when exhausted", () => {
    const gate = new PlanningCenterRateLimit();
    gate.observe(headers(100, 85), 200, 30, 0);
    expect(gate.delay(0)).toBe(500);
    gate.observe(headers(100, 100), 200, 30, 0);
    expect(gate.delay(0)).toBe(20000);
  });
  it("honors Retry-After globally even when a later successful response arrives", () => {
    const gate = new PlanningCenterRateLimit();
    gate.observe(headers(), 429, 47, 0);
    gate.observe(headers(), 200, 30, 1000);
    expect(gate.delay(1000)).toBe(46000);
  });
  it("does not let late headers from an older request loosen newer pacing", () => {
    const gate = new PlanningCenterRateLimit();
    gate.observe(headers(100, 90), 200, 30, 1000, 1000);
    gate.observe(headers(100, 10), 200, 30, 1200, 900);
    expect(gate.delay(1200)).toBe(300);
  });
  it("retains conservative pacing when headers are missing or malformed", () => {
    for (const h of [new Headers(), headers(0), headers(100, -1), headers(100, 1, "bad")]) {
      const gate = new PlanningCenterRateLimit();
      gate.observe(h, 200, 30, 0);
      expect(gate.delay(0)).toBe(2000);
    }
  });
  it("serializes simultaneous callers rather than issuing a request burst", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const gate = new PlanningCenterRateLimit();
    gate.observe(headers(), 200, 30);
    const times: number[] = [];
    const requests = [1, 2, 3].map(async () => {
      await gate.wait();
      times.push(Date.now());
    });
    await vi.advanceTimersByTimeAsync(750);
    await Promise.all(requests);
    expect(times).toEqual([250, 500, 750]);
  });
});
