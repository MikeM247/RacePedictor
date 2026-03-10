# RacePredictor v1 Epic Backlog Execution Plan

> Note: `docs/PRODUCT_EPICS.md` is not present in this repository at the time of planning. This plan uses `docs/ROADMAP.md` as the active epic/task backlog source of truth and aligns it with the required architecture/workflow docs.

## 1) Plan Summary

### Implementation strategy
- Execute work as **one-task-at-a-time vertical slices**, each small enough for a single focused Codex change-set.
- Keep layering strict:
  - business logic/contracts in `packages/core`
  - persistence in `packages/db`
  - reusable presentation in `packages/ui`
  - page/API composition in `apps/web`
- Maintain `/api/v1` additive-only evolution and update docs in the same slice whenever behavior/contracts/schema/UX change.
- Start with docs and contract/schema foundations, then deliver mock-first UI, then live panel-by-panel wiring, then hardening.

### Sequencing logic
1. **Docs/constraints alignment first** to avoid implementation drift.
2. **Schema + API foundations second** so data and transport contracts stabilize before UI live wiring.
3. **Mock-first dashboard shell third** to unblock UI validation independent of backend completion.
4. **Panel-by-panel live integration fourth** to reduce blast radius and preserve component contracts.
5. **Hardening/release readiness last** once full flow is functional.

### Slice discipline model
Each task below is defined with:
- objective
- bounded scope/non-goals
- acceptance criteria
- concrete checks
- docs to read before implementation
- docs to update after implementation

---

## 2) Epic-by-Epic Breakdown

## Epic 1 — R1.1 Finalize planning docs
**Goal:** make all core source-of-truth docs mutually consistent before implementation acceleration.

**Dependencies:** none.

**Recommended order:** first epic.

**Risks/assumptions:** hidden conflicts may exist between docs and current static dashboard behavior.

**Layer mapping**
- `apps/web`: read-only impact (alignment checks against existing shell)
- `packages/core`: contract definition references only
- `packages/db`: schema reference alignment only
- `packages/ui`: design guideline alignment only

## Epic 2 — R2.1 Prisma model baseline
**Goal:** implement canonical normalized models + ingestion support tables + required indexes/constraints.

**Dependencies:** Epic 1 complete.

**Recommended order:** second epic, before API wiring.

**Risks/assumptions:** migration churn if contract fields are unstable; dedupe/index choices must match free-tier constraints.

**Layer mapping**
- `apps/web`: none
- `packages/core`: shared model types and repository interfaces alignment
- `packages/db`: primary implementation area (Prisma models, migrations, repositories)
- `packages/ui`: none

## Epic 3 — R2.2 API baseline
**Goal:** deliver `/api/v1` endpoint skeletons with Zod validation and typed DTO mapping.

**Dependencies:** Epic 1 + Epic 2.

**Recommended order:** third epic.

**Risks/assumptions:** multipart upload parsing and normalize cursor semantics can create accidental breaking changes if not additive.

**Layer mapping**
- `apps/web`: route handlers/composition
- `packages/core`: request/response schemas, mappers, use-cases
- `packages/db`: repository implementations consumed by API handlers
- `packages/ui`: none

## Epic 4 — R3.1 Mocked dashboard
**Goal:** provide complete desktop-first dashboard rendering with typed fixtures and a mock/api adapter seam.

**Dependencies:** Epic 1 (can start before full API completion if contracts are stable enough).

**Recommended order:** fourth epic, beginning in parallel with late API baseline if necessary.

**Risks/assumptions:** mock contracts may drift from API contracts unless validated through shared Zod schemas.

**Layer mapping**
- `apps/web`: data-source interface, composition, page wiring
- `packages/core`: DTO schemas used by fixtures/adapters
- `packages/db`: none
- `packages/ui`: reusable cards/panels/table/chart primitives

## Epic 5 — R4.1–R4.4 Panel-by-panel live wiring
**Goal:** replace mock data with live `/api/v1` data per panel without changing panel component contracts.

**Dependencies:** Epics 2, 3, 4.

**Recommended order:** fifth epic, in panel order from ingestion visibility to predictive insights.

**Risks/assumptions:** partial live wiring can create inconsistent stale/error states unless standardized at app composition layer.

**Layer mapping**
- `apps/web`: API data source, fetch orchestration, page state handling
- `packages/core`: mapping/validation/use-cases
- `packages/db`: query performance/index coverage support
- `packages/ui`: presentation unchanged except state variants

## Epic 6 — Phase 5 hardening and release
**Goal:** harden reliability, guardrails, deployment readiness, and baseline installability.

**Dependencies:** Epics 1–5 complete.

**Recommended order:** sixth epic.

**Risks/assumptions:** PWA and deployment docs can expose infra assumptions not present locally.

**Layer mapping**
- `apps/web`: resilient error fallbacks, PWA configuration
- `packages/core`: guardrail validation rules
- `packages/db`: limit-aware query patterns and operational checks
- `packages/ui`: standardized fallback/error components as needed

## Epic 7 — Deferred post-MVP epics
**Goal:** preserve ordered backlog for post-v1 execution without polluting v1 scope.

**Dependencies:** v1 release.

**Recommended order:** after MVP sign-off.

**Risks/assumptions:** auth/mobile/vector-search decisions may require architecture updates.

**Layer mapping:** all layers potentially affected in post-v1.

---

## 3) Task Breakdown (all tasks from backlog)

> Shared pre-read for every task: `docs/skills/Feature_Developer_Skill.md`, `docs/CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/CODEX_WORKFLOW.md`.

### T01 — Confirm CONTEXT as source of truth
- **Parent epic:** R1.1
- **Objective:** reconcile any conflicting statements across docs in favor of `CONTEXT.md`.
- **Why now:** prevents architectural drift before implementation.
- **Likely affected:** `docs/CONTEXT.md`, `docs/ROADMAP.md`.
- **Consult before:** `CONTEXT.md`, all planning docs.
- **Likely docs update:** `CONTEXT.md`, `ROADMAP.md`.
- **Acceptance criteria:** explicit source-of-truth statement with no contradictions in planning docs.
- **Checks:** `pnpm -w lint` (if doc tooling enforces), markdown lint if configured.
- **Non-goals:** no runtime/code changes.
- **Risks/edge cases:** implicit conflicts hidden in wording.

### T02 — Confirm ARCHITECTURE boundaries
- **Parent epic:** R1.1
- **Objective:** verify all planned modules respect layer boundaries/import rules.
- **Why now:** avoids later cross-layer refactors.
- **Likely affected:** `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`.
- **Consult before:** `ARCHITECTURE.md`, `CONTEXT.md`.
- **Likely docs update:** `ARCHITECTURE.md`, `ROADMAP.md`.
- **Acceptance criteria:** boundary rules clearly map to all planned features.
- **Checks:** targeted static import-boundary checks if present.
- **Non-goals:** implementing new modules.
- **Risks/edge cases:** app-layer shortcuts directly invoking DB details.

### T03 — Confirm API_CONTRACT endpoint/DTOs
- **Parent epic:** R1.1
- **Objective:** ensure endpoint list and DTOs cover all v1 workflows.
- **Why now:** schema/API must stabilize before coding.
- **Likely affected:** `docs/API_CONTRACT.md`, `docs/ROADMAP.md`.
- **Consult before:** `API_CONTRACT.md`, `PRODUCT.md`, `UI_UX_SPEC.md`.
- **Likely docs update:** `API_CONTRACT.md`, `ROADMAP.md`.
- **Acceptance criteria:** all roadmap API tasks represented, additive evolution policy explicit.
- **Checks:** contract schema compilation/typecheck when implemented.
- **Non-goals:** handler implementation.
- **Risks/edge cases:** missing stale/empty/error envelopes for dashboard contracts.

### T04 — Confirm DB_SCHEMA Prisma model alignment
- **Parent epic:** R1.1
- **Objective:** validate canonical fields/indexes/constraints vs product flows.
- **Why now:** prevents migration churn.
- **Likely affected:** `docs/DB_SCHEMA.md`, `docs/ROADMAP.md`.
- **Consult before:** `DB_SCHEMA.md`, `API_CONTRACT.md`.
- **Likely docs update:** `DB_SCHEMA.md`, `ROADMAP.md`.
- **Acceptance criteria:** model/index definitions fully support listed API query paths and dedupe.
- **Checks:** schema lint/format (when available).
- **Non-goals:** actual migration generation.
- **Risks/edge cases:** insufficient indexes for activity list and weekly feature lookups.

### T05 — Confirm CODEX_WORKFLOW story lifecycle
- **Parent epic:** R1.1
- **Objective:** ensure per-slice process is actionable for implementation loop.
- **Why now:** governs every subsequent task.
- **Likely affected:** `docs/CODEX_WORKFLOW.md`, `docs/ROADMAP.md`.
- **Consult before:** `CODEX_WORKFLOW.md`, `Feature_Developer_Skill.md`.
- **Likely docs update:** `CODEX_WORKFLOW.md`, `ROADMAP.md`.
- **Acceptance criteria:** checklist and docs-sync gates are explicit and complete.
- **Checks:** none beyond doc validation.
- **Non-goals:** code/test additions.
- **Risks/edge cases:** ambiguous completion criteria causing inconsistent PR quality.

### T06 — Confirm UI_UX_SPEC desktop dashboard IA
- **Parent epic:** R1.1
- **Objective:** ensure IA/page states/components are clear and testable.
- **Why now:** UI scope lock before building.
- **Likely affected:** `docs/UI_UX_SPEC.md`, `docs/UI_GUIDELINES.md`, `docs/ROADMAP.md`.
- **Consult before:** UI docs + PRODUCT acceptance criteria.
- **Likely docs update:** `UI_UX_SPEC.md`, `UI_GUIDELINES.md`, `ROADMAP.md`.
- **Acceptance criteria:** all five pages and state variants defined.
- **Checks:** none beyond doc review.
- **Non-goals:** visual implementation.
- **Risks/edge cases:** unclear top bar/filter behavior.

### T07 — Implement `Activity` model
- **Parent epic:** R2.1
- **Objective:** add `Activity` schema with required fields/indexes/unique dedupe.
- **Why now:** foundational normalized entity.
- **Likely affected:** `packages/db` prisma schema + migration + repository typings.
- **Consult before:** `DB_SCHEMA.md`, `API_CONTRACT.md`.
- **Likely docs update:** `DB_SCHEMA.md`, `ROADMAP.md` if adjustments.
- **Acceptance criteria:** migration applies; indexes/unique constraints present.
- **Checks:** prisma validate/migrate/test + `pnpm -w typecheck`.
- **Non-goals:** full ingestion pipeline.
- **Risks/edge cases:** nullable field mismatches vs DTO expectations.

### T08 — Implement `ActivitySplitKm` model
- **Parent epic:** R2.1
- **Objective:** add per-km split table and relations/indexes.
- **Why now:** needed for activity detail explainability.
- **Likely affected:** `packages/db` schema/migration/repository.
- **Consult before:** `DB_SCHEMA.md`, `API_CONTRACT.md`.
- **Likely docs update:** `DB_SCHEMA.md`.
- **Acceptance criteria:** relation cascade + indexes valid.
- **Checks:** prisma validate + repository tests.
- **Non-goals:** split derivation logic.
- **Risks/edge cases:** split ordering/index uniqueness assumptions.

### T09 — Implement `WeeklyFeature` model
- **Parent epic:** R2.1
- **Objective:** add weekly feature store with unique athlete/week window.
- **Why now:** required by performance and prediction views.
- **Likely affected:** `packages/db` schema/migration/query adapters.
- **Consult before:** `DB_SCHEMA.md`, `PRODUCT.md`.
- **Likely docs update:** `DB_SCHEMA.md`, `API_CONTRACT.md` if DTO adjustments.
- **Acceptance criteria:** unique + descending index on week start exists.
- **Checks:** prisma validate + db tests.
- **Non-goals:** feature computation jobs.
- **Risks/edge cases:** week boundary timezone consistency.

### T10 — Implement `RouteSignature` model
- **Parent epic:** R2.1
- **Objective:** add optional compact route metadata table.
- **Why now:** supports activity detail enrichment without trackpoint table.
- **Likely affected:** `packages/db` schema/migration.
- **Consult before:** `DB_SCHEMA.md`, `API_CONTRACT.md`.
- **Likely docs update:** `DB_SCHEMA.md`.
- **Acceptance criteria:** unique activity relation + routeHash index.
- **Checks:** prisma validate + schema tests.
- **Non-goals:** vector search/advanced geo queries.
- **Risks/edge cases:** polyline storage length constraints.

### T11 — Implement minimal ingestion tables (`imports`, `raw_files`, `staging_activities`)
- **Parent epic:** R2.1
- **Objective:** create staging/idempotency metadata foundation.
- **Why now:** required before upload/normalize API endpoints.
- **Likely affected:** `packages/db` schema/migrations/repositories.
- **Consult before:** `DB_SCHEMA.md`, `API_CONTRACT.md` imports section.
- **Likely docs update:** `DB_SCHEMA.md`.
- **Acceptance criteria:** cursor/progress fields available for normalize batching.
- **Checks:** prisma validate/migrate + repository tests.
- **Non-goals:** parser implementation completeness.
- **Risks/edge cases:** oversized raw metadata fields.

### T12 — Implement `POST /api/v1/imports/upload`
- **Parent epic:** R2.2
- **Objective:** upload parse/stage endpoint with response counts and warnings.
- **Why now:** starts ingest workflow.
- **Likely affected:** `apps/web` API route, `packages/core` contracts, `packages/db` staging repos.
- **Consult before:** `API_CONTRACT.md`, `DB_SCHEMA.md`.
- **Likely docs update:** `API_CONTRACT.md`, `ROADMAP.md`.
- **Acceptance criteria:** multipart request validated; returns contract-compliant payload.
- **Checks:** route tests + `pnpm -w typecheck` + `pnpm -w test`.
- **Non-goals:** multi-activity GPX/TCX support.
- **Risks/edge cases:** duplicate upload retries/idempotency handling.

### T13 — Implement `POST /api/v1/imports/:id/normalize`
- **Parent epic:** R2.2
- **Objective:** cursor-batched normalize endpoint with idempotent upsert semantics.
- **Why now:** completes ingestion-to-normalized path.
- **Likely affected:** `packages/core` normalize use-case, `packages/db` repos, API route.
- **Consult before:** `API_CONTRACT.md`, `DB_SCHEMA.md`, `CONTEXT.md` limits.
- **Likely docs update:** `API_CONTRACT.md`, `DB_SCHEMA.md`.
- **Acceptance criteria:** `hasMore/nextCursor` semantics; retries do not duplicate activities.
- **Checks:** integration tests for repeated cursor requests.
- **Non-goals:** async job queue architecture.
- **Risks/edge cases:** partial batch failure accounting.

### T14 — Implement `GET /api/v1/activities`
- **Parent epic:** R2.2
- **Objective:** list endpoint with filters and cursor pagination.
- **Why now:** powers activities table and timeline.
- **Likely affected:** API route, core DTO mappers, db queries/index usage.
- **Consult before:** `API_CONTRACT.md`, `DB_SCHEMA.md`, `UI_UX_SPEC.md`.
- **Likely docs update:** `API_CONTRACT.md`.
- **Acceptance criteria:** filtered/sorted output and nextCursor behavior valid.
- **Checks:** endpoint tests with pagination/filter cases.
- **Non-goals:** advanced full-text search.
- **Risks/edge cases:** timezone-boundary filtering.

### T15 — Implement `GET /api/v1/activities/:activityId`
- **Parent epic:** R2.2
- **Objective:** detail endpoint with optional splits and route signature.
- **Why now:** supports drawer/detail flow.
- **Likely affected:** API route + core schema + db joins.
- **Consult before:** `API_CONTRACT.md`, `DB_SCHEMA.md`.
- **Likely docs update:** `API_CONTRACT.md`.
- **Acceptance criteria:** stable detail payload with graceful absence handling.
- **Checks:** endpoint tests for with/without splits/routes.
- **Non-goals:** heavy geo payloads.
- **Risks/edge cases:** N+1 queries when loading nested relations.

### T16 — Implement `GET /api/v1/features/weekly`
- **Parent epic:** R2.2
- **Objective:** weekly features feed with filters/pagination.
- **Why now:** enables performance trends.
- **Likely affected:** API route, core DTO schemas, db queries.
- **Consult before:** `API_CONTRACT.md`, `DB_SCHEMA.md`.
- **Likely docs update:** `API_CONTRACT.md`.
- **Acceptance criteria:** returns explainable/completeness fields.
- **Checks:** endpoint tests for ranges/pagination.
- **Non-goals:** daily feature endpoint.
- **Risks/edge cases:** missing-week gaps in trend rendering.

### T17 — Implement `POST /api/v1/predictions`
- **Parent epic:** R2.2
- **Objective:** prediction request/response route with confidence band and drivers.
- **Why now:** required for overview insights.
- **Likely affected:** core use-case + schemas, API route, optional db reads.
- **Consult before:** `API_CONTRACT.md`, `PRODUCT.md`.
- **Likely docs update:** `API_CONTRACT.md`, `PRODUCT.md` if behavior clarified.
- **Acceptance criteria:** validated request; deterministic response shape.
- **Checks:** route unit/integration tests.
- **Non-goals:** production ML tuning.
- **Risks/edge cases:** insufficient history fallback behavior.

### T18 — Build desktop layout shell + panels (mocked)
- **Parent epic:** R3.1
- **Objective:** complete desktop-first shell/panel layout per UI specs.
- **Why now:** creates stable UI scaffold for subsequent wiring.
- **Likely affected:** `apps/web` page composition, `packages/ui` panel primitives/styles.
- **Consult before:** `UI_UX_SPEC.md`, `UI_GUIDELINES.md`, `PRODUCT.md`.
- **Likely docs update:** `UI_UX_SPEC.md` if implementation-driven clarifications.
- **Acceptance criteria:** sidebar/top bar/KPI/drivers/trends/import status all render with defined states.
- **Checks:** web lint/typecheck/component tests.
- **Non-goals:** live API integration.
- **Risks/edge cases:** visual inconsistency with global toolbar/container constraints.

### T19 — Add typed fixture data mapped to Activity/WeeklyFeature/Prediction DTOs
- **Parent epic:** R3.1
- **Objective:** create realistic fixtures validated against shared contracts.
- **Why now:** ensures mock realism and contract conformance.
- **Likely affected:** `packages/core` contracts + fixture helpers, `apps/web` mock data source.
- **Consult before:** `API_CONTRACT.md`, `PRODUCT.md`.
- **Likely docs update:** none unless fixture reveals contract gaps.
- **Acceptance criteria:** fixtures parse through Zod with no unsafe casts.
- **Checks:** fixture schema tests/typecheck.
- **Non-goals:** synthetic data generation service.
- **Risks/edge cases:** fixtures diverge from API serialization format.

### T20 — Add data-source adapter seam (`mock` vs `api`)
- **Parent epic:** R3.1
- **Objective:** introduce `DashboardDataSource` interface and runtime toggle.
- **Why now:** enables non-disruptive transition from mock to live.
- **Likely affected:** `apps/web` composition/bootstrap; possibly core adapter typings.
- **Consult before:** `ARCHITECTURE.md` data source strategy section.
- **Likely docs update:** `ARCHITECTURE.md`, `ROADMAP.md`.
- **Acceptance criteria:** dashboard components unchanged when switching source.
- **Checks:** unit tests for both adapter implementations.
- **Non-goals:** embedding fetch logic in UI components.
- **Risks/edge cases:** toggle leakage into presentation layer.

### T21 — Wire import status panel to live API
- **Parent epic:** R4.1
- **Objective:** replace mock import status with upload/normalize progress data.
- **Why now:** ingestion health is foundational user trust signal.
- **Likely affected:** `apps/web` data-source implementation, API client calls, panel state mapping.
- **Consult before:** `API_CONTRACT.md`, `UI_UX_SPEC.md` data-quality/overview states.
- **Likely docs update:** `UI_UX_SPEC.md` if interaction details refined.
- **Acceptance criteria:** panel reflects live staged/normalized/duplicate/rejected states and loading/error/empty/stale.
- **Checks:** integration tests for upload-normalize-progress flow.
- **Non-goals:** rebuilding panel component API.
- **Risks/edge cases:** cursor progress race conditions.

### T22 — Wire activity timeline panel to live API
- **Parent epic:** R4.2
- **Objective:** connect activities list/detail including splits.
- **Why now:** major analysis workflow after ingestion visibility.
- **Likely affected:** app data-source methods, activities table/drawer wiring.
- **Consult before:** `API_CONTRACT.md`, `UI_UX_SPEC.md`, `UI_GUIDELINES.md`.
- **Likely docs update:** `UI_UX_SPEC.md` for detail drawer behavior clarifications.
- **Acceptance criteria:** pagination/filter/detail flow works with graceful missing split/route handling.
- **Checks:** UI integration tests + API contract tests.
- **Non-goals:** route map visualization enhancements.
- **Risks/edge cases:** cursor-state reset on filter changes.

### T23 — Wire features trend panel to live API
- **Parent epic:** R4.3
- **Objective:** connect weekly features series to performance panel.
- **Why now:** completes core trend analysis path.
- **Likely affected:** app data adapters, chart props mapping, performance page states.
- **Consult before:** `API_CONTRACT.md`, `UI_UX_SPEC.md`, `PRODUCT.md`.
- **Likely docs update:** `UI_UX_SPEC.md` if chart state messaging changes.
- **Acceptance criteria:** chart displays labeled units/timezone and comparison controls with proper empty/error handling.
- **Checks:** chart rendering tests + adapter tests.
- **Non-goals:** non-weekly feature models.
- **Risks/edge cases:** sparse data causing misleading trend lines.

### T24 — Wire prediction + drivers panel to live API
- **Parent epic:** R4.4
- **Objective:** connect prediction endpoint to overview panel with confidence bands/drivers.
- **Why now:** final live panel completing overview value proposition.
- **Likely affected:** app data-source, overview panel mapping, API client.
- **Consult before:** `API_CONTRACT.md`, `PRODUCT.md`, `UI_UX_SPEC.md`.
- **Likely docs update:** `PRODUCT.md` or `UI_UX_SPEC.md` if explainability copy is refined.
- **Acceptance criteria:** prediction summary renders with bounded confidence and driver list; all states supported.
- **Checks:** integration tests including insufficient-history fallback.
- **Non-goals:** model retraining/tuning systems.
- **Risks/edge cases:** stale predictions with outdated modelVersion.

### T25 — Structured error handling + useful UI fallbacks
- **Parent epic:** Phase 5
- **Objective:** standardize server/client error envelopes and recoverable UI messaging.
- **Why now:** hardening after all live wiring.
- **Likely affected:** core error mappers, API handlers, app state boundaries, reusable UI fallback components.
- **Consult before:** `API_CONTRACT.md`, `UI_UX_SPEC.md`, `UI_GUIDELINES.md`.
- **Likely docs update:** `API_CONTRACT.md`, `UI_UX_SPEC.md`, `ROADMAP.md`.
- **Acceptance criteria:** consistent errors across endpoints/pages with user-actionable messages.
- **Checks:** integration tests for error scenarios; `pnpm -w test`.
- **Non-goals:** redesigning visual system.
- **Risks/edge cases:** masking actionable backend diagnostics.

### T26 — Free-tier guardrails (batch sizes, file limits)
- **Parent epic:** Phase 5
- **Objective:** enforce ingestion constraints in validation and runtime checks.
- **Why now:** prevent operational failures on constrained infra.
- **Likely affected:** core validation rules, upload/normalize handlers, config docs.
- **Consult before:** `CONTEXT.md`, `DB_SCHEMA.md`, `API_CONTRACT.md`.
- **Likely docs update:** `CONTEXT.md`, `API_CONTRACT.md`, `DB_SCHEMA.md` as needed.
- **Acceptance criteria:** oversized payloads/batches rejected with clear validation errors.
- **Checks:** boundary tests for max file size and batch size.
- **Non-goals:** auto-scaling infra.
- **Risks/edge cases:** mismatched limit values across layers.

### T27 — Deployment documentation (Vercel + Neon)
- **Parent epic:** Phase 5
- **Objective:** document reproducible deploy/config process.
- **Why now:** required for release readiness after behavior is stable.
- **Likely affected:** `docs/DEPLOYMENT.md` (create/update), `README`, `docs/ROADMAP.md`.
- **Consult before:** `CONTEXT.md`, `ARCHITECTURE.md`, existing env/config files.
- **Likely docs update:** deployment and roadmap docs.
- **Acceptance criteria:** clean setup steps, required env vars, migration/runtime checklist.
- **Checks:** dry-run build/deploy script validation where possible.
- **Non-goals:** introducing new hosting providers.
- **Risks/edge cases:** secret/config drift between local and hosted environments.

### T28 — PWA baseline
- **Parent epic:** Phase 5
- **Objective:** add minimal installable web-app baseline without changing product scope.
- **Why now:** final hardening enhancement after core flows stabilize.
- **Likely affected:** `apps/web` manifest/service-worker config and docs.
- **Consult before:** `PRODUCT.md`, `UI_UX_SPEC.md`, deployment docs.
- **Likely docs update:** `PRODUCT.md` (if scope wording changes), `ROADMAP.md`, deployment docs.
- **Acceptance criteria:** manifest + install prompt baseline works; no regression to desktop-first UX.
- **Checks:** build/test + manual PWA audit.
- **Non-goals:** full offline-first architecture.
- **Risks/edge cases:** stale asset caching behavior.

### Deferred Post-MVP Tasks (tracked, not executed in v1)
- **T29:** Auth (email/password + JWT HTTP-only cookies)
- **T30:** Mobile app in `apps/mobile` reusing contracts/core
- **T31:** Optional pgvector-backed semantic retrieval

Each deferred task should be broken into its own planning epic after v1 release and must not block MVP.

---

## 4) Slice Discipline

All tasks above are scoped as single-review slices. Additional enforced split rules:
- Any task touching **more than two layers** should be split into prep + integration subtasks.
- Any task expected to change both **schema and multiple endpoints** must be split by endpoint.
- Any UI task adding more than one page interaction pattern should be split per page/panel.
- Hardening tasks must separate **policy definition** (limits/errors) from **UI copy/presentation** when change size grows.

---

## 5) Execution Sequence (exact order)

1. T01 Confirm CONTEXT source-of-truth
2. T02 Confirm ARCHITECTURE boundaries
3. T03 Confirm API_CONTRACT endpoint/DTOs
4. T04 Confirm DB_SCHEMA alignment
5. T05 Confirm CODEX_WORKFLOW lifecycle
6. T06 Confirm UI_UX_SPEC IA
7. T07 Implement `Activity` model
8. T08 Implement `ActivitySplitKm` model
9. T09 Implement `WeeklyFeature` model
10. T10 Implement `RouteSignature` model
11. T11 Implement ingestion support tables
12. T12 Implement upload endpoint
13. T13 Implement normalize endpoint
14. T14 Implement activities list endpoint
15. T15 Implement activity detail endpoint
16. T16 Implement weekly features endpoint
17. T17 Implement predictions endpoint
18. T18 Build mocked desktop shell/panels
19. T19 Add typed fixtures
20. T20 Add mock/api data-source seam
21. T21 Live wire import status panel
22. T22 Live wire activity timeline panel
23. T23 Live wire features trend panel
24. T24 Live wire prediction/drivers panel
25. T25 Structured error handling + UI fallbacks
26. T26 Free-tier guardrails
27. T27 Deployment docs (Vercel + Neon)
28. T28 PWA baseline
29. T29 Deferred: Auth
30. T30 Deferred: Mobile app
31. T31 Deferred: Optional vector search

---

## 6) Immediate Starting Point

**Start with T01 — Confirm `docs/CONTEXT.md` as source of truth.**

Reason: it is the highest-order constraint document and governs conflict resolution across product, architecture, schema, API, and UX docs. Locking this first prevents downstream rework and ensures all future one-task slices inherit consistent constraints.

---

## 7) Output Format Snapshot

- **Plan summary:** Section 1
- **Ordered epic list:** Section 2
- **Ordered task list:** Sections 3 + 5
- **Dependencies:** captured per-epic and sequence ordering
- **First task recommendation:** Section 6
