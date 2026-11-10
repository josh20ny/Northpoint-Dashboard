# Northpoint Dashboard 2.0

Phase 4 adult-attendance workspace for a portable internal ministry analytics platform.
Read `AGENTS.md` and `docs/PROJECT_INITIALIZATION.md` before implementation.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- Managed frontend: `artifacts/northpoint-dashboard: web`; use Run/managed workflows.
- `pnpm start:local` — independent single-origin build-and-run preview outside Replit.
- `pnpm lint`, `pnpm test`, `pnpm test:db`, `pnpm secrets:check` — quality checks
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm db:generate`, `pnpm db:migrate:local` — versioned development migrations
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

See `README.md` for the repository map; `docs/IMPLEMENTATION.md` for boundaries.
All supplied planning documents are retained under their original paths.

## Architecture decisions

- Phase 3 authorized for Planning Center People, Services and Check-Ins.
  Giving, Groups and operational metric publication remain out of scope.
- Vite/Express retained instead of introducing proposed Next.js; recommendation
  and alternatives in `docs/IMPLEMENTATION.md`, not recorded as owner-approved.
- Invite-only verified staff access; no inferred domain admission.
- Disabled auth means no authorized users, not a permissive fake admin.
- Operational routes fail closed; public preview is non-sensitive infrastructure/specs.

## Product

Foundation shell, invite-only OIDC/local roles, Admin access/ministry/service
configuration, audit log, historical workbook exploration/raw staging,
reference schemas, documentation and health. Planning Center OAuth and restricted
source ingestion support manual pages or opt-in run-to-completion on the API.
Admins must be able to adjust scheduled refresh timing and frequency.
The frequency choices must be Daily, Weekly and Custom. Custom supports every N
days or weeks (and hours), anchored to a start date; weekly patterns select weekdays.
The scheduler defaults to daily 1 AM Central; start time and time zone remain editable.
It processes People, Services and Check-Ins sequentially and requires a running API. Reliable unattended hosting is
still outstanding. No operational metrics or individual attendance/giving views.
The owner chose to keep development only; unattended production hosting is deferred.
Phase 3 is closed for development under D-025; Phase 4 does not wait
for fresh lifecycle scans, a scheduled-cycle/restart exercise, or real credential-
failure/reconnect tests. These remain unverified live and required before
production. Keep the schedule disabled until ready to demonstrate it, treat
lifecycle absence as unassessed, and never assume unattended freshness. This
closeout does not authorize metric publication, deletion, or credential changes.

Phase 4 implements protected adult attendance at `/attendance`, a home KPI,
immediate manual saves and immutable corrections. Count seated auditorium
attendees only; exclude volunteers and people on stage. Online-only/intentionally
off Sundays are unrecorded, not zero. Manual entries need no approval.
Admin setup selects the adult ministry; service slots must be explicitly mapped,
not inferred from old headers. The owner subsequently accepted the provided
workbook as the historical source and rejected per-week publication steps.
Accepted mapped history bulk-imports with immutable batch/fingerprint authority
and honest system attribution; preserve manual corrections and unrecorded dates.
No fabricated Admin approval is needed. See the superseding decision in
`docs/DECISIONS.md`.
Four-week/YoY policies are unapproved, so numeric comparisons stay unavailable.
See `docs/PHASE_4_IMPLEMENTATION.md` for verification and acceptance limits.

## User preferences

Follow approved decisions; preserve unknown/TBD rules. No invented ministry
calculations, numeric thresholds, branding, donors, attendance or role sessions.

## Gotchas

Re-run OpenAPI codegen after contract edits. Apply migrations only explicitly in
development/CI; no startup/deploy DDL. See `docs/AUTH_SETUP.md` before enabling auth.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
