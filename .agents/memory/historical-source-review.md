---
name: Historical source review
description: Why matching workbook inventory counts cannot establish source equivalence.
---

Accept accurately pulled PCO data without granular checking of every source
value; prioritize accurate ingestion, storage and display using the existing
PCO interaction structure.

**Why:** The owner explicitly said that if data is accurately pulled from PCO,
it works; storing and displaying it accurately is more important.

**How to apply:** Verify pipeline fidelity, calculations, replay and presentation
with focused automated and representative checks, not exhaustive manual source
approvals. Preserve permissions, missingness and real error handling.

Most PCO data goes back to approximately 2022; older historical data lives in
the uploaded workbook. Historical backfills, particularly Giving, need both.

**Why:** The owner stated the source coverage and dual-source requirement.

**How to apply:** Do not hardcode 2022 as a universal cutoff. Prioritize
current/future ingestion first, then execute historical backfills for all
Phase 5 areas within Phase 5, retaining source lineage and overlap handling for
both sources. The owner clarified that backfills do not need deferral; they
just do not have to come first.

The owner subsequently confirmed: “everything pulled from the workbook
spreadsheet provided in the files of this project is accurate and should just be
imported and displayed where appropriate” and rejected per-week publication
steps.

**Why:** The owner explicitly changed the historical acceptance policy.

**How to apply:** Treat the provided workbook as the accepted historical source
at the batch/fingerprint level. Import mapped history in bulk without recurring
weekly approvals or comparisons. Keep source mappings, permissions, provenance,
unrecorded Sundays and the snapshot cutoff; flag actual unreadable values or
mapping conflicts instead of inventing data. Do not attribute automated imports
to a fabricated signed-in Admin or reinterpret this as independent verification.
This supersedes earlier per-week publication gates for that accepted source,
not the requirement to identify which actual file was supplied.

Treat the supplied inventory as discovery evidence, not a fingerprint or source
approval. Confirm the actual uploaded workbook and its snapshot date before
approving real historical mappings.

**Why:** The working legacy file and the earlier source manifest had different
SHA-256 fingerprints despite matching sheet and formula counts. Those counts
could not establish identical source values.

**How to apply:** Preserve actual bytes and their digest, flag manifest
discrepancies, and keep source authority/snapshot questions explicit rather than
inferring them from filenames or matching inventory totals.

For 2026-01-25 the owner clarified: “technically it was 0 attendance,” following
the earlier explanation about the ice storm.

**Why:** The owner's clarification supersedes the earlier interpretation of
that week as unknown attendance.

**How to apply:** Treat attendance that week as zero, retain ice-storm context,
and do not infer that services were cancelled.

The owner's general attendance rule: past blank or zero entries are zero
attendance because of no services or cancelled services; future blank or zero
entries have not happened yet and must remain unrecorded.

**Why:** The owner explicitly clarified the meaning of attendance placeholders.

**How to apply:** Preserve raw cells and apply the rule to dated attendance,
not arbitrary numeric measures or formula failures. For historical workbook
review, use the confirmed snapshot cutoff, so future placeholders do not turn
into historical zeroes merely because the review runs later.

For the child/student ministry history, the workbook contains total attendance
and first-time check-ins per ministry and service, but no location-level or
group-level history.

**Why:** The owner clarified the workbook's available historical detail.

**How to apply:** Import those aggregate ministry/service measures only. Never
derive location or group history from the aggregate totals.
