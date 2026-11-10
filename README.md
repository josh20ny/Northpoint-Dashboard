# Northpoint Dashboard 2.0

**Status:** Phase 4 adult-attendance development slice implemented; see
`docs/PHASE_4_IMPLEMENTATION.md` for setup, verification and release limits.
Phase 2 sample-review gate met; Phase 3 direct Planning Center
connection and resumable source ingestion with opt-in server-side run-to-completion
processing implemented. Development OAuth consent and organization confirmation
are complete, as are all three backfills/revision rescans and relationship checks.
Admin-configurable refresh scheduling is implemented; unattended hosting and final
operational acceptance are still required.
The owner-authorized workbook history now imports in bulk: 80 adult service
counts across 40 Sundays are loaded, with provenance and no per-week approvals.
See the superseding source-acceptance policy in `docs/DECISIONS.md`.
The original supplied README is preserved at `docs/ORIGINAL_PLANNING_README.md`.
The complete initialization instructions are in `docs/PROJECT_INITIALIZATION.md`.

## Vision

One place for Northpoint staff to see ministry health, understand what is changing, forecast attendance, and identify what needs attention. Emphasize clarity first, optional depth second.

## Read this first

1. `docs/PRD.md` — product goals and scope.
2. `docs/DECISIONS.md` — approved decisions and open decisions.
3. `AGENTS.md` — required instructions for coding agents.
4. `docs/ROADMAP.md` — incremental build order and acceptance gates.
5. `docs/METRICS.md` and `docs/DATABASE.md` — definitions and storage contracts.
6. `docs/HISTORICAL_MIGRATION.md` and `data/workbook_inventory.csv` — legacy spreadsheet inventory.

## Implemented foundation and Phase 1

- React/TypeScript web shell, ministry directory and reusable future-module placeholders.
- Read-only administration/integration setup, documentation reader and system status.
- Separate Express/TypeScript API; generated OpenAPI clients and response validation.
- PostgreSQL infrastructure metadata, versioned SQL and explicit migration commands.
- Replaceable auth contract, verified OIDC sign-in, invite-only admission and local roles.
- Administration for invitations/access, ministries and dated service occurrences.
- People/external-reference and immutable raw-source provenance schemas (empty).
- Auditable configuration changes, append-only audit history and raw-source RLS.
- Synthetic test-only principals, unit/API tests, optional database check, lint,
  TypeScript, formatting configuration, credential-pattern check and GitHub CI.

No dashboards contain invented operational numbers. Unknown values are not zero.
Admin-only historical workbook exploration/staging is available at
`/administration/imports`; see `docs/PHASE_2_IMPLEMENTATION.md` for the workflow,
limits, source fingerprint discrepancy and remaining release gates.
Planning Center authorization and source staging are available under
`/administration/integrations`; see `docs/PHASE_3_IMPLEMENTATION.md`.
The development Planning Center organization is connected; full live-data
acceptance remains outstanding. No published dataset or ministry formula exists. Only
invited, verified identities can create staff sessions. Public pages remain a
no-data preview; this is not a production-ready analytics release.

## Architecture and repository

Node.js 24, pnpm 10.26.1, React/Vite, Express, PostgreSQL and Drizzle.
See `docs/IMPLEMENTATION.md` for the recommendation to use the supplied
Vite/Express structure instead of the proposed Next.js stack, the alternatives,
documentation conflicts and postponed work.

```text
artifacts/northpoint-dashboard/  web application
artifacts/api-server/            TypeScript API
lib/api-spec/                    OpenAPI source of truth
lib/api-client-react/            generated React Query hooks
lib/api-zod/                     generated server response validation
lib/db/                         schema, pool and versioned SQL
workers/                        future worker boundary (not running)
tests/                          synthetic unit/API/database tests
docs/ and data/                 complete planning package
scripts/                        portable startup and repository checks
```

## Replit development

1. Dependencies: `pnpm install --frozen-lockfile`.
2. PostgreSQL uses the provided server-side `DATABASE_URL`; never print or commit it.
3. Apply the development foundation migration: `pnpm db:migrate:local`.
4. Use Run to start the managed API and Northpoint Dashboard web workflows. The
   workflows provide their ports and route prefixes. The Canvas workflow is not
   required for this application.
5. Preview `/`. Liveness: `/api/healthz`; database readiness: `/api/v1/readyz`.
   Readiness returns HTTP 503 when the database or foundation migration is missing.

## Independent local development

1. Install Node.js 24, pnpm 10.26.1 and access to ordinary PostgreSQL.
2. Run `pnpm install --frozen-lockfile`.
3. Copy `.env.example` to an ignored `.env`; replace database placeholders with a
   local/development database connection. Leave `AUTH_PROVIDER=disabled`.
4. Run `pnpm db:migrate:local`. This is development/CI only, not a production script.
5. Run **`pnpm start:local`**. It builds the frontend and API and serves both through
   a single origin at `http://localhost:5000` (or your configured `PORT`).
   Re-run after edits; this portability preview is not a hot-reload server.
6. No workers/scheduler or church/provider accounts are needed for Phase 0.

Managed preview uses separate routed services; independent preview uses the API's
optional static gateway. No browser code uses hardcoded API hostnames.

## Commands

| Command                                         | Purpose                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm lint`                                     | ESLint application/server/libs/tests/scripts                       |
| `pnpm typecheck`                                | Shared libraries and artifact TypeScript                           |
| `pnpm test`                                     | Unit and in-process API/permission tests (no provider credentials) |
| `pnpm test:db`                                  | Explicit development database/migration check                      |
| `pnpm format` / `pnpm format:check`             | Prettier; source specs/data/generated files excluded               |
| `pnpm secrets:check`                            | High-confidence credential patterns and tracked `.env` check       |
| `pnpm db:generate`                              | Generate versioned SQL after reviewed schema changes               |
| `pnpm db:migrate:local`                         | Apply pending migrations to development/local PostgreSQL           |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate typed clients and schemas                               |

GitHub CI installs dependencies, lints, typechecks, tests, replays migrations against
ephemeral PostgreSQL and checks credential patterns. CI configuration is not a claim
that a hosted CI run has passed. See `docs/PHASE_0_VERIFICATION.md`.

## Environment and security

`.env.example` documents safe defaults only. API startup also requires the
application-owned `PCO_TOKEN_ENCRYPTION_KEY` Secret: provision 32 cryptographically
random bytes encoded as 64 hexadecimal characters once, and retain it across
restarts/deploys. Missing or malformed keys stop startup; no replacement is generated.
Never commit or log the key. Required for database readiness:
`DATABASE_URL`. API startup requires `PORT`; managed frontend also requires
`BASE_PATH`. Auth is disabled by default and unsupported values fail validation.
`REPORTING_TIMEZONE` is fixed to `America/Chicago`; `LOG_LEVEL` controls structured
logging. `PROJECT_ROOT` optionally sets the repository root for document loading;
otherwise it is found by walking from the working directory.

No secrets or live records are required in source. Public specifications/readiness
must be reviewed before production release. See `docs/AUTH_SETUP.md` for provider
setup, the approved invite-only policy and remaining production security gates.

## Migrations and hosting

`lib/db/migrations/` contains the initial SQL and snapshot journal. Changes are
explicit, never startup DDL. A repeat migration invocation should make no changes.
Managed Replit production schema changes use its Publish review/diff workflow,
not custom production migration scripts or deployment-build DDL. Independent
hosting needs a separately reviewed release process. Keep only one schema
application mechanism per database. No production release is authorized by this setup.

## Current roadmap slice

Phase 4 provides protected adult attendance inside
`/ministries/service-programming` (legacy `/attendance` redirects), with immediate
manual entry, append-only corrections, deliberate historical promotion and a
home KPI. Auditorium attendees only; volunteers and stage participants excluded.
Online-only and intentionally off Sundays remain unrecorded, not measured zero.
Four-week and YoY comparisons remain unavailable pending policy approval.
Phase 2's January 4, 11 and 18 sample weeks have current
owner-confirmed approvals for both adult services (six exact-evidence approvals).
This is not independent two-source or full-year verification. The imported
workbook retains its accepted 2026-11-07 cutoff and original fingerprint caveat.
Planning Center authorization and organization confirmation are complete in
development. All three backfills/revision rescans and repaired relationships were
verified. Opt-in run-to-completion resumes partial runs; Admins can configure
Daily/Weekly/Custom frequency, custom intervals and start date, time, weekdays and time zone for
People → Services → Check-Ins (daily 1 AM Central by default). Unattended hosting,
first scheduled-cycle acceptance, deletion/retention rules and release acceptance
remain pre-production requirements, not blockers to Phase 4 development under
D-025. Later modules remain out of scope. No production release is authorized.

## Non-negotiable standards

No live personal/church data committed to source. Staff cannot access person-level giving through UI, API, exports, AI, logs, or notifications. Every metric exposes source, freshness, definition version, and date window. All integrations must be reconnectable from Admin > Integrations.

## Sources

- `NP Dashboard PRD.pdf` — 4-page project brief, provided November 2026.
- `NP Dashboard - 2026.xlsx` — legacy workbook; see extracted inventory and migration plan.
- User decisions from the requirements discussion (November 2026).
