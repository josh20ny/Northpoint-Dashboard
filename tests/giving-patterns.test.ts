import { describe, it, expect } from "vitest";
import {
  analyzeGivingPatterns,
  DEFAULT_GIVING_POLICY,
} from "../artifacts/api-server/src/lib/giving-patterns";
import type { SourceFact } from "../artifacts/api-server/src/lib/ministry-calculation";
const person = (id: string, first: string): SourceFact => ({
  type: "Person",
  id,
  attributes: { first_donated_at: `${first}T12:00:00Z` },
  relationships: {},
  sourceCollection: "/giving/v2/people",
});
const gift = (id: string, date: string, personId = "1"): SourceFact => ({
  type: "Donation",
  id,
  attributes: { received_at: `${date}T12:00:00Z`, payment_status: "succeeded", refunded: false },
  relationships: { person: { data: { type: "Person", id: personId } } },
  sourceCollection: "/giving/v2/donations",
});
const joint = (primary: string, other: string): SourceFact => ({
  type: "JointGiver",
  id: primary,
  attributes: {},
  relationships: {
    primary: { data: { type: "Person", id: primary } },
    joint_giver: { data: { type: "Person", id: other } },
  },
  sourceCollection: `/giving/v2/donor_summaries/${primary}/joint_giver`,
});
describe("owner-defined, adjustable Giving signals", () => {
  it("uses lifetime metadata, not a window's first imported gift, and explicit family linkage", () => {
    const facts = [
      person("1", "2018-03-04"),
      person("2", "2024-01-07"),
      joint("1", "2"),
      gift("8", "2026-01-04", "2"),
    ];
    const units = analyzeGivingPatterns(facts, new Date("2026-03-01T12:00:00Z"), true);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ personIds: ["1", "2"], firstRecordedAt: "2018-03-04" });
    expect(
      analyzeGivingPatterns(facts, new Date("2026-03-01T12:00:00Z"), true, {
        ...DEFAULT_GIVING_POLICY,
        grouping: "person",
      }),
    ).toHaveLength(2);
  });
  it("does not guess lifetime first gifts from incomplete transaction history", () => {
    const units = analyzeGivingPatterns(
      [gift("1", "2026-01-04")],
      new Date("2026-03-01T12:00:00Z"),
      false,
    );
    expect(units[0]).toMatchObject({
      firstRecordedAt: null,
      lapsed: null,
      reason: "historical_backfill_required",
    });
  });
  it("classifies three missed weekly expected gifts, but not on the due date itself", () => {
    const facts = [
      person("1", "2026-01-04"),
      ...["2026-01-04", "2026-01-11", "2026-01-18", "2026-01-25"].map((d, i) => gift(String(i), d)),
    ];
    expect(analyzeGivingPatterns(facts, new Date("2026-02-15T12:00:00Z"), true)[0]).toMatchObject({
      cadence: "weekly",
      missedExpected: 2,
      lapsed: false,
    });
    expect(analyzeGivingPatterns(facts, new Date("2026-02-16T12:00:00Z"), true)[0]).toMatchObject({
      cadence: "weekly",
      missedExpected: 3,
      lapsed: true,
      expectedDates: ["2026-02-01", "2026-02-08", "2026-02-15"],
    });
  });
  it("handles monthly cadence and closed historical Sundays without future gifts erasing a prior lapse", () => {
    const facts = [
      person("1", "2025-09-10"),
      ...["2025-09-10", "2025-10-10", "2025-11-10", "2025-12-10", "2026-05-10"].map((d, i) =>
        gift(String(i), d),
      ),
    ];
    const unit = analyzeGivingPatterns(
      facts,
      new Date("2026-06-01T12:00:00Z"),
      true,
      DEFAULT_GIVING_POLICY,
      "2026-03-15",
    )[0];
    expect(unit).toMatchObject({
      cadence: "monthly",
      missedExpected: 3,
      lapsed: true,
      lastGiftDate: "2025-12-10",
    });
  });
  it("leaves irregular or insufficient histories unclassified, not healthy", () => {
    const irregular = ["2026-01-01", "2026-01-03", "2026-02-19", "2026-04-20"].map((d, i) =>
      gift(String(i), d),
    );
    expect(
      analyzeGivingPatterns(irregular, new Date("2026-08-01T12:00:00Z"), true)[0],
    ).toMatchObject({ cadence: null, lapsed: null, reason: "irregular_giving_pattern" });
    expect(
      analyzeGivingPatterns(irregular.slice(0, 3), new Date("2026-08-01T12:00:00Z"), true)[0],
    ).toMatchObject({ lapsed: null, reason: "insufficient_distinct_gift_dates" });
  });
  it("applies adjustable minimum gifts, tolerance, missed-gift threshold and cadence choices", () => {
    const facts = ["2026-01-04", "2026-01-12", "2026-01-18"].map((d, i) => gift(String(i), d));
    expect(
      analyzeGivingPatterns(facts, new Date("2026-02-02T12:00:00Z"), true, {
        ...DEFAULT_GIVING_POLICY,
        minimumGifts: 3,
        missedExpected: 2,
      })[0],
    ).toMatchObject({ cadence: "weekly", lapsed: true, missedExpected: 2 });
    expect(
      analyzeGivingPatterns(facts, new Date("2026-02-02T12:00:00Z"), true, {
        ...DEFAULT_GIVING_POLICY,
        minimumGifts: 3,
        toleranceDays: 0,
      })[0].lapsed,
    ).toBeNull();
    expect(
      analyzeGivingPatterns(facts, new Date("2026-02-02T12:00:00Z"), true, {
        ...DEFAULT_GIVING_POLICY,
        minimumGifts: 3,
        cadences: ["monthly"],
      })[0].lapsed,
    ).toBeNull();
  });
  it("does not let pending, failed, refunded or anonymous gifts establish a cadence", () => {
    const facts = ["2026-01-04", "2026-01-11", "2026-01-18", "2026-01-25"].map((d, i) =>
      gift(String(i), d),
    );
    facts[0].attributes.payment_status = "failed";
    facts[1].attributes.refunded = true;
    expect(
      analyzeGivingPatterns(facts, new Date("2026-03-01T12:00:00Z"), true)[0].lapsed,
    ).toBeNull();
    expect(
      analyzeGivingPatterns(
        [{ ...gift("1", "2026-01-04"), relationships: { person: { data: null } } }],
        new Date("2026-03-01T12:00:00Z"),
        true,
      ),
    ).toEqual([]);
  });
});
