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
  scanRoots,
  pagePath,
  parsePage,
  sourceEntity,
  sourceHash,
  incrementalSinceDate,
  validDateWindow,
} from "../artifacts/api-server/src/lib/planning-center-source";
import { ministryPagePath, parseMinistryPage } from "../artifacts/api-server/src/lib/ministry-source";
import { createPlanningCenterRouter } from "../artifacts/api-server/src/routes/planning-center";
import type { AuthProvider, Principal } from "../artifacts/api-server/src/lib/auth";
import { syncView } from "../artifacts/api-server/src/lib/planning-center";
import { SetPlanningCenterAutomationResponse } from "../lib/api-zod/src/generated/api";

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
  it("serializes PostgreSQL civil DATE values before validating current-run responses", () => {
    for (const zone of ["UTC", "America/Chicago", "Asia/Tokyo"]) {
      vi.stubEnv("TZ", zone);
      const run = {
        id: "00000000-0000-4000-8000-000000000001",
        account_ref: "1",
        product: "groups" as const,
        mode: "current" as const,
        status: "running" as const,
        coverage_start: new Date(2026, 10, 10),
        coverage_end: new Date(2026, 10, 12),
        queue: [],
        visited: [],
        fetched: 0,
        revised: 0,
        pages: 0,
        started_at: new Date(),
        finished_at: null,
        retry_at: null,
        error: null,
        automatic: true,
        automatic_requested_by: "00000000-0000-4000-8000-000000000001",
        last_automatic_at: null,
      };
      expect(SetPlanningCenterAutomationResponse.parse(syncView(run)).coverageStart).toBe(
        "2026-11-10",
      );
      expect(syncView({ ...run, coverage_start: "2026-10-12" }).coverageStart).toBe("2026-10-12");
      expect(syncView({ ...run, coverage_start: null }).coverageStart).toBeNull();
      expect(syncView(run).coverageEnd).toBe("2026-11-12");
      expect(syncView({ ...run, coverage_end: null }).coverageEnd).toBeNull();
    }
  });
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
  it("loads the small PCO grade catalogue without widening the People profile scan", () => {
    const grade = roots("people").find((page) => page.type === "Grade")!;
    const gradeQuery = new URL(pagePath(grade, "people"), "https://api.planningcenteronline.com");
    expect(gradeQuery.pathname).toBe("/people/v2");
    expect(gradeQuery.searchParams.get("fields[Grade]")).toBe("key,value");
    expect(gradeQuery.searchParams.has("fields[Person]")).toBe(false);

    const personQuery = new URL(
      pagePath(roots("people")[0]!, "people"),
      "https://api.planningcenteronline.com",
    );
    expect(personQuery.searchParams.get("fields[Person]")).toBe(
      "created_at,updated_at,status,inactivated_at",
    );
    expect(
      sourceEntity({
        type: "Grade",
        id: "7",
        attributes: { key: 7, value: "7th Grade" },
      }).attributes,
    ).toEqual({ key: 7, value: "7th Grade" });
  });
  it("builds overlapping, provider-filtered incremental roots without risking Groups coverage", () => {
    expect(incrementalSinceDate("2026-11-13T13:25:24.025Z")).toBe("2026-11-10");
    expect(incrementalSinceDate("not-a-date")).toBeNull();

    const people = scanRoots("people", "2026-11-10", "incremental")[0]!;
    expect(people).toMatchObject({ since: "2026-11-10", windowField: "updated_at" });
    expect(
      new URL(pagePath(people, "people"), "https://api.planningcenteronline.com").searchParams.get(
        "where[updated_at][gte]",
      ),
    ).toBe("2026-11-10T00:00:00Z");

    const checkIns = scanRoots("check_ins", "2026-11-10", "incremental");
    const newCheckIns = checkIns.find((page) => page.type === "CheckIn" && !page.windowField)!;
    const changedCheckIns = checkIns.find(
      (page) => page.type === "CheckIn" && page.windowField === "updated_at",
    )!;
    expect(
      new URL(pagePath(newCheckIns, "check_ins"), "https://api.planningcenteronline.com")
        .searchParams.get("where[created_at][gte]"),
    ).toBe("2026-11-10T00:00:00Z");
    expect(
      new URL(pagePath(changedCheckIns, "check_ins"), "https://api.planningcenteronline.com")
        .searchParams.get("where[updated_at][gte]"),
    ).toBe("2026-11-10T00:00:00Z");

    const servingType = scanRoots("serving", "2026-11-10", "incremental")[0]!;
    const servingPlan = parseMinistryPage(
      {
        data: [{ type: "ServiceType", id: "3", attributes: { name: "Sunday" } }],
      },
      servingType,
      "serving",
    ).nextPages[0]!;
    expect(servingPlan).toMatchObject({ since: "2026-11-10", windowField: "updated_at" });
    expect(
      new URL(
        ministryPagePath(servingPlan, "serving"),
        "https://api.planningcenteronline.com",
      ).searchParams.get("where[updated_at][gte]"),
    ).toBe("2026-11-10T00:00:00Z");

    const updatedDonation = scanRoots("giving", "2026-11-10", "incremental").find(
      (page) => page.type === "Donation" && page.windowField === "updated_at",
    );
    expect(updatedDonation).toBeDefined();
    expect(
      new URL(
        ministryPagePath(updatedDonation!, "giving"),
        "https://api.planningcenteronline.com",
      ).searchParams.get("where[updated_at][gte]"),
    ).toBe("2026-11-10T00:00:00Z");

    const groups = scanRoots("groups", "2026-11-10", "incremental");
    expect(groups).toEqual(roots("groups"));
    expect(
      new URL(
        ministryPagePath(
          scanRoots("groups", "2026-11-10", "current").find((page) => page.type === "Event")!,
          "groups",
        ),
        "https://api.planningcenteronline.com",
      ).searchParams.get("where[starts_at][gte]"),
    ).toBe("2026-11-10T00:00:00Z");
  });
  it("preserves incremental filters through pagination and into service plan children", () => {
    const since = "2026-11-10";
    const personPage = scanRoots("people", since, "incremental")[0]!;
    const nextPeoplePage = parsePage(
      {
        data: [person],
        links: { next: "https://api.planningcenteronline.com/people/v2/people?offset=100" },
      },
      personPage,
      "people",
    ).nextPages[0]!;
    expect(nextPeoplePage).toMatchObject({ since, windowField: "updated_at" });
    expect(
      new URL(pagePath(nextPeoplePage, "people"), "https://api.planningcenteronline.com").searchParams.get(
        "where[updated_at][gte]",
      ),
    ).toBe(`${since}T00:00:00Z`);

    const serviceTypePage = scanRoots("services", since, "incremental")[0]!;
    const plans = parsePage(
      {
        data: [{ type: "ServiceType", id: "3", attributes: { name: "Sunday" } }],
      },
      serviceTypePage,
      "services",
    ).nextPages[0]!;
    expect(plans).toMatchObject({ type: "Plan", since, windowField: "updated_at" });
    expect(
      new URL(pagePath(plans, "services"), "https://api.planningcenteronline.com").searchParams.get(
        "where[updated_at][gte]",
      ),
    ).toBe(`${since}T00:00:00Z`);

    const updatedDonation = scanRoots("giving", since, "incremental").find(
      (page) => page.type === "Donation" && page.windowField === "updated_at",
    )!;
    const nextDonationPage = parseMinistryPage(
      {
        data: [],
        links: {
          next: "https://api.planningcenteronline.com/giving/v2/donations?offset=100",
        },
      },
      updatedDonation,
      "giving",
    ).nextPages[0]!;
    expect(nextDonationPage).toMatchObject({ since, windowField: "updated_at" });
    expect(
      new URL(
        ministryPagePath(nextDonationPage, "giving"),
        "https://api.planningcenteronline.com",
      ).searchParams.get("where[updated_at][gte]"),
    ).toBe(`${since}T00:00:00Z`);
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
        event_times: { data: [] },
        locations: { data: [] },
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
      {
        data: [
          {
            type: "Plan",
            id: "4",
            attributes: {},
            relationships: { service_type: { data: { type: "ServiceType", id: "3" } } },
          },
        ],
      },
      service.nextPages[0]!,
      "services",
    );
    expect(plan.nextPages).toEqual([
      { path: "/services/v2/service_types/3/plans/4/plan_times", type: "PlanTime" },
    ]);
  });
  it("rejects included giving objects and strips health fields from linked people", () => {
    expect(() =>
      parsePage(
        { data: [], included: [{ type: "Donation", id: "3", attributes: {} }] },
        roots("check_ins")[1]!,
        "check_ins",
      ),
    ).toThrow();
    const parsed = parsePage(
      {
        data: [],
        included: [
          {
            type: "Person",
            id: "3",
            attributes: { grade: "5th Grade", medical_notes: "must not persist" },
          },
        ],
      },
      roots("check_ins")[1]!,
      "check_ins",
    );
    expect(parsed.entities[0]?.attributes).toEqual({ grade: "5th Grade" });
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
        ["post", "/schedule"],
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
    const schedule = await request(app)
      .post("/api/v1/admin/planning-center/schedule")
      .send({ enabled: true });
    expect(schedule.status).toBe(403);
    const automatic = await request(app)
      .post("/api/v1/admin/planning-center/syncs/00000000-0000-4000-8000-000000000000/automation")
      .send({ enabled: true });
    expect(automatic.status).toBe(403);
    expect(automatic.body.error).toBe("Request verification failed");
  });
  it("bounds Check-Ins to an inclusive, validated date window on creation and update scans", () => {
    expect(validDateWindow("2026-11-06", "2026-11-08")).toBe(true);
    expect(validDateWindow("2026-11-08", "2026-11-06")).toBe(false);
    expect(validDateWindow("2026-11-06", "2026-12-07")).toBe(false);
    expect(validDateWindow("2026-02-30", "2026-03-01")).toBe(false);

    const pages = scanRoots("check_ins", "2026-11-06", "current", "2026-11-08");
    const created = pages.find((page) => page.type === "CheckIn" && !page.windowField)!;
    const updated = pages.find(
      (page) => page.type === "CheckIn" && page.windowField === "updated_at",
    )!;
    expect(created).toMatchObject({ since: "2026-11-06", until: "2026-11-08" });
    expect(updated).toMatchObject({
      since: "2026-11-06",
      until: "2026-11-08",
      windowField: "updated_at",
    });

    for (const [page, field] of [
      [created, "created_at"],
      [updated, "updated_at"],
    ] as const) {
      const url = new URL(pagePath(page, "check_ins"), "https://api.planningcenteronline.com");
      expect(url.searchParams.get(`where[${field}][gte]`)).toBe("2026-11-06");
      expect(url.searchParams.get(`where[${field}][lte]`)).toBe("2026-11-08");
      expect(url.searchParams.get("where[created_at][lt]")).toBe(
        page === updated ? "2026-11-06" : null,
      );
      const next = parsePage(
        {
          data: [],
          links: {
            next: "https://api.planningcenteronline.com/check-ins/v2/check_ins?offset=100",
          },
        },
        page,
        "check_ins",
      ).nextPages[0]!;
      expect(next).toMatchObject({ since: "2026-11-06", until: "2026-11-08" });
      const nextUrl = new URL(pagePath(next, "check_ins"), "https://api.planningcenteronline.com");
      expect(nextUrl.searchParams.get(`where[${field}][lte]`)).toBe("2026-11-08");
      expect(nextUrl.searchParams.get("where[created_at][lt]")).toBe(
        page === updated ? "2026-11-06" : null,
      );
    }
  });
  it("accepts included Check-In people while retaining only their grade", () => {
    const checkInPage = scanRoots("check_ins")[1]!;
    const parsed = parsePage(
      {
        data: [
          {
            type: "CheckIn",
            id: "11",
            attributes: { kind: "Regular", created_at: "2026-11-08T15:00:00Z" },
            relationships: {
              person: { data: { type: "Person", id: "42" } },
              event_period: { data: null },
              event_times: { data: [] },
              locations: { data: [] },
            },
          },
        ],
        included: [
          {
            type: "Person",
            id: "42",
            attributes: {
              grade: "5th Grade",
              status: "active",
              inactivated_at: null,
              updated_at: "2026-11-01T00:00:00Z",
            },
          },
        ],
      },
      checkInPage,
      "check_ins",
    );
    expect(parsed.entities.find((entity) => entity.type === "Person")?.attributes).toEqual({
      grade: "5th Grade",
    });
  });
});
