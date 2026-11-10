# Phase 4 development reconciliation

**Result: PASS — no discrepancies in the reconciled scope.**

**Owner closeout:** Phase 4 closed for development on November 9, 2026
(America/Chicago), following reconciliation and the requested dashboard card
simplification, alignment and number-size refinements. The owner deferred
Imports and Integrations page cleanup until later; see `ROADMAP.md`.

Verified November 9, 2026, America/Chicago
(`2026-11-10T03:38:05.527Z` UTC), against the development database.

## Source and scope

- Accepted file: `NP Dashboard - 2026 (orignal source-legacy).xlsx`.
- File bytes match the imported, owner-authorized SHA-256:
  `c925d771b67c4503ad46d5919000fcb5744c164fc1683a441055b11a1c70a1b3`.
- Workbook snapshot cutoff: November 7, 2026.
- Historical source: SPD dates in A, first/second counts in F/I, cached totals
  in L; 2025 in-person comparison totals in Historical - Adults column P.
- Coverage: January 4–November 1 workbook observations, the four explicitly
  unrecorded Sundays, and November 8 manually entered observations.

## Results

| Check | Result |
|---|---|
| Imported service counts vs actual workbook cells | 80 of 80 match |
| Imported weekly totals | All 40 match the sum of both source service counts |
| Available cached SPD weekly totals | All 39 match; Jan 25's cached total is blank |
| Jan 25 ice-storm Sunday | Both source service counts are 0; published total correctly remains 0 |
| April 12/19/26 and May 3 | Unrecorded, null total; no fabricated service observations |
| Workbook dates after the snapshot | No workbook observations were published |
| November 8 manual observations | 336 + 297 = 633; authenticated actors retained |
| Future November 15–December 27 | No attendance facts; not zero-filled |
| Duplicate current date/slot facts | None |
| Workbook lineage | Matches the accepted source batch |
| Active source/occurrence validity | Every checked current source observation remains valid |
| Rolling comparisons at each completed 2026 Sunday | All 45 endpoint checks match independent arithmetic |
| YoY at each completed 2026 Sunday | All 45 endpoint checks agree with workbook baseline/missing-current semantics |
| Selectable averaging windows | All 52 choices match independent date-window arithmetic |
| Real attendance writes during verification | 0 |

One UI date-label inconsistency was corrected: Home's reporting-context row
previously used the upcoming planning-week date (November 15) beside the
previous-Sunday attendance snapshot (November 8). It now says **Attendance
Sunday** and uses the attendance response's `latestCompletedWeek`, with an
explicit unavailable/sign-in state instead of a planning-date fallback.
The underlying attendance calculations and source records were already correct.

### Current dashboard reference

- Week: November 8, 2026.
- Adult total: **633**.
- Four-week window: October 18–November 8.
- Inputs: 768, 779, 733, 633.
- Raw average: **728.25**, displayed as **728.3**.
- Workbook-aligned 2025 baseline: **783**
  (`Historical - Adults!P79`, numbered week 45).
- Change: **−150**, displayed as **−19.2%**.

The source's missing cached January 25 total is not a database mismatch.
The independently recorded source service values are both zero, consistent
with the owner's confirmed ice-storm interpretation.

## Verification method and safety

The opt-in test independently reads raw accepted cells rather than trusting
staged values alone. It recomputes dates/totals/window arithmetic and calls the
actual Express attendance router, including generated response validation and
Staff authorization. It compares all visible historical totals, current fact
IDs, source validity, lineage, baseline cells and percentages.

A temporary synthetic Staff identity and normal read-audit entries exist only
inside a repeatable-read transaction. Shared-pool interception is asserted;
everything rolls back. No real user was impersonated, no provider scan or
scheduler was run, and no attendance, source, ministry, service or credential
was changed. The before/after attendance revision count is unchanged.

The immediately preceding signed-in desktop/mobile checks verified the
dashboard/Service Programming attendance figures, filter behavior, draft
preservation and displayed rounding against these same current values.
This closeout extends API reconciliation to every completed week and all
window sizes; it does not claim a fresh browser interaction with every row.

## Reproduce

```sh
RUN_ATTENDANCE_RECONCILIATION=1 pnpm exec vitest run tests/attendance-reconciliation.test.ts
```

The test is opt-in because it deliberately checks the configured current
development dataset, not a synthetic workbook. It writes the detailed JSON
result to `generated-artifacts/phase4-attendance-reconciliation.json`.
Generated evidence is excluded from Git/deployment; this summary is retained.

## Exit decision and limits

**Phase 4's adult-attendance development exit gate is met and owner-approved
for closeout.** Source, database,
API, previously verified UI and automated checks agree for this scope.

This is not full-year 2026 verification, an independent second-source audit,
publication of detailed 2025 service splits, completion of other ministries,
or production approval. Phase 3's deferred lifecycle/scheduling/recovery checks,
runtime least privilege, retention/privacy, backup/restore and deployment
acceptance remain separate production gates. Keep the scheduler disabled.
