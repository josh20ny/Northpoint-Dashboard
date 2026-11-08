---
name: OAuth key ownership
description: Owner requirement for provisioning and retaining the Planning Center token encryption secret.
---

The Planning Center token encryption key is application-owned infrastructure, not a provider credential. Provision it once securely and retain it across deploys and restarts. Never silently generate a replacement when it is missing.

**Why:** The owner explicitly corrected the setup instructions: Planning Center provides the client ID and client secret, not this key. Losing or changing the key makes retained OAuth tokens unreadable and requires restoring the original key or reconnecting.

**How to apply:** Keep provider credentials separate from application key provisioning. Use secure secret tooling, never chat or logs, for actual values. Missing or malformed encryption infrastructure must fail startup safely.
