# UI_UX_SPEC

## Product UX Direction
- **Primary target:** desktop users (analyst/coaching workflows).
- **Secondary target:** responsive baseline for tablet/mobile access, with feature parity evolving later.

## Dashboard Information Architecture (Desktop-First)

### Global Shell
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
- Calendar: week/agenda views and confirmed, keyboard-accessible amend/reschedule/skip/restore for future sessions while preserving the approved source prescription. A past session may only be recorded as skipped; it cannot otherwise be changed or restored. Every change requires a 1–500 character reason, shows current effective values separately from the approved source, and exposes readable reasoned history without claiming an AI review occurred. Current-day sessions remain read-only.
- Activities/Data Quality: explicit bounded CSV or one-activity GPX import with duplicate/rejected/warning feedback.
- Settings: timezone/reminder defaults (06:30 `Africa/Johannesburg`), exchange setup, and Codex handoff; app preference, handoff, and external automation statuses remain separate.

Every screen distinguishes loading/empty/error/stale. Today also distinguishes no plan, rest, upcoming, missed/unconfirmed, and skipped. Phase 1 does not infer completion from an unmatched imported activity and does not claim automatic Garmin sync, post-run review, or adaptation.

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
