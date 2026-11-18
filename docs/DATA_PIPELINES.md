# Ingestion, Reconciliation and Freshness

For Phase 5B, classify PCO coverage per measure, population, scope, period and date. Normalize and calculate from staged PCO facts first. Compare the accepted workbook in reconciliation and select it only for a verified gap with compatible semantics. Keep discrepancy, as-of date and provenance available to authorized reviewers. See the [source selection table](PHASE_5B.md#source-selection).

## Pipeline pattern
1. Admin authorizes integration and confirms account/scope; credentials encrypted.
2. Create scoped sync run with idempotency key; fetch paginated raw records, obey retry-after and rate quotas.
3. Stage raw records with source ID, revision, fetch time and source timestamp; do not destroy originals.
4. Normalize fields/units/timezone, resolve links to canonical people and service occurrences.
5. Validate duplicates, negative counts, missing mappings, partial data, conflicting identities and structural break days.
6. Atomically publish new derived snapshots only after successful completeness checks; preserve previous valid snapshot on partial failure.
7. Recompute dependent metrics/forecasts when late-arriving history or rules change.
8. Expose stale and incomplete badges and operator alerts; retain sync-run audit.

## Proposed schedules (not finalized)
PCO Check-Ins and Services nightly plus post-Sunday refresh; giving daily; campaigns/social daily; GA4 daily with backfill for late attribution; manual forms event-triggered; weekly reports after reconciliation cutoff. Account for source latency and rate limits; final schedule set per provider.

## QA / acceptance
Every connector has fixture payloads, pagination and 401/429/500 tests, revoke/reconnect, replay idempotency, backfill, deletions, identity conflict handling and historical coverage tests. All measures carry source and freshness. Alert if mandatory Sunday source is stale before weekly distribution.
