# Northpoint Dashboard 2.0

**Status:** Planning specification v0.1 (2026-11-06). **Implementation has not begun.**

## Vision
One place for Northpoint staff to see ministry health, understand what is changing, forecast attendance, and identify what needs attention. Emphasize clarity first, optional depth second.

## Read this first
1. `docs/PRD.md` — product goals and scope.
2. `docs/DECISIONS.md` — approved decisions and open decisions.
3. `AGENTS.md` — required instructions for coding agents.
4. `docs/ROADMAP.md` — incremental build order and acceptance gates.
5. `docs/METRICS.md` and `docs/DATABASE.md` — definitions and storage contracts.
6. `docs/HISTORICAL_MIGRATION.md` and `data/workbook_inventory.csv` — legacy spreadsheet inventory.

## Development and hosting
Start in Replit, keep an ordinary Git-compatible repository with reproducible setup. The preferred stack is **Next.js/TypeScript**, **PostgreSQL**, and **Python** analytics/ingestion workers; this is a technical proposal, not a user-mandated stack. Use Docker-compatible local services or equivalent reproducible scripts. Do not couple business logic to Replit-specific SDKs. Authentication provider is behind an adapter.

## Local quickstart (implementation target—not executable until scaffold exists)
- Copy `.env.example` to `.env`; add secrets only through the deployment secrets manager.
- Start PostgreSQL, run migrations, seed fixture users and synthetic data.
- Start web, API, ingestion worker and scheduler via one documented development command.
- Run `lint`, `typecheck`, unit/integration/e2e tests and migration checks before merging.

## Non-negotiable standards
No live personal/church data committed to source. Staff cannot access person-level giving through UI, API, exports, AI, logs, or notifications. Every metric exposes source, freshness, definition version, and date window. All integrations must be reconnectable from Admin > Integrations.

## Sources
- `NP Dashboard PRD.pdf` — 4-page project brief, provided November 2026.
- `NP Dashboard - 2026.xlsx` — legacy workbook; see extracted inventory and migration plan.
- User decisions from the requirements discussion (November 2026).
