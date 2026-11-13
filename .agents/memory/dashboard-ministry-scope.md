---
name: Church-wide dashboard and ministry detail scope
description: Owner's required previous-Sunday overview and per-ministry attendance/KPI drilldowns.
---

The main dashboard should show a snapshot from the previous Sunday against all
the documented metrics for every ministry, not only adult attendance.
Under Ministries, clicking a ministry should show its attendance plus all its
other documented KPIs.

**Why:** The owner explicitly clarified the intended product scope; the
adult-only Phase 4 delivery is not the finished dashboard.

**How to apply:** Scope subsequent phases against both the church-wide overview
and each ministry detail page. Do not treat adult attendance as the complete
attendance requirement or invent metrics before their source/definitions are
validated.

Keep planning-week dates distinct from attendance snapshot dates.

**Why:** The shared planning calendar can name the upcoming Sunday while the
owner's dashboard snapshot requires the previous completed Sunday. Mixing them
made otherwise correct attendance figures appear labelled for the wrong week.

**How to apply:** Use the metric's explicit attendance period for snapshot
headings/context. Do not substitute a planning-week date when attendance data
is loading or unavailable.

Attendance details and entry belong inside each ministry page, not on a separate
Attendance tab. Adult attendance belongs in Service Programming alongside the
other SPD KPIs.

**Why:** The owner explicitly corrected the separate Attendance navigation and
page structure.

**How to apply:** Keep the main dashboard as the cross-ministry snapshot, link
its metrics to the relevant ministry, and keep detailed history/entry with that
ministry's other metrics. Legacy attendance links may redirect to Service
Programming; do not reintroduce a standalone Attendance navigation item.

Use a shared ministry-page order: attendance first, formula-based health
metrics next, then other KPIs. Keep health scores absent until their formulas
are defined. Put manual entry and other user-input controls in collapsed
sections at the bottom of ministry pages.

**Why:** The owner explicitly requested this hierarchy to keep primary measures
visible and prevent entry controls from distracting from reported results.

**How to apply:** Use the order across Connection/Groups, child/student
ministries, Service Programming and Giving. Show future health formulas as
unconfigured, never as invented scores.

For child/student attendance, use Sunday PCO Check-Ins as the source of truth.
Waumba Land and UpStreet use mapped Check-Ins locations per service; Transit
and InsideOut use service check-ins matched to students' Groups records.
Double check-ins, missing person profiles, duplicate check-ins and duplicate
profiles are quality-review cases; do not silently treat every source row as a
distinct attendee.

**Why:** The owner clarified the ministry-specific attendance workflow and
called out these data-quality exceptions.

**How to apply:** Preserve the PCO service/location and Groups relationships
when calculating attendance. Deduplicate rechecks only when the same PCO person
identifier establishes the match; do not guess that different profile IDs are
the same person.
