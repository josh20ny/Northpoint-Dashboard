import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createOperationsRouter } from "../artifacts/api-server/src/routes/operations";
import { requireCsrf } from "../artifacts/api-server/src/lib/security";
import { verifiedOidcIdentity } from "../artifacts/api-server/src/lib/session-store";
import { validCalendarDate, explicitInstant } from "../artifacts/api-server/src/lib/administration";
import { syntheticPrincipal } from "./fixtures/principals";
import { validateEnvironment } from "../artifacts/api-server/src/lib/environment";

describe("Phase 1 guards on actual operational routes", () => {
  const paths = [
    "/v1/admin/workspace",
    "/v1/giving/donors",
    "/v1/giving/transactions",
    "/v1/giving/summary",
  ];
  it.each(["staff", "leadership"] as const)(
    "%s cannot access finance or administration by direct URL",
    async (role) => {
      const app = express();
      app.use(
        createOperationsRouter({
          name: "test-only",
          enabled: true,
          authenticate: async () => syntheticPrincipal(role),
        }),
      );
      for (const route of paths) {
        const res = await request(app).get(route).set("X-Role", "admin");
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: "Forbidden" });
        expect(res.headers["cache-control"]).toBe("no-store");
      }
      for (const route of ["/v1/admin/invitations", "/v1/admin/ministries", "/v1/admin/services"]) {
        expect((await request(app).post(route).send({ role: "admin" })).status).toBe(403);
      }
      expect(
        (
          await request(app)
            .patch("/v1/admin/users/00000000-0000-4000-8000-000000000001")
            .send({ role: "admin" })
        ).status,
      ).toBe(403);
      expect(
        (await request(app).delete("/v1/admin/invitations/00000000-0000-4000-8000-000000000001"))
          .status,
      ).toBe(403);
    },
  );
  it("never implements finance/export/report/AI data access as a permissive fallback", async () => {
    const app = express();
    app.use(
      createOperationsRouter({
        name: "test-only",
        enabled: true,
        authenticate: async () => syntheticPrincipal("staff"),
      }),
    );
    for (const path of [
      "/v1/exports",
      "/v1/reports",
      "/v1/analyst/query",
      "/v1/attendance/people",
      "/v1/raw-source-records",
    ]) {
      const r = await request(app).get(path);
      expect(r.status).toBe(501);
      expect(r.body).not.toHaveProperty("data");
    }
  });
});
describe("CSRF boundary", () => {
  it("requires same-origin plus the session-bound token, never just one", async () => {
    vi.stubEnv("AUTH_ORIGIN", "https://church.example.invalid");
    const app = express();
    app.use((_req, res, next) => {
      res.locals.session = { csrfToken: "test-token" };
      next();
    });
    app.post("/mutate", requireCsrf, (_req, res) => {
      res.status(204).end();
    });
    expect((await request(app).post("/mutate")).status).toBe(403);
    expect(
      (
        await request(app)
          .post("/mutate")
          .set("Origin", "https://evil.invalid")
          .set("X-CSRF-Token", "test-token")
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/mutate")
          .set("Origin", "https://church.example.invalid")
          .set("X-CSRF-Token", "wrong")
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/mutate")
          .set("Origin", "https://church.example.invalid")
          .set("X-CSRF-Token", "test-token")
      ).status,
    ).toBe(204);
    vi.unstubAllEnvs();
  });
});
describe("verified identity and configuration", () => {
  it("requires explicit instant offsets and real calendar days", () => {
    expect(explicitInstant("2026-11-08T09:00:00-06:00")).toBe(true);
    expect(explicitInstant("2026-11-08T15:00:00.000Z")).toBe(true);
    expect(explicitInstant("2026-11-08T09:00:00")).toBe(false);
    expect(explicitInstant("2026-02-30T09:00:00-06:00")).toBe(false);
  });
  const claims = { sub: "synthetic-subject", email: "Staff@Example.Invalid", email_verified: true };
  it("requires verified email and normalizes its casing", () => {
    expect(verifiedOidcIdentity(claims)?.verifiedEmail).toBe("staff@example.invalid");
    expect(verifiedOidcIdentity({ ...claims, email_verified: false })).toBeNull();
    expect(verifiedOidcIdentity({ ...claims, email_verified: undefined })).toBeNull();
    expect(verifiedOidcIdentity({ ...claims, sub: "" })).toBeNull();
    expect(verifiedOidcIdentity({ ...claims, email: "bad" })).toBeNull();
  });
  it("requires exact HTTPS callback origin and client id before enabling auth", () => {
    expect(() => validateEnvironment({ AUTH_PROVIDER: "replit" })).toThrow("AUTH_ORIGIN");
    expect(() =>
      validateEnvironment({
        AUTH_PROVIDER: "replit",
        AUTH_ORIGIN: "https://example.invalid/path",
        REPL_ID: "id",
      }),
    ).toThrow();
    expect(
      validateEnvironment({
        AUTH_PROVIDER: "replit",
        AUTH_ORIGIN: "https://example.invalid",
        REPL_ID: "id",
        PCO_TOKEN_ENCRYPTION_KEY: "1".repeat(64),
      }).AUTH_PROVIDER,
    ).toBe("replit");
  });
  it.each(["2026-02-30", "2026-13-01", "not-a-date"])(
    "rejects impossible calendar date %s",
    (value) => {
      expect(validCalendarDate(value)).toBe(false);
    },
  );
});
