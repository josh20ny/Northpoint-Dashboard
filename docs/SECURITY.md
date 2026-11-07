# Security and Privacy Release Requirements

## Security boundaries
Role checks happen at row/field-level server boundary, independent of page visibility. Giving personal records Admin only. Attendance access audited. Require validated session, CSRF protection for mutations, safe redirects, scoped OAuth, secret encryption and rotation, webhook verification, export controls, structured logs with PII redaction. Enforce MFA through chosen identity provider if available.

## Privacy of children and giving
Minimize personal fields; document purpose, retention/deletion, incident response, backups and appropriate child-related legal/policy review. Aggregate suppression and anti-differencing controls (threshold TBD). Staff/Leadership AI responses cannot be used to indirectly identify donors. Do not send sensitive person-level records to model providers without approved data-processing/privacy review.

## Launch block checklist
- IDOR tests with cross-role and direct URLs, filtered exports, cache poisoning and aggregate subtraction.
- OAuth state/PKCE, token refresh, revocation, encrypted tokens, callback origin checks.
- CI secret scanner, dependency audit and immutable audit logs.
- Backups/restore drill; least-privilege database credentials; encrypted at rest/in transit.
- Prompt injection tests with external notes and user-supplied spreadsheets.
- No real production donor/child data in development or demo fixtures.
