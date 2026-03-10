# UI_UX_SPEC

## Product UX Direction
- **Primary target:** desktop users (analyst/coaching workflows).
- **Secondary target:** responsive baseline for tablet/mobile access, with feature parity evolving later.

## Dashboard Information Architecture (Desktop-First)

### Global Shell
- Persistent left navigation order (fixed across all pages):
  1. Overview
  2. Activities
  3. Performance
  4. Data Quality
  5. Settings
- Shell regions:
  - Left navigation (global)
  - Top bar (global, page-scoped controls)
  - Main content (page-specific modules)

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
