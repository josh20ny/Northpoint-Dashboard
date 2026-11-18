# Instructions for AI coding agents

For work after Phase 5, start with the [Phase 5B brief](docs/PHASE_5B.md) and [code audit](docs/PHASE_5B_AUDIT.md). Use the Planning Center API through the existing server-side ingestion path wherever it records the requested measure. Workbook acceptance allows mapped gap fills and reconciliation. Imported rows alone do not establish a staff KPI.

This file is mandatory for every agent/task. **Specifications are contracts, not a suggestion to implement everything at once.**

## Before coding
1. Read `README.md`, `docs/DECISIONS.md`, the relevant spec, `docs/METRICS.md`, `docs/DATABASE.md`, and the current roadmap phase.
2. State intended scope, affected components, anticipated migrations, risks, and tests in the implementation PR/task.
3. Identify `TBD` rules; do not infer them from spreadsheet titles, cached formulas, or example numbers.
4. Build one vertical slice at a time: connector or manual source → normalized records → metric calculation → API → UI → tests.

## Boundaries
- API/analytics server alone is responsible for metric computation and authorization; frontend may format but must not redefine metrics.
- Store ingested source provenance and enforce idempotent upserts and backfills. Keep technical lineage out of the default staff view.
- No direct browser calls to secrets-bearing provider APIs. OAuth server-side, least privilege, encrypted token storage, refresh and revocation support.
- Replit auth should be hidden behind a provider adapter so it can later be replaced with Google Workspace OIDC.
- Deny by default. Giving donor identity/transactions must not flow to Staff/Leadership via endpoints, exports, chat, audit details, charts, logs, or error payloads.
- Individual attendance may be accessed by authenticated Staff/Leadership/Admin according to approved policy; every access is audited.
- Count unknown engagement dimensions as **unknown**, not false; document denominator/missingness.
- Preserve raw and normalized data separately; never mutate raw history to make derived metrics look correct.
- Public calendar/seasonality features are model covariates, not arbitrary record exclusions.
- Do not let the AI use arbitrary SQL or personally identifying giving data unless a dedicated admin-scoped tool is explicitly approved.

## Delivery standard
- Add or update migrations and fixtures.
- Add unit tests for all formulas and access-control tests for each route.
- Add integration/contract tests with mocks; production provider credentials never required for CI.
- Update relevant docs, `DECISIONS.md` when a decision is approved, and the roadmap status.
- For UI, cover empty/loading/error/stale states and accessibility.
- Summarize what changed, what passed, known gaps, any handoff steps.

## Forbidden assumptions
Resolve clock times from the effective-dated ministry schedule. Use First service and Second service across time changes and the actual evening service for InsideOut. Do not use chart-only aggregates as proof of a person's attendance. Do not claim correlation is causation. Do not assume every integration has OAuth or accessible API endpoints.

## Stop and escalate
Request product-owner review before changing a metric definition, adding person-level data access, enabling AI tool actions, mapping ambiguous historical columns, deleting legacy source data, or widening OAuth scopes.
