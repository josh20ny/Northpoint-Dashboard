# Journey and Retention Analytics

## Core entity/event model
Use first-party canonical person IDs linked cautiously to Planning Center source IDs, plus household relationship effective dates. Record events with explicit occurred-at, source, type and quality.

## Canonical journey examples
- Discover Northpoint attended → giving, serving, group membership, inviting (inviting may have no measurable data; label unobservable).
- Sneak Peek attended → first verified serving event.
- Group interest submitted → group membership established / first group attendance.
- Kid/student first visit → second visit → third visit; cohort maturity and elapsed time.
- First recorded giving → recurring/scheduled giving (admin-only identifiable; permitted aggregate conversion for others).
- Baptism sign-up → event attendance/completion if source supports.

## Cohort measures
For each first event cohort: eligible n, at-risk n, conversions, censored n, rate, median days until event, stratification by ministry/service/entry source where privacy permits. Do not count repeated check-ins on same day as repeat visits. Avoid comparing newly enrolled cohorts with older fully mature cohorts. Flag incomplete pre-import history and household ambiguity.

## Privacy
Child data and household links accessible only as permitted by role/data classification. For cross-domain join to giving, use restricted query path and privacy-preserving aggregate output; do not leak donor identity through journeys.
