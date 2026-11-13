---
name: Planning Center runtime contracts
description: Provider capabilities, backlog performance expectations, civil dates, and joint-giver linkage.
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

## Backlog performance

All PCO backlog processes should process in minutes, not hours.

**Why:** The user explicitly set this performance expectation for all PCO backlogs, not only Giving.

**How to apply:** Measure actual throughput and prioritize shared batching and rate-limit-aware processing while preserving resumable progress and accurate storage.

Do not assume every PCO association supports bulk includes. Groups Event supports
including group/location, but not attendance; Services Plan supports plan_times,
but not team_members. PCO rate limits are dynamic and communicated in response
headers, including stricter limits for deep pagination.

**Why:** The provider's documented capabilities differ across products; blindly copying Giving's include optimization can omit records or reject requests.

**How to apply:** Check the product/version documentation before removing association requests, prove complete parent linkage, and use returned rate limits rather than assumed request allowances.
