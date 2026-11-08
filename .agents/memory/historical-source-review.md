---
name: Historical source review
description: Why matching workbook inventory counts cannot establish source equivalence.
---

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
