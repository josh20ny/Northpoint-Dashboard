import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import {
  readWorkbook,
  excelDate,
  stageRows,
  digest,
} from "../artifacts/api-server/src/lib/workbook";
import { buildReport, csv, escapeHtml } from "../artifacts/api-server/src/lib/imports";
import { createImportRouter } from "../artifacts/api-server/src/routes/imports";
import { syntheticWorkbook, mappingInput } from "./fixtures/workbook";
describe("historical workbook discovery and raw-only staging", () => {
  it("reproduces the supplied inventory without evaluating or publishing values", () => {
    const bytes = readFileSync(
      new URL("../data/NP Dashboard - 2026 (orignal source-legacy).xlsx", import.meta.url),
    );
    const result = readWorkbook(bytes);
    expect(digest(bytes)).toBe("c925d771b67c4503ad46d5919000fcb5744c164fc1683a441055b11a1c70a1b3");
    expect(result.sheets).toHaveLength(51);
    expect(result.sheets.reduce((n, s) => n + s.formulas, 0)).toBe(35123);
    expect(result.sheets.reduce((n, s) => n + s.externalFormulas, 0)).toBe(1536);
  }, 20000);
  it("keeps literals, formulas and cached results distinct", () => {
    const w = readWorkbook(syntheticWorkbook());
    expect(w.cells.find((c) => c.cell.coordinate === "B2")?.cell.value).toBe("12");
    expect(w.cells.find((c) => c.cell.coordinate === "C2")?.cell).toMatchObject({
      value: null,
      formula: "SUM(B2)",
      cachedValue: "12",
      flags: ["formula_unverified"],
    });
  });
  it("does not turn blank caches or missing cells into zero", () => {
    const w = readWorkbook(
      syntheticWorkbook(
        `<row><c r="A2"><v>46026</v></c><c r="B2"><f>IMPORTRANGE("x","y")</f></c></row>`,
      ),
    );
    const rows = stageRows(
      { ...mappingInput, endRow: 3 },
      w.cells.map((c) => c.cell),
      w,
      "2026-11-01",
    );
    expect(rows.map((r) => r.value)).toEqual([null, null]);
    expect(rows[0]!.flags).toEqual(
      expect.arrayContaining(["external_dependency", "missing_formula_cache", "missing_value"]),
    );
    expect(rows[1]!.flags).toContain("missing_or_invalid_date");
  });
  it("preserves explicit zero; flags future weeks, repeated dates, and spreadsheet errors", () => {
    const w = readWorkbook(
      syntheticWorkbook(
        `<row><c r="A2"><v>46026</v></c><c r="B2"><v>0</v></c><c r="A3"><v>46026</v></c><c r="B3" t="e"><v>#REF!</v></c></row>`,
      ),
    );
    const rows = stageRows(
      { ...mappingInput, endRow: 3 },
      w.cells.map((c) => c.cell),
      w,
      "2020-01-01",
    );
    expect(rows[0]!.value).toBe(0);
    expect(rows[0]!.flags).toContain("future_relative_to_snapshot");
    expect(rows[1]!.flags).toEqual(
      expect.arrayContaining(["spreadsheet_error", "duplicate_week_in_mapping"]),
    );
  });
  it("respects Excel date systems and rejects the fictional leap day and ambiguous text dates", () => {
    expect(excelDate("1", "1900")).toBe("1900-01-01");
    expect(excelDate("60", "1900")).toBeNull();
    expect(excelDate("61", "1900")).toBe("1900-03-01");
    expect(excelDate("0", "1904")).toBe("1904-01-01");
    expect(excelDate("11/08/2026", "1900")).toBeNull();
    expect(excelDate("2026-02-30", "1900")).toBeNull();
  });
  it("flags integer precision loss rather than silently rounding staged values", () => {
    const w = readWorkbook(
      syntheticWorkbook(
        `<row><c r="A2"><v>46026</v></c><c r="B2"><v>9007199254740993</v></c></row>`,
      ),
    );
    const row = stageRows(
      mappingInput,
      w.cells.map((c) => c.cell),
      w,
      "2026-10-01",
    )[0]!;
    expect(row.value).toBeNull();
    expect(row.flags).toContain("unsafe_numeric_precision");
  });
  it("rejects non-workbooks and XML DTDs without exposing their contents", () => {
    expect(() => readWorkbook(Buffer.from("not an XLSX"))).toThrow("Upload an XLSX");
    const bytes = syntheticWorkbook(`<!DOCTYPE x [<!ENTITY y "test">]>`);
    expect(() => readWorkbook(bytes)).toThrow("Invalid, unsupported or oversized");
  });
  it("keeps conflicting and duplicate evidence visible; approvals bind to exact evidence", () => {
    const w = readWorkbook(syntheticWorkbook());
    const row = stageRows(
      mappingInput,
      w.cells.map((c) => c.cell),
      w,
      "2026-11-01",
    )[0]!;
    const rows = [
      { mappingId: "one", definition: mappingInput, data: row },
      { mappingId: "two", definition: mappingInput, data: { ...row, coordinate: "C2", value: 15 } },
    ];
    const a = buildReport(rows, []);
    expect(a.weeks[0]!.variance).toBe(3);
    expect(a.weeks[0]!.flags).toContain("source_conflict");
    const review = { week: a.weeks[0]!.week, evidenceHash: a.weeks[0]!.evidenceHash };
    expect(buildReport(rows, [review]).weeks[0]!.approved).toBe(true);
    expect(buildReport(rows.slice(0, 1), [review]).weeks[0]!.approved).toBe(false);
  });
  it("escapes exported formulas and HTML rather than activating workbook content", () => {
    expect(csv([['=HYPERLINK("evil")', null, "0"]])).toContain(`"'=HYPERLINK(""evil"")"`);
    expect(escapeHtml("<script>&")).toBe("&lt;script&gt;&amp;");
  });
});
describe("Admin-only import boundary", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const endpoints = [
    ["get", "/v1/admin/imports"],
    ["post", "/v1/admin/imports"],
    ["post", "/v1/admin/imports/source"],
    ["get", `/v1/admin/imports/${id}`],
    ["get", `/v1/admin/imports/${id}/cells?sheet=Test`],
    ["get", `/v1/admin/imports/${id}/original`],
    ["post", `/v1/admin/imports/${id}/mappings`],
    ["post", `/v1/admin/imports/${id}/state`],
    ["post", `/v1/admin/imports/${id}/mappings/${id}/review`],
    ["post", `/v1/admin/imports/${id}/mappings/${id}/stage`],
    ["get", `/v1/admin/imports/${id}/mappings/${id}/rows`],
    ["get", `/v1/admin/imports/${id}/report`],
    ["post", `/v1/admin/imports/${id}/reviews`],
    ["get", `/v1/admin/imports/${id}/exports/weekly`],
  ];
  for (const role of [null, "staff", "leadership"] as const) {
    it(`denies ${role ?? "signed-out"} access to cells, actions, originals and exports`, async () => {
      const app = express();
      app.use(
        createImportRouter({
          name: "test",
          enabled: true,
          authenticate: async () =>
            role
              ? {
                  role,
                  identity: {
                    subject: "synthetic",
                    provider: "replit",
                    verifiedEmail: "synthetic@example.invalid",
                  },
                }
              : null,
        }),
      );
      for (const [method, url] of endpoints) {
        const response = await (method === "post"
          ? request(app).post(url!)
          : request(app).get(url!));
        expect(response.status).toBe(role ? 403 : 401);
        expect(response.text).not.toContain("sha256");
      }
    });
  }
  it("requires session CSRF even for a verified Admin", async () => {
    const app = express();
    app.use(
      createImportRouter({
        name: "test",
        enabled: true,
        authenticate: async () => ({
          role: "admin",
          identity: {
            subject: "synthetic",
            provider: "replit",
            verifiedEmail: "synthetic@example.invalid",
          },
        }),
      }),
    );
    expect((await request(app).post("/v1/admin/imports/source")).status).toBe(403);
  });
});
