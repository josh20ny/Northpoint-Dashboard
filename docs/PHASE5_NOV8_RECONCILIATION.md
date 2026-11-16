# November 8 attendance reconciliation

Read-only development review, November 16, 2026. No metrics, source mappings,
resolution decisions or PCO records were changed.

## Verified findings

- Current source window loads 434 Check-In records and 923 related facts.
- InsideOut's 4:30 PM source has 89 distinct regular participants and one
  volunteer. This matches the supplied screenshot's 89 participants. The
  calculator counts 69; the other 20 have no eligible mapped student membership.
  Service routing currently does not substitute for membership.
- Transit calculates 45 at 9 AM and 44 at 11 AM. These do not reconcile to the
  screenshot's 109. Unclassified memberships and unresolved duplicate checks
  remain; do not assign the entire difference to a single cause.
- Four review candidates remain unresolved: three possible duplicate records
  and one guest Check-In without a linked person.
- Stored Waumba records contain 74 distinct linked people across both services,
  matching the screenshot's combined total, but this does not validate the
  calculated per-service split.
- Fourteen Check-In records link to Hangout, with 14 distinct people. Eleven of
  those same records also link to an UpStreet classroom. Adding the screenshot's
  UpStreet and Hangout branch totals is not a valid unique-person calculation.
- Stored UpStreet-mapped regular Check-Ins contain 156 distinct people plus one
  unlinked guest record. The present classroom-only records do not exactly
  reproduce the older screenshot's branch headcount. No adjustment was made to
  force a match.

## Calculation defect identified

Sixteen UpStreet and three Waumba Check-In records link to multiple EventTimes.
The calculator collects those routes, then constructs `routedScopes` keyed only
by ministry. The last scope replaces the earlier scope. A record linked to both
morning services therefore contributes to only one direct-mapped service.

Fixing this requires retaining every applicable ministry/service route and
deduplicating identities within each service. A combined weekly unique total
must not be obtained by summing service attendance. Runtime counting behavior
was not changed during this read-only reconciliation.

## Next decisions and verification

1. Correct the multi-service routing defect with a regression fixture.
2. Decide whether an otherwise valid student service Check-In with no eligible
   Groups membership should remain uncounted, enter an Admin resolution flow,
   or use another explicitly approved classification rule. Do not silently
   broaden the existing grade fallback, which only resolves eligible overlaps.
3. Resolve the four existing review candidates without merging source identities.
4. Recompare source and calculated service totals, then verify the signed-in
   display before first publication. Historical screenshot counts and current
   stored source data need not be identical if the source was subsequently edited.

## Performance caveat

One fresh preview hit the application's query-read timeout before succeeding on
retry; an isolated repeat loaded the window in 54 ms. The indexed query is fast
in the successful measurements but cold-read reliability is not yet established.
No timeout was raised and the isolated timeout is not evidence of missing data.

The existing preview operation accepts `--reconcile` to emit only aggregate
diagnostics (no child names or profile IDs). It uses a read-only transaction and
never publishes metrics.

## Subsequent owner-authorized corrections

The owner approved fixing service assignments and clarified that missing Groups
membership must not exclude a student from Check-In attendance. Such students
remain unassigned and uncounted in group splits.

The calculator now retains every applicable direct-mapped service scope. A
unique routed student ministry can establish attendance without a Groups
membership, while mapped children's-room records do not also become Transit
attendance. Shared student routes still require disambiguating evidence.
No group membership, group-attendance record or metric publication is created.

The November 8 read-only calculation now returns:

| Ministry | 9 AM | 11 AM | 4:30 PM |
| --- | ---: | ---: | ---: |
| UpStreet | 98 | 76 | — |
| Waumba Land | 46 | 31 | — |
| Transit | 49 | 59 | — |
| InsideOut | — | — | 89 |

These are per-service counts, not additive weekly unique totals. Four unresolved
review candidates keep the results partial. The screenshot discrepancies,
including Transit's 109 combined reference and different service distribution,
remain open; matching InsideOut's 89 is not acceptance of all ministry totals.
The earlier sections describe the pre-correction investigation.

## Transit location versus EventTime reconciliation

A subsequent read-only pass reproduced the screenshot's 70/39 location branch
counts from the stored facts:

| Linked EventTime | Transit location label prefix | Raw records | Distinct linked people |
| --- | --- | ---: | ---: |
| 9 AM | 9:00 | 49 | 49 |
| 11 AM | 9:00 | 20 | 20 |
| 4:30 PM | 9:00 | 1 | 1 |
| 11 AM | 11:00 | 41 | 39 |

The 9:00-prefixed rooms therefore account for 70 people; the 11:00-prefixed
rooms account for 39. These location-branch counts reproduce 109, while
EventTime-based routing places the first three groups at their linked clock
times. The 4:30 record is included in the current InsideOut service total.

The two extra 11:00-branch records are the two pending possible-duplicate
Transit Check-Ins. They do not explain the remaining 109-versus-108 ministry
difference: those records share already-counted person identities. The remaining
person is present at 4:30 under EventTime routing, not lost from storage.

This comparison used the room-label prefixes visible in the owner's screenshots
as diagnostic evidence only. No label-based routing mapping was saved, no review
decisions were applied, and the calculator still uses confirmed EventTimes.
It remains necessary to decide whether these location names describe the service
that should count or a roster/group label that may differ from actual service
attendance. A relationship to several locations does not pair a particular
location with a particular EventTime.

## Owner-confirmed Transit attendance rule

The owner confirmed that Transit time-labelled rooms represent actual attended
service, not assigned rosters. The calculator now resolves those room times
through active Transit service routes for the same event, overriding conflicting
student EventTimes. Mapped children's rooms are excluded from this convention.
Unconfigured room times are not silently assigned to the conflicting service.
Volunteer exclusions, person deduplication, and pending review exclusions remain.
No Groups assignments are created.

The resulting read-only November 8 preview is:

| Ministry | 9 AM | 11 AM | 4:30 PM |
| --- | ---: | ---: | ---: |
| Transit | 70 | 39 | — |
| InsideOut | — | — | 88 |

This supersedes the earlier EventTime-only student totals. All four pending
review candidates remain unresolved, results remain partial, and no metrics
were published by the preview.

## Children's room reconciliation completed

The extended aggregate-only diagnostic reproduced every supplied children's
room count using distinct linked people per room, plus the one missing-profile
guest in 5th Boys B. This supersedes the earlier statement that the UpStreet
classroom reference had not been reproduced:

- Kindergarten: 20; first grade: 22; second: 24; third: 30; fourth: 27;
  fifth: 34 including the unresolved guest. Sum: 157.
- Hangout: 14 distinct linked people.
- Waumba Land: 74, matching all seven room counts in the screenshots.

Room headcounts are not additive unique ministry attendance. Thirteen of the
14 Hangout people also have an UpStreet classroom Check-In; eleven share the
same Check-In record across both room links, while two use separate records.
There is also one cross-classroom person overlap in the classroom sum.

The actual calculator's accepted, person-linked preview remains:

| Ministry | 9 AM | 11 AM | Weekly distinct people | Attended both services |
| --- | ---: | ---: | ---: | ---: |
| UpStreet, including Hangout | 98 | 76 | 156 | 18 |
| Waumba Land | 46 | 31 | 74 | 3 |

Weekly distinct people were independently reconstructed from each accepted
Check-In's calculator output and deduplicated across the two services. This is
diagnostic verification, not a new published weekly metric. The screenshots
were for all times, so they validate room headcounts, not independently the
per-service splits.

One UpStreet guest without a linked profile is still excluded pending Admin
review. Waumba's pending duplicate shares an already counted person and does
not increase distinct attendance. The two Transit duplicates likewise remain
pending. No source, calculation, mapping, or resolution policy was changed
during this review, and no metrics were published. API typecheck passed.

## Owner-approved partial publication

The owner approved publication of the verified November 8 attendance while
leaving all four review cases unresolved. The audited publisher saved the seven
service attendance values above with `partial` quality. The saved values and
publication validity were verified under the persisted Admin author's access.
Replay reused the same publication rather than adding a duplicate.

Publication's coverage check now treats a Friday–Sunday Check-In scan as covering
Sunday attendance; the full-week truncation rule remains for other products.
The coverage date is read as civil-date text. A rollback-only database regression
confirmed that a bounded Check-In window stays visible through the staff
aggregate read path. Source mappings, PCO data and review decisions were not
changed. This publication did not publish weekly-unique diagnostic totals or
deploy the application.
