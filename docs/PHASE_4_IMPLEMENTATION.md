# Phase 4 — adult attendance

## Current comparisons: rolling window and existing 2025 baseline

The owner confirmed that "adjust up or down" means changing the number of weeks,
not changing the computed attendance value. Both Home and Service Programming
default to four weeks and allow every whole-number window from 1 through 52.
The window contains consecutive calendar Sundays, ending at the earlier of the
selected history end and the latest completed Sunday. Home always uses the latest
completed Sunday.

Only complete, valid recorded totals in the selected definition enter the
average; measured zero is included. Missing, incomplete, invalidated and
unrecorded Sundays are excluded, never zero-filled. The API returns the actual
denominator, excluded dates/reasons and window bounds. Short history produces
an explicitly labelled partial-window average, not a fabricated full window.
The entry form remains independent of comparison filters and retains drafts.

The existing accepted workbook already contains 2025 in-person totals in
`Historical - Adults!P35:P86` under the 2025 header P34. No additional upload is
needed for those baselines. Columns A/B provide the workbook's numbered-week and
2026 comparison-date alignment. These are weekly totals, not invented service
splits or newly published 2025 per-service observations.

YoY uses the same numbered Sunday in the previous year. A complete recorded
baseline takes precedence; a partial or invalidated recorded baseline cannot
silently fall back to an older workbook value. Otherwise the fixed workbook
mapping exposes only an accepted, active, matching-fingerprint in-person total.
Missing/current-incomplete/zero-baseline/conflicting-source cases are explicit;
zero baselines never produce a percentage. The 53rd Sunday does not spill into
the wrong baseline year. Source year, date alignment and provenance are returned.

Migrations 0016/0017 add an aggregate-only security-definer function, not broad
Staff workbook access. It validates the active caller, role, year/header and
numeric values, and restores caller context on success or error. Raw source
permissions remain unchanged. Database verification uses a non-owner role,
because the development connection can bypass RLS.

Verification: 237 default tests, 23 rollback-only attendance database tests,
workspace TypeScript and lint pass. This supersedes older statements below
that rolling/YoY comparisons are unavailable or still awaiting window policy.

A signed-in synthetic Staff browser pass verified both pages without submitting
attendance: Nov 8 shows a four-week average of 728.3 (raw 728.25), one week 633
and three weeks 715. YoY is 633 vs the workbook's 783, change -150/-19.2%.
The January 4–18 filter gives 883.7 across three complete weeks, explicitly
excluding Dec 28; Jan 18 compares 831 with 677 from 2025, +154/+22.7%.
Changing the window preserved an unsaved entry draft. Home stayed anchored to
Nov 8 rather than inheriting January's detail range. Phone width 390 had no
horizontal overflow. Normal auth was restored and synthetic access cleaned up.

## Current location: Service Programming ministry

Adult attendance details, weekly entry, history and revisions now live at
`/ministries/service-programming`, alongside the other documented SPD KPIs.
There is no separate Attendance navigation item. The dashboard keeps the
previous-Sunday snapshot and links to Service Programming for detail.
`/attendance` redirects to that ministry for compatibility with older links.
Other SPD KPI connections are explicitly marked planned, not fabricated.
Earlier `/attendance` references below describe previous delivery locations.

## Routine weekly entry: one form, one save

The normal Attendance entry flow now defaults to the most recent Sunday
(today when it is Sunday in Chicago), loads any existing first/second counts,
and saves both services together. Notes are optional; there is no approval or
per-service submission step. The form stays mounted while history filters
reload, and Edit 1/Edit 2 loads both counts for that date.

`POST /api/v1/attendance/week` is authenticated, CSRF-protected and atomic.
Both expected revision IDs are checked; a conflict in either service rolls back
both edits. A stable request identity safely replays the same logical save,
even after service metadata changes. Saved values, actors and correction
history remain intact. No real observation is edited merely for testing.

Existing occurrence links are reused. When exactly two distinct dated service
times exist, unlinked slots can be matched in chronological order without
replacing an existing assignment. When timing is absent or ambiguous, the
counts are recorded against the actual ministry/date/first-or-second slot,
with null occurrence references. The app does not require new scheduling
records or invent start times just to store an observed headcount. Existing
broken occurrence links still produce an actionable conflict, not reassignment.

Unrecorded and measured zero remain distinct for each service. Prior definition
versions are read-only. Background updates do not overwrite drafts; definition
changes block saving until an explicit reload. Unsaved entries survive history
range changes. Both counts, the date and optional fields are locked during save.

Verification: the default 230 tests and full TypeScript/lint checks passed;
21 rollback-only attendance database tests passed, including the real weekly
route, atomic rollback on a second-service conflict, schedule-free entry,
ambiguous scheduling, safe replay and zero/unrecorded behavior.

A focused signed-in Staff browser check confirmed the recent-Sunday default,
saved-count prefill, one Save action, optional note, retained draft values
through history filtering, and Edit 2 loading both January counts with the
second field focused. At 390px the fields stack and document width stays within
the viewport. Numeric inputs blur on wheel to prevent scrolling from changing a
focused headcount accidentally. This last focused event-handler fix was checked
without another browser run.

No real attendance was submitted by the browser test. Request interception was
unavailable, so browser submit/retry payload capture was skipped. True route
persistence, request replay and rollback are verified by isolated database/API
fixtures, not claimed as a real-data browser save. Synthetic auth was cleaned
up and the normal issuer restored.

## Current policy: accepted workbook history imports in bulk

The owner's later instruction in `DECISIONS.md` supersedes the initial
per-week publication workflow described in the historical delivery record
below. Do **not** ask the owner to publish each workbook week or reconfirm
individual values.

The supplied workbook has source-level authority, tied to its immutable batch
and SHA. Development migration 0015 adds an immutable Admin-only authority record
and permits explicitly labelled system-generated workbook observations without
pretending a user signed in to approve them. Manual observations still require
an actual actor. The boolean lineage checker accepts either legacy reviewed
evidence or accepted-workbook authority; Staff still cannot read raw sources or
the authority table.

The management job at
`artifacts/api-server/src/scripts/import-authorized-attendance.ts` defaults to a
rolled-back dry run. `--apply` performs the owner-directed atomic bulk import.
It needs the actual configured ministry/definition and exactly one active source;
it does not fabricate setup, create weekly reviews or modify source cells.
Approved/staged adult mapping changes on that accepted source automatically
import via the same importer inside the source transaction.

Usable numeric historical values need no second-source comparison. Unknown
values, future-at-snapshot dates, known online-only Sundays, malformed/conflicting
mappings and forecasts are not imported as attendance. Existing same-source
observations are reused; invalidated workbook observations may receive a new
revision after an explicit mapping replacement. Manual corrections and
cross-source conflicts are preserved and surfaced rather than overwritten.

The Attendance summary follows the latest completed Sunday **in its selected
range**. The home dashboard still uses the actual previous completed Sunday;
it does not relabel older available history as current.

### Bulk import result

The accepted active workbook contains two currently implemented adult mappings,
104 staged service rows. The bulk import added **74 observations** alongside the
six already published January observations: **80 service counts across 40
Sundays**, January 4 through November 1, 2026. The four online-only Sundays stay
unrecorded; all dates after the November 7 source cutoff stay unrecorded.
January's previously verified 910/910/831 totals and January 25's explicit zero
are retained. No conflicting/manual data was overwritten.

The post-import read-only reconciliation found **zero mismatches** against
mapped staged source counts and **zero invalid lineage links**. A repeat dry
run reported zero new observations and 80 unchanged. The full default test
suite passed (230 tests); the attendance database suite passed (15 isolated
rollback-only tests), including source-level acceptance without weekly reviews,
system attribution, replay, source withdrawal and actual non-owner RLS checks.
TypeScript and lint passed.

An authenticated read-only browser pass confirmed January totals 910/910/831,
the January 18 summary value 831, persistence after reload/reapplying the filter,
and removal of the per-week publication workflow. It found narrow-phone
page-level overflow; table inline-size/paint containment and text wrapping were
adjusted after a focused diagnostic. That CSS correction was not browser-rerun.
The synthetic auth fixture was suspended/revoked and the normal issuer restored.

Comparison placeholders now describe the missing mapping/calculation instead
of asking the owner to reapprove workbook values. No custom denominator or YoY
alignment is silently invented.

This does not mean every other ministry metric in the workbook is implemented.
The same source acceptance applies without repeated value approvals as each
documented mapping and ministry module is implemented. Restricted source data
remains restricted. Earlier sections below are a chronological record of the
initial delivery, not instructions to restore its superseded workflow.

## Development delivery

The existing application now has `/attendance` and a home adult-attendance KPI.
This is a functioning development slice, not a production release, full-year
migration or claim that real attendance has been published. The agent has not
configured a live adult ministry, created service occurrences or entered/promoted
real attendance. The existing workbook approvals remain review evidence.

### Approved rules

The owner defined counts as people seated in the auditorium attending the
service, excluding volunteers and people on stage. Summed service headcounts
are not unique people. Manual entries need no approval; corrections retain
history. Online-only and intentionally off Sundays are unrecorded, not zeros.
Known online-only dates are April 12, 19, 26 and May 3, 2026. Do not infer the
dates of other breaks. January 25 retains the separately confirmed zero and
ice-storm context. See `DECISIONS.md`.

Four-week denominator/completeness and YoY alignment policies remain unapproved.
The UI displays explicit unavailable explanations, not provisional numbers
that could be mistaken for approved comparisons. No rolling-month, forecasts,
targets, health colors, person-level data, giving or other ministry metrics.

## Initial setup and manual workflow

1. Sign in as an invited Admin. In Administration, create the actual adult
   ministry if it does not exist; do not infer a code from a spreadsheet title.
2. Add actual dated service occurrences, preserving historical service start
   times. Current service times do not prove historical 9:30/9:00 mappings.
3. Open Attendance and save its initial count definition: select the adult
   ministry, an effective-from date and a meaningful change/source-basis note.
   Each new definition version is immutable. A new version does not silently
   replay old counts; prior versions remain selectable/read-only.
4. Any invited Staff, Leadership or Admin selects a Sunday, first/second adult
   source slot and the eligible dated service occurrence, enters a whole-number
   count and note, and saves. It is visible immediately. Today’s Sunday can be
   entered during the service day; the headline explicitly uses the latest
   completed Chicago reporting week.
5. For a known intentional break, select Unrecorded; the count is null and no
   fictitious occurrence is required. Unknown data is not zero-filled.
6. Correcting a count appends a new revision bound to the edit's starting revision.
   Another editor's intervening save yields a conflict with reload/discard
   controls, not an overwrite. Repeated identical requests reuse the saved
   result. History preserves the original values and authenticated actors.

Both adult source slots are expected for a full Sunday total. A single recorded
service is shown as a known subtotal, not a full total. Unknown capacity is not
guessed. The two slots do not automatically imply historical start times.

## Historical promotion

An Admin selects an active batch in Attendance, inspects its current evidence
preview and chooses a week with both eligible service groups. Promotion requires
both exact hashes, an explicit source-authority acknowledgement and a basis note.
The action never auto-approves unreviewed workbook evidence or widens the source
authority of other weeks or eras.

Only known nonnegative integer attendance evidence with current reviews and
nonblocking quality is eligible. Owner-confirmed review stays labelled as such,
not independent corroboration. Changed evidence, future/online-only dates,
unreviewed groups and existing conflicting attendance block promotion. Both
services commit atomically, and replay does not duplicate counts.

Unknown historical times remain unresolved: workbook records preserve their
first/second source slots with null occurrence references, not invented instants.
Raw cells, staging rows, review notes and source originals remain unchanged and
Admin-only. The attendance read model exposes only safe aggregate lineage.

The existing reviewed January sample baseline is:

| Sunday | First service | Second service | Total |
|---|---:|---:|---:|
| 2026-01-04 | 446 | 464 | 910 |
| 2026-01-11 | 462 | 448 | 910 |
| 2026-01-18 | 421 | 410 | 831 |

Synthetic fixtures verify this arithmetic and the promotion path. Real sample
promotion remains an authenticated Admin action; it was not performed by tests.
Three approved weeks never fabricate a complete four-week average.

## Persistence, security and recalculation

Development migrations 0013–0014 add immutable definition/revision/lineage tables,
forced RLS, idempotency/root/successor indexes and a boolean-only historical
validity function. Staff writes recheck current active membership and actor
identity. Admin source operations serialize with existing mapping/batch changes.
Reads do not take the global configuration lock.

Source validity checks preserve Admin-only workbook access; the trusted function
temporarily elevates only inside its boolean calculation, restores caller role
settings on success/failure, and never returns source data. The role is an
application-trusted transaction setting, not an end-user header.

Read-time calculations avoid stale metric caches. Source withdrawal, superseded
mappings/new competing evidence or changed service date/time/ministry meaning
invalidate dependent current totals instead of rewriting history. Occurrence
snapshots preserve original interpretation. Earlier definition versions remain
inspectable. Source freshness uses observation timestamps, not unrelated PCO sync.

API responses use no-store and safe fields; raw imports/PCO remain Admin-only.
The frontend refreshes every 60 seconds while visible and on focus/mount,
invalidates related views after saves and clears data on identity changes.
Unsaved inputs are not replaced by polling.

## Verification and limits

- Unit/API checks cover Chicago/DST completed-week boundaries, year edges, sample
  sums, true zero, partial/missing/future/unrecorded/invalidated states, evidence
  eligibility, signed-out and cross-role denial, CSRF and input validation.
- Rollback-only database fixtures cover the real typed API, immediate Staff
  visibility, immutable corrections, stale revision conflicts, save replay,
  source authority checks, atomic/replayed promotion, source withdrawal/mapping
  replacement, service meaning changes, version history, membership revocation
  and non-owner RLS including restored Staff privilege after lineage checks.
- Development migrations applied twice; the second invocation was a journal
  no-op. No production schema, real source records or PCO connection were changed.
- No synthetic definition or attendance is left in the development database by
  these fixtures. Existing guarded PCO database tests must not be run against
  the real connection merely to increase test counts.

### Closeout evidence — 2026-11-09

- `pnpm exec vitest run`: 230 passed, 47 guarded/opt-in tests skipped.
- `RUN_DATABASE_TESTS=1 pnpm exec vitest run tests/attendance-db.test.ts`:
  13 rollback-only tests passed, including actual route persistence/response
  validation. Guarded existing PCO database suites were not run.
- `pnpm typecheck`, `pnpm lint`, focused Prettier check and `pnpm secrets:check`
  passed. The credential-pattern check is not a full security audit.
- Both managed workflows restarted successfully. `/api/v1/readyz` returned
  ready/connected/applied; unsigned attendance and Admin-history requests
  returned 401. The public home screenshot rendered the expected access gate.
- Read-only source reconciliation confirmed the six staging values in the
  table above. Definitions, attendance revisions, lineage, ministries and
  service occurrences remained empty after rollback fixtures.
- One supported OIDC browser pass used only a synthetic invited Staff identity.
  Signed-out gates, signed-in missing/setup-required values, hidden Admin
  controls, reversed-range validation, Home → Attendance and ministry →
  Attendance navigation passed. The fixture account was suspended, its session
  removed and invitation revoked; claims were cleared and the API restarted
  normally. No attendance/source/configuration was created.
- That pass found narrow-screen horizontal overflow. The summary grid now has
  explicit shrinkable tracks; its context values wrap and the weekly table is
  width-bounded with its own horizontal scrolling. This focused CSS correction
  was checked by code/formatting; the signed-in browser was not rerun.
- Save/correction-form persistence was **not browser-verified** because live
  definition/ministry setup is intentionally absent. Server/API persistence,
  replay and conflict behavior passed rollback-only database fixtures. Do not
  describe this as a full real-data submit → KPI → correction browser pass.

## Remaining acceptance boundaries

### January sample activation check — 2026-11-09

The owner chose the already-reviewed January samples as the next validation
scope. A read-only transaction ran the application's actual evidence builder and
historical eligibility checks against the active 2026-11-07 snapshot. Each of the
six service groups has exactly one current group, a matching current
owner-confirmed review and eligible nonnegative integer evidence. Counts
reconciled to 446/464, 462/448 and 421/410; totals are 910, 910 and 831.

The existing `date_formula_unverified` and `insufficient_comparison_sources`
flags remain visible. Eligibility uses the documented owner-confirmed policy;
this does not establish independent corroboration or newly verify formulas.
No reviews, definitions, ministries, occurrences, attendance revisions or
publication audit entries were inserted by this diagnostic.

The remaining operational prerequisite is an authenticated Admin saving the
actual adult-ministry configuration and initial definition effective for the
selected dates, then explicitly promoting each selected week with its source
authority acknowledgement and basis note. Historical-only promotion does not
require fabricated service timestamps. Choosing sample validation in chat is
not a replacement for these application actions.

After promotion, apply the Attendance range 2026-01-04 through 2026-01-18 and
verify six current workbook observations, three full totals, correct
owner-confirmed labels, persisted lineage and no duplicates on repeat
publication. Reload and verify authorized Staff reads without raw workbook
access. Preserve original real observations during correction testing; use
isolated fixtures instead of changing valid historical counts merely to test.
The home KPI must continue to describe the latest completed Sunday, not relabel
January samples as current attendance.

An Admin still needs to configure the real adult ministry/service mapping and
deliberately promote any historical samples after reviewing source authority.
That is not supplied by task acceptance, a prior workbook review or synthetic
fixtures. Historical era mapping and comparison definitions remain open.

D-025's live lifecycle scans, scheduled cycle, controlled restart/recovery and
credential-lifecycle demonstration remain required before production. Do not
enable the schedule, change credentials, start scans, configure unattended hosting
or publish this application as part of Phase 4. Retention/privacy, runtime
least-privilege, backups/restore and production approval remain separate gates.
