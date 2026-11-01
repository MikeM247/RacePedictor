# Calendar Month Summary Implementation

1 November 2026 · Option 08 · Implementation and release handoff

## Outcome and rollout boundary

Implement the selected [BRD](../product/calendar-month-summary/BRD.md): a shared, dark dashboard shell and full-width monthly Calendar, with one Planned/Recorded totals ribbon under each Monday–Sunday row and an independently calculated whole-month summary below the final week. The selected-day summary follows the month summary.

Every normal Calendar entry and return positions the saved-timezone current week. A valid explicit date/session target takes precedence; month browsing remains on the requested month; ordinary scrolling is never continuously corrected. Existing authentication, approved-plan authority, session-edit permissions, Activity details and Day details remain authoritative.

The implementation is controlled by `RACEPREDICTOR_CALENDAR_MONTH_SUMMARY_ENABLED` (default off). The flag gates the shared dashboard presentation/navigation and Option 08 composition together. `RACEPREDICTOR_MILESTONE_HOME_ENABLED` remains independent. It has not been enabled for production.

## Delivered slices

| Slice | Implemented result | Current verification |
|---|---|---|
| 1 · Shared presentation | `DashboardNavigation` renders route-aware desktop/mobile navigation; the dashboard layout shares dark canvas, Arial typography, panel/control tokens, and responsive gutters across Home, Calendar, Coach, Readiness, Settings, Plan, Activities and Data Quality. Home's Race display face remains scoped to its hero. Modal inertness includes shared navigation containers. | Feature-enabled Calendar and navigation are exercised in Playwright. Full route/Coach-gating/Home-flag matrix is still a preview gate. |
| 2 · Read contracts and source metadata | Existing Calendar endpoint/date range retained. Additive `planReadStatus` and `scheduleReadStatus` fields distinguish no plan, failed read, effective schedule and approved-source fallback. Local activity query pads range bounds, converts timestamps in saved timezone and filters to requested local dates. Cloud fallback remains explicit reference content. | Calendar contract, local service, cloud read-handler tests and full suite pass. No database change. |
| 3 · Calendar composition and aggregates | Seven-column full month; weekday labels; weekly ribbons with both distances visible and labeled duration/count disclosures; six Planned/Recorded month facts; selected-day summary below; no permanent day sidebar in Option 08. One pure source-aware totals function serves week and month. Response is validated before totals. | Aggregation unit tests and fixture browser totals pass. Detail/edit and all source edge-case acceptance still need broader regression. |
| 4 · Entry positioning | Measured sticky navigation/controls/weekday headers; one-shot document scrolling positions today's/date/session week after matching data/layout. User input cancels pending automatic positioning; Today/month navigation creates an explicit position request. History state is preserved and app-owned selection URLs are marked automatic. | Playwright covers normal entry, date/session target, Today, month navigation and browser Back at phone/desktop. Dialog scroll/focus restore and delayed-load cancellation remain to verify. |
| 5 · Verification and release | Dependency lockfile install, Prisma generation, lint/typecheck, unit suite, production build, feature-flag browser checks and docs synchronization completed. | Production activation remains blocked on preview and remaining acceptance gates below. |

## Data and totals contract

`packages/core/src/contracts/coaching.ts` keeps the response additive and strict. `planReadStatus` is `active`, `none`, or `unavailable`; `scheduleReadStatus` is `effective`, `approved_fallback`, or `unavailable`; existing `activitiesReadStatus` remains. The browser parses the full Calendar schema and checks the returned range before normalizing or aggregating records. Requests cover the complete Monday–Sunday frame around the selected month. The local precedence remains approved plan timezone → supported saved profile timezone → application default. Cloud uses approved-plan timezone and its supported fallback; an unavailable plan-context read blocks automatic positioning.

`apps/web/lib/calendar-totals.ts` sums source units before formatting. Planned totals include effective active-plan running sessions, excluding skipped/rest/draft/retired sessions. Recorded totals include distinct canonical run/trail/treadmill activity identities. Week ranges include all seven displayed dates; month totals independently filter to the selected month's first and last date. Missing planned distance is incomplete; complete empty periods can be zero. Failed reads, no active plan, incomplete metrics, and approved-source fallback remain distinct. Recorded volume never implies prescription completion.

## Entry and navigation behavior

| Trigger | Positioning |
|---|---|
| Normal entry, reload, return from another route or browser Back | Select saved-timezone today and reveal its week after data/layout are ready. |
| Valid explicit date/session URL | Reveal target week; session detail behavior remains exact. |
| Today | Select today's date/month and reveal its week. |
| Previous/Next/month picker | Select requested month and show its first week. |
| Dialog close | Return focus and scroll to the launcher/prior context. |
| Background refresh, resize, midnight or tab focus | Update data/markers without resetting browsing position. |

Automatic positioning never moves keyboard focus, does not run continuously, and is canceled when the athlete interacts before the matching range is ready. Sticky heights are measured with `ResizeObserver`; mobile bottom navigation is included in available viewport geometry. If a week cannot fit, the target date and week context take priority.

## BRD traceability and remaining acceptance

| Requirement | Implementation / evidence | Status |
|---|---|---|
| CM-01–02, AC-01–02, AC-04 | Dark full month, seven equal columns; six fixture weeks at 320/390/768/1024/1440 and 844×390. 44px date targets checked at 320. | Focused layout/browser checks pass; 200% zoom remains. |
| CM-03–04, AC-05, AC-07, AC-10–12 | `calendar-totals.ts`, contract validation, local/cloud status metadata, fixture totals, dedupe/boundary/skipped/no-plan/failure tests. | Core logic/unit evidence passes; all BRD source permutations still need route-level/preview proof. |
| CM-05, AC-03, AC-18 | Shared layout and route-aware nav, feature flag, independent Home flag. | Calendar shell passes; every named route, Coach availability and both Home flag states remain. |
| CM-06, AC-06, AC-08–09, AC-13–14 | Existing date/session details and mutation handlers retained; focused browser test covers explicit session, month navigation, Today and Back. | Legacy Home/Calendar browser suite rerun: 9/15 pass. Six remain red due to pre-Option-08 selectors/layout and Home fixture expectations (including the old `.calendar-day` grid and old navigation name); update/triage those tests before treating the legacy matrix as acceptance evidence. |
| CM-07, AC-11–12 | Validated source contracts and unavailable/incomplete/no-plan/fallback states. | Unit coverage passes; stale/partial/failure presentation needs local/cloud preview acceptance. |
| CM-08, AC-16–17 | Dashboard layout/theme token layer; document scrolling, no aggregate fetch waterfall or mutation. | Code and focused viewport checks pass; route migration and safe-area/scroll review remain. |
| AC-15 | Semantic controls, disclosures, keyboard handlers and modal hooks retained; focus return behavior preserved in code. | Manual screen-reader/keyboard, forced-colour and reduced-motion acceptance remains. |
| Return-to-today amendment | One-shot measured entry position; automatic history marker; Today and browser Back coverage. | Phone/desktop fixture browser tests pass; slow-load interaction cancellation and bfcache/dialog restoration remain. |

Completed checks: `npm run lint --workspace @racepredictor/web`; all 54 web test files with `RACEPREDICTOR_CLOUD_MODE=disabled`; production build; and the feature-enabled Playwright spec using fixture-only responses and the local `online-fixture` actor. The browser spec checks 320, 390, 768, 1024, 1440 and short landscape 844×390, seven equal columns, dark/Arial shared shell, weekly ribbons, independent month totals, explicit session links, Today, month navigation and browser Back.

Before activation, verify the flag-enabled preview on local and cloud source paths; all named dashboard routes and milestone-Home flag combinations; 200% zoom, short landscape, safe areas, keyboard/screen-reader, forced colours and reduced motion; delayed-load interaction cancellation; dialog scroll/focus return; and existing session edit/activity-detail regressions. Record evidence against BRD AC-01–18. Do not mark production completion before those checks pass.

Rollback disables the shared presentation flag. No athlete-data rollback or database migration is required. The flag remains off in this workspace.
