# InsideOut — Ministry Specification

**Status:** v0.1. Business rules not explicitly confirmed remain draft.

## Questions the page must answer
What is happening this week? How does it compare to plan, 4-week trend and YoY? Where is ministry health improving or declining? Which measurable next step deserves attention?

## Requested information
High-school 4:30 PM attendance; large-group vs small-group, new students, grade/gender, volunteers, Engage/Involve/Challenge scoring, related digital metrics.

## Authoritative-source and data-definition cautions
PCO Check-Ins/Groups plus manually observed large-group attendance; reconcile whether current sheet small-group field is a count of students or groups.

## Minimum view
Current week headline metrics, last 4 completed weeks, YoY comparison, date/service filters, trend and targets, current health statuses (when configured), last sync, issues worth attention and drilldowns to service/evidence.

## Phase and acceptance
Implement after shared core and relevant provider mapping. Tests must verify source date alignment, zero/unknown handling, duplicate prevention, permission boundaries, score version if applicable and reconciliation to owner-approved historical weeks. Explicitly record unresolved definitions in `OPEN_QUESTIONS.md`.
