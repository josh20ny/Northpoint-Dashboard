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
