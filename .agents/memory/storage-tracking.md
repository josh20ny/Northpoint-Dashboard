---
name: Confidential upload tracking
description: Durability and uncertainty rules for tracking original workbook storage.
---

Commit a confidential upload intent before writing storage, independently of the
catalog transaction. A missing storage acknowledgement means unknown, not absent.
Never infer that an unlinked or failed attempt permits deletion.

**Why:** Storage can succeed while the later database transaction fails, or the
process can disappear before recording the result. Rollback cannot undo storage.
Retention and deletion require an owner-approved policy.

**How to apply:** Preserve unresolved attempts for review. Reuse only confirmed
stored originals on retries, without rewriting past attempt outcomes.

Keep declarative RLS flags and policies consistent with custom SQL migrations.

**Why:** Development verification found policies absent and RLS disabled on older
tables whose original hand-written migrations had enabled them. Drizzle snapshots
alone do not capture protections added only through custom SQL.

**How to apply:** Check both actual database protection metadata and declarative
schema when changing confidential source tables; generated migrations alone are
not proof that privacy guards survive schema updates.

Declarative schema synchronization can create a new table before its custom
migration is recorded. A table's existence is not proof the migration ran.

**Why:** Closing checks found an existing upload table with migration history
behind it and without its custom guards; attempting a plain CREATE TABLE would
block the pending migration rather than restore the protections.

**How to apply:** Compare the migration journal and actual constraints/policies/
triggers. Reconcile pre-existing objects non-destructively through the supported
development migration path; never drop confidential history to make it migrate.
