# Frontend/Backend Wiring Architecture Implementation Plan

## Problem Framing
- Goals:
- Wire the dashboard frontend from mock-only data to `/api/v1` backend data across five pages: Overview, Activities, Performance, Data Quality, Settings.
- Preserve contract-first integration through `packages/core` contract ownership.
- Keep implementation additive and page-slice based so each page can be shipped and validated independently.
- Constraints:
- Follow monorepo boundaries in `docs/ARCHITECTURE.md`:
  - `apps/web` orchestration and composition.
  - `packages/core` contract ownership.
  - `packages/db` persistence only (no direct UI coupling).
- `/api/v1` remains additive-only.
- Current dashboard shell exists as a single route (`/dashboard`) with mock data source seam.
- Assumptions:
- Backend endpoints documented in `docs/API_CONTRACT.md` are the wiring source of truth.
- DB readiness gates (DB-5/DB-6) provide sufficient data trust for UI live wiring.
- Settings page may require interim local persistence until a dedicated settings API contract exists.
- Open Questions:
- Should Settings persistence be local-only in v1 or include a new `/api/v1/settings` contract now?
- Should page routing be split to `/dashboard/overview`, `/dashboard/activities`, etc., or remain one shell with internal panel routing in first iteration?
- Should Data Quality read from a dedicated import-history endpoint or derive from latest import payloads only?

## Requirements Check
- Confirmed Requirements:
- Replace mock data flow with backend-backed data sources for five dashboard pages.
- Preserve consistent loading/empty/error/stale behavior.
- Validate payloads against shared contracts before they reach page view models.
- Keep mock capability available for local/demo fallback.
- Missing or Ambiguous Requirements:
- Settings backend contract is not currently defined in `docs/API_CONTRACT.md`.
- Dashboard navigation currently uses anchor placeholders and does not yet map to dedicated routes.
- Acceptance Criteria Gaps:
- No explicit response-time SLA per page is defined; use stable UX behavior and deterministic state handling as the initial acceptance gate.

## Architecture Overview
- System Context:
- `apps/web` currently composes `MockDashboardDataSource` in `app/dashboard/page.tsx`.
- `packages/core` owns contract modules and runtime validators.
- DB-side readiness scripts already verify contract compatibility and integrity for seeded data.
- High-Level Components:
- Frontend Data Source Layer (app layer interfaces + implementations).
- API Gateway Client (shared fetch wrapper with envelope/error/state normalization).
- Page Adapters (Overview/Activities/Performance/Data Quality/Settings mapping API payloads to page view models).
- Contract Validation Layer (runtime validation from `packages/core` before UI mapping).
- Key Design Decisions:
- Keep data-source selection in app composition via environment toggle (mock vs api), not in UI components.
- Use one common API client behavior for retries, timeout, and error envelope normalization.
- Use page-specific adapters to keep page view-model transformation isolated and testable.
- Introduce Settings persistence adapter interface now; support local storage fallback if backend API is unavailable.

## Component Design
- Component: API Data Source Registry
  - Responsibilities:
  - Select mock or api implementations based on environment configuration.
  - Expose stable interfaces consumed by page loaders.
  - Dependencies:
  - `apps/web` composition code and environment flags.
  - Interactions:
  - Creates page data sources and injects into page routes/containers.
  - Failure Modes:
  - Incorrect toggle could silently serve mock data in intended live mode.

- Component: Shared API Client
  - Responsibilities:
  - Execute HTTP requests to `/api/v1`.
  - Normalize standard error envelope and transport failures.
  - Return typed safe payloads only after contract validation.
  - Dependencies:
  - `packages/core` validators/contracts.
  - Interactions:
  - Called by page-specific data source implementations.
  - Failure Modes:
  - Contract drift produces parse failures and page-level error state.

- Component: Page Data Adapters
  - Responsibilities:
  - Map endpoint payloads to page-ready view models.
  - Enforce page-specific empty/stale semantics.
  - Dependencies:
  - API client, page contracts, existing view-model helpers.
  - Interactions:
  - Overview uses dashboard overview payload.
  - Activities uses list/detail/splits payloads.
  - Performance uses weekly feature payloads.
  - Data Quality uses import progress payloads.
  - Settings uses persistence adapter.
  - Failure Modes:
  - Partial payload mapping can misclassify empty vs error state.

- Component: Settings Persistence Adapter
  - Responsibilities:
  - Provide abstraction for settings read/write with backend-first or local fallback strategy.
  - Dependencies:
  - Optional API contract (future) and browser local persistence.
  - Interactions:
  - Consumed by Settings page and global filter defaults.
  - Failure Modes:
  - Write failures leave UI state inconsistent across page transitions.

## Data Model
- Entities:
- UI-facing DTOs from `packages/core`: `DashboardFetchResult`, `ActivitySummary`, `ActivityDetail`, `ActivitySplitKmDTO`, `WeeklyFeatureDTO`, import response DTOs.
- Settings preference model (app-level): default date range, source visibility, selected athlete context (single-athlete default).
- Relationships:
- Overview and Data Quality share import status lineage.
- Activities and Performance share athlete/date filter context.
- Integrity Constraints:
- UI consumes only validated payload shapes.
- Page adapters must preserve additive compatibility by ignoring unknown fields.
- Migration/Backfill Notes:
- No database schema changes required for page wiring scope.

## API Contracts
- Endpoints or Interfaces:
- `GET /api/v1/dashboard/overview` -> Overview page.
- `GET /api/v1/activities`, `GET /api/v1/activities/:activityId`, `GET /api/v1/activities/:activityId/splits` -> Activities page.
- `GET /api/v1/features/weekly`, `GET /api/v1/features/weekly/:athleteId` -> Performance page.
- `POST /api/v1/imports/upload`, `POST /api/v1/imports/:id/normalize` response compatibility + import status reads -> Data Quality page.
- Settings: backend contract pending; use persistence adapter with local fallback until contract is defined.
- Inputs/Outputs:
- Inputs are page filter/query parameters and selected IDs.
- Outputs are page-scoped view models derived from validated DTOs.
- Authorization:
- MVP local runtime only; no auth flow integration in this phase.
- Error Handling:
- Normalize to consistent page states: loading, empty, error, stale.
- Preserve actionable error messages for user recovery.
- Versioning/Compatibility:
- Maintain additive-only interpretation for `/api/v1`; no strict failure on extra fields.

## Non-Functional Requirements
- Performance:
- Page data loading should remain bounded by endpoint pagination (`nextCursor`) and avoid unnecessary detail prefetch.
- Scalability:
- Adapter and client layering must support future multi-athlete extension without route redesign.
- Reliability:
- Contract validation failures must fail safe into explicit error states, not partial rendering.
- Security/Privacy:
- No secret exposure in browser layer; use relative API paths and server runtime env protection.
- Observability:
- Add per-page fetch outcome logs/markers in app layer (success/empty/error/stale) for diagnostics.

## Execution Plan
- Epic/Story: FW-1 Integration Foundation
  - Scope:
  - Introduce shared API client, data-source registry/toggle, and contract-validation gate in frontend path.
  - Acceptance Criteria:
  - Mock and API data sources are switchable without component refactor.
  - Invalid contract payloads fail into deterministic error state.
  - Dependencies:
  - Existing `DashboardDataSource` seam, `packages/core` contracts.

- Epic/Story: FW-2 Overview Live Wiring
  - Scope:
  - Replace Overview fixtures with live dashboard overview endpoint integration.
  - Acceptance Criteria:
  - Overview renders success/empty/error/stale states from live payload.
  - Dependencies:
  - FW-1.

- Epic/Story: FW-3 Activities Live Wiring
  - Scope:
  - Implement activities list/detail/splits integration with cursor support.
  - Acceptance Criteria:
  - List pagination and detail fetch behavior match contract semantics.
  - Dependencies:
  - FW-1.

- Epic/Story: FW-4 Performance Live Wiring
  - Scope:
  - Wire weekly features trend/comparison views to live endpoints.
  - Acceptance Criteria:
  - Performance renders real weekly data with explicit insufficient-history state.
  - Dependencies:
  - FW-1.

- Epic/Story: FW-5 Data Quality Live Wiring
  - Scope:
  - Surface import lifecycle and quality counters from backend-backed source.
  - Acceptance Criteria:
  - Data Quality page clearly distinguishes healthy, retry, and re-upload states.
  - Dependencies:
  - FW-1, import contract availability.

- Epic/Story: FW-6 Settings Wiring
  - Scope:
  - Implement settings page and persistence adapter with backend-ready interface and local fallback.
  - Acceptance Criteria:
  - Settings persist and are reflected across page navigation/reload.
  - Dependencies:
  - FW-1, settings persistence decision.

## Risks and Trade-offs
- Risk/Trade-off: Contract definitions and runtime validator behavior may diverge.
  - Impact:
  - False-positive validation failures or undetected invalid payloads.
  - Mitigation:
  - Keep DB-5 contract readiness checks aligned with frontend integration adapters.

- Risk/Trade-off: Settings backend contract is undefined.
  - Impact:
  - Could block full backend wiring claim for Settings.
  - Mitigation:
  - Ship adapter abstraction with local fallback and explicit follow-up story for backend settings contract.

- Risk/Trade-off: Single `/dashboard` route shell may slow five-page wiring clarity.
  - Impact:
  - Harder testability and page ownership boundaries.
  - Mitigation:
  - Introduce page-level route/modules while preserving shared shell.

## Validation
- Tests:
- Contract-validated data source tests per page adapter (success/empty/error/stale).
- Route/page integration tests for five pages using mock and api modes.
- Regression checks for dashboard shell render continuity.
- Metrics/Logs/Health Checks:
- Per-page fetch status logs with endpoint and state category.
- Track parse-failure counts and endpoint failure rates in local diagnostics.
- Rollout/Rollback:
- Rollout order: FW-1 -> FW-2 -> FW-3 -> FW-4 -> FW-5 -> FW-6.
- Rollback: toggle to mock mode globally while preserving deployed UI shell if live endpoints regress.
- ADR Needed: yes, with reason
- Required ADR topics:
- Settings persistence strategy (backend contract now vs deferred local fallback).
- Five-page routing strategy (`/dashboard/*` split vs single-shell internal navigation).

## Skill Invocation Summary
- Skill: architect
- Scope:
- Architecture implementation design for wiring frontend pages to backend contracts based on product-owner backlog.
- Requirements Validated: yes
- Enforcement Files Read:
- None found (`.codex/enforcement/architecture.md`, `.codex/enforcement/adr.md` missing).
- Key Risks Identified:
- Contract/runtime validation drift, undefined settings backend contract, and routing granularity trade-offs.
