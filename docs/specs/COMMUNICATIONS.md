# Communications — Ministry Specification

**Status:** v0.1. Business rules not explicitly confirmed remain draft.

## Questions the page must answer
What is happening this week? How does it compare to plan, 4-week trend and YoY? Where is ministry health improving or declining? Which measurable next step deserves attention?

## Requested information
YouTube main/students/kids, livestream/7-day/28-day views, watch time, impressions, CTR, subscriptions, social engagement, Facebook, podcasts, GA4 sites, Mailchimp audiences, Clearstream.

## Authoritative-source and data-definition cautions
Maintain per-channel account identities and changing metric definitions; do not sum overlapping livestream and video views as unique users. Provider capabilities must be verified.

## Minimum view
Current week headline metrics, last 4 completed weeks, YoY comparison, date/service filters, trend and targets, current health statuses (when configured), last sync, issues worth attention and drilldowns to service/evidence.

## Phase and acceptance
Implement after shared core and relevant provider mapping. Tests must verify source date alignment, zero/unknown handling, duplicate prevention, permission boundaries, score version if applicable and reconciliation to owner-approved historical weeks. Explicitly record unresolved definitions in `OPEN_QUESTIONS.md`.
