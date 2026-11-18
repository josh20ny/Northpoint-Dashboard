# Copy-and-paste Agent Task Prompts

## Phase 5B

Copy this prompt into the coding agent on a branch that contains the Phase 5B documents.

```text
Implement Phase 5B of the Northpoint Dashboard before starting Phase 6. Read AGENTS.md, docs/PHASE_5B.md, docs/PHASE_5B_AUDIT.md and the Phase 5B decision in docs/DECISIONS.md. The brief contains the screen-by-screen requirements and acceptance walkthrough.

Start with the source-selection defect reproduced in the audit. Calculate each metric from Planning Center wherever the API records it. Use accepted workbook data only for a documented, comparable gap or to reconcile a result. Adult auditorium counts use manual entry and accepted workbook history. A partial PCO result must stay visibly partial.

Follow the brief’s implementation order. Build the missing aggregates, comparisons and graph series on the server, then implement the overview, ministry pages and admin cleanup. Use the same values in cards, charts and tables. Preserve privacy, access controls, corrections and audit history. Keep the numeric comparison window independent of the eight-week graph.

Run the acceptance walkthrough, including both Phase 5 ministry database suites. Use synthetic fixtures for regression coverage, distinguish baseline failures from new ones and record any data gaps with their causes. Return a summary of changes, tests and signed-in acceptance evidence for the owner. Stop after Phase 5B.
```

## Task A — Setup
> Read AGENTS.md, README.md, DECISIONS.md, ARCHITECTURE.md and ROADMAP.md. Implement ONLY phase 0 repo scaffolding. Choose a Replit-compatible structure that can run outside Replit. Include dependency lockfiles, environment template (no secrets), lint, typecheck, test runner, health page and one documented command to run it. Do not implement real integrations. Include CI and a summary of files, commands, tests and gaps.

## Task B — Data and roles
> Read AGENTS.md, DATABASE.md, PERMISSIONS.md and TESTING.md. Implement user/role, ministry, service occurrence, audit and source record migrations with synthetic fixtures, and server-side authorization tests demonstrating that Staff/Leadership cannot access donor transactions. Preserve auth-provider portability. Do not add real source data or assume definition values.

## Task C — Historical staging
> Read AGENTS.md, HISTORICAL_MIGRATION.md, data/workbook_inventory.csv and data/legacy_columns.csv. Build a staged XLSX import validation flow that catalogs sheets, cells, formulas/cached values, and mapping candidates without publishing data. Make ambiguous mappings require admin approval, preserve provenance, and emit reconciliation report. Include rollback/re-import tests. Do NOT load all workbook numbers directly into production metrics.

## Task D — Adult attendance vertical slice
> Read AGENTS.md, METRICS.md, PRD.md, specs/SPD.md and ROADMAP.md. Implement manual service attendance input (9:00/11:00 with historical effective dates), data revision/audit, aggregate attendance calculation, a typed API, and a homepage KPI with drilldown. Use Sunday week-end in America/Chicago. Mark YoY comparator as provisional until approved. Unit/integration/e2e tests required.

## General task wrapper
> Implement only ROADMAP phase/task [ID]. List assumptions and source-derived facts separately; keep all unresolved business semantics behind configuration/TBD status. Preserve PII boundaries and run the relevant tests. Update source docs and add a decision only when explicitly approved. Report what was built, test output, and handoff blockers.
