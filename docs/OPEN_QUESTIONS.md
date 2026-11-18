# Remaining Owner Decisions and Acceptance Gates

This list records Phase 5 closeout and the remaining implementation questions for Phase 5B. Approved source
definitions and historical mappings are recorded in `DECISIONS.md`,
`PHASE5_STATUS.md` and `PHASE5_WORKBOOK_CROSSWALK.md`; the older draft questions
below should not be treated as unresolved when those records already answer
them.

## Phase 5 closeout

The owner approved Phase 5 development closeout on November 18, 2026. This
covers the current minimized development data boundary, accepted source
mappings and backfills, and the reviewed signed-in dashboard screens. It does
not approve additional sensitive fields or provider scopes. Production
deployment, unattended scheduling and production privacy/retention approval
remain separate.

No additional metric definition is currently needed to publish the approved
Phase 5 measures. Actual source gaps, unresolved Check-Ins, partial coverage
and unavailable historical values must remain visible as documented; owner
review is not a request to manually approve every PCO record.

## Phase 5B evidence to establish

- Identify coverage by measure and period, including which legacy group-participation columns correspond to the series indicated in the walkthrough. Use the documented PCO-first rule while checking the field-level evidence.
- Establish which PCO Groups/roles represent active Connection participants, leaders and coaches as of a Sunday. Use a real dated snapshot or source-supported historical reconstruction. Sunday attendance uses the existing approved meeting category.
- Preserve the distinction between unique people and membership records. Where PCO supplies only partial first-visit history or cannot attribute the first service, label that uncertainty. Continue delivering independent measures.
- Giving uses the established General Giving headline and explicit linked giving units. The weekly participation count and source eligibility are specified in [Phase 5B](PHASE_5B.md).

## Reserved for later phases or pre-production

- Health/engagement thresholds, score weights, ministry scorecards, and
  configurable evaluation workflows belong to later phases. Giving's first
  gift, cadence, lapse and Admin-adjustable formula are already defined;
  those signals are not themselves a health score.
- Cross-domain household identity, return windows, cohort maturity, and
  engagement denominators belong to later engagement work. Do not infer them
  from matching provider IDs or aggregate workbook counts.
- YouTube, social, email, website analytics, podcast and ClickUp sources need
  their own provider access and product decisions; they are not missing PCO
  attendance or serving values.
- Fixed retention periods and privacy-deletion procedures require a separate
  pre-production decision. Current development behavior preserves source
  history and does not automatically purge it.
- Numeric small-cell suppression thresholds and privacy/retention rules for
  production remain open; the development approval does not establish them.

## Resolved definitions to preserve

- Giving aggregates are visible to signed-in roles; donor names/IDs,
  transactions and person-linked giving signals are Admin-only. The workbook's
  monthly recurring dollars and weekly/monthly giving-person counts are
  separate, period-labelled measures.
- Child/student attendance follows the approved event, location, service-time,
  ministry, grade-fallback and Check-In review rules. Unresolved Check-Ins
  remain visible and Admin-resolvable; missing links are not invented.
- Connection meeting attendance counts explicit attended records in Groups
  only, deduplicated by event/person. Services scheduled and accepted assignment
  counts remain separate and do not claim actual participation.
- Historical PCO and accepted workbook values are not added together. Use the
  PCO-first source policy, period, scope, effective dates and coverage in [Phase 5B](PHASE_5B.md#source-selection). The Phase 5 crosswalk records the historical inputs.
