# Giving — Ministry Specification

Phase 5 is the accepted development baseline. [Phase 5B](../PHASE_5B.md) governs the next implementation. Long-term measures below follow the roadmap.

## Questions the page must answer
What is happening this week? How does it compare to plan, 4-week trend and YoY? Where is ministry health improving or declining? Which measurable next step deserves attention?

## Requested information
General and restricted giving, fund trends, one-off to scheduled giving, first-time giver and cadence shifts; aggregate visualizations inspired by giving-flow dashboards.

## Sources and definitions

Use PCO Giving across its available history. The existing General Giving measure sums only eligible mapped General Giving designations. Keep all-fund receipts, refunds, recurring amounts and individual funds separate. Use matching accepted workbook periods for genuine gaps or for reconciliation. Historical counts of people require unit comparability before any join to current giving units. Donor details and individual signals are Admin-only.

## Phase 5B display

On Home, show weekly General Giving first and total giving units for the week second. Deduplicate qualifying units across repeated gifts using the applicable explicit joint-giver policy. Show the selected weekly average, YoY and a YTD actual/eight-week-average chart. Retain Building, Care, Fuel campaigns, first-time/lapsed units and month-grain history in the appropriate Giving detail. Remove redundant source labels and workbook-only current KPIs.

## Phase and acceptance
Implement after shared core and relevant provider mapping. Tests must verify source date alignment, zero/unknown handling, duplicate prevention, permission boundaries, score version if applicable and reconciliation to owner-approved historical weeks. Explicitly record unresolved definitions in `OPEN_QUESTIONS.md`.
