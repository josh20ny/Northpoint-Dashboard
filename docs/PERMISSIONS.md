# Access Control Policy (baseline)

| Data/Action | Staff | Leadership | Admin |
|---|---|---|---|
| View church/ministry aggregate attendance and engagement | Yes | Yes | Yes |
| View person-level attendance and permitted check-in history | Yes, audited | Yes, audited | Yes, audited |
| View group/serving person-level data | Pending privacy signoff | Pending | Yes, audited |
| View aggregate giving | Yes, approved/suppressed views | Yes, approved/suppressed views | Yes |
| View person-level giving/donor attribution/transactions | **No** | **No** | **Yes, audited** |
| View/modify health and engagement rule definitions | No | Read | Yes |
| Enter manual attendance/scorecards | Yes | Yes | Yes |
| Review/approve weekly reports | No by default | Yes (scope permitting) | Yes |
| Manage OAuth connections, import mappings, users/roles | No | No | Yes |

Enforce on server endpoint, query/view, export, generated file, cache key, notification, and LLM tool output; never rely on hidden UI elements. Protect small aggregates and differencing attacks (threshold TBD). Role assignment must be server-controlled, with verified email + invited user or domain allowlist, not merely trusting a typed email. Audit person-level access. Explicitly review child/student data handling, consent, retention and applicable legal/policy obligations before production.

Default to least privilege if this table is incomplete. Replit authentication identity must be mapped to local roles and replaceable with Google Workspace OIDC; confirm actual current provider capabilities during implementation.
