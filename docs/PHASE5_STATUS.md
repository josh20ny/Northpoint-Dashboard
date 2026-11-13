# Phase 5: implementation and live-source gates

Phase 5 remains open until current-source acceptance, all required historical
backfills, and owner development signoff are complete. Implementation is not
proof that new provider permissions or live datasets have been accepted.

## Owner decisions

- Trust accurately retrieved PCO data. Verify storage, calculation and display
  fidelity, not every individual source value.
- Build current/future ingestion first. Historical backfills for **every**
  Phase 5 domain remain in Phase 5, after current ingestion.
- Most PCO history starts around 2022, not a universal hard cutoff. Combine PCO
  and the accepted workbook, particularly for older Giving, without summing
  overlapping versions of the same weekly metric.
- Broad Giving numbers are visible to all signed-in roles. Anything connected
  to a person's ID/name, including transactions and financial health inputs,
  is Admin-only.
- First-time giving is the first recorded gift for the person/family.
  Lapse is three missed expected gifts after an established cadence.
- The initial consistency rule is four gifts/three matching intervals with up
  to two days' date variation. **Admins can adjust the formula later.**

## Implemented surfaces

The existing Dashboard layout and adult attendance workflow are retained.
Giving, Connection, Waumba Land, UpStreet, Transit and InsideOut now have
weekly views that render eligible published values, date ranges,
comparison/history tables, source dates, quality flags and a KPI inventory.
The overview uses the previous completed Sunday, not the latest available
historical value. Service Programming retains its adult editor and adds a
separate serving section.

Administration includes effective-dated ministry source interpretation,
immutable correction/retirement versions, explicit publication, and accepted
workbook-history imports. A workbook import needs its **Imports mapping ID**,
not a ministry source mapping ID. Approval is for source semantics and units,
not a new per-week approval of accepted numeric workbook values.

The Admin Giving view exposes paginated, audited transactions and restricted
giving-unit signals. The formula editor changes:

- Minimum distinct gift dates required to establish cadence.
- Allowed interval variation in calendar days.
- Number of missed expected gifts that establishes lapse.
- Individual-person versus explicitly linked joint-giving-unit grouping.
- Enabled weekly, every-other-week, monthly, quarterly and annual cadences.

Each edit appends a version with a note and optimistic concurrency check.
Prior publications/evidence are immutable. Changed formulas invalidate current
published Giving until recalculation. The restricted evidence retains the
formula version and source date for later health work; it is not a health score.
Irregular or insufficient patterns are **unclassified**, not healthy.

## Source and storage contracts

- Existing encrypted OAuth grants and exact original three scopes remain
  compatible. Giving/Groups require a separate, explicit Admin consent flow.
  An additive consent must match the existing organization before replacement.
- Optional-scope acknowledgement explicitly covers pseudonymous donor and
  group-member data entering this development environment. No names, contacts,
  payment instruments, memos or sensitive child attributes are requested.
- Minimal typed adapters use Giving API `2019-10-18`, Groups `2023-07-10`,
  Services `2018-11-01`, and the existing Check-Ins contract.
- Giving keeps donations, fund designations, refunds, recurring schedules,
  lifetime first-gift metadata and explicit joint-giver linkage distinct.
  Funds/refunds are not added again to received Giving. Currencies never mix;
  money is stored/calculated in integer minor units.
- Groups membership/leader snapshots are not event attendance. Only explicit
  attended records on non-cancelled, ended events contribute meeting attendance.
- Services scheduling/acceptance uses explicit linked service times. Neither
  is proof of actual serving.
- Check-Ins attendance is distinct regular participants within each mapped
  ministry/scope/week; volunteers and first-known participants are separate.
  Anonymous/missing linkage stays unknown. First-known does not mean first-ever
  and requires historical coverage. Do not apply adult exceptions to children.
- Current scans persist their lower date bound and lifecycle version separately.
  They cannot mark inaccessible/unscanned older history as absent. Giving also
  scans recently updated gifts so older gifts refunded in the current period
  are not omitted just because their received dates are old.
- Existing resumable pages, retries, token rotation, raw revisions, observation
  ledger and explicit executor delegation are retained.
- Publishing once establishes that product's publication. Later completed,
  authorized scans refresh it in the same executor. A failed projection retains
  the last publication and reports an Admin-review error; it is not silently
  treated as current.
- Scheduler product selection is explicit. Existing settings/enabled state and
  the original three-product default are unchanged. An additional product needs
  granted access and a completed current-window scan or backfill before enabling.
  This does not resolve the separately deferred production/unattended checks.
- Safe aggregate values and restricted lineage/formulas have separate forced-RLS
  tables and immutable history guards. Boolean-only source-validity functions
  validate the active caller and restore role context on success/error.

## Workbook history and overlaps

Accepted, approved and staged source mappings can publish all Phase 5 measures.
Read cached numeric workbook values without executing Excel formulas. Error,
duplicate, unsafe, merged/shifted or undated evidence remains missing.
Counts and currency units must match the approved source interpretation.
Workbook attendance/volunteer headcounts and legacy giver counts have their own
labelled measures. They cannot silently become unique PCO participants, current
formula donor units, or recurring payment schedules. Overlap selection is only
within the same measure, unit and scope; incomparable series stay separate.
An explicitly selected historical year uses ordinal Sundays **within that
source date axis**, not the current year's literal date and not the first row
of a partial-year selection. A year without a matching Sunday is flagged.
Workbook snapshot dates still limit what may be imported.
The non-Giving candidate sheet/measure map is documented in
`PHASE5_WORKBOOK_CROSSWALK.md`; it has not created Phase 5 source mappings or
imported Phase 5 workbook history. The active, accepted 2026-11-07 workbook
batch currently has two approved, staged mappings for Adult service attendance
(52 rows each); those are not Phase 5 ministry metrics.

Current development data check (2026-11-13): the Giving historical backfill is
complete (41,875 pages; 110,535 fetched; 109,564 revised; no pending pages).
Check-Ins, People and Services have completed incremental runs; Groups has a
completed current-window run (1,326 pages; 10,430 fetched), not a historical
backfill. These source records are staged, but there are currently no active
Phase 5 source mappings and no ministry metric publications. A completed PCO
sync is therefore not yet a published ministry dashboard.

## Staged PCO mapping review — 2026-11-13

The Admin-only source directory contains 34 Check-Ins events and 332 locations,
534 Groups, and 36 Giving funds. The Check-Ins labels reviewed include adult
Sunday service events plus special-event, camp and assignment/roster entries;
none was assigned to a child/student weekly attendance measure based on its
name alone. Forty-seven Group labels contain ministry-name keywords, but group
names are not exposed in this review and are not treated as authoritative
ministry classifications.

Services has 22 service types, 3,232 plans and 12,321 plan times, but no staged
PlanPerson/team assignment records. Service-type names alone do not establish
actual-serving counts. No source mapping or publication was created and no new
PCO scan was started. Broad all-fund Giving totals do not require fund-specific
mapping; fund-level figures still require explicit source interpretation.

## Owner-confirmed attendance source semantics — 2026-11-13

Sunday PCO Check-Ins are the current source of truth, with data-quality checks
for double check-ins, missing person profiles, duplicated check-ins and
duplicated profiles. Waumba Land and UpStreet attendance is counted by mapped
Check-Ins location per service. Transit and InsideOut attendance is counted
from their service check-ins and matched to the students' Groups records.

The accepted historical workbook provides total attendance and first-time
check-ins by ministry and service only. It has no location-level or group-level
history; do not fabricate those splits. The Check-Ins calculator now includes
linked guest check-ins in attendance and continues to deduplicate rechecks by
person ID within a ministry/scope/week. It cannot automatically identify two
different PCO profile IDs as the same person. Missing person links remain a
visible data-quality issue, not an identity to infer. The Admin exception
queue now allows an Admin to include or exclude an unresolved Check-In. Each
decision is audit-logged, affects publication only after republishing, and
never changes Planning Center or merges profile identities.

Each source/version is idempotent. Select the newest revision from each source,
then prefer complete PCO over overlapping complete workbook values; never add
the sources together. Archived/withdrawn/changed mappings and changed formulas
invalidate affected publication output. Manual adult corrections are untouched.

## Bounds and known distinctions

Source publication is bounded at 500,000 minimized records and ten reporting
years per operation. Workbook mappings permit 250 active and 1,000 total versions
per batch, retaining the existing 1,000-row-per-mapping bound. Admin source
metadata is bounded; this is not a general raw-record browser.

First-gift metadata is PCO's lifetime first-recorded date, not the first row in
a current ingestion window. Family units use current, explicit PCO joint-giver
relationships; historical family membership is not reconstructed. Workbook-only
aggregate history cannot establish individual identities or donor cadence.
The lapsed signal requires an accessible-history backfill. Formula-supported
cadences are explicit; unsupported/irregular patterns remain unclassified.

Snapshot measures describe their scan date, not an invented historical Sunday.
Unfinished reporting weeks and partial first-window weeks are not final actuals.
Missing observations are not automatically zero. Calendar bucketing uses Chicago.

## Remaining Phase 5 gates

1. Complete the privacy review and approve a suitably restricted development
   environment before adding more identifiable donor, group-member or child
   history. This gates additional sensitive scans, not work on existing,
   already-staged sources.
2. Map the existing PCO events, rooms, groups and funds to approved ministry
   measures; publish completed scans and accept representative
   source-to-storage-to-screen results. Do not infer a ministry from an
   unreviewed name or treat all synced records as reportable.
3. Run the remaining historical backfills and accepted workbook mappings for
   all applicable Phase 5 domains after the data/privacy gates; resolve actual
   historical units, era mappings, overlaps and coverage gaps.
4. Complete the focused authenticated browser pass, live-source acceptance and
   owner development signoff. These are not claimed by type checks or
   synthetic/rollback fixtures.
5. Keep production deployment and unattended scheduling separate from this
   development gate.

## Deferred follow-ups: Integrations usability and PCO speed

These items are recorded for later work; they do not require changing, pausing,
restarting or cancelling active imports. Do not alter live sync queues or
schedule settings as part of this follow-up plan.

### Integrations page: collapse provider sections

The Integrations page currently renders the Planning Center controls and
connection history as one long section, followed by other providers. Add
accessible, keyboard-operable provider sections so the page can show a concise
**Planning Center** heading and reveal its controls, syncs and history when
expanded. Keep connection status visible in the heading, preserve the existing
Admin restrictions and all controls, and leave unrelated provider behavior
unchanged. This is a small admin usability improvement that can be implemented
independently of sync processing; defer it until the owner wants that UI work
started.

### PCO processing: page efficiency improved; durable deltas remain

The shared worker now adapts its request spacing to Planning Center rate-limit
headers and `Retry-After`; source pages are written in set-based batches while
keeping each page and its cursor durable and replayable. Giving and Groups also
fetch supported linked records in batches instead of issuing one relationship
request per record. Workers remain serialized; no unbounded parallelism or
scheduler setting was added.

The Giving backfill processed 41,875 pages over the run period. This is a
completed-history result, not evidence that every future sync finishes in
minutes. Manual and scheduled `incremental` runs now start from the latest
completed backfill/incremental run with a three-day overlap; the cutoff is
stored on the run so retries resume the same window. Filter parameters are
preserved across pagination and service-plan child discovery.

Verified update filters are used for People, Check-Ins, Giving donations, and
Services plans. Other small product roots may still be re-read. Groups keeps
a full reconciliation because the supported API filters do not safely capture
membership edits or changed attendance on older events. This is a product-level
date checkpoint, not a per-resource watermark; Groups and Services assignment
relationship coverage still need a bounded reconciliation/late-change policy.

Next, verify those relationship-change boundaries and add periodic
reconciliation for resources without reliable delta filters. Test
restart/resume, duplicate replay, late updates, relationship changes, partial
page failure, cancellation and rate limiting against isolated fixtures. Do not
start new sensitive scans to benchmark this work before the privacy gate is
cleared.

Do not deploy these worker changes or enable unattended scheduling as part of
the development-only Phase 5 work without separate authorization.
