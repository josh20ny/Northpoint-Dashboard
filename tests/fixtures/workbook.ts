import { createRequire } from "node:module";
import type { ImportMappingInput } from "@workspace/api-zod";
const require = createRequire(new URL("../../artifacts/api-server/package.json", import.meta.url));
const { zipSync, strToU8 } = require("fflate");
export function syntheticWorkbook(
  sheetData = `<row r="2"><c r="A2"><v>46026</v></c><c r="B2"><v>12</v></c><c r="C2"><f>SUM(B2)</f><v>12</v></c></row>`,
) {
  return Buffer.from(
    zipSync({
      "xl/workbook.xml": strToU8(
        `<workbook xmlns:r="urn:r"><workbookPr date1904="0"/><sheets><sheet name="Test" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        `<worksheet><sheetData>${sheetData}</sheetData></worksheet>`,
      ),
    }),
  );
}
export const mappingInput: ImportMappingInput = {
  sheet: "Test",
  dateColumn: "A",
  valueColumn: "B",
  startRow: 2,
  endRow: 2,
  target: "synthetic_count",
  unit: "count",
  ministry: "Synthetic",
  semantics: "Synthetic source count, not church data",
  priority: "Unconfirmed",
  confidence: "low",
  legacyLabel: "Synthetic fixture",
};
