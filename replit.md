# Northpoint Dashboard 2.0

Phase 5 closed for development. The next implementation is **Phase 5B**. Read [the agent brief](docs/PHASE_5B.md), [code audit](docs/PHASE_5B_AUDIT.md) and [AGENTS.md](AGENTS.md) before building. Use React/Vite, Express and the existing PCO connection. The roadmap places scorecards in Phase 6.

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

- The development connection stages People, Check-Ins, Services, Giving and Groups. Phase 5 publishes authorized aggregate ministry results. The [decision log](docs/DECISIONS.md) records exact data and role boundaries.

- Vite/Express retained instead of introducing proposed Next.js; recommendation
  and alternatives in `docs/IMPLEMENTATION.md`, not recorded as owner-approved.
- Invite-only verified staff access; no inferred domain admission.
- Disabled auth means no authorized users, not a permissive fake admin.
- Operational routes fail closed; public preview is non-sensitive infrastructure/specs.

## Product

Staff see a previous-Sunday summary and can drill into the ministry that owns each number. The Phase 5B brief specifies the selected-average and YoY comparisons, YTD graphs and page-by-page changes. Use PCO throughout each metric’s recorded history. Use accepted, compatible workbook values for genuine gaps and as reconciliation evidence. Adult auditorium counts are manual, with accepted workbook history.

The existing development data, invite-only roles, Admin-only donor details and Check-In exception handling have specific permissions. Use the existing server-side calculation and publication paths for derived values. Minimized authorized development data and production readiness have distinct acceptance gates.

Admin-configurable scheduled refresh supports Daily, Weekly and Custom frequency with an effective start, timezone and weekdays. Unattended hosting, production privacy and release approval remain separate. Use existing staged facts and synthetic fixtures for Phase 5B. See [Phase 5 status](docs/PHASE5_STATUS.md) for the accepted baseline.

## User preferences

Follow approved decisions; preserve unknown/TBD rules. No invented ministry
calculations, numeric thresholds, branding, donors, attendance or role sessions.

## Gotchas

Re-run OpenAPI codegen after contract edits. Apply migrations only explicitly in
development/CI; no startup/deploy DDL. See `docs/AUTH_SETUP.md` before enabling auth.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
