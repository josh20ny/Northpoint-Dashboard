# Execution Roadmap — Release Gates

## Current implementation status

Phase 5 closed for development on November 18. **Phase 5B is next and awaits implementation.** The paragraphs below record earlier milestone outcomes.
Phase 0 is retained. Phase 1 implementation adds invite-only verified sign-in,
local roles, ministry/service configuration, people/source reference schemas and
append-only audit history. See `PHASE_1_IMPLEMENTATION.md` for scope, verification
and release limits; `AUTH_SETUP.md` for admission and runtime configuration.
Phase 2 adds the Admin-only historical workbook explorer, explicit mapping
review, raw staging and reconciliation reports. Source values are not published
to metrics. The Phase 2 sample-review gate is met: both adult services for January
4, 11 and 18 have current authenticated owner-confirmed approvals (six approvals;
three approved weeks). This is not independent two-source or full-year verification.
See `PHASE_2_IMPLEMENTATION.md`.

Phase 3 is complete for development with owner-approved live-verification
deferrals (D-025). Direct OAuth/PKCE, organization confirmation,
encrypted token refresh/revocation and resumable People/Services/Check-Ins
source ingestion with opt-in background run-to-completion are implemented.
Development OAuth configuration and organization confirmation are complete.
Live backfills, incremental rescans and repaired source relationships are verified
in development. An Admin-configurable refresh scheduler is implemented
(daily 1 AM Central by default, with time/frequency/weekday/time-zone controls);
development lifecycle rules and tracking are implemented. Fresh lifecycle
baselines, a scheduled cycle, controlled restart/recovery and live credential-
failure/reconnect demonstrations are deferred until before production, not passed.
The schedule remains disabled; unattended freshness must not be assumed.
Unattended hosting is deferred by the owner's development-only choice;
production retention/privacy deletion and release approval remain separate gates.
No metric publication is claimed. See `PHASE_3_IMPLEMENTATION.md`.
Phase 4 is closed for development with owner approval on November 9, 2026
(America/Chicago), after final reconciliation and dashboard card refinements.
It provides manual auditorium headcounts,
immediate saves, immutable corrections, typed aggregate reads, the home KPI and
attendance drilldown, plus deliberate evidence-bound historical promotion.
The owner accepted the supplied workbook for historical adult auditorium counts. The import covered 80 service observations across 40 Sundays.
Individual week publication is no longer required for this accepted source.
The actual adult ministry/definition is configured; manual occurrence setup
remains separate from unresolved historical start times. Other ministry
history still needs its documented mappings and module implementations.
Rolling averages now default to four calendar weeks, with selectable 1–52-week
windows and explicit completeness denominators. YoY uses the existing accepted
2025 in-person totals with documented numbered-Sunday alignment. See
`PHASE_4_IMPLEMENTATION.md` and `PHASE_4_RECONCILIATION.md`; this is not production
or full-project historical acceptance.

| Phase | Build | Exit gate |
|---|---|---|
| 0 | Repo, test framework, CI, synthetic fixtures, shared docs, auth adapter | Replit dev works, portable Git export |
| 1 | RBAC, PostgreSQL migrations, people/ministry/service occurrences, audit | Cross-role security tests green |
| 2 | Historical workbook import explorer, explicit mappings, staged rows, source QA | Several approved weeks reconcile |
| 3 | Planning Center OAuth, People/Services/Check-Ins ingestion | Incremental + backfill, provenance, sync status |
| 4 | Adult attendance complete vertical slice and basic home | Met for development: 80 source counts/40 weeks reconciled, plus manual counts and comparisons |
| 5 | Giving restricted models, groups, serving, child/student modules | Development closeout approved November 18, 2026. See [decisions](DECISIONS.md). |
| **5B** | PCO-first reporting, usable ministry KPIs, trend charts and simpler administration | Demonstrate [Phase 5B acceptance checks](PHASE_5B.md#acceptance-walkthrough) on the signed-in dashboard. |
| 6 | Configurable scorecards, manual forms, service-plan links | Workflow with version/audit + source semantics |
| 7 | Metric registry, thresholds and health cards, ministry pages | Definition changes replay safely |
| 8 | Four-part engagement and journeys | Denominators/rules approved, cohorts validated |
| 9 | ClickUp weekly reports and notifications | Preview, approval/dedup, safe delivery |
| 10 | AI assistant and proactive anomaly engine | Evidence and leak/prompt-injection testing |
| 11 | Attendance forecast controls and backtests | Beats or matches baseline / flags uncertainty |
| 12 | Comms providers (YouTube, GA4, Meta, Mailchimp, Clearstream, podcasts) | OAuth/capability verified per adapter |
| 13 | Special events, Camp 75, polish, disaster recovery, migration | Admin signoff, launch checklist passed |

**Ordering note:** phase 4 needs source validation and can initially use native manual counts before all PCO connectors are complete. Phases may overlap only after interfaces are tested; do not build all ministry pages before a complete vertical slice.

## Integrations status and remaining work

The Phase 5 development record documents the expandable provider interface and improvements to per-product PCO processing, including checkpoints where the underlying product supports them. Groups keeps full-history reconciliation. See [Phase 5 status](PHASE5_STATUS.md) for actual implementation and remaining operational gates. Phase 5B keeps the Integrations controls, clarifies sync wording and simplifies the Admin landing page and directory.

**Next delivery is Phase 5B.** Work through the [implementation brief](PHASE_5B.md) and [verified code findings](PHASE_5B_AUDIT.md). Phase 6 follows the Phase 5B acceptance walkthrough.

## Original foundation tasks

These tasks describe the early phases. The current implementation order is in [Phase 5B](PHASE_5B.md#implementation-order).

1. Scaffold Git-compatible monorepo, lint/format/typecheck/test and `.env.example`.
2. Add Google-compatible/Replit auth adapter with verified identities and invite/allowlist.
3. Implement RBAC guards + audit events + role test fixtures.
4. Create schema migrations for ministries, services, raw records, manual observations, metric definitions.
5. Implement reusable metric response contract and Sunday/Chicago time utility with tests.
6. Build admin source/connection status scaffold (no fake OAuth).
7. Implement XLSX import analyzer and mapping review UI with raw-only staging.
8. Implement direct manual adult attendance entry with immutable revisions and recorded provenance.
9. Implement attendance metric endpoint with four-week and YoY comparisons after policy review.
10. Build home Adult Attendance KPI and drilldown, loading/partial/error states, validation fixtures.

Each task must end with tests and documentation changes. See `AGENT_TASK_PROMPTS.md`.
