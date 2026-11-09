# Phase 4 — adult attendance

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
