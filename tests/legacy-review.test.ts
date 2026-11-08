import { describe, expect, it } from "vitest";
import { buildReview, csv, renderReview } from "../scripts/src/prepare-legacy-review.mjs";
import { readWorkbook, excelDate } from "../artifacts/api-server/src/lib/workbook";
import { syntheticWorkbook } from "./fixtures/workbook";

describe("offline source review (never an approval)", () => {
  const source = { filename: "<script>bad</script>.xlsx", sha256: "test", dateSystem: "1900" };
  it("inventories every populated column without inventing metric mappings", () => {
    const w = readWorkbook(syntheticWorkbook());
    const review = buildReview(w, excelDate);
    expect(review.columns).toHaveLength(3);
    expect(review.populatedCells).toBe(3);
    expect(review.columns.every((c) => c.legacyLabel === "")).toBe(true);
    expect(review.adult).toEqual([]);
  });
  it("preserves missing values and distinguishes copied cache matches from approval", () => {
    const w = readWorkbook(
      syntheticWorkbook(
        '<row><c r="A3"><v>46026</v></c><c r="F3"><v>0</v></c><c r="I3"><v>12</v></c>' +
          '<c r="L3"><f>SUM(F3,I3)</f><v>12</v></c><c r="C3"><f>SPD!L3</f><v>12</v></c></row>',
      ),
    );
    const cells = w.cells;
    w.cells = [
      ...cells.map((x) => ({ sheet: "SPD", cell: { ...x.cell } })),
      ...cells
        .filter((x) => ["A", "C"].includes(x.cell.column))
        .map((x) => ({ sheet: "Dash", cell: { ...x.cell } })),
    ];
    const review = buildReview(w, excelDate);
    expect(review.columns.find((c) => c.sheet === "SPD" && c.column === "F")?.candidateMetric).toBe(
      "adult_service_1",
    );
    expect(review.columns.find((c) => c.sheet === "SPD" && c.column === "I")?.candidateMetric).toBe(
      "adult_service_2",
    );
    expect(review.columns.find((c) => c.sheet === "SPD" && c.column === "L")?.candidateMetric).toBe(
      "",
    );
    expect(review.adult[0]).toMatchObject({
      adult_service_1: 0,
      adult_services_total: 12,
      sourceStatus: "INPUTS_PRESENT_UNAPPROVED",
      variance: 0,
      status: "MATCHED_COPIES_UNAPPROVED",
    });
    w.cells = w.cells.filter((x) => x.sheet !== "SPD" || x.cell.column !== "I");
    expect(buildReview(w, excelDate).adult[0]).toMatchObject({
      adult_service_2: null,
      adult_services_total: null,
      sourceStatus: "MISSING_INPUTS",
      status: "INCOMPLETE",
    });
    w.cells.find((x) => x.sheet === "SPD" && x.cell.column === "A")!.cell.value = "46033";
    expect(buildReview(w, excelDate).adult[0].status).toBe("DATE_MISMATCH");
  });
  it("preserves zero attendance with owner context without approving other values", () => {
    const w = readWorkbook(
      syntheticWorkbook(
        '<row><c r="A3"><v>46047</v></c><c r="F3"><v>0</v></c><c r="I3"><v>0</v></c></row>',
      ),
    );
    const cells = w.cells;
    w.cells = [
      ...cells.map((x) => ({ sheet: "SPD", cell: { ...x.cell } })),
      ...cells
        .filter((x) => x.cell.column === "A")
        .map((x) => ({ sheet: "Dash", cell: { ...x.cell } })),
    ];
    const before = JSON.stringify(w);
    const review = buildReview(w, excelDate, "2026-11-06", {
      "2026-01-25":
        "The owner clarified that in-person attendance was zero; ice-storm context retained.",
    });
    expect(review.adult[0]).toMatchObject({
      date: "2026-01-25",
      adult_service_1: 0,
      adult_service_2: 0,
      adult_services_total: 0,
      sourceArithmeticSum: 0,
      sourceStatus: "ZERO_ATTENDANCE_NO_SERVICE_OR_CANCELLED",
      status: "INCOMPLETE",
    });
    expect(JSON.stringify(w)).toBe(before);
    expect(buildReview(w, excelDate).adult[0].adult_services_total).toBe(0);
    expect(renderReview(review, source)).toContain("in-person attendance was zero");
    expect(renderReview(review, source)).not.toContain("NOT_RECORDED");
  });
  it("checks the explicit snapshot boundary without changing or removing source rows", () => {
    const w = readWorkbook(syntheticWorkbook());
    const dateCell = w.cells.find((x) => x.cell.column === "A")!.cell;
    w.cells = [{ sheet: "Dash", cell: { ...dateCell, coordinate: "A3", row: 3 } }];
    const later = buildReview(w, excelDate, "2026-01-03");
    expect(later.adult).toHaveLength(1);
    expect(later.adult[0].snapshotStatus).toBe("FUTURE");
    expect(later.adult[0].flags).toContain("future_relative_to_snapshot");
    expect(w.cells[0].cell.flags).toEqual([]);
    const boundary = buildReview(w, excelDate, "2026-01-04");
    expect(boundary.adult[0].snapshotStatus).toBe("WITHIN_SNAPSHOT");
    expect(boundary.adult[0].flags).not.toContain("future_relative_to_snapshot");
    expect(buildReview(w, excelDate).adult[0].snapshotStatus).toBe("SNAPSHOT_UNCONFIRMED");
    expect(() => buildReview(w, excelDate, "2026-02-30")).toThrow("valid");
    expect(() => buildReview(w, excelDate, "yesterday")).toThrow("valid");
    expect(renderReview(boundary, source)).toContain("Snapshot date: 2026-01-04");
  });
  it("interprets dated past blanks as zero, future zeroes as unrecorded, and never fills formula failures", () => {
    const w = readWorkbook(
      syntheticWorkbook('<row><c r="A3"><v>46026</v></c><c r="F3"><v>0</v></c></row>'),
    );
    const cells = w.cells;
    w.cells = [
      ...cells.map((x) => ({ sheet: "SPD", cell: { ...x.cell } })),
      ...cells
        .filter((x) => x.cell.column === "A")
        .map((x) => ({ sheet: "Dash", cell: { ...x.cell } })),
    ];
    const before = JSON.stringify(w);
    const past = buildReview(w, excelDate, "2026-01-04").adult[0];
    expect(past).toMatchObject({
      adult_service_1: 0,
      adult_service_2: 0,
      adult_services_total: 0,
      rawAdultService1: 0,
      rawAdultService2: null,
      sourceArithmeticSum: null,
      sourceStatus: "ZERO_ATTENDANCE_NO_SERVICE_OR_CANCELLED",
      status: "INCOMPLETE",
    });
    expect(buildReview(w, excelDate, "2026-01-03").adult[0]).toMatchObject({
      adult_service_1: null,
      adult_service_2: null,
      adult_services_total: null,
      rawAdultService1: 0,
      sourceStatus: "FUTURE_NOT_RECORDED",
    });
    expect(buildReview(w, excelDate).adult[0].adult_services_total).toBeNull();
    expect(JSON.stringify(w)).toBe(before);
    const first = w.cells.find((x) => x.sheet === "SPD" && x.cell.column === "F")!.cell;
    w.cells.push({
      sheet: "SPD",
      cell: {
        ...first,
        coordinate: "I3",
        column: "I",
        formula: "SUM(Z3)",
        value: null,
        cachedValue: null,
        flags: ["missing_formula_cache"],
      },
    });
    expect(buildReview(w, excelDate, "2026-11-06").adult[0].adult_services_total).toBeNull();
    const failed = w.cells.at(-1)!.cell;
    failed.formula = null;
    failed.value = "#REF!";
    failed.flags = ["spreadsheet_error"];
    expect(buildReview(w, excelDate, "2026-11-06").adult[0].adult_services_total).toBeNull();
  });
  it("escapes HTML and CSV; report is offline and explicitly unapproved", () => {
    const report = renderReview(buildReview(readWorkbook(syntheticWorkbook()), excelDate), source);
    expect(report).not.toContain("<script>");
    expect(report).toContain("&lt;script&gt;");
    expect(report).toContain("Snapshot date is unconfirmed");
    expect(report).not.toMatch(/<script|<iframe|<link|<img/i);
    expect(csv([["=HYPERLINK(1)", " @formula", 'a"b', null, 0]])).toBe(
      '"\'=HYPERLINK(1)","\' @formula","a""b","","0"\r\n',
    );
  });
});
