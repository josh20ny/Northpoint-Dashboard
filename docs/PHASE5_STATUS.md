# Phase 5: implementation and live-source gates

**Development closed November 18, 2026.** This file records the Phase 5 implementation and successive reviews. Statements about pending reviews below describe their dates. The [decision log](DECISIONS.md) records the final signoff and production gates. The [Phase 5B brief](PHASE_5B.md) supersedes earlier instructions about workbook display, page hierarchy and the next delivery.

## Owner decisions

- Trust accurately retrieved PCO data. Verify storage, calculation and display
  fidelity, not every individual source value.
- Prioritize current/future ingestion. Historical backfills for **every**
  Phase 5 domain remain in Phase 5 and may proceed when their source and mapping
  gates are ready; they do not need to wait until all current ingestion is done.
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
- Groups sync must retain full-history reconciliation to capture older
  membership and event-attendance changes. The completed history scan took
  3 hours 52 minutes; optimize within supported rate limits and keep progress
  resumable, but do not silently trade accuracy for recent-only sync. This
  decision does not authorize another scan or change scheduling.

## Implemented surfaces

At the Phase 5 closeout the existing Dashboard layout and adult attendance workflow were retained. Phase 5B changes the presentation described in this section.
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

Phase 5 allowed accepted, approved and staged workbook mappings to publish historical measures. Phase 5B restricts their use in staff reporting to documented gaps. Comparable overlaps support reconciliation.
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
The non-Giving workbook crosswalk is documented in
`PHASE5_WORKBOOK_CROSSWALK.md`. The accepted Connection total-groups-attendance
series is now mapped and published for 2018–2026. The active, accepted
2026-11-07 workbook batch also has two approved, staged mappings for Adult
service attendance (52 rows each); those are not Phase 5 ministry metrics.

Initial development data check (2026-11-13): the Giving historical backfill is
complete (41,875 pages; 110,535 fetched; 109,564 revised; no pending pages).
Check-Ins, People and Services have completed incremental runs; Groups has a
completed current-window run (1,326 pages; 10,430 fetched), not a historical
backfill. At the initial review these source records were staged without
Phase 5 source mappings or ministry metric publications. The owner-approved
location mappings recorded below have since been saved. A completed PCO sync
is not itself a published ministry dashboard.

Development update (2026-11-16): The Groups historical backfill completed. The
accepted Connection workbook series was imported into nine valid annual
publications: 52 weekly rows for each year 2018–2025 and 44 for 2026. The
2026-11-07 workbook snapshot limits the 2026 history; future and unreadable or
unsafe source values remain missing. Past literal blank attendance cells are
handled as zero. The import did not start or modify a PCO sync.

The four accepted children/student historical attendance series were also
imported: Waumba Land, UpStreet, Transit and InsideOut, each for 2013–2026.
There are 52 weekly rows per year for 2013–2025 and 44 for 2026, ending
November 1 at the November 7 workbook snapshot. All 56 annual publications
passed validity checks. Unreadable/unsafe cells remain missing (6 Waumba Land,
7 UpStreet, 10 Transit, 32 InsideOut); past literal blank attendance is zero.
These are aggregate workbook headcounts, not unique PCO attendees, and no
service/location/classroom/group splits were inferred. The import did not
start or modify a PCO sync.

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

The Admin mapping form now supports routing-only service-session mappings for
Check-In Events and routing-only student-ministry classifications for Groups.
Transit/InsideOut Check-Ins can be classified only through a mapped Group
membership; that mapping does not publish group totals or person-level data.
The calculation uses only the latest completed Groups snapshot for its nearest
completed Sunday and does not backcast today's memberships into older weeks.
These mapping options do not create source mappings or publications by
themselves. At that implementation checkpoint no mapping had been saved.
The subsequent approved location configuration is recorded below.

### Owner-supplied Check-Ins reference — November 8, 2026

The owner identified **Normal Service Times** and supplied the active PCO
location hierarchy for the November 6–8 session. The staged Event matches that
name, and its November 8 time records are 9:00 AM, 11:00 AM and 4:30 PM Chicago
time. The owner wants the agent to handle mapping entry, not require manual
configuration in Admin.

Screenshot reference totals (PCO UI headcounts, not yet accepted published
dashboard attendance):

| Location branch | Displayed total |
| --- | ---: |
| UpStreet | 157 |
| Waumba Land | 74 |
| Transit | 109 |
| InsideOut | 89 |
| Other → Hangout | 14 |

The combined UpStreet/Waumba parent shows 245 and includes the Other/Hangout
branch. The owner explicitly confirmed **Hangout counts toward UpStreet**.
Do not add parent and descendant totals or assume adding displayed room
headcounts yields unique ministry attendance. PCO
regular/guest/volunteer distinctions and cross-location/service overlaps must
remain distinct when comparing these UI headcounts to dashboard attendance.

Targeted read-only checks found 193, 170 and 90 stored Check-In records linked
to the three service times respectively; the screenshot shows 193, 167 and 90.
Raw row counts are not attendance: reconcile duplicate/missing-profile
treatment before claiming the November 8 counts match.

The existing Event-level service-session rule also needs service-time routing:
one Event contains multiple services, and its individual EventTime IDs are
dated instances. Do not map the whole Event to a single service or create a
one-Sunday-only routing rule that silently fails for future Sundays. No source
mappings or publications were saved during this reference review.

### Approved location mappings saved

Following the owner's Hangout clarification, 27 attendance mappings were saved
through the existing audited Admin mapping repository: 20 UpStreet rooms
(including Hangout) and 7 Waumba Land animal rooms. Only exact source IDs and
labels verified against the supplied hierarchy and November 8 staged data were
used; no unreviewed ministry-name inference was applied.

These mappings use combined-service (`all`) scope, effective November 8, 2026
onward, with no historical backcasting. The existing calculator deduplicates
the same PCO person within a ministry/scope/week, including across Hangout and
UpStreet classrooms. Different profile IDs are not automatically merged.

The operations entry point
`artifacts/api-server/src/ops/apply-approved-kids-locations.ts` previews by
default and requires `--apply` to save. It validates the recorded integration
authorizer is still an active Admin, checks exact source labels, refuses
conflicting interpretations, and preserves immutable mapping/audit history.
Apply reported 27 created; a subsequent preview reported zero pending.
Workspace typechecking passed.

No sync, scheduling setting, source record or metric publication was changed.
### Owner-confirmed service-time routing saved

The owner confirmed the ministry/time matrix: UpStreet, Waumba Land and Transit
at 9:00 AM (`service-1`) and 11:00 AM (`service-2`); InsideOut at 4:30 PM
(`service-3`); noon remains excluded. Seven routing-only mappings now use the
November 8 EventTime records as templates, matching future records by the
linked event and Chicago-local start time. The Admin source picker includes
recent EventTimes labeled with their event, date and local time, and service
scope labels show the corresponding clock times.

The route operation previewed all seven routes, saved seven, then previewed
again with zero remaining. It creates immutable, audited Admin mappings and
does not fetch PCO data or publish metrics. Workspace typechecking and all
non-database tests pass (313 passed; 70 skipped). Both app workflows restarted,
the API health endpoint returned `ok`, and the public preview loaded. The
preview browser is not signed in, so the Admin-only mapping form was not
visually verified.

Student Groups classifications still need mapping; unmapped/ambiguous
Check-Ins still need their Admin review resolutions; and the November 8
source-to-storage-to-display comparison remains open. The screenshot's 11:00
headcount and raw stored record count differ, so do not publish an accuracy
claim until duplicate and profile exceptions have been reconciled. The
location and time mappings are not a claim that Phase 5 attendance acceptance
is complete.

The classification fixtures and full workspace test suite pass, and workspace
typechecking passes. The API health endpoint and public dashboard preview load.
The preview capture cannot verify the signed-in Admin mapping screen, and the
rollback-only database integration test timed out before reporting a result;
database-backed publication is not yet claimed as verified.

### Student category linkage added; category interpretation still open

The Groups adapter now requests `Group.group_type` and stages the GroupType
collection. Student classification supports effective-dated GroupType mappings
as well as individual Group mappings; other Groups measures remain restricted
to Group sources. No student classification mappings have been saved yet.

The live collection includes a synthetic GroupType ID `unique`. The parser now
accepts that exact sentinel for category records and category linkage, without
relaxing ID validation for other resources. The initial refresh rejected that
shape before committing any page; the corrected authenticated current-window
refresh is running with saved page progress and automatic processing enabled.
It reads PCO and stages data only, with no metric publication.

PCO has `Transit General`, `Transit Leaders`, `InsideOut General`, and
`InsideOut Leaders` categories. Their business meaning must be confirmed before
assuming a “Leaders” category contains only adult leaders or only students.
Explicit group-name matching alone leaves substantial gaps and cross-ministry
overlaps, so it is not used to create ministry classifications.

Workspace typechecking and the existing full non-database suite passed before
the sentinel adjustment; the focused ministry suite (25 tests) and API
typechecking passed afterward. The live category response now passes the parser.
Both services run, and the signed-out dashboard loads without console errors.
November 8 attendance reconciliation and signed-in display acceptance remain open.

### Student categories saved; refreshed November 8 comparison

The owner confirmed that the “Leaders” categories contain **both students and
volunteers**. Four GroupType classification mappings now cover Transit General,
Transit Leaders, InsideOut General and InsideOut Leaders, effective November 8.
They were saved through the audited repository; a repeat preview found zero
pending mappings. Categories classify ministry only, with the existing
membership-leader and volunteer Check-In exclusions retained.

The corrected current Groups refresh completed: **1,411 pages and 11,170 fetched
resources**, with no pending pages. This is fetched resources across Groups,
memberships, events, categories and attendance—not a count of students.

A read-only comparison of non-volunteer November 8 Check-Ins against active
Groups memberships (non-leader, joined on/before the service date) found:

| Service | Unique linked people | Transit only | InsideOut only | Both student ministries | Neither student ministry |
| --- | ---: | ---: | ---: | ---: | ---: |
| 9:00 AM | 193 | 44 | 0 | 1 | 148 |
| 11:00 AM | 166 | 44 | 0 | 0 | 122 |
| 4:30 PM | 89 | 0 | 47 | 22 | 20 |

The morning denominator includes children's ministries and is **not** a Transit
attendance total. At 4:30 PM, 22 people have eligible memberships in both student
ministries and 20 have neither. The existing calculator correctly treats
cross-ministry classification as ambiguous, rather than silently assigning it.
At 11:00 AM there are 170 non-volunteer Check-In rows, 166 distinct linked people,
and one row without a person link; raw rows must not be compared as if they were
the screenshot's 167 headcount.

These results do not yet reconcile to Transit 109 and InsideOut 89. The mappings
are configured, but student attendance acceptance is still open. No attendance
metrics were published. The next reconciliation must explain source locations,
membership overlaps/gaps and the existing duplicate/profile exceptions before
changing counting policy or claiming matching totals.

### Confirmed service times now narrow student classifications

The owner approved resolving cross-ministry membership overlaps using the
confirmed service times. The calculator now intersects eligible Groups
classifications with student ministries routed for the actual Check-In time.
Morning routes can classify Transit members; the 4:30 PM route can classify
InsideOut members even when those people also retain Transit memberships.
Routing alone does not replace a missing membership, and multiple eligible
ministries routed to the same Check-In remain ambiguous. Volunteer Check-Ins
remain excluded from student attendance.

The updated focused suite passes 29 tests, covering morning/evening routing,
remaining service ambiguity, missing membership and volunteer exclusion. API
typechecking passes. A read-only November 8 run of the actual calculator reports
no cross-ministry ambiguity; its remaining issues are missing person profiles,
possible duplicate Check-Ins, missing student membership, and four unresolved
Check-In review items. All three student-service attendance results are
correctly withheld as partial (`value: null`), not published as accurate totals.

The read-only preview filters source facts by linked EventTime dates before
loading them. Loading the full Check-Ins history exceeded the existing 500,000
source bound. The publisher now loads only Check-Ins whose linked EventTime or
EventPeriod falls in the requested reporting window, along with their source
context, routing templates and Groups snapshot. First-known values stay missing
when the requested window omits earlier imported history. No attendance was
published by this change.

The Admin Check-In review now defaults to the latest completed Sunday, offers
other Sundays with unresolved records, shows source names/locations and grade
suggestions, and displays live partial attendance subtotals that change after
include/exclude decisions. PCO grade labels classify preschool as Waumba Land,
K–5 as UpStreet, 6–8 as Transit and 9–12 as InsideOut. Grade resolves a
cross-ministry overlap only on the latest completed Sunday and only when that
ministry is already among the eligible mapped memberships; missing or
conflicting evidence remains unresolved. Current grade is not backcast to older
attendance.
Check-In collection requests now include only child display name and grade
needed for this Admin workflow; birthdates and other personal fields remain
excluded. A new Check-Ins/People refresh is required before these fields are
available on existing stored records. No refresh was started.

Each source/version is idempotent. Phase 5 selected the newest revision from each source and preferred PCO only between equally complete candidates. Phase 5B requires PCO authority throughout its coverage, including partial observations. Archived/withdrawn/changed mappings and changed formulas
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

## Connection aggregate snapshot — published 2026-11-16

Using the already-completed Groups snapshot from 2026-11-13, the audited
publisher created a current Connection snapshot for the reporting week ending
2026-11-15:

| Measure | Value | Meaning |
| --- | ---: | --- |
| Active groups | 196 | Non-archived PCO Groups at snapshot time |
| Group memberships | 3,780 | Membership records, not unique people |
| Group leaders | 487 | Leader-role membership records |

Publication validity and all three stored values were verified. The operation
did not start a scan or expose group/person names or IDs. Group meeting
attendance remains unpublished because no eligible PCO Groups-to-ministry
attendance mappings have been defined; the source preview reported
`unmapped_group_attendance`. This is a current snapshot, not historical group
count or membership coverage, and does not complete Connection acceptance.

### Group-attendance category evidence

A read-only aggregation of the same completed snapshot found eligible ended,
non-cancelled Events and distinct attended Event/Person pairs by PCO GroupType:

| PCO category | Eligible events | Attended event/person pairs |
| --- | ---: | ---: |
| Groups | 52 | 198 |
| InsideOut General | 1 | 0 |
| InsideOut Leaders | 42 | 68 |
| Teams | 2 | 11 |
| Uncategorized | 1 | 9 |

Other staged categories had no eligible attendance pairs in this snapshot.
These source facts do not decide which categories belong in Connection group
meeting attendance. In particular, student categories and Teams are not
implicitly included. No category was mapped or attendance total published.

### Owner-approved Connection attendance category — 2026-11-16

The owner selected **Groups only**. The audited mapping now targets that exact
PCO GroupType, effective from the completed source window's start on November 8,
2026. Student, leader, Teams and uncategorized categories remain excluded. The
mapping was applied without starting a PCO scan, and the existing Groups data
was republished with a valid publication.

The source run began November 8 and finished November 13, before the November
15 reporting week closed. Its partial/future attendance values were preliminary.
After the full Groups backfill completed November 16, the completion refresh
published **7** attended pairs for November 8 and **212** for November 15, both
complete; November 22 attendance remains future. No period before November 8
is inferred.

The November 15 group-count, membership and leader snapshots remain 196, 3,780
and 487 from the November 13 scan. A later publication had inserted
`no_eligible_observations` placeholders for those snapshot measures on weeks
other than its own scan week, which hid the earlier dated snapshot. The read
path now ignores only those off-week snapshot placeholders; current snapshot
values remain dated to their scan week and expose their `source_as_of` timestamp.

## Remaining Phase 5 gates

### November 17 implementation update

- Published 35 additional accepted operating-tab series (service attendance,
  source-defined new attendees, volunteer categories and Connection measures),
  with 37 weeks per series through November 1. Missing cached results remain
  missing. Historical 9:30 AM service labels are no longer displayed as current
  9:00 AM service times.
- Published 14 annual Giving workbook series (2013–2026), retaining exact USD
  minor units, 720 dated rows and 718 usable values. Source-defined historical
  general giving is not an all-fund cash-flow reconciliation. Fund categories
  were mapped and the separate monthly recurring / giving-people blocks were
  subsequently published; see the dated November 18 update below.
- Fixed Giving publication coverage: a newer current-window scan no longer
  blocks publication of retained, completed Giving backfill or marks its first
  overlap week partial merely because the current scan began midweek. Other
  products and Giving without a completed backfill keep their coverage guards.
- No new live PCO scan, schedule change or production deployment was performed.
  See `PHASE5_WORKBOOK_CROSSWALK.md` for remaining semantic mapping gaps.
- The completed Groups backfill now provides complete Connection meeting
  attendance for November 8 (7) and November 15 (212). Off-week missing
  placeholders no longer hide the separately dated group-count, membership
  and leader snapshots; a rollback-only database test verifies that behavior.
- The latest current Giving scan had completed, but its in-transaction
  auto-publication had left the explicit Admin-review marker. Re-published the
  entire previously approved October 7, 2018–November 15, 2026 window through
  the Admin repository: 6,360 values, no calculation issues. A successful
  complete-window Admin republish now clears only that specific stale marker;
  narrower publications cannot clear it. Source scan and scheduler settings
  were not changed.
- Verification: API and dashboard TypeScript checks passed. Eleven focused
  storage/access/overlap/display tests passed using rollback-isolated source
  organizations, including the newer-current-scan Giving regression.
- **Giving publication performance blocker cleared:** the original multi-year
  attempt timed out after five minutes. The publisher now indexes Giving
  identities and gift dates once rather than rebuilding them for each Sunday,
  and loads stored facts in bounded keyset pages under the existing query
  timeout. The successful publication processed 110,779 staged facts for
  October 7, 2018–November 15, 2026 in 18.4 seconds. No new PCO scan was needed.
- The live validation also exposed signed Refund amounts: all ten staged
  refunds use negative cents. Refund reporting now uses the absolute magnitude
  while preserving the original signed source records, refund date and
  currency; it never subtracts refunds again from received giving. A new
  calculation version prevents reuse of the earlier withheld publication.
- Verified the replacement publication with the persisted active Admin
  context: valid, no calculation issues, 2,120 metric rows, and 424 complete
  weekly received-giving values. The aggregate dashboard read returns complete
  PCO Giving for November 8/15 without person-linked fields. Three earliest
  lapse weeks lack sufficient classifiable history and remain missing.
  Recurring schedules are scan-time snapshots, not reconstructed weekly
  history; weeks with no eligible refund observations remain missing.
- Verification for the performance fix: API TypeScript passed; 64 focused
  cadence, monetary-calculation and ingestion tests passed, including batched
  vs single-period cadence equivalence and signed refunds. The rollback-only
  storage/access suite also passed nine tests. Phase 5's other gates remain
  open; this is not overall Phase 5 signoff.

### Historical Check-Ins routed and published — November 17, 2026

- The owner approved the 41 historical mappings: 27 locations, four student
  GroupType classifications, and ten service-time routes. Existing current
  mappings remain effective from November 8; no historical/current overlap was
  introduced.
- Historical routes follow the confirmed `Normal Service Times` eras: 9:30 AM
  service 1 from March 20, 2022 through April 19, 2026; 9:00 AM service 1 from
  April 26 through November 7, 2026; 11:00 AM service 2 from March 27, 2022;
  and 4:30 PM service 3 from April 3, 2022. Other observed time labels remain
  unmapped.
- Published 1,715 values for March 20, 2022–November 22, 2026 from the already
  staged PCO history; the run started no new source scan. The publication
  validator passed in under two minutes after caching repeated service-time and
  mapping lookups. This is publication time, not a new PCO sync benchmark. Of
  the stored values, 1,493 are partial and 222 are missing. The run reports
  1,050 unresolved Check-Ins, and leaves unresolved, incomplete-linkage and
  unmapped-source conditions explicit.
- November 8's partial PCO values include Transit 70 at service 1 and 39 at
  service 2 (109 total), matching the owner's Transit reference. Other
  ministry/service values remain partial and are not claimed as fully accepted
  source-to-display totals.
- Historical workbook headcounts remain separate from PCO linked-person
  attendance; do not combine or substitute one source for the other.

### General Giving trend decision and publication — November 17, 2026

- Owner chose **General Giving throughout**, not an all-fund series spliced
  into historical workbook General Giving. The main card and history now use
  `giving_total` for General Giving; `all_fund_giving` is a separate received
  giving KPI in Other KPIs. First-time/lapsed definitions remain church-wide.
- Appended an audited mapping for the unique staged PCO **General Giving**
  fund. Financial calculation uses its designations and the parent gift's
  Chicago received date, status and refund eligibility—not whole split gifts.
  Full eligible designation coverage is checked before declaring General
  Giving complete. An observed gift fully allocated to other funds contributes
  an explicit zero; no source observations still means missing.
- Published 424 complete weeks for each of General Giving and all-fund receipts
  from October 7, 2018 through November 15, 2026. Publication was valid with no
  calculation issues and took about seven seconds. No new scan or scheduler
  changes were made. Historical workbook rows remain unchanged and valid;
  complete PCO General Giving wins overlapping weeks rather than being added.
- Reused timezone formatters in bulk calculations instead of repeatedly
  constructing them. Aggregate history now validates shared publication
  evidence once per publication rather than once per metric row. Measured
  reads covering 2013–2018 and 2019–2026 took 37 ms and 68 ms respectively.
- Source readback found 298 complete workbook weeks before PCO takes over,
  one missing workbook week in the checked earlier range, and 424 complete
  PCO weeks overall. No person-linked fields appeared in the aggregate read.
- Verification: both app type checks passed, 92 focused calculation/display/
  calendar tests passed (one opt-in test skipped), and ten rollback-only
  publication/access tests passed, including role access, split-fund isolation,
  overlap selection, replay and invalidation. Publication creation timestamps
  use insertion time so sequential revisions remain ordered within an outer
  transaction. Signed-in browser presentation is not claimed by these checks.

### Check-In source acceptance and review performance — November 17, 2026

- Verified existing published attendance for November 8/15 and Connection
  attendance from the already-staged completed source windows. Partial child/
  student attendance values remain visible while Check-Ins await resolution.
  November 8 Transit is 70 + 39 = 109, matching the owner's reference; this
  does not claim full attendance acceptance for every other ministry.
- The Admin review request timed out while rebuilding its Sunday dropdown.
  The old query performed repeated period/time lookups for every historical
  Check-In. It now ranks minimal source identifiers once and resolves dates
  in batches only for potential exceptions. Relationship ordering is
  normalized to match the calculator's duplicate detection; valid standalone
  check-ins, non-Sundays and resolved exceptions do not populate the dropdown.
- Verified live repository requests after the fix: latest-Sunday default
  November 15 returned one unresolved record in 1.7 seconds; November 8
  returned four unresolved records and all seven attendance subtotals in
  1.9 seconds. No child names/profile IDs were logged, no resolution was
  recorded, and no source scan, queue, schedule or mapping was changed.
- Added rollback-only storage checks for visible partial attendance followed
  by a resolved count change, normalized duplicate linkage, earliest linked
  service dates, undated exceptions, non-Sunday exclusion, resolved-date
  removal and organization isolation. Twenty-eight focused checks and API
  typechecking passed. Authenticated browser presentation remains a separate
  acceptance item; these are repository/data-boundary checks.

### Separate Fuel campaigns — November 17, 2026

- The owner chose to keep yearly Fuel campaigns separate. Added fixed aggregate
  scopes for the four staged PCO funds: Fuel 2023, 2024, 2026 and 2027.
  A campaign's identity comes from its designated fund, not the calendar year
  a gift arrived. General Giving and all-fund receipts remain distinct.
- Admin source mapping and aggregate history now offer readable campaign
  labels. A new enabled PCO mapping cannot use the undifferentiated `fuel`
  scope; that scope remains available for campaign-unspecified workbook
  history. Existing workbook rows were not assigned to a campaign.
- Created the four owner-approved mappings and republished the existing
  October 2018–November 2026 Giving window using already-staged sources:
  4,240 metric rows, no calculation issues, about nine seconds. Readback
  returned all four distinct campaign scopes and no combined PCO Fuel scope.
  No additional scan, scheduler change or source import was started.
- Sixty-one focused calculation, display and rollback-only repository checks
  passed, including same-week split gifts to different campaigns, a gift
  received outside the campaign's named year, unchanged General Giving,
  all-role aggregate reads, identifier exclusion and invalid-scope rejection.
  API and dashboard type checks passed.
- The five fund-category mappings were approved and published in the later
  November 17 update below. Workbook Fuel (T) remains campaign-unspecified.
  Monthly recurring dollars and weekly/monthly giving-people counts now have
  separate source labels and period handling.
  Overall Phase 5 acceptance stays open.

### Approved fund breakdowns and observed-zero correction — November 17, 2026

- The owner approved Strategic → NP Strategic, Building → Building Fund -
  For Austin, Care → Care, Mosaic → MOSAIC, and FOR → FOR Fund. Created those
  five mappings without changing General Giving or the four Fuel campaigns.
  Care Outreach is excluded from Care; Building and FOR remain distinct.
- Published five accepted workbook fund columns (Q/R/S/U/V) using their native
  2026 Sunday dates, exact USD conversion and existing snapshot cutoff.
  These cover January 4–November 1: 220 observations, 146 readable amounts;
  the other 74 remain missing, and future source rows were omitted. These
  columns do not establish earlier-year fund history. Workbook Fuel (T)
  remains campaign-unspecified and was not assigned to any Fuel campaign.
- Live readback exposed fund weeks marked missing despite fully allocated
  gifts to other funds. Extended General Giving's observed-zero rule to
  individual mapped funds: only reconciled, eligible gift allocations
  establish a zero. Absent/incomplete allocations and inactive mappings do
  not. Versioned the calculation so the old missing-value publication cannot
  be reused.
- Republished the already-imported October 2018–November 2026 Giving source:
  6,360 rows, no calculation issues, about twelve seconds. Compared the new
  publication with its predecessor: all non-fund Giving values and qualities
  were unchanged. All five approved categories read back as complete PCO
  values for all 46 completed 2026 reporting weeks checked; complete PCO
  takes precedence over workbook overlap instead of adding the sources.
- Sixty-three focused calculation/display/rollback-storage checks and both
  app type checks passed. Checks include incomplete-allocation safeguards,
  observed-zero persistence, campaign isolation and all-role aggregate
  privacy. No new PCO scan or scheduler change was made.
- The next Services gate remains open: the older `services` import has
  service types, plans and times but no PlanPerson assignments; the Phase 5
  `serving` source has no staged records. Do not describe the older import as
  volunteer-count coverage or start additional identifiable assignment
  imports before the required development-data approval.

### Services assignment import authorized and verified — November 17, 2026

- The owner authorized development Services assignment imports, beginning with
  the latest completed reporting week before historical backfills. Approved
  fields are person IDs, team/service links, dates and response statuses;
  raw assignments stay Admin-only. This does not authorize production
  publishing or unattended scheduling.
- Added an optional inclusive ending date to current Services/serving imports
  in the API and Integration UI, limited to 31 days. The existing cursor
  mechanism carries both boundaries through service-type discovery, plan
  pagination and assignment/time requests. Documented PCO `after,before`
  filters use Chicago midnight boundaries, including clock-change days.
  Overlapping multi-day plans are not discarded by their sort date.
- The first explicit, manually advanced import covered November 9–15 and
  completed 45 pages with no pending pages or source error. Stored 22 service
  types, 9 plans, 41 plan times and 696 assignments. All records have raw-source
  lineage; all assignments retain person/team/plan/service-type links and
  resolve their linked service-time records. There were no assignments with
  empty service-time linkage.
- Response statuses are 256 confirmed, 311 unconfirmed and 129 declined.
  These are assignment records, not attendance, actual participation or
  deduplicated published volunteer counts. No unrequested name, notes, email
  or decline-reason fields were present in the assignment raw attributes.
- Twenty-nine focused source/API checks and both type checks passed; four
  opt-in database cases were skipped in that run. Actual stored-source
  readback verified the new assignment linkage and field limits. No Serving
  mappings or volunteer-count publications have been created yet.
- Next requires ministry interpretation: active service types include
  InsideOut, Transit, UpStreet, UpStreet Large Group and Waumba Land, plus
  shared Kids' Check-in, LU Guest Services Weekly, Safety Team Schedule and
  Sunday Morning. Do not classify the shared sources from their names alone
  or treat an assignment response as evidence of participation.
- Owner subsequently confirmed the five ministry-specific source routes
  (UpStreet Large Group also routes to UpStreet). Kids' Check-In serves
  UpStreet and Waumba Land but remains its own shared team. LU Guest Services
  Weekly is Guest Services; Safety Team Schedule is a separate team under
  Guest Services. The owner subsequently confirmed Sunday Morning → Service
  Programming.
  The current source-mapping ministry list has no Guest Services or shared
  Kids' team destination, so reporting must support those distinctions before
  publishing these shared assignments. No shared counts should be duplicated
  into both children's ministries merely to fit the existing mapping list.
- Applied and read back twelve enabled Services mappings: scheduled and
  accepted for each of the six confirmed service types (including Sunday
  Morning). Effective from November 9, 2026, the first imported reporting
  week; no historical ownership was inferred. No volunteer metrics have
  been published. The three shared sources remain staged, not silently
  assigned or discarded.

### Services latest-week aggregate publication verified — November 17, 2026

- The owner confirmed Sunday Morning → Service Programming and chose a
  separate shared-team total for Kids' Check-In, outside both UpStreet and
  Waumba Land totals. LU Guest Services Weekly and Safety retain separate
  team scopes within Guest Services.
- All nine active service types now have scheduled and accepted source
  interpretations, effective November 9, 2026. A separate reporting bucket
  supports the shared sources without inventing a new ministry or adding
  shared volunteers into child-ministry figures.
- Published sixteen complete figures for the reporting week ending
  November 15, from the completed 696-assignment scan. Publication
  `083153cc-b13a-435e-8232-64a1558ae68b` has no calculation issues.
  Every stored value matched its pre-publication calculation on readback.

  | Reporting area/team | Scheduled people | Accepted people |
  | --- | ---: | ---: |
  | Waumba Land | 149 | 61 |
  | UpStreet, including Large Group | 165 | 53 |
  | Transit | 98 | 16 |
  | InsideOut | 103 | 23 |
  | Service Programming | 22 | 17 |
  | Shared Kids' Check-In | 5 | 4 |
  | Guest Services: LU weekly team | 79 | 53 |
  | Guest Services: Safety team | 3 | 3 |

- These are distinct PCO Services people per reporting area/team/week, not
  raw assignment counts or actual participation. The existing scheduled
  definition includes confirmed, unconfirmed and declined assignments;
  accepted includes confirmed responses only. Team figures can overlap and
  must not be summed into a church-wide count.
- Ministry pages show their Services figures among other KPIs; the Ministries
  directory has a separate shared/Guest Services section using the same
  summary/history components and collapsed date controls. No person IDs or
  assignment details are added to aggregate responses.
- Fully linked assignments can establish zero accepted responses. Empty
  weeks, missing relationships and unsupported statuses do not establish
  zeros. Calculation definition is versioned to preserve earlier evidence.
- Sixty-two calculation/source/display checks and thirteen rollback-only
  database checks passed, including aggregate reads for all three roles,
  Admin-only source access and unchanged UpStreet figures when shared
  teams are published. Both application type checks passed; services
  restarted cleanly and the health endpoint returned OK.
- The owner later chose era-specific historical routes and approved applying
  the proposed dates. The nine historical source routes end November 8, 2026;
  the separately confirmed current routes begin November 9, with no overlap.
  First local PCO plan dates anchor the historical starts: Sunday Morning →
  Service Programming (2009-05-17), InsideOut (2011-04-02), Transit
  (2014-01-12), UpStreet Large Group → UpStreet (2020-01-05), Waumba Land
  (2022-01-08), Kids' Check-In → separate shared-team total (2022-04-10),
  UpStreet (2023-04-16), Safety Team Schedule → separate Guest Services team
  (2026-02-01), and LU Guest Services Weekly → separate Guest Services team
  (2026-05-10). These are auditable historical mappings, not claims about
  person-level participation.
- A read-only inventory found 3,232 legacy Services plans, with source dates
  spanning 2009–2027, and 12,321 plan times, but no legacy assignment records.
- The bounded November 9–15 Services refresh was repeated after switching plan
  reads to include linked plan times. The same 768 records were fetched in 36
  pages rather than 45 (18 seconds rather than 23); 41 PlanTimes retained
  nested plan provenance, and all 696 PlanPerson records still had person and
  service-time links. The parser falls back to the separate plan-time request
  when an included relationship is absent or incomplete.
- Full historical Serving backfill completed on November 17: **3,727 pages,
  122,679 source records fetched, 121,911 revisions, zero pages pending, and
  30 minutes 31 seconds elapsed**. The one-off run had `automatic=false`; no
  scheduled-processing setting was changed.
- The run observed 22 ServiceTypes, 3,234 Plans, 12,325 PlanTimes and 107,098
  PlanPerson assignments. All assignment records had person, team, plan and
  ServiceType links; all linked PlanTimes were present and retained provenance
  to their parent plan. **191 assignments have no PCO service-time link**. Their
  plans date from 2017–2026, with none in the November 9–22 current reporting
  window. They remain staged as source facts; a Plan's `sort_date` is not used
  to invent a serving instant or count.
- The historical Serving publication used the completed backfill without
  starting a new PCO scan. Because a publication is limited to ten years,
  history was split into adjacent windows, May 17, 2009–May 6, 2018 and
  May 13, 2018–January 24, 2027. Both publications passed validity and coverage
  readback; together they store 14,784 weekly measure rows. The November 15,
  2026 figures remain 16 complete values and match the earlier publication.
- Of 107,098 PlanPerson records, 191 lack a service-time link. The compiler
  never counts those assignments or invents their service instant. It uses the
  Plan's civil date only to flag the affected mapped ministry/week as partial:
  38 ministry-week periods are affected, while other weeks remain complete.
  The 114 records under approved weekly sources account for those partial
  periods. The remaining 77 are under event-specific/unmapped source types and
  do not enter weekly ministry totals. Weeks without usable source observations
  remain missing, not zero.
- Transit Weekend is now published as a separate Transit serving scope from
  its first staged local plan date, February 8, 2018, onward. This does not
  merge its counts into regular Transit and does not claim actual attendance.
  The stored backfill has 236 assignments across seven complete event weeks:

  | Week ending | Scheduled | Accepted |
  | --- | ---: | ---: |
  | 2018-02-11 | 3 | 1 |
  | 2019-02-17 | 3 | 1 |
  | 2022-02-13 | 3 | 0 |
  | 2023-02-19 | 10 | 10 |
  | 2024-02-18 | 19 | 19 |
  | 2025-02-16 | 19 | 17 |
  | 2026-02-08 | 17 | 12 |

  Both historical Serving publications passed validity and coverage readback.
  No new PCO scan was started. One PlanPerson request per plan remains
  necessary for the documented API.
- Added the already-published LU weekly and Safety scheduling figures to
  Connection as separate teams, in addition to the shared-team directory view.
  They use Connection's selected reporting range and existing freshness path;
  loading, empty and failed-refresh states remain explicit. Shared Kids'
  Check-In stays excluded from Connection's Guest Services series. Workbook
  volunteer observations remain distinctly labelled, not merged into Services
  responses. Reporting controls remain collapsed at the bottom of the page.
- Six display checks and the dashboard type check passed for the Connection
  addition, including the exclusion of shared Kids' Check-In and unrelated
  workbook measures from the Guest Services series.

1. **Complete:** The owner approved the current, minimized development data
   boundary on 2026-11-18. The approval does not extend to additional sensitive
   fields, provider scopes, another source scan, unattended processing or
   production.
2. **Complete:** Approved PCO mappings and publications are in place; accepted
   workbook history has been imported for applicable Phase 5 measures. Actual
   source gaps, partial coverage, unresolved Check-Ins and unavailable values
   remain explicitly labelled rather than treated as zero or complete.
3. **Complete:** The owner reviewed the signed-in Giving, Check-In,
   Connection/Serving, child-ministry and home-overview displays and confirmed
   they look correct. This is representative source-to-screen acceptance, not
   granular review of every PCO record.
4. **Complete:** The owner approved Phase 5 development closeout on
   2026-11-18. This closes the development implementation and review gates
   only; it does not authorize production deployment, unattended processing,
   additional sensitive data collection or broader provider access.
5. Production deployment, unattended scheduling, numeric small-cell
   suppression and production privacy/retention approval remain outside this
   development closeout.

## Integrations usability and PCO processing

### Integrations page: collapse provider sections

The Integrations page now presents Planning Center and Other providers as
keyboard-operable, collapsed-by-default sections. Planning Center's connection
state remains visible in its heading; its controls mount only while expanded,
and status polling runs only while open. Admin restrictions and all existing
controls remain in place. The dashboard type check passed. The owner reviewed
the signed-in page and confirmed the collapsed provider layout looks correct.

### PCO processing: page efficiency improved; durable deltas remain

The shared worker adapts request spacing to Planning Center rate-limit headers
and `Retry-After`. Each advance can fetch up to eight consecutive queued pages
of the same resource type concurrently;
the shared limiter still paces requests from live provider headers, and the
page records and cursors commit together. If any page fails, the batch is rolled
back and safely retried. This is bounded concurrency, not an unbounded request
fan-out. Existing run serialization and scheduler settings are unchanged.

The Giving backfill processed 41,875 pages over the run period. This is a
completed-history result, not evidence that every future sync finishes in
minutes. Manual and scheduled `incremental` runs now start from the latest
completed backfill/incremental run with a three-day overlap; the cutoff is
stored on the run so retries resume the same window. Filter parameters are
preserved across pagination and service-plan child discovery.

Serving plan pages now request linked PlanTimes in the same paged response,
with strict linkage checks and the separate plan-time request as a fallback.
The bounded November 9–15 refresh dropped from 45 pages (23 seconds) to 36
pages (18 seconds) for the same 768 records. The full historical Serving source
backfill finished in 30 minutes 31 seconds across 3,727 pages and 122,679 source
records. It was a one-off manual job (`automatic=false`) and did not enable or
alter scheduled processing. The approved era-specific historical routes now
publish the retained assignments without another source scan. The publisher
reads stored entities in indexed 2,000-row keyset batches and splits long
history into two windows; both publications validated in about 14 seconds.
This is database publication time, not a new PCO sync benchmark.

The Groups historical backfill completed 13,044 pages, including 12,823
event-specific Attendance requests, and took 3 hours 52 minutes. Planning
Center documents Attendance as an event-scoped collection without a bulk
include, so batching independent page requests is the supported optimization.
The new bounded page batching also applies to future People, Check-Ins, Giving,
Groups, Services and Serving syncs. No live scan was repeated to benchmark the
change; future authorized runs will establish actual elapsed times.

Verified update filters are used for People, Check-Ins, Giving donations, and
Services plans. Other small product roots may still be re-read. Groups keeps
a full reconciliation because the supported API filters do not safely capture
membership edits or changed attendance on older events. This is a product-level
date checkpoint, not a per-resource watermark; Groups and Services assignment
relationship coverage still need a bounded reconciliation/late-change policy.

The owner chose **full-history accuracy** for Groups synchronization rather
than faster periodic reconciliation. Keep the full scan and bounded,
rate-limit-aware batching; expose its actual run status and freshness, and
resume from durable page progress after interruptions. PCO's Groups API does
not provide the timestamps or bulk Attendance endpoint needed to guarantee
that a short recent-only scan would detect older corrections. The completed
history scan took 3 hours 52 minutes, so a minutes-long full scan is not
currently promised by the supported API. No new source run or scheduler change
was made for this decision.

The current Planning Center references confirm the limit: Groups Membership
records do not expose `updated_at`; Attendance records have no update timestamp
and are listed under individual Events. Services exposes a service-type-wide
PlanPersonTime collection, but it points to PlanPerson IDs and does not provide
the person/team assignment details needed by the accepted metrics. PlanPerson
itself is listed by person; the verified plan-level `team_members` request
remains necessary unless a supported bulk inclusion is confirmed. Keep these
full-reconciliation/relationship boundaries explicit rather than silently
claiming the backlog is now a delta-only scan.

Next, verify those relationship-change boundaries and add periodic
reconciliation for resources without reliable delta filters. Test
restart/resume, duplicate replay, late updates, relationship changes, partial
page failure, cancellation and rate limiting against isolated fixtures. Do not
start new sensitive scans to benchmark this work before the privacy gate is
cleared.

## Remaining source-labeled workbook KPIs published — 2026-11-17

Following the owner's approval to keep remaining workbook measures separate
and source-labeled, imported seven additional KPI series from the accepted
2026-11-07 workbook: UpStreet's literal `LG` volunteer count and new-family
Check-In volunteers; InsideOut SGLs in groups; Connection's 2025 and 2026 group
counts; and its total-groups-attendance and group-member-attendance columns.
Each series has its own measure key, preserving distinct source labels and
preventing accidental overlap with PCO snapshots or similar workbook totals.
The 2025 Connection group-count column was aligned to matching ordinal Sundays.
All seven publications passed lineage validity checks, and the import did not
touch a PCO sync.

`LG` remains literal rather than guessed as an abbreviation.

### Giving month/week history imported — 2026-11-18

The owner confirmed that recurring-gift history is a separate monthly dollar
subtotal and that giving units represent people who gave, then approved
publishing both as separate measures. Added explicit `week`/`month` period
metadata so monthly values use month-start dates and display with month labels,
not as Sundays.

Three source-labeled workbook publications were imported from the accepted
2026-11-07 workbook without reading person-linked records or touching a PCO sync:

- Monthly recurring gifts: 48 months from January 2022 through December 2025;
  27 readable dollar values and 21 missing cells. The recurring subtotal stays
  separate from, and is never added to, General Giving.
- Giving people per week: 304 aligned weekly values from January 2021 through
  November 1, 2026; 289 readable counts and 15 missing cells.
- Giving people per month: 71 months from January 2021 through November 2026;
  55 readable counts and 16 missing cells. The count remains distinct from
  current PCO giving units that may group explicit joint givers.

Missing source cells remain missing, not zero. Monthly values are shown in a
separate history table; the weekly General Giving trend is unchanged.

At that point the owner reviewed the signed-in Giving history and confirmed the separate
monthly/weekly values and period labels look correct. This is acceptance of
that Giving history display only; it does not close the separate review of
General Giving, fund/campaign breakdowns, other ministries, the Check-In
resolver, the privacy gate or overall Phase 5 signoff.

### Connection values restored from completed Groups history

The post-calculation-version Groups publication was rebuilt from the completed
November 16 backfill without starting a PCO scan. Connection meeting attendance
is complete at 7 for November 8 and 212 for November 15. The November 16 group
and membership snapshot is separately published as of its actual source time:
196 active groups, 3,780 memberships and 487 leaders, assigned to the reporting
week ending November 22. It is not backdated into November 15. No eligible
current-run records remain to reconstruct the prior November 15 snapshot, so
those three snapshot measures remain missing for that week rather than showing
stale or invented values. The publication is valid; source mappings and PCO
sync state were not changed.

### Owner review of authenticated Phase 5 displays — 2026-11-18

The owner reviewed the signed-in Giving week/month history and confirmed its
values and period labels look correct. The owner also reviewed the Admin
Check-In resolver and confirmed the screen looks correct. These reviews accept
those specific displays only.

The owner also reviewed the signed-in Connection and Serving figures and
confirmed they look correct. This accepts the reviewed separation of group
meeting attendance from membership snapshots and scheduled/accepted service
assignments from actual participation. Giving fund/campaign breakdowns,
General Giving and separate Fuel campaigns were also reviewed and confirmed
correct. The owner reviewed Waumba Land, UpStreet, Transit and InsideOut and
confirmed the child/student ministry pages look correct. The owner also
reviewed the home overview and confirmed it looks correct. The focused
authenticated review covered the Phase 5 source and ministry displays; the
development privacy gate and overall Phase 5 signoff were subsequently approved in [DECISIONS.md](DECISIONS.md).

Do not deploy these worker changes or enable unattended scheduling as part of
the development-only Phase 5 work without separate authorization.
