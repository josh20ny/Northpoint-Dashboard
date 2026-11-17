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

PCO Refund `amount_cents` can be negative even though the API documentation's
example uses a positive integer.

**Why:** Every refund in the observed staged account used negative minor units;
rejecting negative refunds incorrectly withheld otherwise valid Giving totals.

**How to apply:** Keep signed provider records intact. The separate refunds KPI
reports magnitude by refund date and currency; never subtract it a second time
from received giving or apply this sign rule to donations.

## Backlog performance

Scope date-specific Check-Ins calculations by linked reporting dates in SQL
before loading source facts, rather than loading the entire accessible history.

**Why:** A live read-only calculation exceeded the whole-history source bound
and transferring that history also interrupted the workspace. EventTime linkage
provides the attendance date; creation/import dates are not a safe substitute.

**How to apply:** Keep reporting-window previews bounded and carry the required
EventTimes, EventPeriods, routing templates and membership snapshot into the
calculation. Do not treat a narrowed preview as proof that the full publisher
has been partitioned too.

A date-bounded output does not guarantee a fast database read. Verify attendance
loading through the application's pool, not only an administrative SQL callback.

**Why:** A November 8 preview repeatedly hit the application's query-read timeout
even though aggregate SQL checks returned the correct small source window. A
shared date lookup alone was insufficient: reading the full historical Check-In
payload set still exceeded the request budget.

**How to apply:** Profile the actual query plan and related-context joins before
claiming the attendance preview or publisher works. Do not raise timeouts or
publish totals merely because a separate aggregate query succeeds. Narrow
candidates with indexed relationships before loading their payloads, but retain
the earliest-linked-date and period-fallback rules; a matching date on one link
does not establish that the Check-In belongs in that reporting window.

PCO Groups returns a synthetic GroupType whose ID is the literal `unique`.
Accept that exact sentinel for GroupType records and GroupType linkage, while
retaining numeric-ID validation for other resource types.

**Why:** The live category collection includes this built-in category alongside
numeric custom categories; treating every category ID as numeric rejects the
entire first page.

**How to apply:** Include the sentinel in provider-contract fixtures. Do not
generalize it into arbitrary string IDs or infer ministry membership from the
synthetic category.

All PCO backlog processes should process in minutes, not hours.

**Why:** The user explicitly set this performance expectation for all PCO backlogs, not only Giving.

**How to apply:** Measure actual throughput and prioritize shared batching and rate-limit-aware processing while preserving resumable progress and accurate storage.

Treat ingestion throughput and historical metric-publication throughput as
separate performance gates. Do not repeat a completed PCO scan to fix a slow
calculation over data already stored.

**Why:** The optimized Giving scan completed, but publishing several years of
retained history exceeded five minutes without committing metric rows.

**How to apply:** Profile stored-data loading and per-week calculation costs,
retain historical context needed by giver-cadence rules, and verify bounded
publication before claiming the historical dashboard is ready.

Do not assume every PCO association supports bulk includes. Groups Event supports
including group/location, but not attendance; Services Plan supports plan_times,
but not team_members. PCO rate limits are dynamic and communicated in response
headers, including stricter limits for deep pagination.

**Why:** The provider's documented capabilities differ across products; blindly copying Giving's include optimization can omit records or reject requests.

**How to apply:** Check the product/version documentation before removing association requests, prove complete parent linkage, and use returned rate limits rather than assumed request allowances.
