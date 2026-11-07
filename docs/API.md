# API Contract Skeleton

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
