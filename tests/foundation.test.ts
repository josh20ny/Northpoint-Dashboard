import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import app from "../artifacts/api-server/src/app";
import {
  hasPermission,
  requirePermission,
  type AuthProvider,
} from "../artifacts/api-server/src/lib/auth";
import { reportingWeekEnding } from "../artifacts/api-server/src/lib/reporting-calendar";
import { validateEnvironment } from "../artifacts/api-server/src/lib/environment";
import { syntheticPrincipal } from "./fixtures/principals";

describe("deny-by-default authentication boundary", () => {
  it("never authenticates a spoofed header or role", async () => {
    const response = await request(app)
      .get("/api/v1/admin/users")
      .set("X-Role", "admin")
      .set("Authorization", "Bearer synthetic-only");
    expect(response.status).toBe(401);
  });
  it.each([
    "/api/v1/giving/donors",
    "/api/v1/attendance/people",
    "/api/v1/exports",
    "/api/v1/reports",
    "/api/v1/analyst/query",
    "/api/v1/me",
  ])("protects %s", async (route) => {
    expect((await request(app).get(route)).status).toBe(401);
  });
  it("protects mutations", async () => {
    expect(
      (await request(app).post("/api/v1/admin/integrations").send({ role: "admin" })).status,
    ).toBe(401);
  });
  it.each(["staff", "leadership"] as const)("%s cannot read individual giving", async (role) => {
    expect(hasPermission(syntheticPrincipal(role), "giving:individual")).toBe(false);
    const provider: AuthProvider = {
      name: "test-only",
      enabled: true,
      authenticate: async () => syntheticPrincipal(role),
    };
    const testApp = express();
    testApp.get("/donors", requirePermission("giving:individual", provider), (_req, res) => {
      res.json({ allowed: true });
    });
    expect((await request(testApp).get("/donors")).status).toBe(403);
  });
  it("uses explicit admin permission without enabling admin login", () => {
    expect(hasPermission(syntheticPrincipal("admin"), "giving:individual")).toBe(true);
    expect(hasPermission(null, "system:manage")).toBe(false);
  });
});

describe("public infrastructure only", () => {
  it("provides liveness", async () => {
    const response = await request(app).get("/api/healthz");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });
  it("provides honest no-live-data foundation status", async () => {
    const response = await request(app).get("/api/v1/foundation");
    expect(response.status).toBe(200);
    expect(response.body.quality).toBe("no_live_data");
    expect(response.body.auth.enabled).toBe(false);
    expect(response.body.ministries).toHaveLength(10);
    expect(
      response.body.integrations.every(
        (item: { status: string }) => item.status === "not_connected",
      ),
    ).toBe(true);
    expect(response.body).not.toHaveProperty("metrics");
  });
  it("uses a document allowlist, never raw source datasets", async () => {
    expect((await request(app).get("/api/v1/documents/docs--prd")).status).toBe(200);
    const documents = await request(app).get("/api/v1/documents");
    expect(documents.body.some((item: { path: string }) => item.path.startsWith("data/"))).toBe(
      false,
    );
    expect((await request(app).get("/api/v1/documents/.env")).status).toBe(404);
    expect((await request(app).get("/api/v1/documents/data--sample_week_cells.csv")).status).toBe(
      404,
    );
  });
  it("has no permissive cross-origin access", async () => {
    const response = await request(app)
      .get("/api/v1/foundation")
      .set("Origin", "https://untrusted.invalid");
    expect(response.headers).not.toHaveProperty("access-control-allow-origin");
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it("returns safe malformed-json errors", async () => {
    const response = await request(app)
      .post("/api/v1/admin/users")
      .set("Content-Type", "application/json")
      .send('{"secret":');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid request" });
  });
});

describe("reporting calendar (not a metric calculation)", () => {
  it.each([
    ["2026-11-02T05:30:00Z", "2026-11-01"], // Sunday 23:30 CST
    ["2026-11-02T06:00:00Z", "2026-11-08"], // Monday 00:00 CST
    ["2026-03-08T07:30:00Z", "2026-03-08"], // Spring-forward
    ["2026-03-08T08:30:00Z", "2026-03-08"],
    ["2026-11-01T06:30:00Z", "2026-11-01"], // Repeated fall hour
    ["2026-11-01T07:30:00Z", "2026-11-01"],
    ["2026-12-31T18:00:00Z", "2027-01-03"],
  ])("%s → Sunday %s", (instant, sunday) => {
    expect(reportingWeekEnding(new Date(instant))).toBe(sunday);
  });
  it("rejects invalid dates", () => {
    expect(() => reportingWeekEnding(new Date("invalid"))).toThrow();
  });
});

describe("environment validation", () => {
  it("defaults authentication to disabled", () => {
    expect(validateEnvironment({ PCO_TOKEN_ENCRYPTION_KEY: "1".repeat(64) }).AUTH_PROVIDER).toBe(
      "disabled",
    );
  });
  it("rejects unimplemented auth providers", () => {
    expect(() => validateEnvironment({ AUTH_PROVIDER: "google" })).toThrow("AUTH_PROVIDER");
  });
  it("rejects invalid ports without printing inputs", () => {
    expect(() =>
      validateEnvironment({ PORT: "SECRET_VALUE", PCO_TOKEN_ENCRYPTION_KEY: "1".repeat(64) }),
    ).toThrow("Invalid environment fields: PORT");
  });
  it.each([undefined, "", "bad", "a".repeat(63), "a".repeat(65), "z".repeat(64)])(
    "rejects missing or invalid token encryption keys without disclosing inputs",
    (key) => {
      expect(() => validateEnvironment({ PCO_TOKEN_ENCRYPTION_KEY: key })).toThrow(
        /^Invalid environment fields: PCO_TOKEN_ENCRYPTION_KEY$/,
      );
    },
  );
  it("validates the persistent key without returning it as application configuration", () => {
    const input = { PCO_TOKEN_ENCRYPTION_KEY: "A".repeat(64) };
    const config = validateEnvironment(input);
    expect(config).not.toHaveProperty("PCO_TOKEN_ENCRYPTION_KEY");
    expect(input.PCO_TOKEN_ENCRYPTION_KEY).toBe("A".repeat(64));
    expect(validateEnvironment(input)).toEqual(config);
    expect(() => validateEnvironment({})).toThrow("PCO_TOKEN_ENCRYPTION_KEY");
  });
});
