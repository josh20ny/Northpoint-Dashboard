# Leadership Reporting, ClickUp and Notifications

## Weekly report
Schedule around a configurable data cutoff after Sunday. Template answers three questions: How are we doing? Where are we headed? What needs attention? Provide attendance, check-ins, giving aggregates, serving, groups, engagement, first-visit / next steps, communications summary as toggled by admin. Report sections, channels, role-based scopes and thresholds configurable.

## Dispatch workflow
Generate preview → validate sources/freshness/permissions → approve/auto-send (decision pending) → send to selected ClickUp Chat channel → record external message ID and delivery status. Recipient permission must be at least as restrictive as included data. Do not include donor-specific details in a channel report.

## Technical caveat
ClickUp Chat message endpoints exist but documentation described them as experimental in Nov 2026. Prototype a channel message before finalizing architecture; fallback to ClickUp task/comment or approved alternate destination, not a fabricated integration.

## Immediate alerts
Severity, rule, channel, quiet hours, dedupe interval, acknowledgment, snooze and escalation configurable. No notification storm on every sync retry. Sensitive details must stay behind authenticated dashboard links.
