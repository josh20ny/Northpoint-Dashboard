# Integration Registry and OAuth-first Design

Every provider must have a connection card: name, account/workspace, consent flow, granted scopes, access owner, last success, freshness SLA, failure reason, reconnect/revoke, backfill and coverage. Use OAuth authorization code (+ PKCE when supported), CSRF state, strict callback allowlists, encrypted refresh tokens, rotation and service-side requests. **Do not ask users to type third-party passwords into Northpoint Dashboard.** OAuth tokens are not login credentials.

| Provider | Desired data / action | Authorization strategy | Readiness |
|---|---|---|---|
| Planning Center | People, Giving, Check-Ins, Groups, Services, relevant serving and step events | OAuth 2 available, scope per PCO product; sync token refresh | First priority; verify endpoint data/visibility |
| Google / YouTube | 3 channels, videos, streams, impressions, CTR, duration, subscribers | Google OAuth; YouTube Data & Analytics APIs as needed | Channel permissions/quota validation |
| Google Analytics 4 | npaustin.com, camp75.org, foraustin.com | Google OAuth/GA4 Data API, configured properties | Verify properties and dimensions |
| Meta | IG: northpoint_ch, Waumba Land, UpStreet, Transit, InsideOut, Camp 75; Northpoint Facebook | Meta business authorization and app review/permissions | Verify business account type, scopes and access |
| Mailchimp | All audiences, campaigns, deliveries, opens, clicks | OAuth 2 available | Confirm permission and historical retention |
| Clearstream | SMS campaigns/messages and opt-ins | **Verify if OAuth is offered**; API key or export fallback only with approval | Capability discovery |
| Apple Podcasts / Spotify | Podcast reach/download/listener measures | **Verify available APIs and account permissions**; some metrics may need approved export | Capability discovery |
| ClickUp | Outgoing leadership reports, channel messages and alerts | OAuth 2 supported; Chat endpoints experimental | Prototype channel post, permission and fallback |
| Google Sheets / Forms | Historic/manual submissions, survey averages | Google OAuth or authorized service integration | Preserve individual response vs aggregate provenance |
| Legacy XLSX | Historic figures by sheet/column/date | Offline admin import | Source QA, not live connector |

## Suggested adapter contract
`connect -> verify_permissions -> sync_incremental(cursor) -> normalize -> check_reconciliation -> report_health -> disconnect`.
Each connector declares objects, fields, source timezone, privacy tier, fetch cadence, retry/budget, next sync and incremental/change tracking strategy. Webhooks as supplement, not sole synchronization path.

## External API facts to revalidate at build time
Planning Center docs: https://api.planningcenteronline.com/docs/overview/authentication ; Mailchimp OAuth: https://mailchimp.com/developer/marketing/build/start-developing/set-up-an-oauth-app ; ClickUp authentication: https://developer.clickup.com/docs/authentication ; ClickUp Chat: https://developer.clickup.com/docs/chat . ClickUp Chat APIs were documented as experimental when checked in November 2026. Do not infer that every app supports OAuth.
