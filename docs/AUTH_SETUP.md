# Phase 1 authentication and admission

## Implemented boundary
The API supports `AUTH_PROVIDER=disabled` (portable, fail-closed preview) or
`AUTH_PROVIDER=replit` (server-side OIDC with local invite-only admission).
Google Workspace remains a future adapter, not an enabled integration.
There is no password form, self-assigned role, developer header, or fake Admin.

The owner approved invite-only admission. The first Admin invitation is stored
only in the development database for the owner-provided email. Invitations expire
after seven days. They reserve access; **no invitation email is sent**. Share the
dashboard URL separately. Expired invitations can be replaced by an administrator.

## Sign-in and authorization
1. Log in redirects to the identity provider. A ten-minute server-stored flow binds
   state, nonce and S256 PKCE to an opaque secure cookie. Callbacks are single-use.
2. `openid-client` verifies signature, issuer, audience, expiration, state, nonce
   and code exchange. `email_verified` must be the boolean `true`. Missing or
   unverified email fails closed; do not relax this if a provider omits the claim.
3. A new identity must match an unexpired/unrevoked invitation by normalized email.
   The role comes from that invitation, never browser input. Provider+subject is
   unique. An email already bound to another subject/provider is not relinked.
4. Existing users must still be active and retain the invited verified email.
   Local role/status are loaded from PostgreSQL on every authenticated request.
5. Session handles are random, stored as SHA-256 hashes, and sent only in secure,
   httpOnly, sameSite=Lax cookies scoped to `/api`. No provider access/refresh tokens
   are persisted. Session expiry is the earlier of ID token expiry and eight hours.
6. Mutations require the exact configured Origin and a session-bound CSRF token.
   Account role/status changes revoke all that account's sessions. Local Log out
   revokes its session; it does not log the user out of their identity provider.
7. Admin operations check role both at the route and again inside the database
   transaction. Last-active-Admin removal is blocked under a shared lock.

Authenticated Staff/Leadership cannot read administration, raw source payloads,
or giving records. Even aggregate giving stays disabled pending suppression
policy. Person-level attendance/child/group/serving views are not implemented.
Unimplemented reports, exports and AI routes expose no operational records.

## Runtime configuration
- `AUTH_PROVIDER=replit`
- `AUTH_ORIGIN`: exact HTTPS origin, no path or trailing slash. It fixes callback
  construction; request Host/forwarded headers never choose the redirect origin.
- `REPL_ID`: Replit-provided OIDC client identifier.
- `DATABASE_URL`: server-only database secret.

Development has the owner-confirmed preview origin configured. Production is not
configured or authorized here. Obtain the actual published URL before configuring
production callback origins. Independent hosting needs an approved OIDC provider
registration/adapter; disabled preview still runs without Replit auth.

The OIDC test harness may override `ISSUER_URL` only in non-production. This does
not bypass signature verification or invitation checks. Production always uses the
fixed issuer. No test identities or invitations are seeded on server startup.

## Operating limits and production gates
Login requests have a conservative per-process cap of 60 per ten minutes without
retaining IP addresses; multi-instance deployment needs a shared limiter. Expired
login flows are pruned on login. Sessions expire logically; a reviewed retention/
cleanup job, MFA/provider policy, backups/restore, least-privilege database role,
and production security review remain deployment gates.

Audit rows record action, actor/target opaque IDs, outcome and timestamp, not email
snapshots or payload contents. Database triggers reject audit/raw history changes,
but database owners/superusers can alter DDL; this is not external tamper-proof
storage. Raw RLS is defense in depth only with a non-owner, non-superuser runtime
role. Person-level/financial data must not be loaded before privacy review.
