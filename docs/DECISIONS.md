# Architecture / Product Decision Log
**Legend:** APPROVED = user decision; PROPOSED = technical recommendation; OPEN = not decided.

| ID | Status | Decision | Rationale/guardrail |
|---|---|---|---|
| D-001 | APPROVED | Build first in Replit; design portable to GitHub/future hosting | Avoid vendor lock-in |
| D-002 | APPROVED | No mandatory tech stack | Select on maintainability and agent reliability |
| D-003 | PROPOSED | Next.js + TypeScript frontend, PostgreSQL, Python workers | Established ecosystem and analytics tooling; validate Replit ergonomics |
| D-004 | APPROVED | Use Google/NP accounts; Replit sign-in acceptable initially | Hide behind replaceable auth adapter; domain allowlisting / invites |
| D-005 | APPROVED | Roles Staff, Leadership, Admin; personalization future | RBAC now, not ministry-based homepage requirements |
| D-006 | APPROVED | Person-level attendance allowed to authenticated appropriate staff; person-level giving Admin only | Enforce at every boundary |
| D-007 | APPROVED | Engaged 1/2/3/4 = active in at least 1/2/3/4 of giving, serving, groups, child/student regular check-in | 'Regular' definitions pending |
| D-008 | APPROVED | Configurable health thresholds, weights, metric definitions | Version config and history |
| D-009 | APPROVED | Show Actual, Target/Plan, Statistical Forecast separately | Forecast is not goal |
| D-010 | APPROVED | Preserve historical unusual periods; forecasting should learn seasonality/changes | Enable change-point/event covariates and transparently report model risk; never force arbitrary exclusion |
| D-011 | APPROVED | Forecast attendance first; generalizable architecture | Avoid unnecessary V1 model surface |
| D-012 | APPROVED | Preserve existing scorecards; future admin-configurable, commonly scale 1–4 | Version templates |
| D-013 | APPROVED | Native manual entry with form/sheet ingest as useful | Keep provenance of survey aggregates |
| D-014 | APPROVED | Planning Center Services authoritative for service plan | Link to dated service occurrence |
| D-015 | APPROVED | Configurable reports/alerts to ClickUp channels | Review API availability and report approval policy |
| D-016 | APPROVED | AI answers questions and proactively detects anomalies | Evidence, permission-scoped tools |
| D-017 | APPROVED | GA4 and podcast/social/email integrations desired | Provider capability/discovery gates |
| D-018 | APPROVED | Phased V1 order proposed previously accepted | See ROADMAP |
| D-019 | APPROVED | OAuth-first integration administration | Exceptions require review, never collect provider passwords inside app |
| D-020 | OPEN | Whether Leadership may see aggregate giving and which confidential breakdowns | Default aggregate-only |
| D-021 | OPEN | Exact regularity criteria & denominator for engaged levels | Rule registry and backtests |
| D-022 | OPEN | Health thresholds and weekly summary destination and auto-send gate | Seed draft only |
| D-023 | OPEN | Which source is authoritative for each numeric measure | Reconcile mapping with owners |
| D-024 | APPROVED | Preserve source history; separate explicit lifecycle markers from completed-scan absence; no automatic purge in development | Missing is not deleted; retention/privacy deletion require pre-production decisions |
| D-025 | APPROVED | Close Phase 3 for development with explicit live-verification deferrals; proceed to Phase 4 | Not production acceptance; do not wait for long rescans or claim deferred checks passed |

New decisions must be dated with owner, alternatives, migration impact, and tests.

## Phase 4 adult attendance rules — 2026-11-09

### Simpler routine weekly entry — 2026-11-09

The owner reported that entering the previous Sunday's counts took three steps
and asked for a simpler flow. The implementation now uses a recent-Sunday
default, both adult service counts and one atomic save. Notes are optional.
Reuse known service setup without requiring new scheduling records per date;
when timing is unknown, preserve ministry/date/source-slot aggregate meaning
instead of inventing instants. This changes entry mechanics, not who is counted
or the distinction between measured zero and unrecorded. Retain authenticated
actors, immutable correction history, optimistic conflicts and safe retries.

### Superseding workbook acceptance — 2026-11-09

**APPROVED, owner instruction:** “everything pulled from the workbook spreadsheet
provided in the files of this project is accurate and should just be imported
and displayed where appropriate. We don't need a bunch of steps to show the
historical data.”

The provided workbook is the accepted historical source. Source authority is
recorded once for its batch and fingerprint, not per week or cell. Mapped,
usable historical values should bulk-import into the appropriate implemented
metrics without repeated publication acknowledgements or independent
comparison demands. Cached numeric workbook values may be used as accepted
source values; this does not claim formulas were independently recomputed.

Preserve existing zero/unrecorded exceptions, snapshot cutoff, typed/date
validation, explicit ministry/metric mappings, access restrictions and source
lineage. Missing/unreadable source values, duplicate/contradictory mappings and
manual corrections must not be silently overwritten. Do not invent timestamps,
people or values for unimplemented metrics.

For the one-time owner-directed import, record origin `owner_instruction`,
immutable basis and matching batch SHA; attribute automation to the system
(null actor), not to a fabricated authenticated owner/Admin. Keep existing
weekly reviews intact as historical evidence, not a prerequisite to importing
the rest. New approved/staged adult mappings on that accepted batch import
automatically in the same transaction. Do not implicitly trust unrelated uploads.

This supersedes earlier per-week real-data publication requirements for the
accepted workbook; it does not enable production, provider scans or schedules.

**APPROVED**, owner: product owner. Adult attendance is “Just the headcount of
people sitting in the auditorium during each service”; volunteers, people on
stage and people not attending the service are not counted. Summing service
counts measures service attendance, not deduplicated unique people.

The four online-only Sundays (April 12, 19, 26 and May 3, 2026) are unrecorded,
not zero. The owner also said Northpoint intentionally takes approximately two
Sundays off each year and does not want those recorded as zeros affecting
averages. This supersedes the earlier general past-blank-to-zero interpretation
for these known exceptions; do not infer the dates of other intentional breaks.
January 25 retains its separately confirmed zero and ice-storm context.

Manual counts need no approval and must be adjustable. Corrections retain
previous revisions and the authenticated editor; no approval queue is required.
Historical evidence review remains distinct from deliberate historical
promotion. Source authority by era, historical service times, YoY and exact
four-week averaging/completeness policies remain unresolved.

Alternatives: Admin-approved manual submissions, treating all past blanks as
zero, or interpreting counts as unique people. Migration impact: additive
attendance definitions, immutable observation revisions and restricted historical
lineage; no raw source changes. Tests must cover immediate manual visibility,
correction conflicts, zero versus unrecorded, historical evidence eligibility,
and role restrictions.

## D-025 — Phase 3 development closeout — 2026-11-09

**APPROVED**, owner: product owner. Close Phase 3 for development with these
live-verification deferrals rather than waiting for long scans:

1. Fresh People/Services/Check-Ins scans to establish the new lifecycle baseline.
2. A first scheduled three-product cycle and controlled restart/recovery exercise.
3. Real expired/revoked-access failure and reconnect recovery.

The owner accepted moving on to Phase 4 under the stated development-only
boundaries. Existing validated imports remain usable within their documented
coverage; lifecycle absence remains unassessed until new tracked scans complete.
Keep the schedule disabled until ready to demonstrate it; do not rely on
unattended freshness. Recovery cases retain synthetic evidence only where no
live demonstration exists.

These are deferred checks, not passed checks or permanently waived requirements.
Complete them before production. Production hosting, retention/privacy-deletion
procedures and release approval remain separate gates. No metric publication,
source/history deletion, broader scopes, credential changes, or automatic imports
are authorized by this closeout.

**Why:** the owner does not want to wait for long scans now and explicitly chose
development closeout with the described deferrals.
**How to apply:** proceed with Phase 4 development without reopening Phase 3 just
to require these scans; carry the unresolved checks into the pre-production
acceptance checklist. Use real Admin authorization for future live exercises.

Alternative: keep Phase 3 open until all demonstrations complete. Migration
impact: none; documentation-only approval, no runtime or database changes.
Verification: preserves the recorded non-destructive acceptance results and
existing synthetic test evidence without claiming new live executions.

## D-024 — Planning Center lifecycle rules — 2026-11-09

**APPROVED**, owner: product owner. Inactive/archive markers retain source
history and never erase past attendance. Only explicit provider deletion evidence
may support a deletion label; a missing record is instead “Not seen in latest
completed scan.” Permissions, filters and accessible history can explain absence.
Failed, paused, partial or cancelled scans must never infer absence. Reappearance
clears the missing flag while preserving observation and source evidence.
No automatic purge in development; this is not a decision to retain forever.
Fixed retention periods and privacy-deletion procedures require separate
pre-production approval. No metric formulas or historical totals change.

Alternatives: infer deletion from absence, automatically purge, or leave lifecycle
untracked. Rejected because they confuse access/coverage with source deletion.
Migration impact: additive per-run observation ledger and presence references,
Admin-only forced RLS and append-only observation protection. Legacy/in-flight
runs are not retroactively declared complete lifecycle assessments.
Tests: page-savepoint integration, independent observation of older payloads,
completion-only assessment guard, reappearance, metadata-only summary, and
preserved authorization boundaries. Universal deleted-object discovery remains
unsupported; a stored `deleted_at` is presented as an explicit source marker,
not a claim that every deletion is discoverable.

## Phase 2 sample gate and direct Planning Center authorization — 2026-11-08

**APPROVED**, owner: product owner. Proceed into Phase 3 and “Build direct OAuth
connection” after built-in connector discovery returned no Planning Center match.
Use server-side confidential OAuth with PKCE and only People, Services and
Check-Ins product scopes. This is not approval of Giving, Groups, operational
metric publication or broader person-level views. An Admin must confirm the
returned organization before ingestion; do not infer an organization from its name.

Before proceeding, a read-only application-evidence check found six current
owner-confirmed approvals: January 4 (446/464), January 11 (462/448) and January
18 (421/410), all 2026. Approval hashes match the currently approved mappings
and staged values of the imported workbook. The report computes three approved
weeks. This supersedes earlier chronological notes that these approvals were
outstanding, but does not convert them into independent two-source verification.

Alternative: pause Phase 3 rather than build direct OAuth. Migration impact:
additive restricted connection, OAuth flow, durable sync and normalized source
projection tables; existing workbook/source history retained. Tests cover
scope restrictions, current Admin authority, state/session/PKCE replay, source
pagination, safe retry, revision idempotency and token encryption/refresh/revoke.

## Historical review input and ordering — 2026-11-07
**APPROVED**, owner: product owner. Finish Phase 2 reconciliation before starting
Phase 3. Use the supplied legacy workbook and include all data in review.
This selects the file as review input, not as authoritative metric truth or as
byte-equivalent to the original manifest. The response “All data” did not provide
a calendar snapshot date at that point; it was subsequently confirmed below.
Alternatives: a replacement workbook or proceeding with Planning Center first.
Migration impact: none for offline discovery. Verify the actual fingerprint,
all-sheet coverage, unknown values and copy dependencies; obtain explicit
mapping/source/date approvals before importing and approving real weeks.

## Legacy workbook snapshot — 2026-11-07
**APPROVED**, owner: product owner. The supplied workbook was exported or last
updated “yesterday,” interpreted as **2026-11-06** relative to 2026-11-07 in
America/Chicago. Use that date for this working-copy snapshot, not its filename,
latest populated Sunday or upload timestamp. This does not approve metric
semantics, source authority, manifest equivalence or any weekly values.
Alternatives: leaving the date unknown or obtaining a replacement export.
Migration impact: none; retain this date with any subsequent import provenance.
Tests: valid calendar input, inclusive snapshot boundary, future-week flags,
unknown snapshot handling and preservation of all source rows.

## Adult legacy source naming correction — 2026-11-07
**APPROVED**, owner: product owner. “SPD F = adult_service_1, SPD I =
adult_service_2, diagnostic_sum= adult_services_total”.
Use these exact names for the selected workbook review. The existing review
sum of F and I is named `adult_services_total`; apply the subsequently confirmed
attendance date rule below to blank inputs.
This does not name SPD L or Dash C, approve weekly values, establish unique-person
counting, set service times or publish a canonical metric.
Alternative: the earlier tentative adult attendance terminology, which the owner
said needed correction. Migration impact: none; offline labels/exports only.
Tests: exact source names, derived total, explicit zero, unknown inputs,
and no implied mapping of SPD L to the derived total.

## Owner-confirmed attendance review — 2026-11-07

**APPROVED**, owner: product owner. Add an explicit owner-confirmed review
option alongside the existing two-source comparison. This is an intentional
approval-policy change: an authenticated Admin may record owner verification
of exact adult service attendance values with an explicit acknowledgement and
a review-basis note. It is not independent two-source verification.

Initially limited to `adult_service_1` and `adult_service_2` with unit
`attendance_count`. Require known, nonnegative integer evidence, a note of at
least 20 characters, and the current evidence hash. Waive only the missing
second-source requirement. Conflicts, missing values, invalid/future dates,
external dependencies, unresolved shared formulas and other existing blocking
quality flags remain blockers. Informational flags remain visible.

Preserve the review method, note, authenticated reviewer, timestamp and exact
evidence binding in immutable history and protected reports/exports. Existing
reviews remain two-source reviews; changing evidence invalidates either method.
Owner-confirmed reviews count toward reviewed weeks, but the method must remain
visible and must never imply independent corroboration or metric publication.
No automatic approvals, real-data test approvals or canonical metrics.

Alternative: obtain a second independent attendance source and retain only the
existing comparison policy. Migration impact: additive review-method column
and constraint, with existing reviews defaulting to `two_source`. Tests:
explicit acknowledgement, note length, source quality, stale evidence,
immutable review identity/method, protected exports and authorization.

## Imported workbook review cutoff

**APPROVED**, owner: product owner. After the supplied workbook was imported
with snapshot 2026-11-07 rather than the earlier 2026-11-06 review date, the owner
said “either date is fine.” Use the existing 2026-11-07 batch and cutoff for
ongoing review; do not require another upload or change immutable provenance.
This accepts the review cutoff, not a new claim about the file's export time.
The actual fingerprint matches the reviewed source. No adult service dates
fall between the two cutoffs, so past/future classifications are unchanged.
No mapping or weekly application approvals are implied. Alternative: another
import dated November 6. Migration impact: none. Verify that the dated review
has identical adult classifications and preserves source values.

## Owner-verified attendance sample counts

**CONFIRMED**, owner: product owner. In response to the sample-count review,
the owner selected “I verified these counts” for the selected legacy workbook:

| Sunday | adult_service_1 | adult_service_2 | adult_services_total |
|---|---:|---:|---:|
| 2026-01-04 | 446 | 464 | 910 |
| 2026-01-11 | 462 | 448 | 910 |
| 2026-01-18 | 421 | 410 | 831 |

No verification basis or corrections were supplied. Record this as owner
confirmation, not an independently documented source comparison or an
authenticated application approval. The owner also confirmed the workbook
has not yet been imported. Import, mapping review, staging and application
reconciliation approvals remain outstanding; Phase 2 is not closed.

## Attendance blank/zero date rule

**CONFIRMED**, owner: product owner. Blank or zero attendance entries in the
past are zero-attendance days because there were no services or services were
cancelled. Future blank or zero entries have not happened yet and must not
be recorded as actual attendance. This supersedes the prior assumption that
all past blank attendance inputs are unknown.

For this immutable workbook review, use the accepted imported 2026-11-07 cutoff as
the as-of cutoff (on/before is historical; later is future). Keep original
cells separate from interpreted attendance and retain all future source rows.
Apply only to explicitly mapped attendance inputs with matching valid dates,
not giving, other metrics, formula failures, invalid values or missing formula
caches. Do not choose a specific cancellation reason for each zero without
evidence. Raw staging and authenticated publication approvals remain unchanged.

## January 25 attendance context

**CONFIRMED**, owner: product owner. For 2026-01-25, the owner initially said
attendance was not recorded because of an ice storm, then clarified:
“technically it was 0 attendance.” The clarification supersedes the unknown
interpretation: preserve SPD F/I zeroes and `adult_services_total = 0`, with
ice-storm context. This does not confirm service cancellation, approve other
weeks, or constitute an authenticated mapping/publication approval.
Offline review context is scoped to the reviewed workbook fingerprint.

## Phase 2 authorization — 2026-11-07
**APPROVED**, owner: product owner. Proceed with the roadmap's historical
workbook explorer, explicit mapping review, raw-only staging and reconciliation.
Alternatives were remaining at Phase 1 or starting live connectors; live
connectors and authoritative metrics remain out of scope. Migration impact:
additive import lineage/review tables plus private original-file storage.
Tests cover discovery, source quality, authorization, approval, rollback and
re-import. Source authority and real sample-week approval remain owner decisions.

## Implementation recommendation — 2026-11-06

**PROPOSED**, owner: implementation agent; awaiting product-owner acceptance.
Use the provided React/Vite + Express TypeScript structure with PostgreSQL/Drizzle
and generated OpenAPI contracts in Phase 0 instead of introducing Next.js.
This follows approved D-002 (no mandatory stack). Alternatives, tradeoffs, migration
boundary and verification commands are recorded in `IMPLEMENTATION.md`.
No owner-approved product decision or unresolved business definition is changed.

## Admission policy — 2026-11-07

**APPROVED**, owner: product owner. Use invite-only access and reserve the first
Admin invitation for the email supplied privately in this conversation (stored
only in the development database). Alternatives were open domain admission or
leaving admission unconfigured; no domain is inferred from public websites.
Migration impact: user/invitation/session tables; no automatic user provisioning
on startup. Tests: invitation expiry/revocation/replay, provider-subject collision,
role spoofing, session revocation and last-active-Admin protection.
