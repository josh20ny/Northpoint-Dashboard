# Authentication setup and explicit disabled boundary

## Current behavior
`AUTH_PROVIDER=disabled` is the only accepted runtime value. No sign-in endpoint,
session creation, role selector, fake Admin account, password form or user records
exist. Requests cannot supply a role through headers, JSON, URLs or cookies.
The public Phase 0 preview has only project specs and non-sensitive health/status.
All operational `/api/v1` requests are denied. Provider auth is intentionally
incomplete, not claimed secure because the shell exists.

## Replaceable contract
`AuthProvider.authenticate(request)` must return `null` or a server-verified
principal with a trusted subject, verified email, issuer/provider and locally
assigned role. Replit OIDC and Google Workspace can implement this contract later;
authorization code must depend on the contract, not browser claims.

## Exact next configuration steps (before enabling)
1. Choose initially Replit OIDC or approved Google Workspace OIDC. Replit OIDC can
   use verified `openid-client` authorization code + S256 PKCE flow; the reference
   implementation is available in the project's authentication guidance.
2. Confirm an owner-approved invite/domain admission policy. No actual Northpoint
   Google Workspace domain or initial Admin subject was supplied; do not infer
   one from public website names or this project's owner.
3. Provision server-only issuer, client identifier, registered absolute callback
   and logout URLs and required secrets through the secrets manager. Google may
   require a client secret; never put it in browser variables.
4. Add versioned user, role, invite, session and audit migrations (Phase 1).
   Link provider+subject uniquely. Assign roles in the database, never from user
   input or an unverified email. Verify email and active invite/admission before
   issuing a session. Re-check account status and roles on requests.
5. Use a maintained OIDC library to verify signature, issuer, audience, state,
   nonce, expiration and PKCE. Strictly allowlist redirect/callback origins.
6. Use a shared durable server session store, secure/httpOnly/sameSite cookies,
   expiry/rotation/revocation, session fixation protection, logout and
   CSRF/origin checks for mutations. Do not store identity tokens in localStorage.
7. Add provider and cross-role API/query/export/report/AI/cache tests, audit
   access and admission denial tests. Review MFA and privacy before real records.
8. Only after verification add the adapter, update allowed environment values
   and replace `disabledAuthProvider` composition. Do not enable by just setting
   a flag. The frontend must show the verified server session, not a fake role.

No live church authorization is required or requested in Phase 0. The test
principals use `example.invalid` and exist solely inside automated tests.
