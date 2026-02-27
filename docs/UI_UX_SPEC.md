# UI_UX_SPEC

## Product UX Direction
- **Primary target:** desktop users (analyst/coaching workflows).
- **Secondary target:** responsive baseline for tablet/mobile access, with feature parity evolving later.

## Dashboard Information Architecture (Desktop-First)

### Global Shell
- Persistent left navigation:
  - Overview
  - Activities
  - Performance
  - Data Quality
  - Settings
- Top bar:
  - Date range selector
  - Source filter
  - Athlete filter
  - Quick refresh/status indicator

### Overview Page
- KPI card row (e.g., total distance, total time, avg pace, activity count).
- Primary trend chart area.
- Secondary insights panel (highlights/anomalies).

### Activities Page
- Filter panel + sortable table/list.
- Activity detail drawer/panel on selection.
- Clear empty/loading/error states.

### Performance Page
- Metric selector.
- Multi-series chart region.
- Comparison controls (period-over-period).

### Data Quality Page
- Ingestion health stats.
- Duplicate/rejection counters.
- Recent validation issues.

## Responsive Baseline (Future Mobile Readiness)
- Breakpoint strategy:
  - Desktop: full nav + multi-column layouts.
  - Tablet: collapsible nav + reduced column density.
  - Mobile baseline: stacked cards, simplified charts, essential actions only.
- Interaction rules:
  - Maintain core read workflows on small screens.
  - Defer complex editing/configuration to desktop where needed.

## UX Standards
- Consistent loading/empty/error states across pages.
- Predictable filter behavior and visible active filter chips.
- Accessible color contrast and keyboard navigation.
- Time-series visualizations must show units and timezone context.

## Non-Goals for Current Phase
- Pixel-perfect mobile optimization.
- Native mobile interaction patterns.
- Highly customized per-role dashboards.
