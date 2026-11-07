# Phase 2 — historical import workspace

## Scope
Owner authorized Phase 2 on 2026-11-07. Build an Admin-only XLSX explorer,
explicit versioned mappings, raw-only staging and weekly reconciliation.
No canonical metrics, source integrations, publication or person-level views.

Affected components: import API, private object storage, PostgreSQL import
tables, OpenAPI/generated clients and the existing Northpoint Admin UI.
Additive migrations only; original workbook and cell lineage remain immutable.

## Risks and verification
Treat every uploaded workbook as confidential. All import endpoints, downloads
and reports require current Admin access; mutations require CSRF. Never evaluate
formulas, follow external links, infer authority from labels, or turn blanks into
zero. Limit archive expansion, cells, worksheets and mapping row ranges.

Test discovery, date systems, missing/formula/external/error flags, duplicate
uploads, approval requirements, transaction rollback, re-import, report escaping,
cross-role denial and browser persistence. Several real weeks must be reviewed
and approved by the owner before claiming the Phase 2 exit gate.

## Working flow
Open Administration → Workbook imports. Enter the workbook's actual snapshot
date, then upload an XLSX (up to 10 MB) or catalog the supplied legacy workbook.
The original is stored privately and write-once, with SHA-256 and import time.
Repeated identical bytes and snapshot date return the existing batch.

Inspect sheets and paginated populated cells, formulas, caches, merges and flags.
The supplied file includes over a million empty formatting cells: their XML is
preserved in the original, but they are not duplicated into database rows.
Missing coordinates stage as unknown, not zero. No formulas or external links
are evaluated. XLSX limits: 100 sheets, 1,200 ZIP entries, 100 MB expansion,
35 MB per ZIP entry, 1.5 million physical / 250,000 populated cells.

Create a draft mapping with explicit sheet/value/date columns, row range,
legacy label, candidate slug, unit, ministry, semantics, priority and confidence.
There are at most 20 current mappings and 100 versions per batch; each maps
up to 1,000 rows. Labels are discovery aids, never approved definitions.
An Admin must review the mapping with a note before separately staging it.
To change a mapping, create a replacement referencing the previous version.
Replacement approval supersedes the old version; no old cells or rows are edited.

Staged rows retain original date/serial, interpreted Sunday-ending week,
America/Chicago reporting convention, original cell references, cache status,
value and quality flags. Unknown values stay null. Both Excel date systems are
supported; fictional serial 60 in the 1900 system and ambiguous text dates are
rejected/flagged. Non-Sunday dates, future weeks, errors, duplicate weeks,
merged cells, external dependencies and forecast/derived source tabs are flagged.

Reports compare sources only when candidate, unit and ministry match. Values
are never summed across sources. A weekly evidence group can be approved only
after at least two distinct source cells match without blocking QA flags.
Formula caches remain labeled unverified even after a review. The Admin note
must explain their review. Evidence hashes bind approvals to exact mapping
versions and staged values; new versions invalidate previous approvals.
Approval is not metric publication or approval of an unresolved business formula.

Protected exports: `mapping_approved.csv`, `row_errors.csv`,
`source_conflicts.csv`, `reconciled_weekly.csv`, `variance_report.html`.
CSV values are protected against formula injection; HTML is escaped and sandboxed.

Withdrawing a batch blocks exploration, staging, downloads and reporting while
retaining history. Re-importing it does not silently restore it. An Admin can
explicitly restore with a note. No source or history is hard-deleted.

## Source fingerprint discrepancy
The working file `data/NP Dashboard - 2026 (orignal source-legacy).xlsx` hashes
to `c925d771b67c4503ad46d5919000fcb5744c164fc1683a441055b11a1c70a1b3`.
The older manifest names a different file/fingerprint. Sheet/formula/external
counts agree (51 / 35,123 / 1,536), but this is not proof of identical values.
The importer always records the actual uploaded bytes; source equivalence and
the workbook snapshot date require owner confirmation.

## Operational limits
The initial catalog runs synchronously with a process-local four-per-minute
upload limit; use one API instance and review worker/multi-instance requirements
before increasing limits. Private file persistence is required; there is no
filesystem or database-byte fallback. Original-file upload attempts are now
tracked independently of the catalog transaction; see the review workflow below.
Retention/orphan cleanup requires a separately reviewed policy. Do not delete
originals automatically.

## Original-file upload review
Administration → Workbook imports → Original-file upload history is Admin-only.
The paginated history lists unlinked references first, including attempt ID,
filename, snapshot date, private object reference, SHA-256, status, storage
acknowledgement, failure phase, timestamps and any current linked batch. The
review endpoint (`GET /api/v1/admin/imports/uploads?page=1`) rechecks active Admin
access, audits reads and returns `Cache-Control: no-store`. Staff, Leadership and
signed-out requests are denied; forced RLS separately restricts the ledger.
Private references are not public download links. No unlinked download or delete
endpoint has been introduced.

An intent and its audit event commit **before** the storage write. Status is
`pending`, `linked` or `failed`; storage is `unknown` or `stored`. Storage errors
may occur after bytes were saved, so **unknown never means absent**. A confirmed
write is committed to the ledger before starting the catalog transaction. The
catalog, cell lineage, linked status and success audit commit atomically. On
failure a separate transaction records only a fixed phase code, never raw error
text or workbook contents. If that update also fails (database outage, process
interruption or lost Admin access), the original pending intent remains reviewable.
Pending is not proof that a request is still running, nor permission to delete.

Identical digest/snapshot uploads serialize under a database session lock, using
one connection for independently committed stages to avoid pool exhaustion.
An existing batch returns unchanged, including its withdrawn state, without
another file write or upload-attempt row. A retry after catalog failure reuses a
confirmed stored original and records a new attempt. Older failed/pending attempts
are retained unchanged; the review shows the later batch link by private reference.
Unknown writes are not reused: their references remain visible for manual review.
No automatic deletion, retention deadline, history editing, or cleanup action is
implemented. An owner must approve retention/deletion policy separately.

Development migrations `0003`–`0005` add the ledger, immutable attempt provenance,
no-delete guards and linked rows for existing cataloged originals. They also
declare the existing source/import RLS flags and policies in Drizzle and reconcile
them in SQL: development verification found those older tables' RLS disabled and
policies absent despite their original migrations. Keeping the declarative schema
in sync prevents a schema push from removing hand-written privacy protections.
Readiness now requires the upload ledger's policy and immutability guards.
Apply with `pnpm db:migrate:local` in development/CI only; no startup DDL.
Previously untracked storage objects cannot be reconstructed from catalog history;
this migration does not claim to discover old unlinked files.

Verification for upload tracking: database failure injection after storage success
(cell insert and catalog commit), lost storage acknowledgement, failure-recording
failure, durable pending intent, retry reuse, unchanged terminal history, pagination
and non-Admin RLS denial. These use synthetic workbooks and rollback-only fixtures;
no original or audit history is deleted.

The final automated pass covered 19 rollback-only database checks and 58 unit/API
checks; typecheck, lint and credential-pattern checks passed. Readiness returned
`ready` after the additive development migrations. A browser pass confirmed the
signed-out gate and uploads API denial, but the identity provider's login flow
blocked the synthetic Admin sign-in. The signed-in history UI and its mobile
layout were therefore not browser-verified. The synthetic test account was
suspended and normal workflow configuration restored.

Custom import immutability triggers and forced RLS are part of the migration.
Readiness verifies them. Privileged database owners can bypass RLS/alter guards;
the least-privilege runtime and privacy/retention production gates from Phase 1
still apply. All import UI/API/download/export paths are Admin-only and audited.

## Verification completed in development
- 53 unit/API checks pass, including the supplied workbook's fingerprint and
  inspection counts, separate formula caches, date systems, unknown values,
  unsafe integer precision, protected exports and cross-role route denial.
- 14 rollback-only database checks pass across Phases 1 and 2. The five new
  import checks cover idempotency, immutable provenance, approval/staging,
  evidence invalidation, withdrawal/restore, failure rollback and forced RLS.
- Full workspace typecheck, lint, formatting and limited credential-pattern
  scan pass. The additive migration applies and replays without changes.
- Browser verification with an invited synthetic Admin and synthetic XLSX:
  upload/private storage, cell discovery, two UI-created mapping approvals,
  staging, three weekly comparisons, one evidence approval and reload,
  original/CSV download, phone layout, withdraw/restore, logout and protected
  direct URLs. The HTML download link was checked; HTML escaping is unit-tested.
- Synthetic batch remains withdrawn to retain audit/source history. The test
  account is suspended and sessions revoked. No real mappings were approved.

The real source is not yet cataloged: its snapshot date remains unconfirmed.
Several owner-approved real weeks have not reconciled, so the roadmap's Phase 2
exit gate is not yet met. No Phase 3 work, canonical metric publication or
production release is claimed.
