import { describe, expect, it } from "vitest";
import {
  normalized,
  pagePath,
  parsePage,
  sourceHash,
} from "../artifacts/api-server/src/lib/planning-center-source";
import { ministryEntity } from "../artifacts/api-server/src/lib/ministry-source";
import { compileMinistryFacts } from "../artifacts/api-server/src/lib/ministry-calculation";

const page = { type: "Donation", path: "/giving/v2/donations?offset=41000" };
const donation = (id = "1", designations: unknown = [{ type: "Designation", id: "10" }]) => ({
  type: "Donation",
  id,
  attributes: {
    received_at: "2026-11-08T15:00:00Z",
    amount_cents: 1000,
    amount_currency: "USD",
    payment_status: "succeeded",
    refunded: false,
    memo: "must not persist",
  },
  relationships: {
    person: { data: null },
    recurring_donation: { data: null },
    designations: { data: designations },
  },
});
const designation = (id = "10", amount = 1000) => ({
  type: "Designation",
  id,
  attributes: { amount_cents: amount, amount_currency: "USD", fee_cents: 0 },
  relationships: { fund: { data: { type: "Fund", id: "8" } } },
});

describe("batched Giving designation ingestion", () => {
  it("reasserts safe includes and both linkage fieldsets on saved continuation pages", () => {
    const url = new URL(
      pagePath({ ...page, path: `${page.path}&include=person&fields[Donation]=memo` }, "giving"),
      "https://api.planningcenteronline.com",
    );
    expect(url.searchParams.get("offset")).toBe("41000");
    expect(url.searchParams.get("per_page")).toBe("100");
    expect(url.searchParams.get("include")).toBe("designations");
    expect(url.searchParams.get("fields[Donation]")).toContain("designations");
    expect(url.searchParams.get("fields[Donation]")).toContain("person");
    expect(url.searchParams.get("fields[Designation]")).toContain("fund");
    expect(url.searchParams.get("fields[Donation]")).not.toContain("memo");
  });

  it("stores a batch without one child GET per gift and retains legacy hashes and parent paths", () => {
    const original = donation();
    const parsed = parsePage(
      {
        data: [original],
        included: [designation()],
        links: { next: "/giving/v2/donations?offset=41100" },
      },
      page,
      "giving",
    );
    expect(parsed.entities.map((entity) => entity.type)).toEqual(["Donation", "Designation"]);
    expect(parsed.nextPages.map((next) => next.type)).toEqual(["Donation"]);
    expect(parsed.sourceCollections?.["Designation:10"]).toBe(
      "/giving/v2/donations/1/designations",
    );
    expect(sourceHash(parsed.entities[1]!)).toBe(
      sourceHash(ministryEntity(designation(), "Designation")),
    );
    // Inline linkage is transport metadata: it must not churn existing raw
    // Donation revisions or change their established stored representation.
    expect(sourceHash(parsed.entities[0]!)).toBe(sourceHash(ministryEntity(original, "Donation")));
    expect(JSON.stringify(parsed)).not.toContain("must not persist");
  });

  it("keeps split gifts linked to their actual parent even when included resources are unordered", () => {
    const parsed = parsePage(
      {
        data: [
          donation("1", [
            { type: "Designation", id: "10" },
            { type: "Designation", id: "11" },
          ]),
          donation("2", [{ type: "Designation", id: "12" }]),
        ],
        included: [designation("12"), designation("11", 400), designation("10", 600)],
      },
      page,
      "giving",
    );
    expect(parsed.nextPages).toEqual([]);
    expect(parsed.sourceCollections).toEqual({
      "Designation:12": "/giving/v2/donations/2/designations",
      "Designation:11": "/giving/v2/donations/1/designations",
      "Designation:10": "/giving/v2/donations/1/designations",
    });
  });

  it("uses explicit linkage, not included counts, to decide which association GETs can be skipped", () => {
    const parsed = parsePage(
      {
        data: [donation(), donation("2", [{ type: "Designation", id: "20" }]), donation("3", [])],
        included: [designation()],
      },
      page,
      "giving",
    );
    expect(parsed.nextPages).toEqual([
      { type: "Designation", path: "/giving/v2/donations/2/designations" },
    ]);
  });

  it("retains legacy queued association requests and falls back when linkage is omitted", () => {
    const legacy = donation();
    const { designations: _unused, ...relationships } = legacy.relationships;
    const result = parsePage({ data: [{ ...legacy, relationships }] }, page, "giving");
    expect(result.nextPages).toEqual([
      { type: "Designation", path: "/giving/v2/donations/1/designations" },
    ]);
    const queued = { type: "Designation", path: "/giving/v2/donations/1/designations" };
    const parsed = parsePage({ data: [designation()] }, queued, "giving");
    expect(parsed.entities).toEqual([ministryEntity(designation(), "Designation")]);
    expect(parsed.nextPages).toEqual([]);
    expect(
      new URL(pagePath(queued, "giving"), "https://example.invalid").searchParams.has("include"),
    ).toBe(false);
  });

  it("still reads refunds separately and retains source parents for fund metric calculations", () => {
    const gift = donation();
    gift.attributes.refunded = true;
    const refunds = parsePage({ data: [gift], included: [designation()] }, page, "giving");
    expect(refunds.nextPages).toEqual([{ type: "Refund", path: "/giving/v2/donations/1/refund" }]);
    const parsed = parsePage({ data: [donation()], included: [designation()] }, page, "giving");
    const facts = parsed.entities.map((entity) => {
      const saved = normalized(
        entity,
        parsed.sourceCollections?.[`${entity.type}:${entity.id}`] ?? "/giving/v2/donations",
      );
      return { ...entity, sourceCollection: saved.sourceCollection };
    });
    const result = compileMinistryFacts(
      "giving",
      facts,
      [
        {
          id: "synthetic-fund",
          product: "giving",
          objectType: "Fund",
          externalId: "8",
          ministry: "giving",
          measure: "fund_giving",
          scope: "all",
          effectiveFrom: "2020-01-01",
          effectiveTo: null,
        },
      ],
      "2026-11-01",
      "2026-11-15",
      new Date("2026-11-10T12:00:00Z"),
    );
    expect(result.issues).not.toContain("designation_parent_or_fields_missing");
    expect(result.values.find((value) => value.measure === "fund_giving")?.value).toBe(1000);
    expect(result.values.find((value) => value.measure === "all_fund_giving")?.value).toBe(1000);
  });

  it.each([
    { data: [donation()], included: [designation("999")] },
    { data: [donation()], included: [designation(), designation()] },
    { data: [donation("1", null)], included: [] },
    { data: [donation("1", [{ type: "Person", id: "10" }])], included: [] },
    { data: [donation(), donation("2")], included: [designation()] },
    { data: [donation()], included: [{ ...designation(), relationships: {} }] },
    { data: [donation()], included: [{ type: "Person", id: "10", attributes: {} }] },
  ])("fails closed on unrelated, ambiguous, malformed or unsafe included data", (payload) => {
    expect(() => parsePage(payload, page, "giving")).toThrow("unsupported source shape");
  });
});
