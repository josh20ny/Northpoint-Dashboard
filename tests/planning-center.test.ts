import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  configuration,
  encrypt,
  decrypt,
  exchangeToken,
  providerRequest,
  ProviderError,
  retrySeconds,
} from "../artifacts/api-server/src/lib/planning-center-client";
import {
  roots,
  pagePath,
  parsePage,
  sourceEntity,
  sourceHash,
} from "../artifacts/api-server/src/lib/planning-center-source";
import { createPlanningCenterRouter } from "../artifacts/api-server/src/routes/planning-center";
import type { AuthProvider, Principal } from "../artifacts/api-server/src/lib/auth";

const person = {
  type: "Person",
  id: "42",
  attributes: {
    status: "active",
    updated_at: "2026-01-04T15:00:00Z",
    medical_notes: "must not persist",
    first_name: "not collected",
  },
};
describe("Planning Center secure transport and source contract", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_ORIGIN", "https://example.invalid");
    vi.stubEnv("PCO_CLIENT_ID", "synthetic-client");
    vi.stubEnv("PCO_CLIENT_SECRET", "synthetic-secret");
    vi.stubEnv("PCO_TOKEN_ENCRYPTION_KEY", "1".repeat(64));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("fails closed on missing configuration, malformed keys and non-origin callbacks", () => {
    expect(configuration().configured).toBe(true);
    expect(configuration().callbackUrl).toBe(
      "https://example.invalid/api/v1/admin/planning-center/callback",
    );
    vi.stubEnv("PCO_TOKEN_ENCRYPTION_KEY", "bad");
    expect(configuration().configured).toBe(false);
    vi.stubEnv("PCO_TOKEN_ENCRYPTION_KEY", "1".repeat(64));
    vi.stubEnv("AUTH_ORIGIN", "https://example.invalid/path");
    expect(configuration().configured).toBe(false);
  });
  it("encrypts secrets with independent nonces, authentication and purpose binding", () => {
    const a = encrypt({ token: "synthetic" }, "tokens:1");
    const b = encrypt({ token: "synthetic" }, "tokens:1");
    expect(a).not.toBe(b);
    expect(a).not.toContain("synthetic");
    expect(decrypt(a, "tokens:1")).toEqual({ token: "synthetic" });
    expect(() => decrypt(a, "tokens:2")).toThrow(/cannot be decrypted/);
    const parts = a.split(".");
    parts[2] = Buffer.alloc(16).toString("base64url");
    expect(() => decrypt(parts.join("."), "tokens:1")).toThrow(/cannot be decrypted/);
  });
  it("requires the original persistent key to recover both OAuth tokens", () => {
    const tokens = {
      accessToken: "synthetic-access-token",
      refreshToken: "synthetic-refresh-token",
      expiresAt: 123456789,
      scopes: ["people", "services", "check_ins"],
    };
    const ciphertext = encrypt(tokens, "tokens:1");
    expect(ciphertext).not.toContain(tokens.accessToken);
    expect(ciphertext).not.toContain(tokens.refreshToken);
    vi.stubEnv("PCO_TOKEN_ENCRYPTION_KEY", "2".repeat(64));
    expect(() => decrypt(ciphertext, "tokens:1")).toThrow(/restore the encryption key/);
    vi.stubEnv("PCO_TOKEN_ENCRYPTION_KEY", "");
    expect(() => encrypt(tokens, "tokens:1")).toThrow(/configuration is incomplete/);
    expect(() => decrypt(ciphertext, "tokens:1")).toThrow(/configuration is incomplete/);
    vi.stubEnv("PCO_TOKEN_ENCRYPTION_KEY", "1".repeat(64));
    expect(decrypt(ciphertext, "tokens:1")).toEqual(tokens);
  });
  it("allowlists provider paths and reasserts sparse fields on every page", () => {
    const url = pagePath(
      { path: "/people/v2/people?offset=100&include=background_checks", type: "Person" },
      "people",
    );
    expect(url).toContain("offset=100");
    expect(url).not.toContain("background_checks");
    expect(decodeURIComponent(url)).toContain(
      "fields[Person]=created_at,updated_at,status,inactivated_at",
    );
    for (const path of [
      "https://evil.invalid/people/v2/people",
      "/giving/v2/donations",
      "//evil.invalid/people/v2/people",
      "https://user@api.planningcenteronline.com/people/v2/people",
      "/people/v2/people#x",
      "/people/v2/people?offset=-1",
    ])
      expect(() => pagePath({ path, type: "Person" }, "people")).toThrow();
  });
  it("minimizes raw fields and makes revision hashes independent of key order", () => {
    const a = sourceEntity(person);
    expect(a.attributes).toEqual({ updated_at: "2026-01-04T15:00:00Z", status: "active" });
    expect(JSON.stringify(a)).not.toMatch(/medical|first_name/);
    const b = sourceEntity({
      ...person,
      attributes: { updated_at: person.attributes.updated_at, status: "active" },
    });
    expect(sourceHash(a)).toBe(sourceHash(b));
    expect(sourceHash(a)).not.toBe(
      sourceHash(sourceEntity({ ...person, attributes: { status: "inactive" } })),
    );
  });
  it("preserves nullable source relationships without cross-product identity inference", () => {
    const e = sourceEntity({
      type: "CheckIn",
      id: "3",
      attributes: { kind: "Guest", one_time_guest: true },
      relationships: {
        person: { data: null },
        event_period: { data: { type: "EventPeriod", id: "9" } },
      },
    });
    expect(e.relationships.person?.data).toBeNull();
    expect(e.relationships.event_period?.data).toEqual({ type: "EventPeriod", id: "9" });
  });
  it("rejects invalid timestamps, IDs, types and payload shapes", () => {
    for (const x of [
      { ...person, id: "../evil" },
      { ...person, attributes: { updated_at: "bad" } },
      { ...person, type: "Donation" },
      { ...person, attributes: { status: { unsafe: true } } },
    ])
      expect(() => sourceEntity(x)).toThrow();
    expect(() => parsePage({ data: person }, roots("people")[0]!, "people")).toThrow();
    expect(() =>
      parsePage(
        { data: [{ type: "ServiceType", id: "1", attributes: {} }] },
        roots("people")[0]!,
        "people",
      ),
    ).toThrow();
  });
  it("follows only increasing same-collection next links and discovers service plan children", () => {
    const p = roots("people")[0]!;
    expect(
      parsePage(
        {
          data: [person],
          links: { next: "https://api.planningcenteronline.com/people/v2/people?offset=100" },
        },
        p,
        "people",
      ).nextPages,
    ).toHaveLength(1);
    for (const next of [
      "https://evil.invalid/people/v2/people?offset=100",
      "/people/v2/people?offset=0",
      "/people/v2/people",
      "/giving/v2/donations?offset=100",
    ])
      expect(() => parsePage({ data: [person], links: { next } }, p, "people")).toThrow();
    const service = parsePage(
      { data: [{ type: "ServiceType", id: "3", attributes: { name: "Sunday" } }] },
      roots("services")[0]!,
      "services",
    );
    expect(service.nextPages).toEqual([
      { path: "/services/v2/service_types/3/plans", type: "Plan" },
    ]);
    const plan = parsePage(
      { data: [{ type: "Plan", id: "4", attributes: {} }] },
      service.nextPages[0]!,
      "services",
    );
    expect(plan.nextPages).toEqual([
      { path: "/services/v2/service_types/3/plans/4/plan_times", type: "PlanTime" },
    ]);
  });
  it("rejects included giving/health objects instead of silently ingesting them", () => {
    expect(() =>
      parsePage(
        { data: [], included: [{ type: "Person", id: "3", attributes: {} }] },
        roots("check_ins")[1]!,
        "check_ins",
      ),
    ).toThrow();
  });
  it("never follows HTTP redirects and sanitizes provider errors", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(new Response('{"errors":[{"detail":"secret body"}]}', { status: 403 }));
    vi.stubGlobal("fetch", f);
    await expect(providerRequest("/people/v2")).rejects.toThrow("permissions");
    expect(f.mock.calls[0]![1].redirect).toBe("error");
    await expect(providerRequest("//evil.invalid")).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("enforces maximum response size", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ a: "x".repeat(500) }))),
    );
    await expect(providerRequest("/people/v2", {}, 100)).rejects.toBeInstanceOf(ProviderError);
  });
  it("handles 429 delay seconds, HTTP date, network and 500 without exposing provider bodies", async () => {
    expect(retrySeconds("19")).toBe(19);
    expect(retrySeconds(new Date(20_000).toUTCString(), 0)).toBe(20);
    expect(retrySeconds("bad")).toBe(30);
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response("private", { status: 429, headers: { "retry-after": "19" } }),
      );
    vi.stubGlobal("fetch", f);
    await expect(providerRequest("/people/v2")).rejects.toMatchObject({
      status: 429,
      retrySeconds: 19,
    });
    f.mockResolvedValue(new Response("private", { status: 500 }));
    await expect(providerRequest("/people/v2")).rejects.toMatchObject({ status: 500 });
    f.mockRejectedValue(new Error("sensitive upstream URL"));
    await expect(providerRequest("/people/v2")).rejects.toThrow("temporarily unavailable");
  });
  it("requires exactly approved scopes and complete token responses", async () => {
    const token = {
      access_token: "access",
      refresh_token: "refresh",
      token_type: "bearer",
      expires_in: 7200,
      scope: "people services check_ins",
    };
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(token)));
    vi.stubGlobal("fetch", f);
    const t = await exchangeToken({ grant_type: "authorization_code", code: "synthetic" });
    expect(t.scopes).toEqual(["people", "services", "check_ins"]);
    f.mockResolvedValue(
      new Response(JSON.stringify({ ...token, scope: "people services check_ins giving" })),
    );
    await expect(exchangeToken({})).rejects.toThrow();
    f.mockResolvedValue(new Response(JSON.stringify({ ...token, scope: undefined })));
    await expect(exchangeToken({})).rejects.toThrow();
    f.mockResolvedValue(new Response(JSON.stringify({ ...token, scope: undefined })));
    await expect(exchangeToken({ grant_type: "refresh_token" }, t)).resolves.toMatchObject({
      scopes: t.scopes,
    });
  });
});
describe("Planning Center HTTP permission boundary", () => {
  for (const role of [null, "staff", "leadership"] as const) {
    it(`denies all provider actions for ${role ?? "anonymous"}`, async () => {
      const identity = {
        subject: "synthetic",
        provider: "replit" as const,
        verifiedEmail: "synthetic@example.invalid",
      };
      const provider: AuthProvider = {
        name: "synthetic",
        enabled: true,
        authenticate: async () => (role ? ({ role, identity } as Principal) : null),
      };
      const app = express();
      app.use(express.json());
      app.use("/api", createPlanningCenterRouter(provider));
      for (const [method, path] of [
        ["get", ""],
        ["get", "/callback"],
        ["post", "/authorize"],
        ["post", "/confirm"],
        ["post", "/disconnect"],
        ["post", "/syncs"],
        ["post", "/syncs/00000000-0000-4000-8000-000000000000/advance"],
        ["post", "/syncs/00000000-0000-4000-8000-000000000000/cancel"],
        ["post", "/syncs/00000000-0000-4000-8000-000000000000/automation"],
      ] as const) {
        const response = await request(app)[method](`/api/v1/admin/planning-center${path}`);
        expect(response.status).toBe(role ? 403 : 401);
        expect(response.headers["cache-control"]).toBe("no-store");
      }
    });
  }
  it("requires CSRF even from authenticated Admin and rejects unsupported product scopes", async () => {
    const auth: AuthProvider = {
      name: "synthetic",
      enabled: true,
      authenticate: async () => ({
        role: "admin",
        userId: "synthetic",
        identity: {
          subject: "synthetic",
          provider: "replit",
          verifiedEmail: "synthetic@example.invalid",
        },
      }),
    };
    const app = express();
    app.use(express.json());
    app.use("/api", createPlanningCenterRouter(auth));
    const response = await request(app)
      .post("/api/v1/admin/planning-center/syncs")
      .send({ product: "giving", mode: "backfill" });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Request verification failed");
    const automatic = await request(app)
      .post("/api/v1/admin/planning-center/syncs/00000000-0000-4000-8000-000000000000/automation")
      .send({ enabled: true });
    expect(automatic.status).toBe(403);
    expect(automatic.body.error).toBe("Request verification failed");
  });
});
