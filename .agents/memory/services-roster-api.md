---
name: PCO Services roster APIs
description: Documented API limits that affect safe and efficient Serving imports.
---

Planning Center exposes a ServiceType-wide PlanPersonTime collection, but its
records link to PlanPerson IDs and do not replace the person/team/status roster
used by accepted Serving metrics. Plan pages can include PlanTimes; use that
only when every referenced PlanTime is present, and retain the per-plan
PlanTime request as a fallback.

**Why:** Treating the time-assignment collection as a complete roster would
lose person/team identity and could undercount or misattribute Serving.

**How to apply:** Keep the roster fields and linkage checks narrow, use included
PlanTimes only when their references are complete, and do not backdate ministry
routes without owner approval.
