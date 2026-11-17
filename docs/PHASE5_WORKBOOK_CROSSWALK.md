# Phase 5 workbook-to-measure crosswalk

## Scope and status

This crosswalk documents the non-Giving Phase 5 history in the accepted
workbook. It uses sheet headings and the existing metric registry; it does not
inspect individual numeric observations or change the active Giving run.
Workbook values are accepted by the owner. The Connection total-groups-
attendance series and the four child/student aggregate attendance series have
been mapped and published. The operating-series implementation below records
which additional candidates are now published. Preserve each
source's measure, unit, scope, date axis and lineage when applying Imports
mappings.

`data/legacy_columns.csv` is the original 2026 operating-tab header inventory.
Its `UNREVIEWED` markers predate the imports recorded below; use this crosswalk
and the persisted Imports mappings for current mapping status. They do not
reopen the owner's acceptance of the workbook's values.

## Historical-series candidates

| Workbook section | Source axis and coverage shown in headers | Phase 5 destination candidate | Treatment |
| --- | --- | --- | --- |
| `Historical - Kids`, `A:P` | `Week`, `Date`, then 2013–2026; section title `Historical - In-Person WL Attendance` | Waumba Land, `attendance_headcount`, `all` | Aggregate workbook headcount, not distinct PCO participants. The history block has no service split. |
| `Historical - Kids`, `R:AG` | `Week`, `Date`, then 2013–2026; section title `Historical - In-Person US Attendance` | UpStreet, `attendance_headcount`, `all` | Same distinction: an aggregate source count, not unique PCO participants; no service split in this block. |
| `Historical - Students`, `A:P` | `Week`, `Date`, then 2013–2026; section title `Historical - In-Person Transit Attendance` | Transit, `attendance_headcount`, `all` | Keep as a workbook headcount series. Do not reinterpret it as a unique-person count. |
| `Historical - Students`, `R:AG` | `Week`, `Date`, then 2013–2026; section title `Historical - In-Person IO Attendance` | InsideOut, `attendance_headcount`, `all` | The historical series is not split into large-group and small-group measures. |
| `Historical - Connection`, `A:K` | `Week`, `Date`, then 2018–2026; section title `Historical - Total Groups Attendance` | Connection, `member_attendance`, `all` | Accepted workbook-defined attendance. Keep distinct from PCO `group_attendance`, which counts explicit event/person pairs. |
| `Historical - Connection`, `M:S` | `Week`, `Date`, then 2022–2026; section title `Historical - Engaged 1` | None in Phase 5 | Preserve as source history for later engagement work; do not publish as a Phase 5 group or attendance measure. |

The identified historical attendance tabs do not expose year-by-year volunteer
or new-attendee series in their section headings. Do not fill those historical
gaps from attendance totals or label them as zero.

## Accepted children/student history imported — 2026-11-16

Waumba Land, UpStreet, Transit and InsideOut aggregate attendance were imported
for 2013–2026 as `attendance_headcount` with `all` scope. Each ministry has 52
weekly rows in 2013–2025 and 44 rows in 2026, ending November 1 because the
accepted workbook snapshot is November 7, 2026. All 56 annual publications
passed validity checks. Each year uses the workbook's ordinal-Sunday alignment;
the series remain separate from unique PCO Check-In attendance and have no
historical service, location, classroom or group split. No PCO sync was started
or changed.

Unreadable or unsafe source cells remain missing rather than being guessed.
The imported data has these missing-cell counts: Waumba Land, 6; UpStreet, 7;
Transit, 10; InsideOut, 32. Past literal blank attendance cells follow the
accepted zero rule, while future 2026 weeks after the snapshot were excluded.

## Operating-tab candidates

These tabs contain weekly operating measures and may overlap years represented
in the historical blocks. Apply the same-measure, same-unit, same-scope overlap
rules below; do not import both copies of an overlapping observation.

| Sheet and source headings | Candidate metric key | Mapping notes |
| --- | --- | --- |
| `WL!E:G`, `US!E:G`: 9:30, 11:00 and total in-person attendance | `attendance_headcount` | Map service components to `service-1`/`service-2` only with the date-era service mapping. Keep total scope `all`; do not add the total to its components. |
| `WL!H:J`, `US!H:J`: new kids by service and in-person total | `new_guests` | Use only as a source-defined workbook count. It is not PCO `first_known` and does not establish first-ever attendance. |
| `WL!K:M`: volunteers by service and total | `volunteer_headcount` | Keep service scopes and total distinct; do not assume volunteers are unique across services. |
| `US!K:Q`: volunteers in rally, serving at each service, large-group volunteers and totals | `volunteer_rally` for rally counts; `volunteer_headcount` for service/large-group counts | Keep activity categories and totals separate. Do not infer unique people or sum overlapping categories. Resolve the `LG` abbreviation before assigning a scope. |
| `US!R`: volunteers for new-family check-in | `volunteer_headcount` | This is a volunteer category, not a `new_families` measure. Keep separate from service totals unless the workbook defines deduplication. |
| `Transit!B:D`: 9:30, 11:00 and total headcount | `attendance_headcount` | Apply date-specific service mapping; total is not the sum of another ministry's series. |
| `Transit!E`, `IO!H`: new students in person | `new_guests` | Source-defined count only; not PCO `first_known`. |
| `Transit!F:H`, `IO!I`: SGLs in rally | `volunteer_rally` | Keep rally participation separate from actual serving and from PCO scheduled/accepted volunteers. |
| `IO!F:G`: large- and small-group attendance | `large_group` and `small_group` | Keep the source-defined measures separate. The existing definitions intentionally do not assume that either count is unique students or that the two can be summed. |
| `IO!J`: SGLs in groups | `volunteer_headcount` | Candidate source count with small-group context; do not combine with rally counts or infer unique people. |
| `Connection!D`, `Connection!V`: total groups attendance and group-member attendance | `member_attendance` | Similar labels need explicit column mapping so the same weekly count is not imported twice. Preserve any distinct source-defined measures separately. |
| `Connection!C`, `Connection!B`: number of groups | `group_count` | Use only for a dated snapshot whose scope matches the active/non-archived group definition; not a weekly attendance measure. |
| `Connection!U`: groups that took attendance | `groups_reported` | Source-defined count of reporting groups; not total active groups. |
| `Connection!M:N`: group leaders and coaches | `group_leaders` / `coaches` | Map separately. A coach is not automatically a PCO leader, and a workbook aggregate is not a person-level list. |
| `Connection!O:P:T`: total groups volunteers, guest-services volunteers and total church volunteers | `volunteer_headcount`, `guest_services_volunteers`, `total_volunteers` | Keep subset and total measures distinct; do not add components into the total. |

These are candidate interpretations, not database mapping records. A column
with a similar label is not sufficient if its date, scope, unit or underlying
population differs.

## Keep outside the Phase 5 crosswalk

- Score, momentum and connection/engagement dimensions belong to later
  scorecard, health or engagement work; their historical formulas are not
  Phase 5 attendance or serving measures.
- YouTube, Instagram, TikTok, website and page-view fields belong to later
  communications/analytics integrations. A page view is not a completed
  Discover Northpoint, Sneak Peek or group-join conversion.
- New-kid/student counts must not be relabelled as first-known PCO participants
  without a definition match. PCO `first_known` is limited to imported
  person-linked history.
- Rally, scheduled, accepted and actual-serving activity are distinct. Do not
  convert a rally count or a PCO schedule response into actual service.

## Operating measures imported — 2026-11-17

Published 35 series through the existing accepted-workbook mapping and staging
path. All publications passed source-lineage validity checks. Each contains
37 Sunday observations, February 22–November 1, 2026; later rows are excluded by
the November 7 snapshot cutoff.

- `WL`: E/F service attendance; H/I/J new children; K/L/M serving volunteers.
- `US`: E/F service attendance; H/I/J new children; L/N/Q serving volunteers;
  K/M/O rally volunteers.
- `Transit`: B/C service attendance; E new students; F/G/H rally volunteers.
- `IO`: F/G large-/small-group counts; H new students; I rally volunteers.
- `Connection`: M leaders; N coaches; O group volunteers; P guest-services
  volunteers; T total church volunteers; U reporting groups.

Missing or unsafe cached formula results stay missing, not zero. In particular,
Transit new-student/rally, InsideOut rally and Connection reporting-group
columns have no usable cached values in the imported range. No formulas were
executed. Child/student all-service attendance continues to use the previously
imported historical blocks rather than duplicate operating totals.

UpStreet P (`LG`) and R (new-family check-in volunteers), InsideOut J (SGLs in
groups), and Connection B/C/D/V remain unmapped because activity definitions,
population equivalence or duplicate-series treatment is not established.
Historical first-service observations retain the workbook's 9:30 AM label;
current PCO first-service observations retain 9:00 AM.

## Giving workbook imported — 2026-11-17

The `$$$` sheet B:O contains 2013–2026 historical **general-giving** weekly
totals. Fourteen annual publications passed lineage validity checks: 720 weekly
rows, 718 usable values, through November 1, 2026. The 2013 and 2021 unreadable
cells remain missing. Values use exact USD minor units, ordinal Sundays and
the accepted snapshot cutoff. Complete PCO values win same-period overlap;
the sources are never added together.

Important source limitation: the workbook labels this **general giving**, not
all-fund cash flow, and explicitly notes a PCO gift excluded from its total.

The owner subsequently chose **General Giving throughout** for the primary
trend. The mapped PCO General Giving fund's eligible designations now publish
to that same General Giving series, while all-fund received totals are a
separate KPI. This resolves the fund-scope mismatch; it does not make sources
additive or remove the workbook's documented exclusions and missing cells.
These are source-defined historical amounts; do not assert that workbook and
PCO totals have identical inclusion rules. The owner subsequently approved
Strategic → NP Strategic, Building → Building Fund - For Austin, Care → Care,
Mosaic → MOSAIC, and FOR → FOR Fund. Columns Q/R/S/U/V are now accepted as
fund-category history on their native 2026 Sunday axis: 220 observations through
November 1, of which 146 have readable amounts. Missing cells stay missing;
complete PCO values win overlap. Care Outreach stays outside Care; Building and
FOR remain separate.

Fuel column T remains campaign-unspecified. The owner chose to keep PCO's
year-labelled Fuel funds separate, so that combined column has not been
assigned to a campaign. X:Z first-time/recurring/lapsed headers have no
underlying cells in the accepted sheet and cannot supply those historical
counts. Separate monthly recurring and giving-unit blocks also require their
own period/unit mappings; they were not treated as weekly amounts.

## Date, source and overlap rules

1. Treat the `Week`/`Date` cells and year columns as the source date axis.
   Preserve source lineage and the applicable year/snapshot cutoff; use the
   importer's ordinal-Sunday handling rather than shifting a partial year or
   reusing the current year's literal dates.
2. Keep the 9:30/11:00 labels tied to their effective date era. Do not silently
   rename historical services to current times.
3. For a matching measure, unit, scope and period, prefer a complete PCO series
   over an overlapping complete workbook value. Never add the two sources.
   Workbook headcounts remain distinct from unique PCO Check-Ins participants;
   incomparable measures stay separate rather than being forced into an
   overlap.
4. Import usable accepted cached values through the existing Imports mapping
   flow. Do not execute workbook formulas or require per-week/per-cell
   reapproval. Preserve actual unreadable, duplicate, ambiguous or undated
   cells as flagged gaps.
5. The Connection history mapping is applied for the accepted 2026-11-07
   workbook. Other rows remain candidate interpretations, not database
   mappings; this crosswalk itself does not create or approve mappings.
