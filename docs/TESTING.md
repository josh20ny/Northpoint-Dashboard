# Verification and Quality Gates

## Testing pyramid
- Unit: metrics with known input sets, timezones/DST, FY/week edges, engagement cumulative vs exact counts, 1–4 weighted averages, forecast interval/validation.
- Contract: PCO, YouTube, Mailchimp, ClickUp fixtures, OAuth renew, 429/403, pagination, canceled scopes, provider schema drift.
- Integration: import→normalize→metric→API; replay and deduplication, partial data and backfills.
- Role security: Staff/Leadership forbidden donor drilldown through endpoint/export/AI/report; Admin auditable; direct ID probes.
- End-to-end: login, KPI drilldown, scorecard form, config preview/publish, forecasting controls, report preview/send test.
- Migration reconciliation: selected full weeks/year snapshots by source cell and source-of-truth evidence.

## Shipping gates
Each phase: schema migration reversible/forward-safe, CI green, synthetic fixture walkthrough, permission review, docs updated, data lineage present, no placeholder numbers presented as real, owner signoff for metric definitions.

For the [Phase 5B acceptance walkthrough](PHASE_5B.md#acceptance-walkthrough), test partial PCO against complete workbook history, independent service/Sunday deduplication, historical coverage, snapshots, chart windows, YoY colors, entry and Admin permissions. Explicitly execute `tests/ministry-data-db.test.ts` and `tests/ministry-checkin-source-db.test.ts` with `RUN_DATABASE_TESTS=1` on isolated PostgreSQL. The existing `test:db` file list omits them.
