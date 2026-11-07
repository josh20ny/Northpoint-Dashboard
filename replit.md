# Northpoint Dashboard 2.0

Phase 0 foundation for a portable internal ministry analytics platform.
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

- Phase 0 only; do not advance roadmap phases without explicit approval.
- Vite/Express retained instead of introducing proposed Next.js; recommendation
  and alternatives in `docs/IMPLEMENTATION.md`, not recorded as owner-approved.
- No live accounts or production credentials in initialization.
- Disabled auth means no authorized users, not a permissive fake admin.
- Operational routes fail closed; public preview is non-sensitive infrastructure/specs.

## Product

Read-only foundation shell, ministry placeholders, integration scaffolding,
documentation reader, and infrastructure health. No operational metrics.

## User preferences

Follow approved decisions; preserve unknown/TBD rules. No invented ministry
calculations, numeric thresholds, branding, donors, attendance or role sessions.

## Gotchas

Re-run OpenAPI codegen after contract edits. Apply migrations only explicitly in
development/CI; no startup/deploy DDL. See `docs/AUTH_SETUP.md` before enabling auth.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
