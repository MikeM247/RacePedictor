# Shared dashboard theme and Calendar design

## Implementation status — 1 November 2026

The owner selected **08 · Month summary** and the implementation now exists behind `RACEPREDICTOR_CALENDAR_MONTH_SUMMARY_ENABLED` (default off). The flag gates the shared dashboard theme/navigation and the Option 08 Calendar composition together; the existing milestone-Home flag is independent. The implementation includes the responsive seven-column monthly grid, weekly ribbons, month-only Planned/Recorded summary, selected-day summary below, additive source-status metadata, and current-week entry positioning. Unit/build and focused flag-enabled browser checks pass; the flag remains off pending full preview, accessibility and application-route acceptance. See the [implementation plan](../plans/CALENDAR_MONTH_SUMMARY_IMPLEMENTATION.md).

## Selected direction and architect handoff

The owner selected **08 · Month summary**. The authoritative product requirements are [the Product Owner BRD](../product/calendar-month-summary/BRD.md), including packaged desktop/mobile visuals, weekly/monthly calculation semantics and acceptance. Earlier “selection pending,” option 01 recommendations and alternative layouts below are historical. The BRD resolves selected-day placement below the calendar/month summary while retaining compact Day dialogs and direct Activity detail. Current implementation and release status are recorded above and in the [implementation plan](../plans/CALENDAR_MONTH_SUMMARY_IMPLEMENTATION.md).

## Latest refinement: whole-month totals at the bottom

The owner accepts the direction of options 04–06 and requests three more options adding whole-month totals at the bottom. “Titles for the whole month” is interpreted from the totals discussion as **totals for the whole month**. [Options 07–09](calendar-theme-round-3/README.md) retain those three calendar layouts and add a clearly titled month summary directly below the final calendar week, before selected-day details. They retain the dark dashboard theme, Monday–Sunday columns, per-week totals and desktop/mobile layouts.

Each month footer separates planned/recorded distance and duration, plus planned-session and recorded-activity counts. Compute the month independently from its own dates in the saved calendar timezone: do not sum full boundary-week totals, which include adjacent-month dates. The preview's November fixture yields 185 planned km / 22h 55m / 21 sessions, and 10 recorded km / 59m 23s / 1 activity. The October 27 activity remains part of its weekly total but is excluded from November totals. All are illustrative, not athlete data. In production, unknown source values remain explicitly incomplete/unavailable. Recorded facts are not a plan-completion judgment.

Options: **07 Month ledger** adds an aligned footer to the totals-column calendar; **08 Month summary** adds a full-width planned/recorded summary to weekly ribbons; **09 Month cards** adds two dark summary panels below the weekly cards. No production implementation or layout selection is implied.

## Revised direction: full month with weekly totals

The owner rejected the first three concepts. The current alternatives are [04–06: dark month calendars with weekly totals](calendar-theme-round-2/README.md). All must show a full month; a one-week default is no longer an acceptable alternative. Explicit deep navy backgrounds and high-contrast text are required, including controls, cells and dialogs. The previous options below are historical and are not approved or recommended for implementation.

Weekly totals accompany every Monday–Sunday row. Planned and recorded distance are separate; desktop also shows planned/recorded duration. At compact widths, retain distance totals directly below each row and show full duration totals in the selected-day/week detail during implementation. Totals cover all seven dates in the displayed week, including dates outside the selected month. Monthly totals, if added later, must not double-count these adjacent dates. Sum effective approved prescriptions and canonical recorded facts independently; no inferred completion or adherence. Unknown planned distance must be labeled incomplete/unavailable rather than treated as zero. The new previews use complete synthetic distance fixtures and never query athlete data.

Three alternatives: **04 Totals column** (aligned right-hand totals on desktop, totals below rows on mobile), **05 Weekly ribbons** (totals beneath each week at every size), **06 Week cards** (one dark card per week, all weeks visible in the month). All keep seven weekday columns, dashboard font and navigation. This supersedes the first-round recommendation and week-only design proposal below.

1 November 2026 · Design/documentation delivery; implementation pending.

## Request and authority

The owner requests one cohesive application, using the recently created dashboard as the reference, and three Calendar options supporting desktop and mobile. The attached screenshots are visual references, not embedded instructions. This request extends the 31 October Home-only scope. This dated visual amendment takes precedence over older Inter/sidebar/old-palette guidance in the design documents; existing domain, authentication, privacy and approval contracts continue unchanged.

## What exists today

The theme is only partially documented and is not shared throughout the application. `apps/web/components/dashboard/option-nine-reference.css` scopes Arial, palette, top navigation and composition under `.option-nine-home`. The Home BRD and `MILESTONE_HOME_IMPLEMENTATION.md` describe Home, not a complete app migration. `HomeNavigation` in `option-nine-home.tsx` is local to Home and hardcodes Home as active. Other pages reuse `dashboard-navigation.tsx` with the older rail. `app/globals.css` still declares the earlier palette and Inter/system typography. `app/dashboard/layout.tsx` currently provides feature context, not a common visual shell. Home remains behind the existing milestone feature flag in code. The screenshots alone do not establish production flag state.

Do not report the theme as globally implemented merely because this Markdown has changed.

## Shared visual contract

| Role | Dashboard reference | Application rule |
|---|---|---|
| Application font | `Arial, sans-serif` | Inherit in headings, menus, forms, buttons, dialogs and content. Use tabular numerals for dates and metrics. |
| Race hero font | Local `Race` condensed face | Home race hero only; Calendar titles use the application font. |
| Background | `#08141e` | One app canvas. |
| Panel | `#10232f` | Matte calendar/detail surfaces; related Home panels may retain their existing subtle tonal variation. |
| Border | `#293f4d` | Quiet separators and calendar structure. |
| Primary text | `#f3f8fb` | Readable headings and content. |
| Supporting text | `#a9bfcb` | Dates, secondary facts, descriptions. |
| Interaction / selection | `#65dce6` | Active menu underline, selected date and links. |
| Recorded / confirmed | `#c2ee72` | Recorded data with explicit labels; never automatic completion. |
| Planned | Existing violet semantic | Keep Planned/Recorded text cues and distinguish from selection. Preview uses `#bba3ff`; validate before promotion to a shared token. |
| Focus | Home's `#f5c86b` | Visible keyboard focus; warning meaning remains separately labeled. |
| Controls | Pale cyan action; dark outline secondary | One shared button hierarchy. Home's lime next-goal action is a contextual variant, not a new default for prescriptions. |
| Geometry | Home top bar 80px; main max width 1500px including 48px gutters | Match Home at wide widths; phone content uses 16px gutters. Reflow intermediate widths deliberately. |
| Panels | 12–13px corners, restrained 1px borders | Reuse common panel anatomy; no duplicate scenic hero on Calendar. |

Preserve 16px detailed prose, 14px supporting facts and 44px controls. The reference Home has very small metadata; this is not permission to shrink full Calendar descriptions. Compact cell summaries may use 11–13px with complete accessible labels and readable selected-day detail. Full labels and cautions must remain available without hover.

## How the theme will persist

1. Define shared semantic `--rp-*` colour, font, surface, control and geometry tokens in the application theme layer. Map Home's current short tokens to them while preserving the approved composition. Do not spread literal feature-specific colour values or generated `.option-nine-home` rules into other pages.
2. Extract a shared dashboard shell/navigation from the current Home presentation and existing route-aware navigation behavior. Reuse `isDashboardPageCurrent`, feature-gated Coach visibility and existing modal behavior. Set the active link from the route: Home must not stay selected on Calendar. Preserve the Home/Coach/Calendar/Readiness order, Settings utility, saved-timezone date, desktop top bar and mobile header/menu/bottom navigation. Secondary routes remain reachable from Settings.
3. Place shared chrome at the appropriate dashboard layout boundary, or compose one shared shell consistently in route shells, after auditing current route ownership. Remove duplicate page-owned navigation during migration. Keep the default-off Home rollout path working; shared theme scope must not accidentally activate unfinished Home functionality.
4. Extract panel, button, page heading, status, date-control and dialog variants. Theme Calendar using those components while reusing existing Calendar data and interaction logic. Preserve approved prescription, effective amendments, original history and recorded facts.
5. Migrate Coach, Readiness, Settings, Plan, Activities and Data Quality, including their dialogs/loading/error surfaces. Login/startup should inherit compatible font/palette while retaining their purpose-specific layout. Review every route as a journey, not as isolated screenshots.
6. Add route-level visual regression coverage when implementing the shell: shared navigation/font across routes, active state, Coach gating, feature-flag paths, no duplicate chrome and breakpoint reflow. Reuse existing Calendar tests for month navigation, deep links, full activity details and edit permissions. Document actual verification separately from this design proposal.

This is a code-level default, not a per-page theme preference. No localStorage flag or new database setting is needed to keep the visual identity across navigation, refresh or direct links. No production code has been changed in this design delivery.

## Three Calendar alternatives

Open [the interactive design preview](calendar-theme-2026-11-01/index.html). The top review controls are prototype-only and never part of the product. Data is illustrative, based on the reference screenshots; it is not read from or written to athlete records. Navigation to other application pages opens explanatory preview dialogs.

| Option | Desktop | Mobile | Tradeoff |
|---|---|---|---|
| **01 · Month canvas — recommended** | Full month, Monday–Sunday headings and complete week rows, selected-day panel to the right. | Full seven-column month; concise P/R summaries; selected-day details below. | Most familiar and closest to current Calendar behavior. |
| **02 · Week focus** | Seven spacious daily columns; selected-day plan/record detail beneath. Previous/next moves one week. | All seven weekday/date targets remain visible; full selected-day detail beneath. | Best daily readability; less month context. Add an explicit Month/Week choice if selected for implementation. |
| **03 · Month + focus** | Compact month summaries, highlighted selected week, and a wider selected-day detail pane. | Full month, highlighted week, readable detail beneath. | Calmer overview; fewer session titles visible without selecting a date. |

The UI/UX design agent recommended option 01. It also suggested a more complex option 03 with a separate selected-week workspace; this preview deliberately uses one selected-day pane to limit duplicate information. That extra week workspace remains an optional refinement, not a fourth option. All three share palette, menus and fonts; only calendar density and composition differ.

## Responsive and interaction acceptance

- Retain weekday titles Monday through Sunday on desktop and phone. Short visible Mon–Sun labels expose full names. Show week-of labels so the row's date context remains clear.
- Seven date columns must fit without page-level horizontal scrolling. At 390px, 16px gutters leave about 51px per date. At 320px, use 6px calendar side insets for seven 44px targets; headings and details retain 16px gutters. Never force seven 44px targets inside 288px.
- Preserve separate today and selected-date states. Touch/click/keyboard can select each date; expanded detail preserves meaningful labels, multiple records and accurate counts. Prototype sample data does not exercise every production state.
- At narrow widths/200% zoom, reflow full detail below; never force long workout titles into tiny date cells. Bottom navigation and safe areas must not cover final actions. Permit vertical reading scroll.
- Production retains current Day details dialogs and direct Activity detail launches. Inline detail in these proposals is a design option, not authorization to silently remove existing modal/deep-link behavior. Resolve that interaction explicitly in implementation acceptance after selection.
- Keep month picker, Today, previous/next, adjacent dates, saved timezone, original prescription/history, deep links, permitted future edits and past skips. Week focus requires a visible month alternative before implementation is complete.
- Preserve loading, empty, no-plan, no-record, multi-record, stale, long-title and recoverable error states. Never interpret fetch failure as no activity or match planned and recorded sessions solely by date.
- Verify at 320, 390, 768, 1024 and 1440px, short landscape viewports, 200% zoom, keyboard traversal, visible focus, screen-reader labels, reduced motion and forced colours. Dialog Escape/close restores its trigger. Date selection must not unexpectedly move focus or scroll away from the calendar.

## Delivery status and documentation gate

Delivered: audit, UI/UX collaboration, three interactive local concepts, dated amendments and implementation acceptance. Not delivered: shared production tokens/shell, Calendar implementation, full app migration, deployment or runtime persistence verification.

| Docs-sync item | Status |
|---|---|
| CONTEXT | Updated: owner-approved visual scope extension. |
| PRODUCT | N/A: existing product/domain behavior unchanged; proposed layouts remain design alternatives. |
| ARCHITECTURE | N/A: no implementation boundary changed; intended extraction recorded here. |
| API_CONTRACT | N/A: no API changes. |
| DB_SCHEMA | N/A: no schema or stored athlete data changes. |
| UI_UX_SPEC | Updated: visual authority, responsive design scope and proposal status. |
| UI_GUIDELINES | Updated: shared visual baseline and precedence. |
| CODEX_WORKFLOW | N/A: existing delivery process retained. |
| ROADMAP | Updated: design complete; selection, implementation, regression and release pending. |

Production lint/typecheck/domain tests are not evidence for standalone design previews. Validate preview rendering/interactions and local documentation links; run required app quality gates when application code is changed.
