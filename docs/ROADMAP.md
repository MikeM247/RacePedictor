# ROADMAP

## Delivery Strategy
Work is delivered in vertical slices. Each slice has explicit acceptance criteria and required checks.

## Slice 0 — Repo + Tooling Foundation
**Goal:** establish monorepo structure and baseline quality tooling.

### Acceptance Criteria
- Directory layout exists: `apps/web`, `packages/core`, `packages/db`, `packages/ui`.
- Workspace tooling resolves package boundaries.
- Lint/typecheck/test scripts are wired at root.

### Checks
- Workspace install/bootstrap succeeds.
- Lint/typecheck/test commands execute without failure.

## Slice 1 — API Contract Skeleton (`/api/v1`)
**Goal:** stand up initial endpoint surface and contract schemas.

### Acceptance Criteria
- `/api/v1` route namespace exists.
- Endpoint skeletons for health, ingestion, activities, dashboard are present.
- Request/response Zod schemas defined in `packages/core`.

### Checks
- Contract tests validate request parsing + response shape.
- No breaking changes against additive-only v1 policy.

## Slice 2 — Staging + Normalized DB Schema
**Goal:** support reliable ingestion and query-friendly domain storage.

### Acceptance Criteria
- Staging tables defined and migrated.
- Normalized tables defined with required keys and relations.
- Dedupe uniqueness constraints implemented.

### Checks
- Migration apply/rollback verified in CI/local.
- Dedupe constraints tested with conflict scenarios.

## Slice 3 — Ingestion Pipeline + Dedupe
**Goal:** ingest source activities and upsert normalized records idempotently.

### Acceptance Criteria
- Ingestion endpoint writes staging records.
- Normalization job/process maps to domain schema.
- Dedupe uses `source_activity_id` primary and `dedupe_hash` fallback.

### Checks
- Integration tests cover duplicate and near-duplicate payloads.
- Throughput baseline meets agreed ingest target.

## Slice 4 — Desktop Dashboard Vertical Slice
**Goal:** deliver primary desktop experience for overview + activity exploration.

### Acceptance Criteria
- Dashboard shell with navigation and top filters implemented.
- Overview KPIs + trend chart populated from live API.
- Activities list/detail flow functional with empty/loading/error states.

### Checks
- UI tests/smoke tests for core navigation and filter behavior.
- Accessibility spot checks (keyboard nav + contrast).

## Slice 5 — Hardening + Release Readiness
**Goal:** stabilize reliability, observability, and documentation.

### Acceptance Criteria
- Structured error handling across API/UI.
- Logging + key metrics available for ingestion and API latency.
- Documentation set fully aligned with implemented behavior.

### Checks
- Regression suite passes.
- Performance sanity checks completed.
- Final doc review completed for all files in `docs/`.

## Epic 6 — Authentication (Post-MVP)
**Goal:** add account authentication after single-profile local MVP is stable.

### Acceptance Criteria
- Email/password registration and login flows are implemented.
- JWT-based auth is issued and stored in HTTP-only secure cookies.
- API authorization middleware protects user-scoped endpoints.
- Session lifecycle behavior (logout, token rotation/expiry handling) is documented and tested.

### Checks
- Auth integration tests cover signup/login/logout and unauthorized access behavior.
- Cookie/security settings validated for local + production environments.
- Backward compatibility verified for non-auth MVP slices where applicable.
