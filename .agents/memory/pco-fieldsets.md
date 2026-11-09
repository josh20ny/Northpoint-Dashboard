---
name: Planning Center sparse fieldsets
description: Why included resource counts and completed imports are insufficient evidence of usable relationship coverage.
---

Treat Planning Center sparse fieldsets as selecting both attributes and relationship names. Validate linkage coverage separately from raw-source provenance and successful pagination.

**Why:** Real imports and incremental replays completed successfully with related included resources but empty relationship objects because only attribute names were selected. Matching record counts and valid raw-source links did not establish which person, event, time, or location belonged to a check-in.

**How to apply:** When changing provider fields/includes, test against responses that actually apply sparse-field filtering to relationships, not fixtures that always supply every link. Require documented linkage fields and distinguish explicit null/empty from omitted data. Repair old records through the authenticated rescan path while retaining immutable revisions; do not infer associations from included-object ordering or merge person IDs across products.
