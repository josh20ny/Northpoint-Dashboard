import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { createMinistryDataRouter } from "../artifacts/api-server/src/routes/ministry-data";
import type { Principal } from "../artifacts/api-server/src/lib/auth";
import { AccessError } from "../artifacts/api-server/src/lib/administration";

const repo = vi.hoisted(() => ({
  readMinistryData: vi.fn(),
  ministryDataAdmin: vi.fn(),
  givingTransactions: vi.fn(),
  createMinistryMapping: vi.fn(),
  publishMinistryData: vi.fn(),
  importMinistryHistory: vi.fn(),
  getCheckInReview: vi.fn(),
  resolveCheckIn: vi.fn(),
}));
vi.mock("../artifacts/api-server/src/lib/ministry-data", () => repo);
vi.mock("../artifacts/api-server/src/lib/audit", () => ({ recordAudit: vi.fn() }));
function app(role: Principal["role"] | null, csrfSession = false) {
  const a = express();
  a.use(express.json());
  if (csrfSession)
    a.use((_req, res, next) => {
      res.locals.session = { csrfToken: "synthetic-csrf" };
      next();
    });
  a.use(
    createMinistryDataRouter({
      name: "synthetic",
      enabled: true,
      authenticate: async () =>
        role
          ? {
              userId: "11111111-1111-4111-8111-111111111111",
              role,
              identity: {
                provider: "replit",
                subject: "fixture",
                verifiedEmail: "fixture@example.invalid",
              },
            }
          : null,
    }),
  );
  a.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.status(error instanceof AccessError ? error.status : 500).json({ error: "test error" }),
  );
  return a;
}
beforeEach(() => {
  vi.clearAllMocks();
  repo.readMinistryData.mockResolvedValue({
    ministry: "giving",
    start: "2026-11-08",
    end: "2026-11-08",
    latestCompletedWeek: "2026-11-08",
    timezone: "America/Chicago",
    asOf: "2026-11-10T12:00:00Z",
    metrics: [],
    kpis: [],
    issues: [],
  });
  repo.getCheckInReview.mockResolvedValue({
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
        assumedMinistry: "upstreet",
        ministry: "upstreet",
        ministryBasis: "mapped",
        issueReasons: ["missing_person_profile"],
        canInclude: true,
        resolution: null,
      },
    ],
    page: 1,
    pageSize: 50,
    total: 1,
    unresolved: 1,
    selectedDate: "2026-11-08",
    availableSundays: ["2026-11-08"],
    attendancePreview: [
      {
        ministry: "upstreet",
        scope: "service-1",
        value: 42,
        quality: "partial",
        flags: ["unresolved_checkins_pending"],
      },
    ],
    asOf: "2026-11-10T12:00:00Z",
  });
});
describe("aggregate versus person-linked ministry permissions", () => {
  for (const role of ["staff", "leadership", "admin"] as const)
    it(`${role} can read broad Giving summaries`, async () => {
      const response = await request(app(role)).get("/v1/ministry-data/giving");
      expect(response.status).toBe(200);
      expect(repo.readMinistryData).toHaveBeenCalledOnce();
      expect(repo.givingTransactions).not.toHaveBeenCalled();
    });
  for (const role of ["staff", "leadership"] as const)
    it(`${role} cannot read financial transactions or source configuration`, async () => {
      for (const path of [
        "/v1/admin/ministry-data/giving-transactions",
        "/v1/admin/ministry-data",
        "/v1/admin/ministry-data/giving-policy",
        "/v1/admin/ministry-data/giving-health",
        "/v1/admin/ministry-data/check-ins",
      ]) {
        expect((await request(app(role)).get(path)).status).toBe(403);
      }
      expect(repo.givingTransactions).not.toHaveBeenCalled();
      expect(repo.ministryDataAdmin).not.toHaveBeenCalled();
      expect(repo.getCheckInReview).not.toHaveBeenCalled();
    });
  it("returns child names and mapping context only on Admin Check-In review", async () => {
    const response = await request(app("admin")).get("/v1/admin/ministry-data/check-ins?page=1");
    expect(response.status).toBe(200);
    expect(response.body.items[0]).toEqual(
      expect.objectContaining({
        checkInId: "300",
        serviceDate: "2026-11-08",
        childName: "Casey Jones",
        ministry: "upstreet",
        locationNames: ["UpStreet"],
        resolution: null,
      }),
    );
    expect(JSON.stringify(response.body)).not.toMatch(/private-person-id|personId|displayName/);
    expect(repo.getCheckInReview).toHaveBeenCalledOnce();
  });
  it("rejects unauthenticated aggregates and arbitrary donor filters", async () => {
    expect((await request(app(null)).get("/v1/ministry-data/giving")).status).toBe(401);
    expect((await request(app("staff")).get("/v1/ministry-data/giving?personId=99")).status).toBe(
      400,
    );
  });
  it("guards source mutations with CSRF before entering a repository", async () => {
    const response = await request(app("admin"))
      .post("/v1/admin/ministry-data/publish")
      .send({ product: "giving", start: "2026-11-08", end: "2026-11-08" });
    expect(response.status).toBe(403);
    expect(repo.publishMinistryData).not.toHaveBeenCalled();
    const resolution = await request(app("admin"))
      .post("/v1/admin/ministry-data/check-ins/300/resolution")
      .send({ action: "exclude" });
    expect(resolution.status).toBe(403);
    expect(repo.resolveCheckIn).not.toHaveBeenCalled();
  });
  it("records a valid Admin include resolution through the protected endpoint", async () => {
    const previousOrigin = process.env.AUTH_ORIGIN;
    process.env.AUTH_ORIGIN = "https://northpoint.test";
    repo.resolveCheckIn.mockResolvedValue({ checkInId: "300", action: "include" });
    try {
      const response = await request(app("admin", true))
        .post("/v1/admin/ministry-data/check-ins/300/resolution")
        .set("Origin", "https://northpoint.test")
        .set("X-CSRF-Token", "synthetic-csrf")
        .send({ action: "include" });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ checkInId: "300", action: "include" });
      expect(repo.resolveCheckIn).toHaveBeenCalledWith(
        expect.objectContaining({ role: "admin" }),
        "300",
        "include",
      );
    } finally {
      if (previousOrigin === undefined) delete process.env.AUTH_ORIGIN;
      else process.env.AUTH_ORIGIN = previousOrigin;
    }
  });
});
