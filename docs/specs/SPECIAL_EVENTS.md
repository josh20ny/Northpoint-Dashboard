# Special Sundays — Christmas and Easter — Ministry Specification

**Status:** v0.1. Business rules not explicitly confirmed remain draft.

## Questions the page must answer
What is happening this week? How does it compare to plan, 4-week trend and YoY? Where is ministry health improving or declining? Which measurable next step deserves attention?

## Requested information
Special service date/time patterns, capacity, attendance, registrations, staffing, year-over-year comparison using event not calendar Sunday alignments.

## Authoritative-source and data-definition cautions
Preserve Easter, Christmas Eve, CE 2026 and other special-event tabs. Comparisons use holiday-relative service occurrences, not naive same-date YoY.

## Minimum view
Current week headline metrics, last 4 completed weeks, YoY comparison, date/service filters, trend and targets, current health statuses (when configured), last sync, issues worth attention and drilldowns to service/evidence.

## Phase and acceptance
Implement after shared core and relevant provider mapping. Tests must verify source date alignment, zero/unknown handling, duplicate prevention, permission boundaries, score version if applicable and reconciliation to owner-approved historical weeks. Explicitly record unresolved definitions in `OPEN_QUESTIONS.md`.
