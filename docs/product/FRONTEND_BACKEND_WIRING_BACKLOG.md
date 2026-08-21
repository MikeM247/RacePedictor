# Frontend to Backend Wiring Backlog (Product Owner)

Feature: Frontend API Integration Foundation
Description: Establish a single contract-safe frontend data access layer that replaces mock-only data flow and supports all five dashboard pages with `/api/v1` responses.
Priority: High
Area: `apps/web` data-source and API client layer
Reason: This dependency unlocks every page and prevents page-by-page integration drift.
Acceptance Criteria:
- A shared API client/data-source interface is used by all dashboard pages instead of page-local fetch logic.
- API responses are validated against shared contract schemas from `packages/core` before reaching view models.
- Standard loading, empty, error, and stale states are produced consistently from the shared layer.
- Existing mock mode remains available behind a clear dev switch/fallback path.
Dependencies:
- `docs/API_CONTRACT.md`
- `packages/core` contract exports
- Existing `DashboardDataSource` seam
Risks:
- Contract/type mismatch between runtime validators and documented API behavior can block integration.

Feature: Overview Page Live Wiring
Description: Wire Overview to backend contract data for prediction summary, feature trend points, and import progress using `GET /api/v1/dashboard/overview`.
Priority: High
Area: Overview page
Reason: Overview is the primary landing experience and fastest validation point for end-to-end frontend/backend flow.
Acceptance Criteria:
- Overview reads data from backend endpoint (not static fixtures) and renders KPI, trend, and import progress sections.
- Success, empty, error, and stale API variants map to correct UI states.
- Prediction summary and driver contribution fields are populated from API payload, not hardcoded fixtures.
- Failures return user-visible recoverable messaging using standard error envelope handling.
Dependencies:
- Feature: Frontend API Integration Foundation
- `GET /api/v1/dashboard/overview` endpoint availability
Risks:
- If backend payload shape differs from current dashboard view model assumptions, mapping layer rework will be needed.

Feature: Activities Page Live Wiring
Description: Implement live Activities list and detail flow using `GET /api/v1/activities`, `GET /api/v1/activities/:activityId`, and optional splits/route data rendering.
Priority: High
Area: Activities page
Reason: Activities is a core user workflow and validates canonical `Activity` + `ActivitySplitKm` + `RouteSignature` usage.
Acceptance Criteria:
- Activities list renders from API with filters and cursor pagination support (`nextCursor`).
- Selecting an activity fetches detail payload and renders activity fields, splits, and optional route signature safely.
- Missing optional data (splits/route) does not break detail render.
- Empty and API error states are explicitly differentiated in UI.
Dependencies:
- Feature: Frontend API Integration Foundation
- Activities endpoints in `/api/v1`
Risks:
- Cursor pagination behavior may be inconsistent if frontend and backend disagree on continuation semantics.

Feature: Performance Page Live Wiring
Description: Wire weekly performance/trend views using `GET /api/v1/features/weekly` and `GET /api/v1/features/weekly/:athleteId`.
Priority: High
Area: Performance page
Reason: Performance validates weekly feature readiness and trend/comparison workflows central to product goals.
Acceptance Criteria:
- Performance page loads weekly feature series from API for selected range/athlete context.
- Metric selector/comparison controls are backed by real `WeeklyFeatureDTO` values.
- Insufficient history state and API/system error state are handled distinctly.
- Units/time context are shown consistently for trend values.
Dependencies:
- Feature: Frontend API Integration Foundation
- Weekly feature endpoints in `/api/v1`
Risks:
- Weekly completeness/aggregation edge cases can create confusing trend output without clear UI labeling.

Feature: Data Quality Page Live Wiring
Description: Connect Data Quality page to import/upload/normalize progress and quality counters from backend import contracts.
Priority: High
Area: Data Quality page
Reason: This page closes the ingestion-to-analytics trust loop and is essential for operational confidence.
Acceptance Criteria:
- Page shows staged, normalized, duplicate, rejected, and error counters using backend import response-compatible data.
- Normalize progress semantics (`hasMore`, `nextCursor`) are represented in UI status.
- Parse warnings/recent issues are surfaced from backend-backed data source.
- Users can distinguish “needs re-upload”, “can retry normalize”, and “healthy” states from visible data.
Dependencies:
- Feature: Frontend API Integration Foundation
- Import endpoints and import status data model
Risks:
- If import history/read endpoint behavior is incomplete, page may need interim polling or derived-status logic.

Feature: Settings Page Backend-Linked Preferences
Description: Wire Settings page to persisted runtime preferences with backend-backed read/write contract where available; otherwise define explicit interim persistence policy.
Priority: Medium
Area: Settings page
Reason: Lower immediate user value than core analytics pages, but required for five-page parity and consistent navigation behavior.
Acceptance Criteria:
- Settings page exists in routed app and is accessible from dashboard navigation.
- Preference fields (default filters/display options) persist across reloads according to agreed persistence mode.
- Save failures show explicit recoverable error feedback.
- Settings changes are reflected when navigating back to Overview, Activities, Performance, and Data Quality.
Dependencies:
- Feature: Frontend API Integration Foundation
- Product/API decision on settings persistence contract (currently not explicit in `API_CONTRACT.md`)
Risks:
- Missing agreed backend contract for settings may delay final wiring or force temporary local persistence.

## Product Assumptions
- Current frontend is mock-first, and backend wiring should proceed incrementally by page.
- `/api/v1` endpoints in `docs/API_CONTRACT.md` are the integration source of truth for page wiring.
- “Five pages” refers to Overview, Activities, Performance, Data Quality, and Settings.
- Settings persistence contract is not yet explicit in current API docs and needs a decision before final implementation.

## Prioritisation Summary
- Highest priority is the shared integration foundation because it unlocks all page wiring and enforces consistent states/contracts.
- Next are Overview, Activities, Performance, and Data Quality because they map directly to defined API contracts and core product workflows.
- Settings is Medium priority due to lower immediate analytical value and unresolved persistence contract details.

## Recommended Next Item
Feature: Frontend API Integration Foundation

Reason: It is the smallest high-impact slice that de-risks all subsequent page wiring, enforces contract-safe integration, and prevents duplicated integration logic across the five pages.
