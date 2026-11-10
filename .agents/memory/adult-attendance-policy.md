---
name: Adult attendance policy
description: Owner's auditorium headcount, unrecorded break Sundays and correction requirements.
---

Count only people sitting in the auditorium attending each service; exclude
volunteers, people on stage and people not attending the service.

**Why:** The owner explicitly defined the adult headcount.

**How to apply:** Keep aggregate service attendance distinct from unique people.

Online-only and intentionally off Sundays are unrecorded, not zeros. Northpoint
takes approximately two Sundays off annually; do not invent their dates.

**Why:** The owner does not want these dates recorded as zeros affecting averages.

**How to apply:** Preserve explicit unrecorded status; do not apply the older
blank-to-zero rule to these exceptions or infer an averaging denominator.

Manual attendance does not need approval, but manually entered values must be
adjustable with retained correction history.

**Why:** The owner explicitly rejected a manual approval requirement.

**How to apply:** Manual saves take effect immediately; workbook review and
historical promotion remain separate.

The rolling average defaults to four weeks; "adjust up or down" means changing
the number of weeks, not manually adjusting the computed attendance.

**Why:** The owner explicitly selected "Change the number of weeks."

**How to apply:** Keep a calendar-week window and an explicit recorded-week
denominator. Never zero-fill unrecorded Sundays or silently pull additional
weeks from outside the chosen window to reach four observations.

Use the accepted workbook's existing prior-year in-person totals for labelled
week-aligned YoY; do not require another upload or invent service splits.

**Why:** The owner offered a 2025 workbook only if the project lacked that data;
the existing accepted workbook already includes weekly 2025 in-person totals.

**How to apply:** Keep total-only comparison evidence distinct from detailed
per-service observations, display alignment/source year, and withhold
percentages for missing or zero baselines.

Routine adult attendance should be entered as one Sunday with both service
counts and one save, not a repeated service-setup/publication sequence.

**Why:** The owner reported that manual entry still took three steps and asked
for it to be simpler.

**How to apply:** Default the recent Sunday, prefill saved counts, keep notes
optional and reuse service links. Date/slot-only aggregate counts must not
require invented timestamps when timing is unavailable. Keep atomic saves,
correction history and conflict protection; preserve drafts across history
filter changes.

Prevent scrolling from changing a focused headcount input.

**Why:** Browser verification demonstrated that a wheel scroll can increment or
decrement a focused native number input without an intentional count edit.

**How to apply:** Keep count-entry wheel handling that removes numeric-input
focus before scrolling; do not remove it as cosmetic cleanup.
