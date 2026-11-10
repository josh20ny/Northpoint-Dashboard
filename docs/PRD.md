# Product Requirements Document — Northpoint Dashboard 2.0
**Version:** v0.1 | **Status:** Requirements captured; calculations and source capabilities pending validation.

## Purpose and outcomes
One place for any Northpoint staff member to quickly determine the state of their ministry, identify problems, understand what is working, project where things are headed, and prioritize actions. The product must be simple, clear, concise, interactive, with optional deeper analysis.

Three primary questions: **How are we doing today? Where are we headed? What needs attention?**

## Target users and authorization
Staff, Leadership, Admin. Only Admin sees person-level giving, donor identities, donation transaction details or restricted financial attributes. Staff/Leadership may view authorized person-level attendance records. Leadership receives church-wide reporting; permission details in `PERMISSIONS.md`. Personalized ministry homepages are future scope.

## Core workflows
1. See current week, prior four complete weeks, rolling month, YoY and 2–24-month adjustable trend; compare actual vs target and forecast.
2. Drill from a health indicator to relevant ministry, service, date, definition and evidence.
3. Admin configures rules, scorecard templates, thresholds, forecast settings, users, integrations and alerts without source changes.
4. View giving and aggregate giving regularity without exposing donor identities to non-admins.
5. Explore event-based journeys: Discover Northpoint, Sneak Peek, group interest/join, giving, serving, kid/student first/second/third check-in, baptism sign-ups, first-time gifts (meaning to confirm).
6. Enter adult attendance, service scores, notes, event exceptions through forms; ingest aggregate external survey responses where possible.
7. Tie service plans, programming, volunteers, scorecard results, series and attendance to the same service occurrence.
8. Ask evidence-based AI questions and receive proactive alerts with citations to internal metric results and accessible drilldowns.
9. Preview/approve configurable weekly ClickUp leadership summaries and configurable urgent alerts.
10. Import and reconcile historical workbook records with explicit source mappings and quality flags.

## Ministry modules
Home; Service Programming (Adults/Online); Giving; Connection (Groups & Guest Services); Communications; Waumba Land; UpStreet; Transit; InsideOut; Special Sundays (Christmas/Easter); Camp 75; Admin (Sources, Metrics, Scorecards, Users, Imports, Alerts, Audit). See `specs/`.

## Integrations
Planning Center (People, Check-Ins, Giving, Groups, Services and supported volunteer/engagement data); YouTube (three channels); Instagram (six specified handles) and Northpoint Facebook; Mailchimp (all audiences); GA4 (npaustin.com, camp75.org, foraustin.com); Clearstream; Apple Podcasts/Spotify where supported; ClickUp outgoing reports; native forms and external forms/Google Sheets. OAuth-first, not OAuth-only; access scope and availability must be proven for each API.

## Operating calendar
Weekly Mon–Sun, displayed as Sunday-end date in America/Chicago; compare YoY on aligned weeks (explicit policy pending). Support months, quarters, semesters and rolling 1-month/2–24-month trends. Service time effective dating; 9:00 and 11:00 current adult/kid/middle school services, InsideOut 4:30; preserve historical 9:30 where applicable.

## UX requirements
Home is the previous-Sunday cross-ministry snapshot. Attendance history, entry
and all other ministry KPIs belong together on the relevant ministry page;
there is no separate attendance product/tab. Adult attendance belongs under
Service Programming. Older attendance links redirect to that ministry.
First glance must answer top three questions. Use simple cards, sparklines, trend comparison, colored health only with numeric/text labels, clear freshness timestamps; support drilldowns and accessible contrast. Distinguish metrics from interpretations. Responsive desktop-first.

## Success criteria (initial proposed targets, not approved business KPIs)
All primary metrics traceable to source and formula; daily sync audit; no privilege escalation; initial vertical slice matches validated spreadsheet baseline; historical import reconciles on sampled weeks/years; user can navigate from alert to evidence in <3 interactions; weekly ClickUp report is configurable and previewable.

## Out of scope for initial milestone
Per-user ministry personalization, forecasting every measure, broad self-service SQL, automatic action-taking AI, probabilistic predictions about identifiable persons visible to all staff, replacement of Planning Center as system of record.

## Open definitions
See `OPEN_QUESTIONS.md` and `METRICS.md`. No numeric threshold, fixed retention window, or giving cadence should be treated as approved yet.
