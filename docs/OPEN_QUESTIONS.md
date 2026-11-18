# Remaining Owner Decisions and Acceptance Gates

This list reflects the current Phase 5 implementation. Approved source
definitions and historical mappings are recorded in `DECISIONS.md`,
`PHASE5_STATUS.md` and `PHASE5_WORKBOOK_CROSSWALK.md`; the older draft questions
below should not be treated as unresolved when those records already answer
them.

## Still open for Phase 5

1. Complete the privacy review and approve a suitably restricted development
   environment before adding identifiable donor, group-member or child history
   beyond the fields and sources already approved. This does not block use of
   existing staged data, aggregate display or approved current/history work.
2. Complete representative authenticated owner review of the remaining
   source-to-screen surfaces, especially Check-In exceptions, Connection and
   Serving. Do not treat an implementation check or a single page review as
   approval of every ministry or every source value.
3. Record owner development signoff after the remaining reviews and privacy
   gate. This is separate from production deployment, unattended scheduling
   and production privacy/retention approval.

No additional metric definition is currently needed to publish the approved
Phase 5 measures. Actual source gaps, unresolved Check-Ins, partial coverage
and unavailable historical values must remain visible as documented; owner
review is not a request to manually approve every PCO record.

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
  approved source precedence, period, scope, effective dates and coverage
  documented in the Phase 5 status and crosswalk.
