---
name: Workspace test isolation
description: Prevent synthetic tests from accidentally reading the real development database through workspace package imports.
---

Do not assume a Vitest module mock of the workspace database package intercepts every server import. Spy on the shared exported pool instance and assert that the intended connection/query stub is actually called before testing mutations.

**Why:** An alias-only mock did not intercept the server's pool in this environment. Synthetic tests unexpectedly reached the development database; nonexistent synthetic Admin membership safely blocked changes. Spying on the shared instance intercepted the calls correctly.

**How to apply:** Keep provider calls stubbed and synthetic credentials installed as a second boundary. Retain the database fixture guard against running connector fixtures where a real Planning Center connection already exists. Never relax that guard to make tests pass.

For rollback-only publication fixtures, isolate the synthetic organization as
well as the pool connection. Do not reuse the connected organization's source
history merely because the test has created a new synthetic sync run.

**Why:** A bounded attendance loader correctly read earlier observed snapshots,
so an otherwise isolated fixture unintentionally included real staged attendance
and failed its synthetic assertions.

**How to apply:** Scope synthetic source data and the transaction-local connection
organization consistently inside the rollback boundary. Never persist a changed
integration organization or weaken the production loader to accommodate a test.

PostgreSQL `now()` is the outer transaction's start time, including inside
savepoints; it cannot establish publication order within rollback-only tests.

**Why:** Sequential unresolved/resolved publications shared identical timestamps
in a rollback fixture, so UUID tie-breaking sometimes selected the earlier one.

**How to apply:** Ensure append-event timestamps reflect the actual insertion
instant where revision order matters. Do not “fix” intermittent assertions by
rerunning until UUID ordering happens to match the intended chronology.
