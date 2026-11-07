# Phase 0 implementation and architecture recommendation

## Understanding and scope
Northpoint Dashboard 2.0 is a long-term, permission-scoped ministry analytics
platform. This iteration implements **Phase 0 only**. It does not publish metrics,
define unresolved business rules, ingest source samples, or connect church accounts.

## Selected technical foundation (recommendation, not owner approval)
React + TypeScript + Vite for the web application; Express + TypeScript for a
separate OpenAPI-first API; PostgreSQL + Drizzle for persistence and migration
artifacts; future Python workers only when ingestion/statistical work needs them.

The supplied Next.js proposal is not mandatory (D-002). The starting repository
already supplies Vite, a separate API, generated typed clients and PostgreSQL
support. Keeping that structure avoids unnecessary framework replacement, suits an
internal application that does not need server-side SEO, and provides a portable
single-origin hosting option. Alternatives: Next.js would consolidate routes and
server rendering but adds a framework migration now; neither provides security
automatically. No metric or auth logic is coupled to Vite or Replit SDKs.

## Repository boundaries
- `artifacts/northpoint-dashboard/`: web shell, accessible components, navigation.
- `artifacts/api-server/`: request validation, safe public infrastructure read
  models, disabled auth provider and deny-by-default operational API boundary.
- `lib/api-spec/`: `/api/v1` contract; generated clients/Zod under `lib/`.
- `lib/db/`: connection pool, infrastructure-only schema, versioned migrations.
- `workers/`: reserved future worker boundary, no running process.
- `tests/`: synthetic-only role, calendar, environment and API checks.
- `docs/`, `docs/specs/`, `data/`: supplied project specifications and source
  inspection artifacts. CSV samples remain reference material, not loaded data.
- `.github/workflows/`: portable CI with ephemeral PostgreSQL.

## Database boundary
Phase 0 adds one `foundation_metadata` table and an infrastructure version marker.
There are no people, ministry, donor, attendance or metric tables yet.
Drizzle generates versioned SQL. Apply migrations explicitly to development/local
databases, not at app startup. Never automatically run DDL in deployment builds.
Managed Replit production uses the Publish schema-diff workflow; independent hosts
need their own reviewed release migration process. Do not use both mechanisms on
the same database. Fixtures live in tests and are never actual application users.

## Authentication boundary
See `AUTH_SETUP.md`. Disabled means **no verified users and no authenticated admin**,
not a permissive demo. The preview exposes only non-sensitive project documents,
ministry names and infrastructure status. All remaining `/api/v1` paths require
verified authentication and authorization. No provider configuration is fabricated.
The basic permission evaluator is a foundation seam, **not completed Phase 1 RBAC**.

## Conflicts and unresolved decisions
1. The initialization prompt requests migration tooling in Phase 0; ROADMAP puts
   domain migrations in Phase 1. Implement infrastructure tooling/metadata only.
2. D-020 leaves Leadership aggregate-giving access open; PERMISSIONS lists approved
   suppressed giving views for Staff/Leadership. No giving endpoint is enabled.
   Resolve the policy and suppression threshold before implementing aggregates.
3. Proposed Next.js/Python topology versus provided Vite/Express foundation:
   recommendation above; no product decision is silently marked approved.
4. README mentions Docker-compatible setup. Containers are unnecessary for this
   environment. Standard Node/pnpm and an ordinary PostgreSQL connection suffice;
   CI uses a PostgreSQL service on GitHub, not a container in Replit.

## Deliberately postponed
Live verified sign-in and invite/domain admission, database-backed role assignment,
audited person access, ministry/people/service domain tables, integrations and OAuth,
historical staging, attendance calculations, giving, scorecards, engagement,
forecasts, AI, reports, live child/donor information and production release.

## Release boundary
This foundation preview is not a production church-data release. Before any
sensitive data, complete Phase 1 identity/admission/role/audit controls and review
public document visibility, privacy policies, cookie/session/CSRF implementation,
MFA, backups, secrets, permissions and deployment hardening.
