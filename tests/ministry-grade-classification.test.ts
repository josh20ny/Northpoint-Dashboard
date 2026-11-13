import { describe, expect, it } from "vitest";
import {
  gradeLabelFor,
  ministryForGradeLabel,
} from "../artifacts/api-server/src/lib/ministry-grade-classification";
import type { SourceFact } from "../artifacts/api-server/src/lib/ministry-calculation";

const fact = (
  type: string,
  id: string,
  attributes: Record<string, unknown>,
): SourceFact => ({
  type,
  id,
  attributes,
  relationships: {},
  sourceCollection: null,
});

describe("PCO grade-to-ministry fallback", () => {
  it.each([
    ["Preschool", "waumba-land"],
    ["Pre-K 4", "waumba-land"],
    ["Kindergarten", "upstreet"],
    ["K", "upstreet"],
    ["5th Grade", "upstreet"],
    ["6th Grade", "transit"],
    ["8", "transit"],
    ["9th Grade", "insideout"],
    ["12", "insideout"],
    ["13th Grade", null],
    ["", null],
  ])("maps %s only within the approved grade bands", (label, ministry) => {
    expect(ministryForGradeLabel(label)).toBe(ministry);
  });

  it("looks up the provider's grade label without using birthdate", () => {
    const person = fact("Person", "person", { grade: 7 });
    const grades = [fact("Grade", "7", { key: 7, value: "7th Grade" })];
    expect(gradeLabelFor(person, grades)).toBe("7th Grade");
    expect(gradeLabelFor(fact("Person", "unknown", { grade: 99 }), grades)).toBeNull();
  });
});
