# Visual System (initial proposal)

Use a restrained, high-contrast, easy-on-the-eyes system consistent with Northpoint's existing brand once actual colors, typography and logo usage are approved. Avoid inventing brand standards.

- Layout: 12-column desktop grid, 1-column mobile; summary above details; generous whitespace.
- KPI: number, comparison, trend, health label, as-of timestamp and definition link.
- Status: green/yellow/red with text and icon; gray for stale/unavailable.
- Components: SummaryCard, HealthMetric, EvidenceDrawer, TrendChart, ServiceSelector, PeriodPicker, ForecastControls, SourceFreshness, ScorecardForm, ConfigEditor, AuditHistory.
- States: loading, no source connected, insufficient history, partial backfill, zero, error, stale, access denied.
- Use component/storybook snapshots and accessibility checks before establishing shared patterns.
