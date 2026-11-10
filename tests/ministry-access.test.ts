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
}));
vi.mock("../artifacts/api-server/src/lib/ministry-data", () => repo);
vi.mock("../artifacts/api-server/src/lib/audit", () => ({ recordAudit: vi.fn() }));
function app(role: Principal["role"] | null) {
  const a = express();
  a.use(express.json());
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
      ]) {
        expect((await request(app(role)).get(path)).status).toBe(403);
      }
      expect(repo.givingTransactions).not.toHaveBeenCalled();
      expect(repo.ministryDataAdmin).not.toHaveBeenCalled();
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
  });
});
