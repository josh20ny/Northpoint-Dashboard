# Architecture / Product Decision Log
**Legend:** APPROVED = user decision; PROPOSED = technical recommendation; OPEN = not decided.

| ID | Status | Decision | Rationale/guardrail |
|---|---|---|---|
| D-001 | APPROVED | Build first in Replit; design portable to GitHub/future hosting | Avoid vendor lock-in |
| D-002 | APPROVED | No mandatory tech stack | Select on maintainability and agent reliability |
| D-003 | PROPOSED | Next.js + TypeScript frontend, PostgreSQL, Python workers | Established ecosystem and analytics tooling; validate Replit ergonomics |
| D-004 | APPROVED | Use Google/NP accounts; Replit sign-in acceptable initially | Hide behind replaceable auth adapter; domain allowlisting / invites |
| D-005 | APPROVED | Roles Staff, Leadership, Admin; personalization future | RBAC now, not ministry-based homepage requirements |
| D-006 | APPROVED | Person-level attendance allowed to authenticated appropriate staff; person-level giving Admin only | Enforce at every boundary |
| D-007 | APPROVED | Engaged 1/2/3/4 = active in at least 1/2/3/4 of giving, serving, groups, child/student regular check-in | 'Regular' definitions pending |
| D-008 | APPROVED | Configurable health thresholds, weights, metric definitions | Version config and history |
| D-009 | APPROVED | Show Actual, Target/Plan, Statistical Forecast separately | Forecast is not goal |
| D-010 | APPROVED | Preserve historical unusual periods; forecasting should learn seasonality/changes | Enable change-point/event covariates and transparently report model risk; never force arbitrary exclusion |
| D-011 | APPROVED | Forecast attendance first; generalizable architecture | Avoid unnecessary V1 model surface |
| D-012 | APPROVED | Preserve existing scorecards; future admin-configurable, commonly scale 1–4 | Version templates |
| D-013 | APPROVED | Native manual entry with form/sheet ingest as useful | Keep provenance of survey aggregates |
| D-014 | APPROVED | Planning Center Services authoritative for service plan | Link to dated service occurrence |
| D-015 | APPROVED | Configurable reports/alerts to ClickUp channels | Review API availability and report approval policy |
| D-016 | APPROVED | AI answers questions and proactively detects anomalies | Evidence, permission-scoped tools |
| D-017 | APPROVED | GA4 and podcast/social/email integrations desired | Provider capability/discovery gates |
| D-018 | APPROVED | Phased V1 order proposed previously accepted | See ROADMAP |
| D-019 | APPROVED | OAuth-first integration administration | Exceptions require review, never collect provider passwords inside app |
| D-020 | OPEN | Whether Leadership may see aggregate giving and which confidential breakdowns | Default aggregate-only |
| D-021 | OPEN | Exact regularity criteria & denominator for engaged levels | Rule registry and backtests |
| D-022 | OPEN | Health thresholds and weekly summary destination and auto-send gate | Seed draft only |
| D-023 | OPEN | Which source is authoritative for each numeric measure | Reconcile mapping with owners |

New decisions must be dated with owner, alternatives, migration impact, and tests.

## Historical review input and ordering — 2026-11-07
**APPROVED**, owner: product owner. Finish Phase 2 reconciliation before starting
Phase 3. Use the supplied legacy workbook and include all data in review.
This selects the file as review input, not as authoritative metric truth or as
byte-equivalent to the original manifest. The response “All data” did not provide
a calendar snapshot date at that point; it was subsequently confirmed below.
Alternatives: a replacement workbook or proceeding with Planning Center first.
Migration impact: none for offline discovery. Verify the actual fingerprint,
all-sheet coverage, unknown values and copy dependencies; obtain explicit
mapping/source/date approvals before importing and approving real weeks.

## Legacy workbook snapshot — 2026-11-07
**APPROVED**, owner: product owner. The supplied workbook was exported or last
updated “yesterday,” interpreted as **2026-11-06** relative to 2026-11-07 in
America/Chicago. Use that date for this working-copy snapshot, not its filename,
latest populated Sunday or upload timestamp. This does not approve metric
semantics, source authority, manifest equivalence or any weekly values.
Alternatives: leaving the date unknown or obtaining a replacement export.
Migration impact: none; retain this date with any subsequent import provenance.
Tests: valid calendar input, inclusive snapshot boundary, future-week flags,
unknown snapshot handling and preservation of all source rows.

## Adult legacy source naming correction — 2026-11-07
**APPROVED**, owner: product owner. “SPD F = adult_service_1, SPD I =
adult_service_2, diagnostic_sum= adult_services_total”.
Use these exact names for the selected workbook review. The existing review
sum of F and I is named `adult_services_total`; keep missing inputs unknown.
This does not name SPD L or Dash C, approve weekly values, establish unique-person
counting, set service times or publish a canonical metric.
Alternative: the earlier tentative adult attendance terminology, which the owner
said needed correction. Migration impact: none; offline labels/exports only.
Tests: exact source names, derived total, explicit zero, unknown inputs,
and no implied mapping of SPD L to the derived total.

## January 25 attendance context

**CONFIRMED**, owner: product owner. For 2026-01-25, the owner initially said
attendance was not recorded because of an ice storm, then clarified:
“technically it was 0 attendance.” The clarification supersedes the unknown
interpretation: preserve SPD F/I zeroes and `adult_services_total = 0`, with
ice-storm context. This does not confirm service cancellation, approve other
weeks, or constitute an authenticated mapping/publication approval.
Offline review context is scoped to the reviewed workbook fingerprint.

## Phase 2 authorization — 2026-11-07
**APPROVED**, owner: product owner. Proceed with the roadmap's historical
workbook explorer, explicit mapping review, raw-only staging and reconciliation.
Alternatives were remaining at Phase 1 or starting live connectors; live
connectors and authoritative metrics remain out of scope. Migration impact:
additive import lineage/review tables plus private original-file storage.
Tests cover discovery, source quality, authorization, approval, rollback and
re-import. Source authority and real sample-week approval remain owner decisions.

## Implementation recommendation — 2026-11-06

**PROPOSED**, owner: implementation agent; awaiting product-owner acceptance.
Use the provided React/Vite + Express TypeScript structure with PostgreSQL/Drizzle
and generated OpenAPI contracts in Phase 0 instead of introducing Next.js.
This follows approved D-002 (no mandatory stack). Alternatives, tradeoffs, migration
boundary and verification commands are recorded in `IMPLEMENTATION.md`.
No owner-approved product decision or unresolved business definition is changed.

## Admission policy — 2026-11-07

**APPROVED**, owner: product owner. Use invite-only access and reserve the first
Admin invitation for the email supplied privately in this conversation (stored
only in the development database). Alternatives were open domain admission or
leaving admission unconfigured; no domain is inferred from public websites.
Migration impact: user/invitation/session tables; no automatic user provisioning
on startup. Tests: invitation expiry/revocation/replay, provider-subject collision,
role spoofing, session revocation and last-active-Admin protection.
