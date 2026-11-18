# Metric Registry — functional contract

**Statuses:** APPROVED = explicit concept; DRAFT = candidate calculation; TBD = clarification required. Do not deploy a DRAFT as church-authoritative without owner signoff.

## Time and comparison
- Weekly boundary: Mon 00:00 through Sun 23:59:59.999 `America/Chicago`, label by Sunday date (APPROVED).
- Phase 5B weekly comparisons use complete observations in a trailing calendar-week window ending at the reporting anchor. Default four weeks, adjustable from 1 to 52. Expose the actual recorded denominator. Each YTD mini-chart uses a separate fixed eight-week average.
- Rolling month: previous calendar-month-length interval relative to today, or 30 days? **TBD**; show both available options until signed off.
- Phase 5B YoY follows the same numbered Sunday in the previous year. Match metric, population, scope and unit. An unmatched 53rd Sunday or missing baseline has no comparable value. A zero baseline has no percentage. Monthly and future forecast policies are separate.
- Missing, delayed or partial weeks: `quality_status` and denominator; do not display as zero except for the owner-confirmed attendance rule below.

## Attendance
### Phase 4 approved count and missingness rules
- Adult count: people seated in the auditorium attending that service, excluding
  volunteers and people on stage. Service sums are not deduplicated unique people.
- Manual saves take effect immediately; corrections retain previous revisions.
- April 12, 19, 26 and May 3, 2026 are online-only/unrecorded, not measured zero.
  Intentionally off Sundays are also unrecorded; do not invent their dates.
  These exceptions supersede the blanket historical blank-to-zero interpretation.
- January 25, 2026 retains the explicitly confirmed zero and ice-storm context.
- Full Sunday actuals require both configured adult source slots; a single known
  service produces only a labelled subtotal. Unrecorded/invalidated/future values
  never become full totals.
- The owner approved the adult window and ordinal-Sunday comparator on November 9. Phase 5B puts the control beside the metric and reuses this convention for comparable weekly measures.

### Owner-confirmed legacy review names (2026-11-07)
- `SPD!F` → `adult_service_1`.
- `SPD!I` → `adult_service_2`.
- The review's former `diagnostic_sum` → `adult_services_total`
  (`adult_service_1 + adult_service_2`, after applying the owner-confirmed
  attendance date rule below).

These are approved source/review names for the selected workbook, not publication
or weekly-value approval. They do not approve `SPD!L`/`Dash!C` semantics, unique
attendee interpretation, ministry/time mappings or the draft canonical metrics
below. See `DECISIONS.md`.

### Owner-confirmed attendance date rule
- Past blank/zero attendance inputs mean zero attendance: no service or cancelled service.
- Future blank/zero entries are not yet recorded; exclude them from actuals.
- For a historical snapshot use its confirmed as-of date, not today's date,
  so old exports do not gradually turn future placeholders into zeroes.
- The offline adult review uses matching SPD/Dash dates and 2026-11-07 as its
  inclusive historical cutoff. Original F/I values remain separate.
- Missing formula caches, spreadsheet errors, invalid values and unconfirmed
  dates remain unresolved; this rule does not apply to other numeric measures.

### Canonical definitions
- `adult_in_person_attendance`: sum of auditorium per-service headcounts for Sunday under the Phase 4 definition; aggregate observations are marked as such. Manual entry is approved without an approval queue; historical source authority/promotion remains explicit and separate.
- `adult_online_connections`: raw source-defined live Sunday connections; distinct from estimated persons (DRAFT).
- `adult_total_engagement`: historical `in_person + online_connections * multiplier`; preserve as *legacy-defined* metric, with effective-dated multiplier, and do not call it unique attendees (DRAFT).
- Child/student attendance uses Sunday PCO Check-Ins, approved room/service routes and existing review decisions. Publish service counts and a separately deduplicated ministry Sunday total. Historical aggregate headcounts cannot establish distinct people or room splits.
- First-time check-ins use the first known eligible visit to that ministry across available PCO history. Publish service splits and a distinct Sunday total. Record the earliest reliable coverage and unresolved service attribution. See [Phase 5B](PHASE_5B.md).
- Return 2nd/3rd: percent of first-timers with 2nd/3rd distinct-day visit within a configurable observation window; report cohort maturity and median/mean lag; exact window **TBD**.
- Capacity utilization = observed attendance / effective capacity. Historical capacities vary by venue and service.

## Four engagement dimensions (APPROVED structure)
For a person/household-defined evaluation period at time T:
1. GIVING: qualifies as current giving under configurable cadence/recency policy **TBD**.
2. SERVING: qualifies as current volunteering/serving under configurable activity window **TBD**.
3. GROUP: qualifies as in a group under membership and/or attendance rules **TBD**.
4. KIDS/STUDENTS: user's child/student regularly checking in; household relationship and regularity rule **TBD**.
`engagement_count = SUM(boolean qualifying dimensions)` ONLY WHEN inputs are known. `Engaged N = at least N dimensions`, N=1..4, per user definition; **these are cumulative, not mutually exclusive**. Also offer mutually exclusive `exactly N` cohorts clearly labeled. Define eligible population/denominator, household linkage, no-kid households, kids aging out, privacy and incomplete sources before treating these as authoritative. Display unknown/not-evaluable separately. Do not penalize a person for lacking children without explicit product decision.

## Giving
General Giving uses the approved fund designations on qualifying received gifts, dated in Chicago. Keep all-fund receipts, refunds, Fuel campaigns and recurring schedules distinct. Phase 5B adds total distinct giving units that gave in the reporting week. Count repeated gifts once per unit using the applicable PCO joint-giver policy. First-time and lapsed units remain separate measures. Staff and Leadership see broad aggregates. Donor identity, transactions and person-linked signals are Admin-only. See [Giving](specs/GIVING.md) and [decisions](DECISIONS.md) for existing definitions and production privacy gates.

## Connection

Count eligible active groups and distinct active participants from dated PCO Groups evidence. Multiple memberships for one person may increase membership count, but count the person once. Report meeting attendance from explicit attended event/person pairs at eligible ended, non-cancelled meetings in the approved Groups category. Coach and leader counts need evidence of the respective role. The workbook series identified in the walkthrough describes active participants, even though its historical label says attendance. See [Connection](specs/CONNECTION.md).

## Leading indicators / next steps
`Discover attendance → first subsequent qualified next step`; `Sneak Peek → first serving`; `group interest → join`; kid/student visit → return; signup → baptism (only if completion data available). Track cohort n, converted n, window, median lag, uncensored rate, source coverage. Correlations are exploratory and do not imply causation. First-time gifts (welcome gifts vs money donations) must be disambiguated.

## Scorecards
Current workbook mixes numerical 1–4 evaluations and student 'Double/Triple/Homerun' labels. Store raw original response/rubric and versioned mapped numeric value only where approved. Weighted average must record source and missing-response rules. Volunteer evaluation averages should not be represented as raw individual survey scores when only aggregates exist.

## Health
Rule registry per metric/ministry with config effective date and green/yellow/red bands, numerator/denominator and reference target. Never hardcode 98% etc. A metric is `gray/insufficient_data` if sample size/completeness insufficient. Composite health score/weights **TBD**.

## Forecast
Actual vs target vs statistical forecast shown independently. Always expose model and training window, uncertainty bands, errors and 'forecast vs target' comparisons. See `FORECASTING.md`.

## Source selection

Apply [the Phase 5B selection table](PHASE_5B.md#source-selection) before comparisons, charts and exports. Keep observed zero, partial, unavailable and stale distinct. The accepted workbook supports reconciliation and comparable gaps. Adult auditorium headcounts are the established manual exception.

## Data contract for every measure
`metric_slug, title, value, unit, grain, period_start, period_end, timezone, ministry, filters, definition_version, source_refs, last_updated_at, completeness, quality_status, target, comparable_prior, comparison_policy, lineage`.
