# Connection / Groups & Guest Services — Ministry Specification

**Status:** v0.1. Business rules not explicitly confirmed remain draft.

## Owner-confirmed PCO attendance rule

Connection group meeting attendance includes only explicit attended records for
non-cancelled, ended events whose group is in the PCO **Groups** category.
Membership, RSVP, student ministry categories, leader categories, Teams and
uncategorized groups do not count toward this measure unless separately
approved. Attendance is deduplicated by event/person pair.

## Questions the page must answer
What is happening this week? How does it compare to plan, 4-week trend and YoY? Where is ministry health improving or declining? Which measurable next step deserves attention?

## Requested information
Number of groups, group attendance, group leaders/coaches, guest services volunteers, Discover Northpoint, Sneak Peek and group interest-to-join progression.

## Authoritative-source and data-definition cautions
PCO Groups/People and native form events; separate membership from attending; import Connection tab and historical datasets with source review.

## Minimum view
Current week headline metrics, last 4 completed weeks, YoY comparison, date/service filters, trend and targets, current health statuses (when configured), last sync, issues worth attention and drilldowns to service/evidence.

## Phase and acceptance
Implement after shared core and relevant provider mapping. Tests must verify source date alignment, zero/unknown handling, duplicate prevention, permission boundaries, score version if applicable and reconciliation to owner-approved historical weeks. Explicitly record unresolved definitions in `OPEN_QUESTIONS.md`.
