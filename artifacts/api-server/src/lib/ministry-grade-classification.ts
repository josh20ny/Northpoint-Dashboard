import type { SourceFact } from "./ministry-calculation";

export function gradeLabelFor(
  person: SourceFact | undefined,
  gradeFacts: SourceFact[],
): string | null {
  const gradeKey = person?.attributes.grade;
  if (typeof gradeKey !== "number" || !Number.isSafeInteger(gradeKey)) return null;
  const grade = gradeFacts.find(
    (fact) => fact.type === "Grade" && fact.attributes.key === gradeKey,
  );
  return typeof grade?.attributes.value === "string" ? grade.attributes.value : null;
}

export function ministryForGradeLabel(label: string | null): string | null {
  if (!label) return null;
  const normalized = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");

  if (
    /\b(pre\s*k|pre\s*k[34]|prekindergarten|preschool|nursery|toddler)\b/.test(normalized) ||
    /\b[34]\s*(?:k|year olds?|yr olds?)\b/.test(normalized) ||
    /\bpk\s*[34]\b/.test(normalized)
  )
    return "waumba-land";
  if (
    /^(k|tk|kindergarten|transitional kindergarten)$/.test(normalized) ||
    /\bkindergarten\b/.test(normalized)
  )
    return "upstreet";

  const ordinal =
    normalized.match(/^(?:grade\s*)?(\d{1,2})(?:st|nd|rd|th)?(?:\s*grade)?$/) ??
    normalized.match(/^grade\s*(\d{1,2})$/);
  const grade = ordinal ? Number(ordinal[1]) : null;
  if (grade === null) return null;
  if (grade >= 1 && grade <= 5) return "upstreet";
  if (grade >= 6 && grade <= 8) return "transit";
  if (grade >= 9 && grade <= 12) return "insideout";
  return null;
}
