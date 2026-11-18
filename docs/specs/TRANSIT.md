# Transit — Ministry Specification

Phase 5 is the accepted development baseline. [Phase 5B](../PHASE_5B.md) governs the next implementation. Long-term measures below follow the roadmap.

## Questions the page must answer
What is happening this week? How does it compare to plan, 4-week trend and YoY? Where is ministry health improving or declining? Which measurable next step deserves attention?

## Requested information
Middle-school total and 9:00/11:00 attendance, first-timers, group/grade/gender/service, SGL rally, Engage/Involve/Challenge scorecard, optional social metrics.

## Sources and definitions

Calculate attendance and first-time check-ins from PCO Check-Ins throughout accessible history. Use confirmed time-labelled Transit locations and their dated service mappings. Follow the existing student classification and resolver rules. Transit Weekend remains a separate serving scope. Use aggregate workbook history only for comparable gaps or reconciliation. First time means first known eligible ministry visit within available history.

## Phase 5B display

The overview leads with total attendance and smaller service splits, selected average, YoY and a YTD actual/eight-week-average chart. On the detail page place attendance by service and Sunday total in row one and first-time check-ins in row two. Put a small two-line chart on each applicable card. Show honest partials, use date-range history and keep PCO serving secondary. Remove standalone workbook headcount, new-guest and volunteer cards. The [brief](../PHASE_5B.md#acceptance-walkthrough) covers a child attending multiple services, a service switch and a single-service ministry.

## Phase and acceptance
Implement after shared core and relevant provider mapping. Tests must verify source date alignment, zero/unknown handling, duplicate prevention, permission boundaries, score version if applicable and reconciliation to owner-approved historical weeks. Explicitly record unresolved definitions in `OPEN_QUESTIONS.md`.
