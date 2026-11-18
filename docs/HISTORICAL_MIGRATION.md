# Historical Workbook Migration Strategy

The accepted batch supplies dated gaps and independent checks. The [Phase 5B source rules](PHASE_5B.md#source-selection) govern dashboard publication, even for mappings that Phase 5 already imported. A workbook value may remain valid source evidence throughout an overlapping PCO period.

## Source files
`NP Dashboard - 2026.xlsx` and `NP Dashboard PRD.pdf` provided by the owner. The Excel workbook has **51 worksheets** (inspection count) with 2026 operating tabs plus historical, forecast, pivot and archival sheets. See `data/workbook_inventory.csv` and `data/legacy_columns.csv` for mechanically extracted positions and labels. Headers are **not** proof that a value has a particular definition.

## Import stages
1. Keep immutable original workbook with SHA256 and import date in admin-only object storage.
2. Discover every worksheet, coordinate, value type, external formula and spreadsheet error; record cached values vs formulas separately.
3. Build admin-reviewed mapping `sheet, cell_column, date_axis, legacy_label → proposed_metric_slug, unit, ministry, source_semantics, source_priority, confidence`.
4. Stage values with original Excel date serial and interpreted Sunday date, timezone and calculation status.
5. Flag corrupted, missing, future-at-snapshot, duplicated or shifted rows. Preserve imported/formula-linked provenance. Use accepted numeric caches only under an approved mapping. Follow measure-specific zero and unrecorded rules.
6. Reconcile selected 2026 weeks with SPD, Dash, ministry pages and historical raw tabs. Preserve discrepancies, cross-source duplication and known venue/time changes.
7. Publish only approved datasets in batches; preserve source cell lineage, issue log, and rollback capability.

## Important observations from workbook inspection
- `Dash` has summary columns for adults, digital, connection, kids, students, totals and financials; these are likely derived, not authoritative by default.
- `SPD`: `F` historical first service (header says 9:30), `I` second service 11:00, `L` in-person total; review the actual 2026 service-time switch. `B` online connections, `C` online multiplier, `M` total engagement. Never treat multiplier output as unique people.
- `WL` and `US`: `E/F/G` per-service and total in-person, `H/I/J` new kids; `Transit`: `B/C/D` headcount; `IO`: `F` large group attendance.
- `$$$`: columns `B:N` historical giving years 2013–2025, `O` 2026; `Connection` has groups, attendance and volunteers; `Communications` YouTube, Meta, website, podcasts and Mailchimp sections.
- Some formulas contain `__xludf.DUMMYFUNCTION("IMPORTRANGE(...` wrappers in exported XLSX; these are unresolved external-sheet dependencies, even if Excel doesn't label them as `#REF!`. Their cached values cannot be presumed complete.
- Existing historical forecasting sheets represent legacy calculation outputs, not source attendance facts. Preserve them for comparison but exclude from model training truth.

## Selected workbook mappings

The status below distinguishes accepted mappings from fields that still require a definition. The [Phase 5 crosswalk](PHASE5_WORKBOOK_CROSSWALK.md) records the imported series.

| Legacy cell/column | Target | Status |
|---|---|---|
| SPD!L | Adult auditorium total | Use the cached total to check the sum of the accepted per-service headcounts. See [reconciliation](PHASE_4_RECONCILIATION.md). |
| SPD!F and SPD!I | Adult first and second service auditorium headcounts | Accepted historical counts. Resolve clock times by era. |
| SPD!B | adult_online_connections | REVIEW source measurement |
| SPD!C and SPD!M | legacy_online_multiplier / legacy_total_engagement | REVIEW calculation |
| WL!G, US!G | Legacy children’s headcount | Compare with PCO when scopes match. Use a gap fill only for the same population and counting method. |
| Transit!D, IO!F | Legacy student headcount | Keep this historical headcount distinct from unique PCO attendees. Validate compatible scope and counting method before a gap fill. |
| $$$!O | General Giving for 2026 | Accepted historical mapping for comparisons or verified coverage gaps. PCO designations govern covered weeks. |
| Communications!B/C/D | youtube_livestream_live/7d/28d | REVIEW snapshot and attribution |

## Reconciliation outputs
Generate `mapping_approved.csv`, `row_errors.csv`, `source_conflicts.csv`, `reconciled_weekly.csv` and a human-readable variance report. All should avoid unprotected person-level giving. Each approval is recorded in audit log with mapping version and approver.
