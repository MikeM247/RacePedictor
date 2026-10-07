# UI_UX_SPEC

> **6 October 2026 approved split presentation:** Calendar and Training activity records place Splits below the run summary, initially expanded when data is available. Actual lime bars compare with per-split violet planned markers/ranges, with five or ten visible splits based on chart width. Desktop arrows, mobile horizontal swipes and keyboard selectors preserve exact selected values and a fixed global scale. Effort guidance has no invented numeric target; partial splits show their recorded distance. Chart/Table and per-activity state persist for the browser session. See [the split comparison handoff](plans/ACTIVITY_SPLIT_COMPARISON.md).

> **4 October 2026 approved presentation amendment:** Home and Calendar are the only primary destinations; Settings contains secondary goal/plan management, activity history/import and data recovery links. Navigation shows the existing logo without a duplicate app name. Home uses Goal + milestone → Today's focus → Latest activity with supported approved why/how and separate adherence/performance summaries. Routine Home omits plan versions, AI processing and publication stages; material evidence limits stay adjacent. Calendar uses the Monday-first month grid at every width. At 1200px and above, selecting a date updates the selected-day sidebar; below 1200px it opens a date-specific Day details dialog with every planned session and recorded activity. Narrow cells show the first planned and recorded distance, duration when distance is unavailable, or N/A, plus an accurate +N count. Planned and recorded entries never replace each other or prove completion. Saved API timezone governs today and date selection. The full existing details/actions/history remain available. No matching/scoring/narrative-sidecar capability is added. See [the mobile month handoff](plans/CALENDAR_MOBILE_MONTH_IMPLEMENTATION.md) and the updated design authority.

> Redesign authority: [Design Intent Contract](design/DESIGN_INTENT_CONTRACT.md) takes precedence for redesign information architecture, presentation, interaction, and UX acceptance. Existing domain, privacy, and approval rules remain binding. Older navigation and layout requirements below are historical where they conflict with the contract.

## Product UX Direction
- **Primary target:** desktop users (analyst/coaching workflows).
- **Secondary target:** responsive baseline for tablet/mobile access, with feature parity evolving later.

## Dashboard Information Architecture (Desktop-First)

### Global Shell
- Race Predictor branding uses the supplied runner-and-prediction logo in the sign-in experience and a tightly cropped transparent version in dashboard navigation; navigation has no separate duplicate app-name text. The logo link retains its accessible Home name. The tab uses the dedicated Race Predictor app icon.
- Initial analytics navigation order:
  1. Overview
  2. Activities
  3. Performance
  4. Data Quality
  5. Settings
- The Phase 1 Digital Coach addendum below supersedes this initial order with the current Today, Plan, Calendar, Activities, Data Quality, and Settings navigation.
- Shell regions:
  - Left navigation (global)
  - Top bar (global, page-scoped controls)
  - Main content (page-specific modules)
- Top bar:
  - Date range selector
  - Source filter
  - Athlete filter
  - Quick refresh/status indicator

### Global Top Bar Behavior (Normative)
- Control order (left → right):
  1. Page title
  2. Date range selector
  3. Source filter
  4. Athlete filter
  5. Refresh/status indicator
- Date range + source filters apply to **Overview, Activities, Performance, Data Quality**.
- Athlete filter is shown but read-only/single-option in v1 single-athlete mode.
- Settings does not require data filters; it keeps only title + status indicator.
- Filter semantics:
  - Changing a filter transitions page content to loading, then renders resolved data/empty/error state.
  - Active filters are always visible as chips or inline labels.
  - Refresh does not clear filter state.
  - If data is older than refresh threshold, show stale indicator until next successful fetch.

## Page Definitions (IA + Required Modules)

### 1) Overview Page
- Required modules:
  - KPI card row (distance, time, pace, activity count)
  - Primary trend chart area
  - Secondary insights/anomalies panel
  - Import/normalize progress summary
- Primary user question: "What is my current performance snapshot?"

### 2) Activities Page
- Required modules:
  - Filter panel
  - Sortable table/list of activities
  - Pagination/cursor continuation affordance
  - Activity detail drawer/panel on row selection
- Detail expectations:
  - Show splits and route signature when present
  - If absent, render graceful "not available" sub-state (not full-page error)
  - Present the selected activity as a compact Night Ops record: prioritise distance, elapsed time, pace, and elevation before optional telemetry; retain clear section labels and explicit route availability text.
- Primary user question: "What happened in specific workouts?"

### 3) Performance Page
- Required modules:
  - Metric selector
  - Multi-series trend chart region
  - Period-over-period comparison controls
  - Completeness/explainability context for selected metric
- Primary user question: "Am I trending up/down versus prior periods?"

### 4) Data Quality Page
- Required modules:
  - Ingestion health counters (staged/normalized/duplicate/rejected/error)
  - Normalize progress state (`hasMore`/`nextCursor` context)
  - Recent validation issues/parse warnings list
  - Recommended next action (retry normalize, re-upload, no action)
- Primary user question: "Can I trust this dataset right now?"

### 5) Settings Page
- Required modules:
  - Local dashboard preferences (default date range/source visibility/display options)
  - Save/apply controls
  - Persistence success/failure feedback
- Explicit exclusions:
  - No auth/account/security profile settings in v1
- Primary user question: "How should this dashboard behave by default?"

## Required Page-State Variants (All Five Pages)
Every page definition above must include and test the following states:
1. **Loading** — request in progress after navigation/filter change.
2. **Empty** — successful response with no usable records for current filters.
3. **Error** — failed response or unrecoverable render issue; actionable message shown.
4. **Stale** — previously rendered data remains visible with stale badge until refresh success.

## Core UI Components (Contract-Level)
- KPI Card
- Data Table
- Trend Chart
- Detail Drawer
- Filter Panel
- Insight Panel
- Status Badge (loading/error/stale/healthy)

## Responsive Baseline (Future Mobile Readiness)
- Breakpoint strategy:
  - Desktop: full nav + multi-column layouts.
  - Tablet: collapsible nav + reduced column density.
  - Mobile baseline: stacked cards, simplified charts, essential actions only.
- Interaction rules:
  - Maintain core read workflows on small screens.
  - Defer complex editing/configuration to desktop where needed.

## UX Standards
- Consistent loading/empty/error/stale states across pages.
- Predictable filter behavior and visible active filter context.
- Accessible color contrast and keyboard navigation.
- Time-series visualizations must show units and timezone context.

## Non-Goals for Current Phase
- Pixel-perfect mobile optimization.
- Native mobile interaction patterns.
- Highly customized per-role dashboards.
- Visual implementation detail decisions (covered by UI guidelines and build tasks).

## Page States
- Every page must support:
  - Loading state
  - Empty state
  - Error state
  - Data stale state

## Core UI Components
- KPI Card
- Data Table
- Trend Chart
- Detail Drawer
- Filter Panel
- Insight Panel

## Phase 1 Digital Coach UX Addendum

`docs/design/screens.md` is the screen source of truth. Navigation becomes **Today, Plan, Calendar, Activities, Data Quality, Settings**; Today evolves Overview. AI conversation remains in Codex/Second Brain, not an embedded chat. Existing analytics remain on Today rather than claiming an unimplemented Performance route.

- Today: goal purpose, active plan, local session/rest state, intent/prescription, and calendar link; usable without Codex delivery.
- Plan: active approved plan first, with a prominent Create a plan with Codex button that reveals the context-publish and proposal-import workflow; Sunday is the default preferred long-run day for new routines. Surface a newer persisted draft from the active-plan panel without automatically expanding the workflow, hide superseded drafts, then provide schema/freshness feedback and review/diff with Approve/Reject. Online approved history distinguishes coaching version from approval record and lets the signed-in owner explicitly confirm an inactive approved version as active. The confirmation states that prescriptions are unchanged; drafts never expose this control.
- Calendar: the Month view presents a complete Monday–Sunday month beginning with the current or deep-linked month. Previous/next controls, a month/year picker, Today, and Page Up/Page Down navigate months; wheel and vertical touch scrolling never changes the month. Each date shows planned and recorded summaries with violet and lime treatments. At 1200px and above, date selection updates the sidebar and its record links open full details. Below 1200px, cells show first-record distance, duration fallback or N/A and accurate +N; a date tap opens a keyboard-accessible, date-specific Day details dialog with every activity and planned session. All dates retain recorded activity detail first and active-plan context without claiming completion, including future-dated activities and empty/unavailable categories. Close/Escape restores the tapped date and month/scroll position; deep links focus their session and the reactive interaction matches CSS. Retired plans never appear in Calendar. On desktop, Calendar keeps the standard shared left sidebar and fills the available content area beside it; compact layouts retain their existing navigation, the month grid, and the Training totals and timezone disclosure with separate planned/recorded weekly and monthly totals. Confirmed, keyboard-accessible amend/reschedule/skip/restore actions preserve the approved source prescription. A past session may only be recorded as skipped; it cannot otherwise be changed or restored. Every change requires a 1–500 character reason, shows current effective values separately from the approved source, and exposes readable reasoned history without claiming an AI review occurred. Current-day sessions remain read-only.
- Activities/Data Quality: explicit bounded CSV or one-activity GPX import with duplicate/rejected/warning feedback.
- Settings: timezone/reminder defaults (06:30 `Africa/Johannesburg`), exchange setup, and Codex handoff; app preference, handoff, and external automation statuses remain separate.

Every screen distinguishes loading/empty/error/stale. Today also distinguishes no plan, rest, upcoming, missed/unconfirmed, and skipped. RacePredictor does not infer completion from an unmatched imported activity, change a plan, or adapt training automatically. Activity Coach's review is an asynchronous, evidence-bounded readout.

## Night Ops Interaction Addendum (2026-08-20)

Night Ops changes hierarchy and presentation without changing any coaching, approval, data, or safety rule.

- Today is workout-first: approved workout or intentional rest appears before healthy infrastructure detail. Calendar context, analytics, and freshness load independently so an optional failure cannot hide the daily coaching state.
- Calendar week cells contain concise summaries only. Selecting a session exposes its effective prescription, approved source, cautions, history, and permitted actions in a contextual detail surface. Agenda is the default whenever a seven-day grid cannot remain readable.
- Plan shows date progress and groups sessions by explicitly supplied calendar weeks. It does not infer named training phases, workout completion, or effectiveness.
- Activities maintains the list while selected details load. On compact screens, activity detail has an explicit return action that restores focus to the selected row.
- System freshness is compact when healthy and expands automatically when a signal is stale, unavailable, or action-required. Independent data sources remain individually named.
- Night Ops uses a dark, matte, high-contrast visual system with restrained cyan, violet, lime, amber, and red accents. Colour never acts as the sole state signal.

Future-session amendment and schedule-change dialogs use labelled native form controls and announce validation, saving, success, conflict, and error states. Opening a dialog moves focus to its first control; Tab and Shift+Tab stay within it; Escape closes it when no save is in progress; closing returns focus to the launching control; and an invalid submission focuses the first invalid field. These behaviors apply at desktop and supported mobile widths and are covered by browser automation.

## Cloud Strava and Sync UX Addendum

The existing navigation remains. The online phase adds only the status and connection surfaces required for the approved outcome:

- Settings shows Strava connection state/actions and one local-device pairing/revocation surface; it does not add athlete switching, provider choice, or Garmin controls.
- Today shows workout/activity freshness separately from the latest selected Second Brain snapshot freshness. A local computer outage cannot make fresh cloud workouts appear stale.
- Activities shows automatic Strava provenance and ingestion states alongside retained manual CSV/GPX history without duplicating an activity.
- Data Quality shows delayed, retrying, action-required, and terminal provider work with a safe supported action; it never exposes tokens, object keys, raw payload bodies, or stack traces.
- Second Brain status shows snapshot version/revision, selected section names, publication time, and current/stale/never/error state. It never renders an Obsidian note, local path, arbitrary text, or a claim that context changed the approved plan.
- Authentication-required, disconnected, local-device-offline, cloud-unavailable, and stale-context states are distinct and recoverable at desktop and responsive baseline widths.

The one-athlete UI has no athlete selector or role-management controls. Automatic review/adaptation and plan mutation remain excluded.

## Activity feedback separation

Activities and Calendar use one shared feedback presentation with two titled sections: **AI coach feedback** (metrics, approved-plan comparison, limitations, and processing state) and **AI athlete feedback** (the approved local summary and publication metadata). The athlete section always renders `Athlete feedback has not been provided.` when no artifact exists. Previous mixed reviews are available only through a collapsed **Previous combined reviews** disclosure. Pending coach work polls every ten seconds while visible for up to five minutes; failed feedback reads leave workout metrics visible and offer refresh.

## Athlete reflection and daily check-in

Activity detail adds a separate **Your reflection** section with optional Training, Race, or Ignore classification. Ignore or no classification shows the combined shared, training, and race questions. The form supports partial saves and optional turning-point sections; it never marks a planned session complete or changes an approved plan. Home places a non-blocking **How are you feeling today?** recovery callout inside Today’s focus. It offers Check in or Skip today, persists one local-date record, and remains editable without adding a primary navigation destination. Saved journal entries are visibly athlete-authored and remain distinct from AI feedback.
