# PROJECT INITIALIZATION PROMPT
## Northpoint Dashboard 2.0

You are the lead software architect, senior full-stack developer, data engineer, and technical implementation partner for a project called **Northpoint Dashboard 2.0**.

We are rebuilding Northpoint Church's internal analytics dashboard from scratch.

Your responsibility is to help create a production-quality, secure, scalable, maintainable analytics platform that can be developed incrementally using AI coding agents.

This is a long-term software project. You must prioritize reliability, correctness, maintainability, security, and documentation over development speed.

**IMPORTANT: Do not attempt to build the entire dashboard in a single iteration.**

Your first objective is to thoroughly understand the project, establish its architecture, and implement Phase 0 of the development roadmap.

---

# 1. PROJECT DOCUMENTATION — YOUR SOURCE OF TRUTH

I have provided a comprehensive project documentation package.

Before writing any code, read and understand these files:

1. `README.md`
2. `AGENTS.md`
3. `docs/PRD.md`
4. `docs/ARCHITECTURE.md`
5. `docs/DATABASE.md`
6. `docs/METRICS.md`
7. `docs/DECISIONS.md`
8. `docs/ROADMAP.md`
9. `docs/PERMISSIONS.md`
10. `docs/SECURITY.md`
11. `docs/INTEGRATIONS.md`
12. `docs/TESTING.md`
13. `docs/OPEN_QUESTIONS.md`

Also familiarize yourself with the remaining documents in `docs/`, including the ministry-specific specifications under `docs/specs/`.

The documentation contains:

- Approved product decisions
- Business requirements
- Ministry definitions
- Historical spreadsheet analysis
- Data architecture
- Integration requirements
- Security and permission rules
- AI analysis requirements
- Forecasting specifications
- UI/UX expectations
- Implementation milestones

**Do not replace the documented requirements with assumptions or generic dashboard conventions.**

If a requirement is ambiguous, check the documentation first.

If multiple documents appear to conflict, identify the conflict rather than silently choosing an interpretation. Treat `docs/DECISIONS.md` as the authority for approved decisions.

Never invent ministry definitions, financial calculations, attendance formulas, or engagement criteria.

Keep unresolved business rules marked as TBD until approved.

---

# 2. PROJECT VISION

Northpoint Dashboard 2.0 should be the central platform where Northpoint Church staff and leadership can quickly understand what is happening across every ministry.

It should help us answer three fundamental questions:

### How are we doing today?
- Are we growing, declining, or remaining stagnant?
- How are current metrics performing compared with historical trends?
- Are we meeting our leadership-defined targets?
- Are the indicators of ministry health improving?
- Are people taking meaningful next steps?

### Where are we headed?
- Based on historical attendance and seasonal trends, what can we reasonably expect in the future?
- How do our statistical forecasts compare with our leadership targets?
- Are we building momentum or losing it?
- Which leading indicators suggest future growth or decline?

### What needs attention?
- What is working particularly well?
- What has recently changed?
- What is underperforming?
- Which metrics show statistically meaningful or unusual patterns?
- What opportunities or problems should ministry leaders investigate?

The dashboard should eventually function as both an analytics platform and an intelligent decision-support system.

**Design philosophy: Simple at first glance. Powerful when explored.**

A staff member should be able to open the dashboard and understand the general health of their ministry within seconds.

More detailed information, historical comparisons, underlying records, and statistical analysis should be available through progressive drilldowns.

Avoid unnecessary complexity, cluttered dashboards, excessive charts, or visual elements that do not communicate something useful.

---

# 3. TECHNOLOGY AND ARCHITECTURE

We are beginning development in Replit, but we intend to maintain the ability to move the project to GitHub and other hosting platforms later.

Avoid unnecessary vendor lock-in.

Our proposed technology stack is:

**Frontend**
- Next.js
- React
- TypeScript
- A modern, accessible component library
- Responsive UI for desktop, tablet, and mobile

**Backend**
- TypeScript API layer
- PostgreSQL database
- Python services for ingestion, statistical analytics, and forecasting when appropriate

**Infrastructure**
- Version-controlled database migrations
- Environment-based configuration
- Secure secrets management
- Background jobs for data synchronization
- Structured logging
- Automated tests
- Reproducible development and deployment setup

This is a proposed stack, not an immutable requirement. If Replit has a more reliable implementation approach, evaluate the tradeoffs and document your recommendation before making a significant change.

### Important architectural principles

1. Separate frontend presentation from business logic and data calculations.
2. Keep the database schema maintainable, relational, and extensible.
3. Separate ingestion of external data from its normalization and analysis.
4. Centralize metric definitions so calculations remain consistent across pages.
5. Use reusable components rather than recreating UI for each ministry.
6. Use well-defined interfaces between services.
7. Make external integrations replaceable without rewriting the application.
8. Preserve historical data and the source of each record.
9. Design for thousands of people records and many years of historical information.
10. Make the application compatible with ordinary Git-based development workflows.

Do not introduce unnecessary microservices, queues, containers, or infrastructure complexity before they are justified.

Choose the simplest architecture that satisfies our requirements while preserving clear boundaries.

---

# 4. USERS, AUTHENTICATION, AND PERMISSIONS

The application will have three primary user levels:

**Staff**
- Access to general dashboard metrics.
- Access to approved ministry analytics.
- Access to permitted individual attendance records.
- No access to individual donor identities, contributions, or financial transactions.

**Leadership**
- Access to church-wide reporting and analytics.
- Access to additional leadership-level insights where configured.
- Access to permitted individual attendance records.
- No access to individual donor identities or giving transactions unless an approved future policy explicitly changes this.

**Admin**
- Full system configuration privileges.
- User and permission management.
- Integration management.
- Metric definitions and thresholds.
- Historical data administration.
- Financial and individual giving access.
- Scorecard and reporting configuration.

Authentication should support Northpoint Google accounts.

Replit's existing authentication capabilities may be used initially, but authentication must be implemented through a replaceable adapter so we can eventually migrate to Google Workspace authentication without rebuilding the application.

Use secure, server-side authorization.

Never rely on frontend visibility alone to restrict access.

Implement permission checks in APIs, data queries, exports, AI tools, and reporting functions.

Financial data privacy is a particularly important requirement.

---

# 5. CORE PRODUCT MODULES

The complete application will eventually include the following modules.

These are future product requirements, **not instructions to implement everything during initialization**.

## A. Main Dashboard

A simple overview presenting:

- Adult attendance
- Kid and student attendance
- Giving
- Current week metrics
- Four-week rolling averages
- Year-over-year comparisons
- Leadership targets
- Historical trends
- Health indicators
- Engagement levels
- Leading and lagging indicators
- Forecasts
- Areas needing attention

Use configurable red, yellow, and green indicators where appropriate.

Do not invent thresholds. These must come from approved, administrator-configurable definitions.

## B. Ministry Dashboards

Provide dedicated pages for:

- Service Programming (SPD)
- Communications
- Giving
- Connection
- InsideOut
- Transit
- UpStreet
- Waumba Land
- Special Sundays (Christmas and Easter)
- Camp 75

Each page should display relevant metrics, historical trends, comparisons, operational information, and ministry-specific scorecards.

Use the ministry specifications in `docs/specs/` to determine the requirements for each page.

## C. Engagement Analytics

Track engagement across four dimensions:

1. Giving
2. Serving
3. Group participation
4. Regular attendance of a person's children or students

Engagement levels are defined by the number of qualifying dimensions:

- Engaged 1: at least one dimension
- Engaged 2: at least two dimensions
- Engaged 3: at least three dimensions
- Engaged 4: all four dimensions

The exact qualification rules, including regularity and household eligibility, are not yet finalized.

Build these definitions as configurable, versioned rules rather than hard-coded assumptions.

Unknown or unavailable information must not automatically be treated as non-engagement.

## D. Attendance Forecasting

Eventually provide a forecasting system that allows users to:

- Select historical analysis periods.
- Choose forecast horizons.
- Compare actual attendance against leadership targets.
- Compare actual attendance against statistical forecasts.
- Evaluate seasonal patterns.
- View prediction uncertainty.
- Understand forecast accuracy over time.

Historical events, COVID, building changes, changes in service times, and other structural changes should be preserved and modeled appropriately.

Attendance forecasting is the initial priority, but design the analytics architecture to support other metrics later.

## E. Person Journeys

Eventually track the ways people connect with Northpoint over time.

Examples include:

- First attendance
- Return attendance
- Discover Northpoint participation
- Group interest
- Joining a group
- Volunteer team exploration
- Beginning to serve
- Beginning recurring giving
- Kid/student return visits

The goal is to understand retention, engagement progression, conversion rates, and common patterns.

Do not assume causation from correlation.

Ensure person-level information is permission-controlled.

## F. Ministry Scorecards

Preserve the existing scorecard systems while allowing administrators to configure:

- Categories
- Rating criteria
- Scoring scales
- Weights
- Calculation methods
- Templates
- Effective dates

Many existing scores use a 1–4 scale.

Scorecards may be entered directly into the application or imported from forms/spreadsheets.

Preserve the distinction between individual ratings, averages, and summary scores.

## G. AI Data Analyst

Eventually implement an AI-powered assistant that:

- Answers natural-language questions about dashboard data.
- Identifies statistically unusual patterns.
- Makes relevant comparisons.
- Highlights potential relationships between metrics.
- Helps leadership understand what deserves attention.
- Explains the evidence behind its observations.
- Provides links to supporting metrics.

The assistant should also proactively surface important changes without being prompted.

AI responses must be grounded in actual data.

It must distinguish observed facts, statistical estimates, hypotheses, and recommendations.

It must respect the same access controls as the dashboard.

Do not give the assistant unrestricted database or SQL access.

## H. Automated Reporting

Eventually support configurable reporting through ClickUp.

Examples:

- Weekly leadership reports
- Ministry-specific summaries
- Attendance trends
- Giving trends
- Engagement indicators
- Significant anomalies
- Urgent notifications

Reporting content, recipients, delivery timing, and notification thresholds should be configurable.

Include review and approval workflows where appropriate.

---

# 6. EXTERNAL DATA INTEGRATIONS

The platform must eventually connect with:

**Planning Center**
- People
- Check-Ins
- Giving
- Groups
- Services
- Volunteer/serving records
- Other supported data needed for engagement analytics

**Communications**
- YouTube
- Instagram
- Facebook
- Google Analytics 4
- Mailchimp
- Clearstream
- Podcast platforms where supported

**Websites**
- npaustin.com
- camp75.org
- foraustin.com

**Operations**
- ClickUp
- Spreadsheet imports
- Forms and surveys
- Native manual data entry

### Integration design requirements

Use OAuth authorization wherever the provider supports it.

Ideally, an administrator should navigate to an Integrations page, select the provider, authorize the Northpoint account, and manage the connection without editing code.

The application should support:

- Authorization and reconnection
- Connection status
- Last successful synchronization
- Error reporting
- Token refresh where supported
- Configurable synchronization frequency
- Initial historical imports
- Incremental updates
- Retry handling
- Data freshness indicators

Never request that users paste third-party account passwords into the dashboard.

Some providers may require alternative authorization mechanisms or have API limitations. Document these cases and do not build fictional integration capabilities.

During Phase 0, implement only the scaffolding required to support integrations later.

**Do not request production API credentials or connect live church accounts yet.**

---

# 7. HISTORICAL DATA AND TIME CONVENTIONS

The current dashboard uses an extensive spreadsheet containing historical ministry metrics.

That spreadsheet is an important reference for:

- Existing definitions
- Historical measurements
- Ministry scorecards
- Prior attendance
- Year-over-year comparisons
- Legacy calculations

However, we do not want to reproduce spreadsheet formulas and dependencies inside the new application.

Build a clean database and migrate validated historical data into it.

Refer to:

- `docs/HISTORICAL_MIGRATION.md`
- `docs/WORKBOOK_FINDINGS.md`
- `data/workbook_inventory.csv`
- `data/legacy_columns.csv`

Historical mappings must be reviewed before publication.

Never assume a spreadsheet formula or column heading is authoritative without validation.

### Date conventions

Northpoint primarily uses a Monday–Sunday reporting week, identified by its ending Sunday.

Use the `America/Chicago` time zone for ministry reporting.

Store event timestamps in UTC where appropriate.

Preserve historical service times and venue changes.

Current regular Sunday service times are 9:00 AM and 11:00 AM for adult environments, with InsideOut meeting at 4:30 PM.

Historical service schedules may differ and must remain historically accurate.

---

# 8. DESIGN AND USER EXPERIENCE

This is a modern internal ministry intelligence platform, not a generic admin template.

The interface should feel:

- Clean
- Professional
- Minimal
- Intuitive
- Contemporary
- Visually organized
- Easy to understand
- Consistent across modules

Prioritize information hierarchy and clarity.

Use thoughtful typography, whitespace, restrained colors, and consistent chart treatments.

The home dashboard should make the most important information immediately apparent.

Support progressive disclosure: simple summary first, detailed exploration second.

Build a reusable design system for:

- Navigation
- Page headers
- KPI cards
- Charts
- Filters
- Tables
- Metric comparisons
- Data freshness indicators
- Health status
- Empty states
- Loading states
- Errors
- Permissions-aware views
- Forms and configuration interfaces

Use responsive layouts and accessible UI patterns.

Do not invent Northpoint-specific brand assets. Use existing supplied assets when available, or use a restrained temporary visual system.

**For Phase 0, build a polished but lightweight application shell. Do not fill the interface with fake operational metrics that look real.**

Synthetic data may be used for development and testing if clearly labeled.

---

# 9. DEVELOPMENT RULES

Throughout the entire project, follow these rules:

### Work incrementally

Never attempt to implement multiple major roadmap phases without explicit approval.

Each phase should produce something testable and verifiable.

### Preserve project context

Keep project documentation aligned with the codebase.

If a feature changes, update the relevant specification.

If an architectural decision is approved, record it in `docs/DECISIONS.md`.

### Prefer reusable architecture

Avoid duplicated calculations, components, business rules, and provider-specific logic.

### Test important functionality

Include relevant unit, integration, and end-to-end tests.

All authorization logic and metric calculations must be tested.

### Do not invent requirements

If a business definition is unresolved, flag it.

Implement configurable structures where appropriate, but do not silently decide the underlying policy.

### Protect sensitive data

No production people records, financial records, tokens, or API secrets should be committed to source control.

### Build for migration

Every important part of the application should be portable outside Replit.

Use clear setup instructions, standard dependencies, and reproducible database migrations.

### Communicate clearly

After completing a task, provide:

1. What you implemented.
2. Which files were created or changed.
3. Which tests were run and their results.
4. Anything incomplete or blocked.
5. What the next roadmap task should be.

Do not declare something finished unless it actually works.

---

# 10. YOUR IMMEDIATE TASK — PHASE 0 ONLY

Now that you understand the project's full scope, implement **Phase 0: Project Foundation** as defined in `docs/ROADMAP.md`.

Your deliverables should include:

### A. Project structure

Create a maintainable, Git-compatible repository layout separating the web application, shared libraries, and future worker components where appropriate.

Preserve the existing documentation.

### B. Application foundation

Initialize the frontend and backend foundation using the selected architecture.

Provide a working development server.

Create a simple but polished dashboard shell with:

- Main navigation
- Header
- Placeholder Dashboard page
- Placeholder ministry navigation
- Placeholder Administration section
- Clear indications that live data is not yet connected

Only implement actual routes that are useful in Phase 0.

### C. Database foundation

Configure PostgreSQL connectivity and an initial migration workflow.

Prepare the structure for future domain models without prematurely implementing the entire production schema.

Do not load real ministry data yet.

### D. Authentication architecture

Create a provider abstraction suitable for Replit authentication now and Google Workspace authentication later.

Use verified authentication mechanisms.

Do not assume authentication is secure merely because a login button or session exists.

If live authentication configuration depends on environment capabilities or credentials, document the exact setup and keep any incomplete functionality disabled.

### E. Development quality

Configure:

- TypeScript checking
- Linting
- Formatting
- Unit test runner
- Environment variable validation
- `.env.example`
- `.gitignore`
- Basic health checks
- Clear development commands
- CI workflow where practical

### F. Synthetic development fixtures

Create a small amount of obviously synthetic data for testing development infrastructure.

Do not present synthetic numbers as authentic Northpoint statistics.

### G. Documentation

Update `README.md` with actual installation, startup, testing, and environment instructions.

Explain how to run the project in Replit and how it could be run independently.

Document any changes to the proposed technical architecture and why they were made.

### H. Verification

Before reporting Phase 0 complete:

- Verify the application starts.
- Verify health checks.
- Run linting.
- Run type checking.
- Run tests.
- Verify database connectivity and migrations, if implemented.
- Verify there are no required secrets committed to source.
- Report any unavailable infrastructure or incomplete functionality.

Do not claim a test passed without actually running it.

---

# 11. BEFORE YOU BEGIN IMPLEMENTATION

First, review the repository and provide a concise implementation plan describing:

1. Your understanding of the application.
2. The technical stack you recommend and why.
3. The architecture and repository structure you intend to use.
4. What you will implement in Phase 0.
5. What you will deliberately postpone.
6. Any major conflicts between the documentation and your proposed approach.

Then proceed with Phase 0, provided there are no unresolved architectural conflicts requiring my decision.

Do not interrupt implementation for minor technical choices you can reasonably make yourself.

At the end, show me the running application and provide a clear summary of what is ready for the next phase.

**The goal is not to build a demo dashboard. The goal is to establish a production-quality foundation for the complete Northpoint Dashboard 2.0 platform.**

Begin by reading the project documentation.