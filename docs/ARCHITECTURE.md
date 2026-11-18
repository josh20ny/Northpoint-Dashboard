# System Architecture

The implemented dashboard runs on React/Vite, Express/TypeScript, generated OpenAPI clients and PostgreSQL. Start Phase 5B in those packages. PCO access, source resolution and chart calculations belong on the server. The topology below records the original planning proposal. See [implementation](IMPLEMENTATION.md) and the [code audit](PHASE_5B_AUDIT.md).

## Proposed topology
```text
Provider APIs / Forms / Spreadsheet uploads
          │
  OAuth connection manager + scheduled sync + webhooks (where supported)
          │
Raw source records (append provenance, schema version, sync run)
          │
Normalize + identity resolution + effective-dated service occurrence
          │
PostgreSQL domain tables → Versioned metric calculations → Aggregate snapshots
          │                         │
      Permission-scoped API          ├─ Forecasting jobs
          │                         ├─ Anomaly jobs
       Next.js UI                    └─ AI analyst read-only tools
                                    │
                          Report preview/approval → ClickUp
```

## Application boundaries
- Web (Next.js): presentation, forms, accessibility, auth session; no provider tokens, business calculations, raw model SQL.
- API (TypeScript route handlers or separate backend): RBAC, validation, paginated read models, changes and audit, signed server-side OAuth callbacks.
- Data workers (Python): provider ingestion, normalized record materialization, metrics, forecasting, anomaly detection, backfill.
- Database (PostgreSQL): strict schema migrations, versioned configs, PII separation and auditable historical facts.
- Queue/scheduler (implementation TBD): durable job claims, retries, backfill partitioning, idempotency keys and alert deduplication.

## Critical constraints
- Use `America/Chicago` calendar, Sunday week-ending and immutable timestamps in UTC.
- Historical effective dates for ministry/service schedules and venue capacity.
- Separate donor-restricted datasets and aggregate read models; no untrusted SQL exposed to users or LLM.
- Ingestion honors provider rate limits, pagination, webhook signature verification (if supplied), deletions, revoked tokens and modified-since incremental cursors.
- Use generated OpenAPI and typed client; transactional outbox for notifications.
- Source and metric provenance: data source, external ID, version, import batch, sync time, effective date, completeness.
- Track definition revisions and recompute affected summaries on config change.

## Environments
Local Replit dev with synthetic fixtures; isolated staging with test providers where possible; production with independent secrets, managed Postgres backups, scheduled jobs, monitoring. Git export, migration and deployment runbook must be portable.

## Threat model
OAuth token theft, cross-role IDOR, AI leakage from prompt injection/SQL, donor disclosures in exports/logs, spreadsheet formula injection, webhook spoofing, duplicate record ingest, cached report leaking admin data. Mitigations and verification in `SECURITY.md`.
