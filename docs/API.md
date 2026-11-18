# API Contract Skeleton

## Phase 5B contract to implement

Extend the authenticated aggregate reads used by Home and ministry detail. Return the report Sunday, lead measure, service and total values, source coverage, dated roster as-of, selected average/denominator, aligned YoY and YTD actual/prior/eight-week points as applicable. The UI formats the same values for cards, charts and dated history. Publish schemas in `lib/api-spec/openapi.yaml` before regenerating the client and validators. Preserve the weekly adult save/correction contract. Remove endpoints for obsolete controls only after checking their other consumers. Verify Staff/Leadership responses contain no person-linked fields. The [brief](PHASE_5B.md) defines acceptance.

## Phase 4 implemented surface

`GET /api/v1/attendance` additionally accepts `averageWeeks` (integer 1–52,
default 4). `rollingAverage` contains bounds, value/null, recorded denominator
and excluded dates/reasons; `yearComparison` contains status, both reference
weeks/values, change/percent/null, alignment and aggregate source provenance.
Comparison lookback is independent of the requested visible history start;
lookback revisions are not leaked into that visible history. The legacy
`fourWeek` and `yoy` text fields remain computed compatibility summaries.
An accepted 2025 workbook total can supply YoY without granting Staff access to
raw import cells.

`POST /api/v1/attendance/week` is the normal quick-entry route. Invited
Staff/Leadership/Admin submit one request UUID, definition/date, first and
second counts/statuses with their expected revision IDs, and an optional note.
It returns `{first,second}` saved revisions. The operation is all-or-nothing;
identical retries return the same records. Automatic service linkage is
server-owned, with date/slot-only observations where timing is unresolved.
It never creates fictitious dated services. The older per-service endpoint
remains compatible but is no longer the normal manual-entry UI.

Accepted provided-workbook history now bulk-imports through a trusted
management job and automatically when its approved adult mappings are staged.
The source-level owner instruction replaces routine per-week publication.
Legacy historical preview/promotion endpoints remain compatible for diagnostic
and unaccepted-source workflows; they are no longer the normal Attendance UI.

Protected `GET /api/v1/attendance` accepts optional Sunday `start`/`end` (up to
two years) and optional historical `definitionId`. It returns weekly totals,
separate known subtotals, quality, safe observation revisions and definition/
freshness metadata. Current revisions are always included even when older edit
history is bounded. It exposes no workbook originals, private paths or provider
payloads. Previous versions are read-only.

`POST /api/v1/attendance` allows authenticated Staff/Leadership/Admin, requires
Origin/CSRF, a request UUID and exact expected revision, and saves immediately.
Recorded actuals require an eligible configured service, Sunday date and
nonnegative integer; unrecorded entries have null counts.

Admin-only definition creation and historical preview/promotion are under
`/api/v1/admin/attendance`. Promotion requires current evidence hashes, explicit
source-authority acknowledgement and a basis note; it is not automatically
performed by workbook review. All responses use `no-store`. Generated OpenAPI
remains the source of truth for request/response fields.

## Phase 2 implemented surface
All `/api/v1/admin/imports` routes require a current Admin session and `no-store`.
Mutations additionally require exact Origin and session-bound `X-CSRF-Token`.
The generated OpenAPI contract defines upload (raw octet-stream XLSX), supplied
workbook cataloging, batch listing/detail, paginated cells/rows, immutable
mapping versions/review/staging, withdrawal/restore, reports and evidence-bound
week approval. Original XLSX and all five report exports are also protected.
No generic object-storage or raw payload route is exposed.

Inputs include an explicit snapshot date and mapping semantics; there is no
automatic source-authority inference. `409` marks state/review conflicts,
`400` invalid or unsupported input, and `503` unavailable private storage.
No operation publishes normalized observations or operational metrics.

## Phase 1 implemented surface
The runtime contract is `lib/api-spec/openapi.yaml`. Auth endpoints are
`GET /api/auth/user`, `GET /api/login`, `GET /api/callback`, and CSRF-protected
`POST /api/logout`. `GET /api/v1/me` requires a verified local session.
Admin-only `/api/v1/admin/workspace?page=1` returns 50 records per collection and
`hasMore`; mutation routes manage invitations, account role/status, ministries
and dated services. All mutations require exact Origin and `X-CSRF-Token`.
Responses never include stored session/provider tokens or raw source payloads.
Operational responses are `no-store`; configuration lists expose `asOf`/`quality`.

The future endpoints in the skeleton below are not implemented merely because
they are listed. Giving remains Admin-guarded and unavailable, including aggregate
giving until suppression policy is approved; individual attendance remains unavailable.

Version endpoints under `/api/v1`; generate typed clients and OpenAPI. All responses include `as_of`, `quality`, and relevant definition versions. Default-deny permissions enforced by middleware and data-access layer.

| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Verified identity/role and capabilities |
| GET | `/ministries` | Accessible ministry list |
| GET | `/metrics?slug=&ministry=&start=&end=&grain=` | Permission-safe series with target/forecast refs |
| GET | `/metrics/{slug}/definition` | Formula and version history |
| GET | `/services/{id}` | Service plan, attendance, evaluation, historical notes |
| GET | `/attendance/people?filters=` | Audited individual attendance view |
| GET | `/giving/summary` | Permission-safe giving aggregates |
| GET | `/giving/donors` | Admin only, audited |
| GET | `/engagement/transitions` | Four-dimension cohorts; suppressed aggregates |
| GET | `/journeys?funnel=` | Permission-scoped cohorts |
| POST | `/manual/submissions` | Validated manual observations |
| GET/POST | `/admin/integrations` | Connect, status and revoke; callbacks separately |
| GET/POST | `/admin/metric-rules` | Versioned draft/preview/publish |
| GET/POST | `/admin/scorecards` | Versioned templates |
| POST | `/admin/imports` | Validate and stage batch; explicit publish |
| GET/POST | `/forecasts` | Series and queued forecasting jobs |
| GET/POST | `/reports` | Templates/previews/delivery |
| POST | `/analyst/query` | Server-side tool-permissioned analysis |

Document schemas, pagination, rate limits, errors, correlation IDs and explicit audit fields with implementation. No generic SQL endpoint.
