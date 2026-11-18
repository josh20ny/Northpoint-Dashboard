# Logical Database Model (proposed; validate before migration generation)

Phase 5B retains immutable source records, workbook lineage, manual revisions and role restrictions. First inspect the existing publication and metric-value tables. Add versioned derived coverage or aggregates only where the existing schema cannot represent a requested measure. See [Phase 5B](PHASE_5B.md#source-selection).

## Phase 4 implementation note

Comparison migrations 0016/0017 add
`np_attendance_year_reference(date)`: an authenticated, aggregate-only
security-definer projection of accepted 2025 in-person totals from the existing
imported workbook. It checks active source/fingerprint and year/header/value
mapping, restores caller context, and leaves raw-source RLS unchanged.
It does not manufacture 2025 per-service attendance revisions.

Migration 0015 adds immutable Admin-only `workbook_source_authorities`, tied to
the source batch and fingerprint. Owner-directed automated workbook revisions
may have null actors and `workbook_authoritative` provenance; this is a system
import, not a fabricated authenticated review. Manual revisions still require
non-null actors. Source validity accepts authorized workbook lineage without
individual weekly review rows. No raw-source RLS is relaxed.

`attendance_definitions` binds the adult ministry, effective date and immutable
definition version. `attendance_revisions` stores aggregate manual/historical
observations with status, count, source, actor, immutable occurrence snapshot,
idempotency key and prior-revision link. Partial unique root and successor indexes
prevent duplicate revision chains. `attendance_lineage` retains Admin-only
workbook batch/evidence/mapping references.

All three have forced RLS and immutable-history guards. Staff/Leadership read
safe attendance facts and insert their own authenticated edits; definitions and
historical lineage writes are Admin-only. A narrowly scoped SECURITY DEFINER
function returns only historical validity, restores caller role settings and
never returns raw source records. Custom protection objects must survive schema
transfers. Migrations 0013–0014 are development-only and additive.

Calculations are read-time and deterministic; no metric cache or snapshot table
requires invalidation. Withdrawn/replaced workbook evidence and changed service
meaning yield invalidated totals. Previous definition versions remain explicitly
selectable, not silently replayed into newer definitions. Manual counts need no
approval under the owner's Phase 4 rule. No fictitious people are created.

## Phase 3 implementation note

`pco_connections`, `pco_oauth_flows`, `pco_sync_runs` and `pco_source_entities`
implement a single-organization direct connector, with forced Admin RLS and
additive migration `0007`. Private token ciphertext uses AES-256-GCM with a
dedicated key. OAuth flow secrets expire and are consumed once, bound to the
authenticated Admin session. Source revisions reuse the immutable
`raw_source_records` table; normalized projections reference the raw revision
and most recent sync run. No names, contact details, medical notes or security
codes are retained by these minimal adapters. No person-level read API or
operational metric publication is added.

## Phase 2 implementation note
`import_batches`, `import_cells`, `import_mappings`, `import_staged_rows` and
`import_week_reviews` now implement Admin-only, review-only historical staging.
Original XLSX bytes are write-once in private App Storage, never in PostgreSQL.
Mapping versions/cells/staged rows and evidence approvals preserve lineage.
Withdraw/restore retains history. Custom triggers and forced RLS must be preserved.
No approved staging value becomes a normalized observation or metric in Phase 2.
See `PHASE_2_IMPLEMENTATION.md`.

## Phase 1 implementation note
The additive Phase 1 migration implements local users/access invitations/sessions,
ministry/service reference records, people/external ID references, raw source
revisions and audit history only. All other models below remain proposals for
later phases. See `PHASE_1_IMPLEMENTATION.md` for implemented scope and verification.
Raw/audit history triggers and raw-source RLS are custom SQL and must be preserved
along with tables; database readiness checks their presence. Do not load sensitive
records into a privileged development database.

## Core reference data
- `users(id, auth_subject, email, role, status, created_at)`; unique trusted `auth_subject`.
- `ministries(id, code, name, parent_id, active_from, active_to)`.
- `service_occurrences(id, ministry_id, service_date, start_at, timezone, location_id, plan_external_id, special_event_id, capacity)`; effective service time not hard-coded.
- `integration_connections(id, provider, account_ref, state, granted_scopes, encrypted_token_ref, connected_by, updated_at, last_success_at, error_state)`.
- `sync_runs(id, connection_id, job_name, started_at, finished_at, status, cursor_before, cursor_after, fetched, inserted, updated, quarantined, error_summary)`.
- `raw_source_records(id, provider, account_ref, object_type, external_id, payload_json, payload_hash, source_updated_at, ingested_at, sync_run_id, deleted_at)`; unique provider/account/object/external id per current row, optional immutable revision log.

## Identity / domain facts
- `people(id, canonical_person_ref, sensitive_identity_ref, source_link_status, created_at)` and restricted `person_identities(person_id, display_name, contact_info_encrypted, ...)`; deterministic account-scoped external ID mapping in `external_person_ids`.
- `households(id, source_ref)`; `household_memberships(person_id, household_id, relation, starts_at, ends_at)` for children's regularity and blended/changed households.
- `attendance_events(id, person_id NULLABLE, service_occurrence_id NULLABLE, attended_at, source, external_ref, event_kind, quality_flag)`; manual aggregate counts separately in `attendance_aggregate_observations(id, occurrence_id, metric_key, count, source, revision, submitted_by)` to avoid fictitious people.
- `giving_transactions(id, person_id NULLABLE, source_ref, occurred_at, amount_minor, fund, payment_type, status, restricted)`; permission-restricted schema/view. `giving_summary_snapshots` are safe aggregates after suppression policy.
- `group_memberships(id, person_id, group_external_ref, joined_at, left_at)` and `group_attendance_events`.
- `serving_events(id, person_id, team_external_ref, occurrence_id, served_at, status)`.
- `journey_events(id, person_id, event_type, occurred_at, source_ref, metadata_json, quality_flag)`; explicitly supported events include discover, sneak_peek, group_interest, group_join, first_time_gift, checkin, baptism_signup.
- `service_plans(id, external_id, occurrence_id, title, items_json, pulled_at)`.

## Operational/configuration facts
- `manual_submissions(id, form_id, occurrence_id, created_by, created_at, payload_json, revision_of, status)`.
- `scorecard_templates(id, ministry_id, name, version, valid_from, valid_to, scale_min, scale_max, weights_json, rubric_json)`; `scorecard_responses(id, template_version_id, occurrence_id, rater_source, ratings_json, submitted_at, source_ref)`; `scorecard_aggregates`.
- `metric_definitions(id, slug, version, expression_spec, input_contract, valid_from, valid_to, created_by, status)`.
- `metric_threshold_rules(id, metric_slug, ministry_id, version, green_rule, yellow_rule, red_rule, target_ref, effective_from)`.
- `metric_snapshots(id, slug, ministry_id, period_start, period_end, value, unit, definition_version, data_as_of, source_coverage, quality_status, computed_at)`.
- `target_plans(id, metric_slug, ministry_id, period_start, period_end, value, created_by, revision)`.
- `forecast_runs(id, metric_slug, scope_id, as_of, training_start, training_end, horizon, model_version, settings_json, validation_json, status)`; `forecast_points(run_id, period_end, point_value, lower_bound, upper_bound)`.
- `anomalies(id, metric_slug, period_end, severity, explanation, evidence_refs, rule_version, state)`.
- `report_subscriptions(id, destination, config_json, access_scope, enabled)` and `report_deliveries(id, subscription_id, period_end, payload_hash, approved_by, state, delivered_at, provider_message_ref)`.
- `audit_events(id, actor_user_id, action, target_type, target_id, timestamp, metadata_json)`; redact PII/token contents.
- `import_batches` / `import_rows` with legacy sheet/coordinate/file digest, validation/reconciliation status.

## Required indexes and constraints
Unique external IDs scoped by provider/account; unique import batch + cell/row mapping; idempotent provider event signatures. Index occurred_at, service_occurrence_id, metric_slug+period_end, person_id+event_type+occurred_at; donor records in restricted schema. Database policies and API checks must be tested independently.

## Data semantics
Use UTC `timestamptz`, local service date `date`, currency minor units, explicit `NULL` for unknowns. Never infer zero from missing data. Model identities may be incomplete or ambiguous; quarantine conflicting merges. Store weekly summaries by Sunday-end date.
