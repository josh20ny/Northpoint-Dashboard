import { describe, expect, it, vi, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { randomUUID } from "node:crypto";
import type { AttendanceRevision, ImportWeek } from "../lib/api-zod/src/index";
import {
  calculateWeeks,
  chicagoDate,
  completedSunday,
  shiftDate,
  sunday,
} from "../artifacts/api-server/src/lib/attendance-calculation";
import { historyEligible } from "../artifacts/api-server/src/lib/attendance-history";
import { createAttendanceRouter } from "../artifacts/api-server/src/routes/attendance";
import { syntheticPrincipal } from "./fixtures/principals";
import { AccessError } from "../artifacts/api-server/src/lib/administration";
import * as repo from "../artifacts/api-server/src/lib/attendance";

const rev = (
  date: string,
  slot: string,
  count: number | null,
  extras: Partial<AttendanceRevision> = {},
): AttendanceRevision => ({
  id: randomUUID(),
  definitionId: randomUUID(),
  serviceDate: date,
  slot,
  occurrenceId: null,
  count,
  status: count === null ? "unrecorded" : "recorded",
  note: "Synthetic headcount",
  source: "manual",
  reviewMethod: null,
  createdAt: "2026-01-19T12:00:00Z",
  previousId: null,
  valid: true,
  ...extras,
});
describe("adult aggregate calculation", () => {
  it("reconciles both services for the three verified sample totals without inventing a four-week average", () => {
    const values = [
      ["2026-01-04", 446, 464],
      ["2026-01-11", 462, 448],
      ["2026-01-18", 421, 410],
    ] as const;
    const rows = values.flatMap(([d, a, b]) => [
      rev(d, "adult_service_1", a),
      rev(d, "adult_service_2", b),
    ]);
    const weeks = calculateWeeks(rows, "2026-01-04", "2026-01-25", "2026-02-01", "2026-01-01");
    expect(weeks.map((w) => w.value)).toEqual([910, 910, 831, null]);
    expect(weeks[3].quality).toBe("missing");
  });
  it("distinguishes a partial known subtotal from a complete total, including true zero", () => {
    const one = rev("2026-01-25", "adult_service_1", 0);
    expect(
      calculateWeeks([one], "2026-01-25", "2026-01-25", "2026-02-01", "2026-01-01")[0],
    ).toMatchObject({ value: null, knownSubtotal: 0, quality: "partial" });
    expect(
      calculateWeeks(
        [one, rev("2026-01-25", "adult_service_2", 0)],
        "2026-01-25",
        "2026-01-25",
        "2026-02-01",
        "2026-01-01",
      )[0],
    ).toMatchObject({ value: 0, quality: "complete" });
  });
  it("preserves known online-only and other explicitly unrecorded Sundays without zero-fill", () => {
    expect(
      calculateWeeks([], "2026-04-12", "2026-05-03", "2026-06-01", "2026-01-01").map((w) => [
        w.quality,
        w.value,
      ]),
    ).toEqual(Array(4).fill(["unrecorded", null]));
    expect(
      calculateWeeks(
        [rev("2026-06-07", "adult_service_1", null)],
        "2026-06-07",
        "2026-06-07",
        "2026-07-01",
        "2026-01-01",
      )[0].quality,
    ).toBe("unrecorded");
  });
  it("does not publish invalidated or future facts", () => {
    expect(
      calculateWeeks(
        [rev("2026-01-04", "adult_service_1", 12, { valid: false })],
        "2026-01-04",
        "2026-01-04",
        "2026-01-05",
        "2026-01-01",
      )[0],
    ).toMatchObject({ quality: "invalidated", value: null, knownSubtotal: null });
    expect(
      calculateWeeks([], "2026-01-11", "2026-01-11", "2026-01-05", "2026-01-01")[0].quality,
    ).toBe("future");
  });
  it.each([
    ["2026-03-09T04:59:59Z", "2026-03-01"],
    ["2026-03-09T05:00:00Z", "2026-03-08"],
    ["2026-11-02T05:59:59Z", "2026-10-25"],
    ["2026-11-02T06:00:00Z", "2026-11-01"],
  ])("uses completed Chicago weeks at %s", (instant, expected) => {
    expect(completedSunday(new Date(instant))).toBe(expected);
  });
  it("validates real Sunday dates and keeps calendar days across leap/year boundaries", () => {
    expect(sunday("2026-02-30")).toBe(false);
    expect(sunday("2026-01-05")).toBe(false);
    expect(sunday("2026-01-04")).toBe(true);
    expect(shiftDate("2025-12-28", 7)).toBe("2026-01-04");
    expect(chicagoDate(new Date("2026-01-05T03:00:00Z"))).toBe("2026-01-04");
  });
});
describe("historical eligibility is not implied by source counts", () => {
  const group: ImportWeek = {
    week: "2026-01-04",
    target: "adult_service_1",
    unit: "attendance_count",
    ministry: "Synthetic",
    evidence: [{ mappingId: randomUUID(), sheet: "Test", coordinate: "B2", value: 446, flags: [] }],
    variance: null,
    flags: ["insufficient_comparison_sources"],
    evidenceHash: "a".repeat(64),
    approved: true,
    approval: {
      method: "owner_confirmed",
      note: "Owner verified the exact synthetic count",
      reviewedBy: randomUUID(),
      reviewedAt: new Date(),
    },
  };
  it("accepts only eligible current evidence and preserves the owner-confirmed distinction", () => {
    expect(historyEligible(group, "2026-11-07")).toBe(true);
    expect(historyEligible({ ...group, approved: false }, "2026-11-07")).toBe(false);
    expect(historyEligible({ ...group, week: "2026-04-12" }, "2026-11-07")).toBe(false);
    expect(historyEligible({ ...group, flags: ["external_dependency"] }, "2026-11-07")).toBe(false);
    expect(historyEligible({ ...group, flags: ["shared_formula_unresolved"] }, "2026-11-07")).toBe(
      false,
    );
    expect(historyEligible(group, "2026-01-01")).toBe(false);
    expect(historyEligible({ ...group, target: "adult_services_total" }, "2026-11-07")).toBe(false);
  });
});
describe("attendance API boundaries", () => {
  afterEach(() => vi.restoreAllMocks());
  const paths = [
    "/v1/attendance",
    "/v1/admin/attendance/history/00000000-0000-4000-8000-000000000001",
  ];
  const appFor = (role: "staff" | "leadership" | "admin" | null, csrf = false) => {
    const app = express();
    app.use(express.json());
    if (csrf)
      app.use((_req, res, next) => {
        res.locals.session = { csrfToken: "synthetic-csrf" };
        next();
      });
    app.use(
      createAttendanceRouter({
        name: "synthetic",
        enabled: true,
        authenticate: async () => (role ? syntheticPrincipal(role) : null),
      }),
    );
    app.use(
      (
        error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res
          .status(error instanceof AccessError ? error.status : 500)
          .json({ error: "Request failed" });
      },
    );
    return app;
  };
  it.each(paths)("denies signed-out reads %s", async (path) => {
    expect((await request(appFor(null)).get(path)).status).toBe(401);
  });
  it.each(["staff", "leadership"] as const)(
    "denies %s historical preview and configuration",
    async (role) => {
      const app = appFor(role);
      expect((await request(app).get(paths[1])).status).toBe(403);
      expect((await request(app).post("/v1/admin/attendance/definition").send({})).status).toBe(
        403,
      );
      expect((await request(app).post(paths[1]).send({})).status).toBe(403);
    },
  );
  it("requires session-bound CSRF and validates manual inputs before persistence", async () => {
    expect((await request(appFor("staff")).post("/v1/attendance").send({})).status).toBe(403);
    const savedOrigin = process.env.AUTH_ORIGIN;
    process.env.AUTH_ORIGIN = "https://attendance.example.invalid";
    try {
      const spy = vi.spyOn(repo, "saveManual");
      const response = await request(appFor("staff", true))
        .post("/v1/attendance")
        .set("Origin", process.env.AUTH_ORIGIN)
        .set("X-CSRF-Token", "synthetic-csrf")
        .send({ count: -1 });
      expect(response.status).toBe(400);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      if (savedOrigin === undefined) delete process.env.AUTH_ORIGIN;
      else process.env.AUTH_ORIGIN = savedOrigin;
    }
  });
});
