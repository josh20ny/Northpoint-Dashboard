---
name: Workspace test isolation
description: Prevent synthetic tests from accidentally reading the real development database through workspace package imports.
---

Do not assume a Vitest module mock of the workspace database package intercepts every server import. Spy on the shared exported pool instance and assert that the intended connection/query stub is actually called before testing mutations.

**Why:** An alias-only mock did not intercept the server's pool in this environment. Synthetic tests unexpectedly reached the development database; nonexistent synthetic Admin membership safely blocked changes. Spying on the shared instance intercepted the calls correctly.

**How to apply:** Keep provider calls stubbed and synthetic credentials installed as a second boundary. Retain the database fixture guard against running connector fixtures where a real Planning Center connection already exists. Never relax that guard to make tests pass.
