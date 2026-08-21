# Database Architecture Implementation Plan

## Problem Framing
- Goals:
- Implement the v1 database structure that supports ingestion, normalization, dedupe, weekly analytics, and dashboard/API reads.
- Implement deterministic data population so frontend and API teams can use realistic data early.
- Keep schema and data behavior consistent with `docs/CONTEXT.md`, `docs/DB_SCHEMA.md`, `docs/API_CONTRACT.md`, and product-owner backlog requirements.
- Constraints:
- MVP is single local athlete runtime, but all domain records must remain keyed by `athleteId`.
- API namespace is `/api/v1` with additive-only compatibility expectations.
- Ingestion must stage first, then normalize.
- Trackpoint-level storage is out of scope for MVP.
- Schema and docs must remain synchronized per `docs/CODEX_WORKFLOW.md`.
- Assumptions:
- Database engine is PostgreSQL (Neon-compatible).
- Schema and migrations will be owned by `packages/db`.
- Seed data must be deterministic and rerunnable in local/dev and CI-like environments.
- Frontend and API consumers can start against seeded data before full ingestion endpoints are complete.
- Open Questions:
- Exact enum sets for `sourceType`, `sport`, and import `status` are not fully finalized in current docs.
- Preferred numeric precision (for pace, elevation, coordinates, scores) is not explicitly standardized.
- Long-term policy for retaining staging rows after successful normalize is not defined.
- Whether prediction/insight snapshots should ever be persisted in DB (or remain compute-on-read only) is still a product/architecture decision.

## Requirements Check
- Confirmed Requirements:
- Canonical entities: `Activity`, `ActivitySplitKm`, `WeeklyFeature`, `RouteSignature`.
- Supporting ingestion structures: `imports`, `raw_files`, `staging_activities`.
- Required uniqueness/index constraints from `docs/DB_SCHEMA.md` must be enforced.
- Data population must support product-owner seed coverage targets and frontend contract readiness.
- Missing or Ambiguous Requirements:
- Exact column-level definitions for `imports`, `raw_files`, and `staging_activities` are described conceptually but not fully typed.
- No explicit retention/archival rules for imports and staging tables.
- No explicit timezone normalization strategy (store UTC vs mixed local offsets) documented for all datetime fields.
- Acceptance Criteria Gaps:
- Current docs define what data must exist, but not yet a formal completion checklist for migration rollback validation and seed idempotency behavior.

## Architecture Overview
- System Context:
- `packages/db` owns schema definitions, migrations, seed population workflow, and repository adapters.
- `packages/core` owns contracts and validation types consumed by API and app layers.
- `apps/web` and future API handlers consume DB data through service/repository interfaces, not direct SQL details.
- High-Level Components:
- Schema Definition Layer
- Migration Layer
- Seed and Population Orchestrator
- Normalization and Dedupe Service Layer
- Read Repository Layer for dashboard/API payloads
- Data Quality Validation Layer
- Key Design Decisions:
- Keep ingestion and normalized data physically separated to preserve traceability and idempotency.
- Enforce dedupe integrity at DB level (`UNIQUE (athleteId, dedupeHash)`), not only in app logic.
- Use deterministic seed keys and ordered population phases to ensure rerunnable environments.
- Keep DB changes additive and backward-safe for `/api/v1` compatibility.

## Component Design
- Component: Schema Definition Layer
  - Responsibilities:
  - Define canonical and supporting tables with constraints, indexes, and foreign keys.
  - Encode required nullable vs non-nullable fields from product and contract docs.
  - Dependencies:
  - `docs/DB_SCHEMA.md`, `docs/product/PRODUCT.md`, `docs/product/DB_STRUCTURE_AND_POPULATION_BACKLOG.md`.
  - Interactions:
  - Feeds migration generation and repository query contracts.
  - Failure Modes:
  - Missing indexes or incorrect nullability causes query regressions and contract mismatch.

- Component: Migration Layer
  - Responsibilities:
  - Create ordered, reversible migrations for initial schema and later additive updates.
  - Protect existing data during iterative schema refinement.
  - Dependencies:
  - Schema Definition Layer, DB engine capabilities.
  - Interactions:
  - Executes before seed and normalization jobs.
  - Failure Modes:
  - Non-reversible or destructive changes block safe rollout and rollback.

- Component: Seed and Population Orchestrator
  - Responsibilities:
  - Populate athlete context, imports/raw files, staging rows, normalized entities, weekly aggregates, and optional route signatures in deterministic order.
  - Provide rerunnable semantics (idempotent inserts/upserts where needed).
  - Dependencies:
  - Migration Layer, normalization services, validation layer.
  - Interactions:
  - Produces initial dataset consumed by dashboard and API contract tests.
  - Failure Modes:
  - Non-deterministic seeds create flaky tests and inconsistent analytics.

- Component: Normalization and Dedupe Service Layer
  - Responsibilities:
  - Transform staged rows into canonical `Activity` and related data.
  - Apply dedupe strategy (`sourceActivityId` preferred, `dedupeHash` fallback).
  - Dependencies:
  - Staging tables, canonical schema, dedupe indexes.
  - Interactions:
  - Writes to `Activity`, `ActivitySplitKm`, optional `RouteSignature`, and supports weekly aggregation input.
  - Failure Modes:
  - Duplicate inserts, partial normalize batches, or inconsistent cursor progress.

- Component: Read Repository Layer
  - Responsibilities:
  - Expose query adapters for activity timeline/detail, weekly feature trends, and import progress summaries.
  - Keep SQL details encapsulated in `packages/db`.
  - Dependencies:
  - Canonical and supporting tables, `packages/core` contracts.
  - Interactions:
  - Consumed by API handlers and app-level data sources.
  - Failure Modes:
  - N+1 patterns, unbounded scans, and missing index usage.

- Component: Data Quality Validation Layer
  - Responsibilities:
  - Run post-population checks for integrity, counts, and reconciliation.
  - Emit machine-readable validation results for CI/local gating.
  - Dependencies:
  - Seed output datasets, repository queries.
  - Interactions:
  - Blocks "data ready" handoff if critical rules fail.
  - Failure Modes:
  - Silent data drift passing to frontend/API consumers.

## Data Model
- Entities:
- Canonical: `Activity`, `ActivitySplitKm`, `WeeklyFeature`, `RouteSignature`.
- Supporting: `imports`, `raw_files`, `staging_activities`.
- Relationships:
- `ActivitySplitKm.activityId -> Activity.id` (cascade delete).
- `RouteSignature.activityId -> Activity.id` (cascade delete, unique per activity).
- `WeeklyFeature.longestRunId -> Activity.id` (nullable relationship).
- All entity groups include `athleteId` for partitioning and forward compatibility.
- Integrity Constraints:
- `UNIQUE (athleteId, dedupeHash)` on `Activity`.
- `UNIQUE (athleteId, weekStartDate)` on `WeeklyFeature`.
- `UNIQUE (activityId)` on `RouteSignature`.
- Indexes for timeline, sport filtering, split lookup, weekly trends, and route hash lookup.
- Migration/Backfill Notes:
- Initial migration introduces full baseline schema and indexes.
- Backfill path for any new derived weekly fields should be additive and batched.
- If enum scopes change, migration must preserve existing values or map them explicitly.

## API Contracts
- Endpoints or Interfaces:
- No new endpoint families required for this plan; schema is built to satisfy existing `/api/v1` contracts.
- Data model must support:
- `POST /api/v1/imports/upload`
- `POST /api/v1/imports/:id/normalize`
- `GET /api/v1/activities`
- `GET /api/v1/activities/:activityId`
- `GET /api/v1/features/weekly`
- `GET /api/v1/dashboard/overview`
- Inputs/Outputs:
- Inputs map from staged import payload metadata and parsed activity rows.
- Outputs map to `ActivitySummary`, `ActivityDetail`, `WeeklyFeatureDTO`, and dashboard overview payload contracts.
- Authorization:
- MVP local runtime only; no auth schema requirements in this phase.
- Error Handling:
- DB layer must return deterministic conflict/not-found/error signals to support API standard error envelopes.
- Versioning/Compatibility:
- Schema evolution for this plan is additive-first to protect `/api/v1` compatibility.

## Non-Functional Requirements
- Performance:
- Query plans must use declared indexes for activity timeline and weekly feature lookups.
- Normalize and aggregate jobs must run in bounded batches (cursor-oriented).
- Scalability:
- Schema remains single-athlete in runtime mode but structurally multi-athlete ready through `athleteId`.
- Reliability:
- Migrations are reversible; normalization is idempotent; seed workflow is rerunnable.
- Security/Privacy:
- Store minimal raw file metadata, not full raw payload blobs by default.
- Observability:
- Capture import/normalize counters, dedupe counts, normalization errors, and aggregation coverage metrics.

## Execution Plan
- Epic/Story: DB-1 Canonical Schema Baseline
  - Scope:
  - Implement canonical tables, constraints, and indexes.
  - Acceptance Criteria:
  - All canonical entities exist with required fields and relationship constraints per `docs/DB_SCHEMA.md`.
  - Dedupe and weekly uniqueness constraints are enforced.
  - Dependencies:
  - Product and schema docs approved.

- Epic/Story: DB-2 Ingestion and Staging Structures
  - Scope:
  - Implement `imports`, `raw_files`, `staging_activities` with lifecycle and traceability fields.
  - Acceptance Criteria:
  - Supports staged, duplicate, rejected, normalized, and error progress reporting.
  - Dependencies:
  - DB-1.

- Epic/Story: DB-3 Normalization and Dedupe Path
  - Scope:
  - Implement deterministic normalize flow from staging to canonical entities.
  - Acceptance Criteria:
  - Re-running normalize with same cursor does not create duplicate normalized activities.
  - Dependencies:
  - DB-1, DB-2.

- Epic/Story: DB-4 Seed Population Pipeline
  - Scope:
  - Implement deterministic seed dataset and ordered population workflow.
  - Acceptance Criteria:
  - Dataset covers product-owner minimums (athlete, imports, staging, 12+ weeks of activities/features, splits coverage, route signature subset).
  - Dependencies:
  - DB-1, DB-2, DB-3.

- Epic/Story: DB-5 Data Contract Readiness Validation
  - Scope:
  - Validate DB data can satisfy current `/api/v1` response shapes and frontend state requirements.
  - Acceptance Criteria:
  - Mapping checks pass for overview, activities, performance, and data quality payload requirements.
  - Dependencies:
  - DB-4.

- Epic/Story: DB-6 Integrity and Operational Gate
  - Scope:
  - Add integrity checks, migration rollback check, and data-quality reconciliation checks as release gate.
  - Acceptance Criteria:
  - All gate checks pass before API/live wiring begins.
  - Gate is executable via `npm run db:test:gate` with machine-readable summary output and critical-failure exit code.
  - Dependencies:
  - DB-5.

## Risks and Trade-offs
- Risk/Trade-off: Strict uniqueness constraints may reject legacy-like records with weak identifiers.
  - Impact:
  - Potential ingestion friction until dedupe signature logic is tuned.
  - Mitigation:
  - Keep `sourceActivityId` and canonical hash both available, with clear error reporting.

- Risk/Trade-off: Rich optional metrics increase schema width and migration complexity.
  - Impact:
  - Higher effort now, but less churn later for prediction and analytics expansion.
  - Mitigation:
  - Keep optional columns nullable and stage rollout by highest-value fields first.

- Risk/Trade-off: Staging retention improves auditability but increases storage usage.
  - Impact:
  - Could stress free-tier limits over time.
  - Mitigation:
  - Define retention and cleanup policy after initial implementation validation.

- Risk/Trade-off: Compute-on-read predictions/insights avoid storage complexity but can increase response-time variance.
  - Impact:
  - Potential performance pressure as data volume grows.
  - Mitigation:
  - Add optional snapshot persistence only if observed latency and load require it.

## Validation
- Tests:
- Migration apply and rollback smoke checks.
- Seed idempotency checks (multiple runs produce stable outcomes).
- Referential integrity checks and dedupe conflict checks.
- Weekly aggregation reconciliation checks.
- Metrics/Logs/Health Checks:
- Import status counters (`stagedCount`, `normalizedCount`, `duplicateCount`, `rejectedCount`, `errorCount`).
- Normalize batch throughput and error rates.
- Query latency for activity timeline and weekly trend reads.
- Rollout/Rollback:
- Rollout in sequence: DB-1 -> DB-2 -> DB-3 -> DB-4 -> DB-5 -> DB-6.
- Rollback strategy: revert to prior migration state and reseed baseline data snapshot.
- ADR Needed: yes, with reason
- Required ADR topics:
- Canonical dedupe signature algorithm and conflict policy.
- Staging data retention and cleanup strategy.
- Numeric precision and timezone normalization standards for analytic fields.

## Skill Invocation Summary
- Skill: architect
- Scope:
- Architecture implementation plan for DB structure and population, based on product-owner requirements and backlog.
- Requirements Validated: yes
- Enforcement Files Read:
- None found (`.codex/enforcement/architecture.md`, `.codex/enforcement/adr.md` missing).
- Key Risks Identified:
- Dedupe conflicts, staging retention growth, optional-field complexity, and compute-on-read performance variability.
