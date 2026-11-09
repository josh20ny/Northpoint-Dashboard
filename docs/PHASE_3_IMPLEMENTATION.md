# Phase 3 — Planning Center

## Authorized scope and implementation plan

The owner approved Phase 3 and a direct Planning Center OAuth connection after
catalog discovery found no built-in connector. People, Services and Check-Ins
are the only requested product scopes. Giving and Groups are excluded.

Affected components: generated OpenAPI contracts, Admin > Integrations, server-side
OAuth and source adapters, additive connection/flow/sync/projection tables,
private raw revision history, and synthetic tests.

Migration: additive development migration only. No workbook or review records are
changed. No operational metric is published.

Risks: product-scoped authorization is broader than field-level read access;
server adapters therefore use GET-only allowlisted endpoints and sparse fields.
Provider permissions can change after consent. Tokens require dedicated encryption
and rotation. Pagination is not a transactional snapshot of a changing provider.
Missing records must not be treated as deleted or zero.

Verification: OAuth state/PKCE/session binding, encrypted token tamper checks,
scope and organization confirmation, SSRF/redirect protection, pagination,
rate limits, expired credentials, revision replay, partial-page rollback,
Admin-only routes and database policies. Real connection checks require the
owner's registered OAuth application and explicit consent.

## Delivery status

The Phase 3 connection and opt-in background page executor are implemented.
Migrations are applied in development only. Provider configuration, consent and
organization confirmation have been completed in development. Complete backfill
coverage, replay validation and real-data acceptance remain outstanding;
Phase 3 is not complete or approved for a live-data release.

### Administration flow

1. Open **Administration → Integrations** as an invited, authenticated Admin.
2. A Planning Center **Organization Administrator** registers a **confidential**
   application at https://api.planningcenteronline.com/oauth/applications.
   Use the exact callback shown on the page:
   `AUTH_ORIGIN` + `/api/v1/admin/planning-center/callback`.
3. Configure `PCO_CLIENT_ID`, `PCO_CLIENT_SECRET` and
   `PCO_TOKEN_ENCRYPTION_KEY` in server Secrets. The encryption key is a
   cryptographically random 32-byte value represented as 64 hexadecimal
   characters. Generate privately and store securely; never paste values in chat,
   documentation, source, screenshots or logs. Do not replace the encryption key
   while encrypted tokens exist without an explicit migration/reconnect plan.
   This is application-owned infrastructure, not a Planning Center-issued value.
   `PCO_TOKEN_ENCRYPTION_KEY` is the only supported name; do not configure a second
   `TOKEN_ENCRYPTION_KEY` alias. The API refuses to start if this key is missing or
   is not exactly 64 hexadecimal characters, even before OAuth is configured.
   Startup never generates or replaces it. AES-256-GCM encrypts the access and
   refresh tokens together before PostgreSQL persistence; decryption occurs only
   on the server for provider requests, refresh or revocation.
4. Click **Connect Planning Center**. Consent requests exactly `people services
   check_ins`. These are product scopes, not provider read-only scopes; our
   adapters only perform allowlisted GETs. No Giving/Groups/OIDC scope is requested.
5. Review the returned organization name and ID, acknowledge that it is correct,
   and click **Confirm organization**. The server checks each actual product
   collection before enabling ingestion. No records are ingested by confirmation.
6. Start **Backfill** for a product. Choose **Run to completion** to process
   its saved queue automatically on the API server. Existing partial runs resume
   without restarting. **Pause automatic processing** retains every committed
   page and allows manual advancement or later resumption.
   Alternatively, **Process next page** performs one bounded
   request and atomically persists its page, source revisions, normalized source
   references, counts and continuation queue. Reloading resumes from the saved
   queue. Requests are serialized; two administrators cannot claim the same page.
7. Complete a backfill before **Incremental** for that product. The initial
   incremental strategy is a paginated rescan with content-addressed revision
   insertion, not a provider delta-cursor API. Unchanged revisions are reused.
   Reads reflect only the records visible to the granting user and are not a
   transactionally consistent provider snapshot.
8. **Cancel sync** retains committed history. **Disconnect** must successfully
   revoke the refresh token at Planning Center before clearing local credentials
   and cancelling open runs. Disconnect before reauthorizing, including a pending
   or expired connection. Retained source data is never deleted by disconnect.

There is **no recurring sync scheduler** in this slice. Automatic processing only
executes an existing run after an authenticated Admin explicitly enables it.
A durable database flag and Admin delegation survive API restarts. The executor
processes at most one page per tick with a two-second delay between attempts;
the same transaction-scoped advisory lock used by manual/Admin operations
coordinates replicas and serializes pages. No in-memory-only claim or browser
loop owns progress. Each page and its continuation commit atomically.

The delegating user must remain an active Admin. Revoked authority pauses work
and is audited. Pause, cancel and disconnect take effect between page transactions.
The current page may finish before a requested pause is acknowledged. Terminal
runs disable automatic processing. Closing the tab is safe, but the API must be
running; a sleeping workspace does not process pages. On restart, enabled work
resumes without starting another backfill.

Rate-limit responses preserve the queue and expose the earliest retry time;
the worker waits until then. Transient failures retry from the saved page.
Authorization/permission errors require reconnecting; malformed data fails the run
without committing part of a page. Last successful sync is not advanced on failure.

### Ingested coverage and boundaries

- People: account-scoped person source IDs, created/updated timestamps and source
  status/inactivation. No names, birthdates, contacts or medical/background data.
- Services: accessible service types, their plans, and dated plan times. Source
  titles/times are preserved; no ministry mapping or presumed 9:00/11:00 schedule.
- Check-Ins: accessible events/check-ins and included event periods/times/locations,
  source attendance kind and person relationships. One-time guests may have no
  person reference; cross-product person IDs are not automatically merged.
- Sparse selected-field resource records are retained as immutable raw revisions,
  not full HTTP response archives. The normalized source projection references its
  raw revision and latest observing run. Unknown fields/dates do not become zero.
- No numeric attendance definition, deduplicated headcount, serving/engagement
  definition, canonical identity merge or Staff-facing person endpoint is added.
- Missing records do not imply deletion. Explicit source archive/inactive markers
  are preserved. Deleted-object discovery/webhook validation remains future work.
- The status endpoint returns configuration presence, organization metadata and
  run counts only. Tokens, payloads and personal records are never in its response.

### Relationship-field repair

The initial sparse fieldsets selected attributes only. JSON:API fieldsets also
filter relationship fields, so completed runs could retain related included
resources without retaining the links connecting them. Raw-source revision links
were intact; those links do not establish event/person/time/location coverage.

Requests now explicitly select CheckIn person/event_period/event_times/locations,
EventPeriod event, EventTime event/event_period, and Plan service_type identifiers.
These selections apply again to every continuation request and included resource.
Missing requested relationship data fails the page with an unsupported-source-shape
error rather than silently saving empty links. Explicit null to-one relationships
(including one-time guest person links) and empty to-many arrays remain valid.
Person resources are not included and product-specific person IDs are not merged.
PlanTime has no documented plan relationship; its parent remains in sourceCollection.

Existing immutable revisions are not rewritten or removed. An Admin must run
**Incremental → Run to completion** for Services and Check-Ins after this fix.
The rescan creates revisions when linkage changes and updates the existing source
entity by identity; it does not duplicate entities. People does not need a repair
rescan because no person relationships are requested. Expect a larger revision
count on the first repair rescan; that is not evidence of duplicate people or visits.
Verify stored linkage after those runs before accepting metric coverage.

References: Planning Center's JSON:API guide and the JSON:API 1.0 sparse-fieldset
contract, plus the pinned CheckIn/EventPeriod/EventTime and Services Plan resource
documentation:
- https://api.planningcenteronline.com/docs/overview/json-api
- https://jsonapi.org/format/1.0/#fetching-sparse-fieldsets
- https://api.planningcenteronline.com/docs/apps/check-ins/versions/2025-05-28/vertices/check_in
- https://api.planningcenteronline.com/docs/apps/check-ins/versions/2025-05-28/vertices/event_period
- https://api.planningcenteronline.com/docs/apps/check-ins/versions/2025-05-28/vertices/event_time
- https://api.planningcenteronline.com/docs/apps/services/versions/2018-11-01/vertices/plan

### Security and verification

OAuth state is random, hashed, short-lived, session-and-Admin-bound, and consumed
before token exchange. PKCE uses S256 and an encrypted verifier. Tokens use
AES-256-GCM with purpose/account-bound authenticated data. Refresh token rotation
is persisted before processing a source page; a page failure does not roll it
back. A crash during remote refresh/local persistence can still require reconnect.
OAuth callback and return paths are fixed, and secrets-bearing requests cannot
follow redirects. Provider pagination cannot change origin, collection or sparse
fields. Provider error bodies and callback query strings are not logged.

All connection/flow/sync/projection tables have forced Admin RLS. Existing raw
append-only protection is retained; connection/source/run deletion is blocked.
Every management operation checks current active Admin membership and uses
the existing CSRF/session boundary. Status/source staging access is audited.
Database readiness includes the connector protection metadata.

Synthetic verification: 96 unit/API/offline tests and 32 rollback-only database
tests pass; typecheck/lint checks cover the updated app. Database fixtures cover
all three products, pagination/replay, failed pages, scope/org/state/session/PKCE,
refresh success/rejection, 401/429/500, revocation failure and retained history,
and a non-owner role's RLS denial. No real provider credentials are needed.
Signed-in browser controls and real Planning Center consent/permissions are not
yet verified. The existing test OIDC setup was blocked during the preceding
review feature; no authentication bypass or real-user impersonation was added.

### Remaining Phase 3 exit checks

- Owner configures the confidential OAuth application and grants consent.
  Completed in development; no production release authorization is implied.
- Verify actual organization permissions and sparse-field/API-version compatibility.
- Review real backfill coverage, page counts and replay idempotency for each product.
- Agree on refresh cadence, then add durable unattended scheduling/claims and
  appropriate delta filtering where the provider documents/supports it.
  Explicit run-to-completion processing is implemented; recurring run creation
  remains deferred.
- Validate deletion discovery, retention and any broader identity handling before
  claiming full synchronized coverage. No live records should be committed to Git.

### Automatic processing verification

Synthetic executor/control tests cover explicit delegation, pause without cursor
loss, manual/automatic exclusion, retry deadlines, transaction-lock contention,
rollback, safe error logging, restart selection and current Admin authority.
The existing database fixtures were extended to cover automatic completion,
pause/resume, rate limits and authority revocation. Run those fixtures only in an
isolated database without a real Planning Center connection; do not overwrite a
live connection or use it for synthetic tests. Signed-in controls and complete
real-account background processing still require live acceptance.

### Provider documentation checked

- Authentication, scopes, PKCE, refresh and revoke:
  https://api.planningcenteronline.com/docs/overview/authentication
- Dynamic rate limits and Retry-After:
  https://api.planningcenteronline.com/docs/overview/rate-limiting
- People Person/Organization, version `2025-11-10`; Services ServiceType/Plan,
  version `2018-11-01`; Check-Ins CheckIn/Event, version `2025-05-28`, in
  https://api.planningcenteronline.com/docs .
