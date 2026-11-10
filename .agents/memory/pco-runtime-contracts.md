---
name: Planning Center runtime contracts
description: PostgreSQL civil dates and collection-based joint-giver linkage at runtime.
---

PostgreSQL DATE values from the pg pool may be JavaScript Dates at local midnight,
even when a TypeScript interface says string. Serialize them as civil dates using
local calendar components, not UTC instant conversion, before response validation.

**Why:** Current-window sync operations committed successfully but their strict
response validation failed, making pause/resume appear to fail after saving.

**How to apply:** Cover native pg Date values, text and null in API serialization
tests, including positive/negative UTC offsets. Do not assume a declared
string type changes the driver's runtime decoding.

Resolve Giving joint-giver linkage on the documented DonorSummary collection
with explicit sparse linkage and minimized included Person fields. Do not rely
on a singular optional joint-giver association succeeding for every summary.

**Why:** A Giving backfill stopped at a joint-giver association lookup despite
successful donation ingestion. DonorSummary is collection-only; an unavailable
association must not be misreported as a general provider outage.

**How to apply:** Preserve persisted cursors by translating old association
lookups to person-filtered collection reads. Explicit null, omitted linkage and
a missing summary are different evidence. Keep unresolved family patterns
unclassified; never infer linkage from names or from included resources alone.
