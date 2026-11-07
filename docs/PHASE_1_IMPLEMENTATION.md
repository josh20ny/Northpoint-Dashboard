# Phase 1 implementation scope

## Scope and boundaries
User-authorized Phase 1: verified identity, local Staff/Leadership/Admin roles,
invite-only admission, PostgreSQL models for people references, ministries,
dated services, raw source provenance and append-only audit history.
No imports, live source integrations, giving transactions, person-level record
views, metric formulas, scoring, or later roadmap phases.

Affected components: database schema/migrations, API authorization and auth
adapter, typed API contracts, shared browser auth, administration screens,
test fixtures and documentation.

Anticipated migrations: additive user/invitation/session/login-flow tables,
ministries, service occurrences, people/external identity references, raw source
revisions, audit events; immutability triggers and restrictive raw-source policy.
No destructive migration or legacy source changes.

## Owner-confirmed policy
Invite-only admission; first Admin invitation is provisioned directly in the
development database for the owner-supplied email, not stored in source/docs.
No inferred domain rule and no default role assigned on open signup.
Replit OIDC is allowed initially under approved D-004, behind a replaceable adapter.

## Risks and checks
Verify signature, issuer, audience, expiration, state, nonce and S256 PKCE using
the maintained OIDC library. Reject missing/unverified email, expired/revoked
invites, cross-provider email collisions and inactive users. Recheck local roles
and status per request; revoke sessions on role/status changes. Use secure
httpOnly cookies, fixed callback origin, CSRF/origin checks, hashed session handles,
short-lived single-use login flows, no stored provider tokens, no unsafe redirects.

Tests cover role matrix, protected direct URLs, headers/body spoofing, CSRF,
admission/replay/expiry, local-date consistency/DST, transaction/audit rollback,
last-admin protection, raw-source access and migration replay using synthetic
identities only. No provider credentials required for CI.

## Implemented
- Additive migration for user roles/status, invitations, hashed sessions,
  short-lived OIDC flows, ministry/service occurrences, people/external references,
  revision-keyed raw provenance and audit history. No real people/source records.
- PostgreSQL guards preserve audit/raw history; raw RLS defaults to no rows unless
  the trusted application transaction sets the Admin role. No raw payload API.
- Server-side authorization and transactional Admin re-checks; CSRF-protected
  mutations; concurrent last-active-Admin guard and session revocation.
- Admin workspace creates/revokes invitations, updates account access, creates/
  edits ministry active dates and dated services, and reads paginated audit history.
  Records are not hard-deleted through UI; ministry active-to dates preserve history.
- Shared browser auth reads real server state, clears caches before publishing
  identity/role transitions, refreshes sessions on focus/periodically, and exposes
  no fake role selector. Existing dashboard layout/brand is preserved.
- Generated OpenAPI contracts and React Query mutations; unknown capacity remains
  null. Chicago service dates must agree with the timestamp at the database level.

## Verification completed in development
- `pnpm test`: 40 unit/API tests passed; 9 opt-in database tests skipped there.
- `pnpm test:db`: 9 database tests passed. All unit database fixtures use outer
  transactions and roll back, including append-only audit fixtures.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: passed.
- Versioned migrations applied successfully twice (second run is a journal no-op).
- `pnpm secrets:check`: passed its limited credential-pattern check; not a full audit.
- Browser OIDC test with synthetic signed claims and an invited synthetic Admin:
  sign-in, ministry creation/reload, service creation with unknown capacity,
  unchanged-time service edit/reload, Staff invitation/revocation, audit display,
  responsive mobile navigation, logout, direct protected API 401 and restricted UI.
- Synthetic browser service/ministry removed after testing; test Admin suspended,
  its sessions revoked. The suspended synthetic actor and audit records remain to
  preserve audit referential integrity. The real owner's invitation was untouched.
- Public Replit OIDC discovery advertises `email_verified`. An actual owner session
  was not created by the agent; their pending invitation requires their own login.

## Remaining gates and exclusions
Hosted CI, production deployment, real-owner sign-in, MFA policy, least-privilege
runtime database role, independent backup/restore and privacy/retention review
are not claimed complete. The development database role is privileged; raw RLS
was separately verified using a non-owner test role inside a rollback transaction.
Audit triggers do not protect against a database owner deliberately altering DDL.

The migration includes custom PostgreSQL triggers/policies/constraints in addition
to Drizzle-generated tables. Any hosting/schema transfer must preserve and verify
these objects; readiness reports not-ready if the Phase 1 history/RLS guards are
missing. Do not assume a table-only schema push is equivalent to the migration.
No startup DDL or production migration script was added.

Phase 2 historical workbook analysis/mapping has not started. No metrics, live
integrations, person-level attendance or giving views are enabled by Phase 1.
