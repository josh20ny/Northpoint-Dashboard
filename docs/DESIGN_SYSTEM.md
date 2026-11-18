# Visual System (initial proposal)

Use a restrained, high-contrast, easy-on-the-eyes system consistent with Northpoint's existing brand once actual colors, typography and logo usage are approved. Avoid inventing brand standards.

- Layout: 12-column desktop grid, 1-column mobile; summary above details. Home uses compact reporting context and gives ministry cards enough space for the headline, comparisons and chart.
- KPI cards lead with the value and reporting Sunday. Use compact directional comparisons, a YTD two-line chart, accessible text and a direct detail link. Keep technical provenance available on demand. A meaningfully incomplete value carries a short caveat. See [Phase 5B](PHASE_5B.md).
- Status: green/yellow/red with text and icon; gray for stale/unavailable.
- Components: SummaryCard, HealthMetric, EvidenceDrawer, TrendChart, ServiceSelector, PeriodPicker, ForecastControls, SourceFreshness, ScorecardForm, ConfigEditor, AuditHistory.
- States: loading, no source connected, insufficient history, partial backfill, zero, error, stale, access denied.
- Use component/storybook snapshots and accessibility checks before establishing shared patterns.
