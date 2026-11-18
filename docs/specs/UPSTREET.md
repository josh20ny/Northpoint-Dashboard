# UpStreet — Ministry Specification

Phase 5 is the accepted development baseline. [Phase 5B](../PHASE_5B.md) governs the next implementation. Long-term measures below follow the roadmap.

## Questions the page must answer
What is happening this week? How does it compare to plan, 4-week trend and YoY? Where is ministry health improving or declining? Which measurable next step deserves attention?

## Requested information
Elementary children, 9:00/11:00 attendance and first-time visits; repeat check-ins by age/grade, gender, service and mat (define mat), volunteer rally and small-group participation, scorecard.

## Sources and definitions

Calculate attendance and first-time check-ins from PCO Check-Ins throughout accessible history. Include Hangout under the approved UpStreet mapping. Deduplicate a child linked to Hangout and a classroom within the applicable scope. Multiple room links do not establish multiple children. Use aggregate workbook history only for comparable gaps or reconciliation. First time means first known eligible ministry visit within available history.

## Phase 5B display

The overview leads with total attendance and smaller service splits, selected average, YoY and a YTD actual/eight-week-average chart. On the detail page place attendance by service and Sunday total in row one and first-time check-ins in row two. Put a small two-line chart on each applicable card. Show honest partials, use date-range history and keep PCO serving secondary. Remove standalone workbook headcount, new-guest and volunteer cards. The [brief](../PHASE_5B.md#acceptance-walkthrough) covers a child attending multiple services, a service switch and a single-service ministry.

## Phase and acceptance
Implement after shared core and relevant provider mapping. Tests must verify source date alignment, zero/unknown handling, duplicate prevention, permission boundaries, score version if applicable and reconciliation to owner-approved historical weeks. Explicitly record unresolved definitions in `OPEN_QUESTIONS.md`.
