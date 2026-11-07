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
