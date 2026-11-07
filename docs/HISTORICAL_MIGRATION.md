# Historical Workbook Migration Strategy

## Source files
`NP Dashboard - 2026.xlsx` and `NP Dashboard PRD.pdf` provided by the owner. The Excel workbook has **51 worksheets** (inspection count) with 2026 operating tabs plus historical, forecast, pivot and archival sheets. See `data/workbook_inventory.csv` and `data/legacy_columns.csv` for mechanically extracted positions and labels. Headers are **not** proof that a value has a particular definition.

## Import stages
1. Keep immutable original workbook with SHA256 and import date in admin-only object storage.
2. Discover every worksheet, coordinate, value type, external formula and spreadsheet error; record cached values vs formulas separately.
3. Build admin-reviewed mapping `sheet, cell_column, date_axis, legacy_label → proposed_metric_slug, unit, ministry, source_semantics, source_priority, confidence`.
4. Stage values with original Excel date serial and interpreted Sunday date, timezone and calculation status.
5. Reject/flag corrupted, missing, future relative to workbook snapshot, duplicated, merged/shifted, import-fed or externally linked rows; never silently translate blanks to zero.
6. Reconcile selected 2026 weeks with SPD, Dash, ministry pages and historical raw tabs. Preserve discrepancies, cross-source duplication and known venue/time changes.
7. Publish only approved datasets in batches; preserve source cell lineage, issue log, and rollback capability.

## Important observations from workbook inspection
- `Dash` has summary columns for adults, digital, connection, kids, students, totals and financials; these are likely derived, not authoritative by default.
- `SPD`: `F` historical first service (header says 9:30), `I` second service 11:00, `L` in-person total; review the actual 2026 service-time switch. `B` online connections, `C` online multiplier, `M` total engagement. Never treat multiplier output as unique people.
- `WL` and `US`: `E/F/G` per-service and total in-person, `H/I/J` new kids; `Transit`: `B/C/D` headcount; `IO`: `F` large group attendance.
- `$$$`: columns `B:N` historical giving years 2013–2025, `O` 2026; `Connection` has groups, attendance and volunteers; `Communications` YouTube, Meta, website, podcasts and Mailchimp sections.
- Some formulas contain `__xludf.DUMMYFUNCTION("IMPORTRANGE(...` wrappers in exported XLSX; these are unresolved external-sheet dependencies, even if Excel doesn't label them as `#REF!`. Their cached values cannot be presumed complete.
- Existing historical forecasting sheets represent legacy calculation outputs, not source attendance facts. Preserve them for comparison but exclude from model training truth.

## Worked mapping candidates (require approval)
| Legacy cell/column | Tentative target | Status |
|---|---|---|
| SPD!L | adult_in_person_attendance (Sunday) | REVIEW source authority |
| SPD!F and SPD!I | adult_per_service_headcount | REVIEW service-time effective dates |
| SPD!B | adult_online_connections | REVIEW source measurement |
| SPD!C and SPD!M | legacy_online_multiplier / legacy_total_engagement | REVIEW calculation |
| WL!G, US!G | kids_ministry_attendance | REVIEW backfill source |
| Transit!D, IO!F | student_ministry_attendance | REVIEW definition/group count |
| $$$!O | general_giving_weekly_2026 | REVIEW fund, refund, date alignment |
| Communications!B/C/D | youtube_livestream_live/7d/28d | REVIEW snapshot and attribution |

## Reconciliation outputs
Generate `mapping_approved.csv`, `row_errors.csv`, `source_conflicts.csv`, `reconciled_weekly.csv` and a human-readable variance report. All should avoid unprotected person-level giving. Each approval is recorded in audit log with mapping version and approver.
