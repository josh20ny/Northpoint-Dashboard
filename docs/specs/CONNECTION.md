# Connection / Groups & Guest Services — Ministry Specification

Phase 5 is the accepted development baseline. [Phase 5B](../PHASE_5B.md) governs the next implementation. Long-term measures below follow the roadmap.

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

## Sources and definitions

Use dated PCO Groups evidence for eligible active groups, distinct participants and roles. Count a member in two active groups once in the participant total. Distinguish member records, distinct people, leaders, coaches and checked meeting attendances. Use the actual observation date and show unavailable when a Sunday snapshot cannot be supported. Josh identified the historical “Total group attendance” display as active participants. Validate its exact source mapping before using a comparable gap fill.

## Phase 5B display

Order the page as Group attendance, Guest Services teams, then Health metrics. Show active people, active groups and reported meeting attendance. The date-filtered history table includes active leaders, members, groups, coaches where evidenced, and reported meeting attendance. Keep LU weekly and Safety separate. Display Kids’ Check-In on Connection as a separately labeled shared team. Leave workbook duplicates, church-wide volunteer totals and “All services” labels off this page. The Home card leads with active participants and gives meeting attendance as context.

## Phase and acceptance
Implement after shared core and relevant provider mapping. Tests must verify source date alignment, zero/unknown handling, duplicate prevention, permission boundaries, score version if applicable and reconciliation to owner-approved historical weeks. Explicitly record unresolved definitions in `OPEN_QUESTIONS.md`.
