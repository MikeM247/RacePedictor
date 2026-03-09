# PRODUCT

## v1 Product Scope
RacePredictor v1 delivers a desktop-first analytics dashboard backed by stable `/api/v1` APIs, ingest/normalize pipelines, and weekly-first performance features for a **single local athlete profile**. The product scope aligns to the core monorepo boundaries (`apps/web`, `packages/core`, `packages/db`, `packages/ui`) and prioritizes read-oriented coaching/analysis workflows over account management or mobile-first experiences.

### In Scope (v1)
- Desktop-first dashboard with the five primary pages: **Overview, Activities, Performance, Data Quality, Settings**.
- Stable, additive-only REST namespace under `/api/v1`.
- Import + normalize workflow for activity data with deterministic dedupe behavior.
- Canonical domain outputs for `Activity`, `ActivitySplitKm`, `WeeklyFeature`, and optional `RouteSignature`.
- Weekly feature aggregation as the default analytical cadence.
- Consistent loading/empty/error/stale states across pages.

### Out of Scope / Non-Goals (v1)
- Authentication and account lifecycle UX (signup/login/session/password reset).
- Multi-tenant or white-label product customization.
- Mobile-first UX optimization or native mobile interaction patterns.
- Real-time streaming guarantees (websocket/SSE-first architecture).
- Production ML model tuning workflows and plugin ecosystem support.

## Product Goals and Non-Goals

### Product Goals
1. **Reliable data-to-dashboard flow:** users can ingest activity files, normalize data, and see trustworthy analytics in the dashboard.
2. **Decision-ready desktop UX:** users can quickly assess recent performance, trends, and data quality from predictable IA and shared interaction patterns.
3. **Contract-safe integrations:** API behavior is explicit, versioned, and additive-only for v1 so UI and downstream consumers remain stable.
4. **Explainable performance insights:** weekly features and predictions are displayed with clear units, time context, and bounded confidence outputs.

### Non-Goals (Acceptance Intent)
- v1 does **not** attempt multi-user identity, role-based experiences, or collaborative workflows.
- v1 does **not** require pixel-perfect parity on mobile breakpoints; responsive baseline is sufficient.
- v1 does **not** require real-time push updates; manual/periodic refresh patterns are acceptable.

## Target Users and Primary Workflows

### Target Users
- **Primary:** self-coached athlete or analyst using a desktop dashboard for review and planning.
- **Secondary:** coach/operator reviewing a single athlete profile in a local runtime setup.

### Primary Workflows
1. **Ingest and validate data**
   - Upload source activity file, monitor staged/duplicate/rejected counts, normalize in batches, and confirm ingestion health.
2. **Review recent activity history**
   - Filter activities by date/source/sport, sort and inspect details, including splits and route metadata when available.
3. **Assess performance trajectory**
   - Use weekly feature trends and comparison controls to evaluate progress or regressions over time windows.
4. **Monitor data quality and pipeline status**
   - Inspect duplicate/rejection counters and recent validation issues, then retry or resolve ingestion quality gaps.
5. **Configure dashboard defaults**
   - Adjust local preferences (e.g., default date range/source visibility) without invoking auth/account flows.

## Dashboard Acceptance Criteria

### Global (All Dashboard Pages)
- Must render within the global shell with left navigation entries: Overview, Activities, Performance, Data Quality, Settings.
- Must support loading, empty, error, and stale-data states with consistent presentation semantics.
- Must honor top-bar filters (date range, source filter, athlete filter where applicable) and show active filter context.
- Time-series visualizations must display units and timezone context.

### Overview
- Displays KPI row including distance, time, pace, and activity count for selected scope.
- Displays primary trend visualization and secondary insights/anomaly panel.
- Surfaces dashboard overview payload elements: prediction summary, latest weekly load snapshot, and import/normalize progress summary.
- Empty/error states explain whether missing data is due to no activities, failed import, or API failure.

### Activities
- Displays filter panel and sortable list/table of `ActivitySummary` records.
- Supports pagination/cursor continuation when `nextCursor` is provided.
- Selecting a row opens detail context populated by `ActivityDetail`, including splits and optional route signature.
- Handles absent splits/route data gracefully without blocking core detail render.

### Performance
- Provides metric selector and multi-series trend chart for weekly-first analysis.
- Supports period-over-period comparison controls.
- Uses `WeeklyFeatureDTO` payloads and conveys completeness/explainability fields.
- Clearly distinguishes insufficient-history empty state from API/system error state.

### Data Quality
- Displays ingestion health metrics including staged, normalized, duplicate, rejected, and error counts.
- Surfaces recent validation issues and parse warnings from import workflow.
- Provides visibility into normalize progress (`hasMore`, `nextCursor` semantics) during batched processing.
- Enables user to determine whether re-upload, retry normalize, or no action is needed.

### Settings
- Provides local runtime/dashboard preferences only (no account/auth settings).
- Allows updating default filters or display options used by dashboard pages.
- Persisted settings are reflected on subsequent dashboard navigation/reload.
- If persistence fails, user receives explicit recoverable error feedback.

## Product Outcomes → Measurable UI/API Behavior

| Product outcome | UI behavior (measurable) | API behavior (measurable) |
|---|---|---|
| Trustworthy ingestion pipeline | Data Quality page shows counters for staged/duplicate/rejected and recent issues after each import action. | `POST /api/v1/imports/upload` returns `stagedCount`, `duplicateCount`, `rejectedCount`, `parseWarnings`; `POST /api/v1/imports/:id/normalize` returns normalization counts and cursor progress fields. |
| Fast activity review | Activities page renders list state, sortable columns, and detail drawer from selected row within one interaction flow. | `GET /api/v1/activities` returns `items` + optional `nextCursor`; `GET /api/v1/activities/:activityId` returns `activity` with optional `splits` and `routeSignature`. |
| Explainable performance tracking | Performance page displays selected metric trends with comparison controls and explicit units/time context. | `GET /api/v1/features/weekly` and `/api/v1/features/weekly/:athleteId` return `WeeklyFeatureDTO[]` with completeness/explainability fields. |
| Actionable overview snapshot | Overview page shows KPI cards, trend, and insights/anomalies for active filters. | `GET /api/v1/dashboard/overview` provides prediction summary, weekly load snapshot, and import/normalize progress summary; `GET /api/v1/insights` returns insight cards. |
| Stable integration surface | UI continues functioning across additive API changes and displays standard error envelopes in failure states. | `/api/v1` remains additive-only; errors follow standard envelope with codes such as `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`. |

## Terminology Consistency Cross-Check (CONTEXT + API_CONTRACT)
- Uses the same canonical entities: `Activity`, `ActivitySplitKm`, `WeeklyFeature`, `RouteSignature`.
- Preserves v1 namespace language: `/api/v1`, additive-only compatibility policy.
- Preserves ingestion/normalization terminology: staged rows, dedupe, normalize cursor batching.
- Preserves runtime constraint language: single local athlete profile.
- Keeps dashboard page naming consistent with UI spec and global navigation labels.

## Acceptance Intent Summary
A v1 release is acceptable when a desktop user can ingest data, validate quality, review activities, assess weekly performance trends, and consume overview insights through stable `/api/v1` contracts with clear page-state behavior and no dependency on auth or mobile-first implementation.
