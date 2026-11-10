---
name: Giving definitions and privacy
description: Owner definitions for giving visibility, first-time givers, lapse and later health integration.
---

Everyone can see giving numbers broadly, but anything specific tied to a person
ID or name should only be visible to Admins.

**Why:** The owner explicitly clarified this during Phase 5.

**How to apply:** Separate broad totals from restricted donor transactions and
person-linked financial signals, including health inputs and exports.

A first-time giver is the first recorded giving event for that person/family at
Northpoint. A lapsed giver has a consistent giving record/cadence (weekly,
monthly, etc.) and then misses three consecutive expected gifts. A normally
monthly giver missing three consecutive months is lapsed.

**Why:** These are the owner's definitions; they also expect giving to feed the
health data in later phases.

**How to apply:** Preserve dates, evidence, person/family identity boundaries and
classification coverage for later health integration. Do not mistake a current
ingestion window's first transaction for the first recorded lifetime event, or
infer family membership from names/addresses. Consistency-detection details
must be distinguished from the owner-approved three-miss definition.

The owner accepted four consecutive gifts (three matching intervals) with up
to two days' date variation as the starting cadence rule, but explicitly said
this must be an Admin-adjusted formula whose definition can change later.

**Why:** “yes, but this should be an admin adjusted formula meaning we can change
its definition later if we would like”.

**How to apply:** Keep an Admin-only editable, versioned definition rather than
a fixed permanent constant. Retain the formula version with classifications
and future health inputs; never silently mutate historical evidence.

The owner approved current-data setup for Giving and Groups in this development
environment after disclosure of donor IDs, amounts, joint-giver relationships
and group memberships, with person-linked financial data Admin-only.

**Why:** The owner selected “Proceed with current-data setup” in response to
that explicit disclosure. Publishing and enabling unattended scheduling were
excluded from that approval.

**How to apply:** Do not repeatedly ask for the same development-data approval.
Actual PCO consent must still be completed by an authenticated Admin; chat
approval is not a provider grant or permission to impersonate an app user.
Leave existing scheduler settings unchanged unless separately authorized.
