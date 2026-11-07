# Source Integrity Manifest

- Original workbook: `NP Dashboard - 2026.xlsx`
- Workbook SHA-256: `af87fde8959d877a38b4a388d0287411bcadd0c4e9b863d392bfd4ac16cd3724`
- Sheets inspected: 51
- Operating header positions extracted: 277
- Workbook total formula cells: 35,123
- Formula cells with external `IMPORTRANGE`/`_xludf` indicators: 1,536
- Typed Excel error cells: 0
- Note: zero typed Excel error cells does **not** mean all cross-sheet/Google Sheets formula results are valid. Raw cells/cached values and formulas need separate QA.
- This manifest is reproducible using standard ZIP/OpenXML parsing; do not treat cached values as authoritative.

## Working-copy verification — 2026-11-07
The separately named working file `NP Dashboard - 2026 (orignal source-legacy).xlsx`
has SHA-256 `c925d771b67c4503ad46d5919000fcb5744c164fc1683a441055b11a1c70a1b3`.
Its 51-sheet / 35,123-formula / 1,536-external-formula counts agree with the
earlier inspection, but its bytes differ from the original fingerprint above.
Do not assume the source values are identical. Confirm snapshot date and source
equivalence with the owner before approving real historical mappings.
