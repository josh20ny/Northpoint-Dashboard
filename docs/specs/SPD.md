# Service Programming / Adults — Ministry Specification

Phase 5 is the accepted development baseline. [Phase 5B](../PHASE_5B.md) governs the next implementation. Long-term measures below follow the roadmap.

## Questions the page must answer
What is happening this week? How does it compare to plan, 4-week trend and YoY? Where is ministry health improving or declining? Which measurable next step deserves attention?

## Requested information
Adult 9:00 and 11:00 in-person attendance, online connections and legacy multiplier, service capacity/distribution, volunteers, service plans, scorecards (Welcome/Music/Vision/Message/Production/Walk Away).

## Sources and definitions

Adult auditorium attendance is manually counted at each service. The accepted workbook supplies historical counts where PCO never recorded them, including aligned prior-year totals. New entries and corrections are saved together in the existing native form. PCO Services provides plans and volunteer scheduling. Preserve date-effective service order, real zeros and unrecorded Sundays.

## Phase 5B display

Home links to `/ministries/service-programming`. On the detail page show the two service counts, total, adjacent average selector/window and a chart of this year, aligned last year and the eight-week average. Place weekly history high on the page with prior-year total, current-year first/second/total and YoY. Positive YoY is green and zero or negative is red. Show a signed value or equivalent text. Hide future rows and routine quality/source marks. Keep the row Edit actions and one-save entry, collapse revision history, and put serving history at the bottom. Retire the redundant reporting and count-definition controls. The legacy `/attendance` path still points here.

## Phase and acceptance
Implement after shared core and relevant provider mapping. Tests must verify source date alignment, zero/unknown handling, duplicate prevention, permission boundaries, score version if applicable and reconciliation to owner-approved historical weeks. Explicitly record unresolved definitions in `OPEN_QUESTIONS.md`.
