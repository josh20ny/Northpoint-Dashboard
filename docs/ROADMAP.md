# Execution Roadmap — Release Gates

## Current implementation status
Phase 0 scaffold is implemented and development checks are passing; see `IMPLEMENTATION.md` for boundaries and
`PHASE_0_VERIFICATION.md` for actual checks and outstanding configuration.
Live authentication remains disabled until the verified provider/admission work is
complete. No Phase 1 or later ministry-data functionality is implied by navigation.

| Phase | Build | Exit gate |
|---|---|---|
| 0 | Repo, test framework, CI, synthetic fixtures, shared docs, auth adapter | Replit dev works, portable Git export |
| 1 | RBAC, PostgreSQL migrations, people/ministry/service occurrences, audit | Cross-role security tests green |
| 2 | Historical workbook import explorer, explicit mappings, staged rows, source QA | Several approved weeks reconcile |
| 3 | Planning Center OAuth, People/Services/Check-Ins ingestion | Incremental + backfill, provenance, sync status |
| 4 | Adult attendance complete vertical slice and basic home | Source→database→API→UI→tests; 2026 samples reconciled |
| 5 | Giving restricted models, groups, serving, child/student modules | Role isolation, complete source flags |
| 6 | Configurable scorecards, manual forms, service-plan links | Workflow with version/audit + source semantics |
| 7 | Metric registry, thresholds and health cards, ministry pages | Definition changes replay safely |
| 8 | Four-part engagement and journeys | Denominators/rules approved, cohorts validated |
| 9 | ClickUp weekly reports and notifications | Preview, approval/dedup, safe delivery |
| 10 | AI assistant and proactive anomaly engine | Evidence and leak/prompt-injection testing |
| 11 | Attendance forecast controls and backtests | Beats or matches baseline / flags uncertainty |
| 12 | Comms providers (YouTube, GA4, Meta, Mailchimp, Clearstream, podcasts) | OAuth/capability verified per adapter |
| 13 | Special events, Camp 75, polish, disaster recovery, migration | Admin signoff, launch checklist passed |

**Ordering note:** phase 4 needs source validation and can initially use native manual counts before all PCO connectors are complete. Phases may overlap only after interfaces are tested; do not build all ministry pages before a complete vertical slice.

## First ten implementation tasks
1. Scaffold Git-compatible monorepo, lint/format/typecheck/test and `.env.example`.
2. Add Google-compatible/Replit auth adapter with verified identities and invite/allowlist.
3. Implement RBAC guards + audit events + role test fixtures.
4. Create schema migrations for ministries, services, raw records, manual observations, metric definitions.
5. Implement reusable metric response contract and Sunday/Chicago time utility with tests.
6. Build admin source/connection status scaffold (no fake OAuth).
7. Implement XLSX import analyzer and mapping review UI with raw-only staging.
8. Implement manual adult attendance input with revisions, approval and authoritative source marker.
9. Implement attendance metric endpoint with four-week and YoY comparisons after policy review.
10. Build home Adult Attendance KPI and drilldown, loading/partial/error states, validation fixtures.

Each task must end with tests and documentation changes. See `AGENT_TASK_PROMPTS.md`.
