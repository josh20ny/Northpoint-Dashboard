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
published weekly values, date ranges, comparison/history tables, source dates,
quality flags and a KPI inventory. The overview uses the previous completed
Sunday, not the latest available historical value. Service Programming retains
its adult editor and adds a separate serving section.

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
`PHASE5_WORKBOOK_CROSSWALK.md`; it has not created source mappings or imported
any workbook history.

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

1. Owner/Admin authorizes any additional PCO permissions and the relevant
   restricted development-data environment.
2. Execute current-data scans, identify/map actual events, rooms, groups, funds
   and teams, and accept representative source-to-storage-to-screen results.
3. Run PCO historical backfills and accepted workbook mappings for all domains;
   resolve actual historical units/era mappings and coverage gaps.
4. Complete the focused authenticated browser pass, live-source acceptance
   and owner development signoff. These are not claimed by type checks or
   synthetic/rollback fixtures.
5. Keep production, publishing, enabling unattended scheduling, and the earlier
   deferred production lifecycle checks separate from this development gate.

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

### PCO processing: measure, then improve safely

The current worker advances one API page per two-second tick and serializes
workers behind a shared database advisory lock. Each page is committed
durably, but entities within it are persisted through multiple database
operations, and some source relationships fan out into additional queued
requests. A run can therefore take many hours even though progress is saved.
The current `incremental` run mode also initializes from product root
collections rather than a persisted per-product last-success checkpoint; a
completed backfill is required, but by itself does not make the next run
resume from the prior processing time.

Recommended order:

1. After the current imports settle, capture safe per-product baselines:
   elapsed time, API pages, records received, database revisions, unchanged
   records, retries and rate-limit responses. Do not log source payloads,
   donor details or credentials.
2. Implement a true incremental checkpoint per product/resource. Store a
   durable provider-supported `updated_at` watermark (or the narrowest reliable
   equivalent), use a documented overlap window for late changes, and dedupe
   by the existing source identity/hash. Verify which PCO endpoints support
   reliable change filters and relationship updates before relying on them;
   retain a bounded reconciliation path for endpoints that do not.
3. Reduce request and database overhead without dropping lineage or recovery:
   use supported collection includes/relationship lookups instead of
   per-record requests where possible, batch idempotent writes and observation
   records per page, and retain atomic page checkpoints and safe replay.
4. Replace fixed one-page polling with a rate-limit-aware worker that can
   process pages efficiently and use carefully bounded parallelism only for
   independent resources. Preserve fairness between runs, pause/cancel
   behavior, the provider's `Retry-After` guidance, and deduplication. If
   workers are parallelized, replace the broad lock with durable page claims
   and fencing/lease checks so a crash or overlapping worker cannot skip or
   double-apply a page.
5. Test restart/resume, duplicate replay, late updates, relationship changes,
   partial page failure, cancellation and rate limiting against isolated
   fixtures. Compare elapsed time and request counts to the baseline before
   considering the speed work complete.

Do not deploy these worker changes or enable unattended scheduling as part of
the development-only Phase 5 work without separate authorization.
