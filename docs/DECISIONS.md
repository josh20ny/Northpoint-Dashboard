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
