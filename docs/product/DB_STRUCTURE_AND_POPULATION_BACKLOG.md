# Database Structure and Population Backlog (Product Owner)

Feature: Canonical Normalized Schema Baseline
Description: Define and approve the canonical normalized database structure for RacePredictor MVP using `Activity`, `ActivitySplitKm`, `WeeklyFeature`, and `RouteSignature`, including required keys, relationships, and constraints.
Priority: High
Area: Database schema (`packages/db` target), domain data model
Reason: This is the foundation for every API and frontend data workflow; no reliable ingestion, analytics, or dashboard payloads are possible without it.
Acceptance Criteria:
- Schema includes `Activity`, `ActivitySplitKm`, `WeeklyFeature`, and `RouteSignature` with required fields defined in `docs/DB_SCHEMA.md`.
- Foreign keys are defined for splits and route signatures against `Activity` with cascade delete behavior.
- Unique constraints and indexes are defined for dedupe and read performance:
- `UNIQUE (athleteId, dedupeHash)` on `Activity`
- `UNIQUE (athleteId, weekStartDate)` on `WeeklyFeature`
- Indexes for activity timeline, sport filters, split lookup, weekly trend lookup, and route hash lookup.
- Schema is explicitly scoped to single-athlete runtime in MVP while keeping `athleteId` on all domain records for forward compatibility.
Dependencies:
- `docs/CONTEXT.md`
- `docs/DB_SCHEMA.md`
- `docs/API_CONTRACT.md`
Risks:
- Constraint mismatches with API DTO expectations may cause rework in activity and dashboard endpoints.

Feature: Ingestion and Staging Metadata Structure
Description: Define the supporting ingestion metadata structures required for upload, parse, normalize, dedupe, and retry behavior (`imports`, `raw_files`, `staging_activities`).
Priority: High
Area: Import pipeline data model
Reason: Frontend Data Quality workflows depend on transparent ingest status and counters; normalization safety depends on staging and idempotency metadata.
Acceptance Criteria:
- `imports` supports status lifecycle, progress counters, and cursor/batch metadata.
- `raw_files` stores file identity and parse summary metadata only (no large payload persistence by default).
- `staging_activities` stores parsed activity rows needed by normalize pass and dedupe checks.
- Structure supports reporting staged, normalized, duplicate, rejected, and error counts used by Data Quality and Overview flows.
Dependencies:
- Canonical schema baseline item
- `/api/v1/imports/upload` and `/api/v1/imports/:id/normalize` contract requirements
Risks:
- Missing metadata fields will block trustworthy ingestion visibility and retry semantics.

Feature: Frontend Data Contract Readiness Mapping
Description: Define which database entities and fields are required to satisfy each frontend/API payload shape for Overview, Activities, Performance, and Data Quality.
Priority: High
Area: Data-to-contract mapping
Reason: Prevents building schema that cannot power required UI states and avoids late-stage contract drift.
Acceptance Criteria:
- Mapping exists from DB entities to `ActivitySummary`, `ActivityDetail`, `WeeklyFeatureDTO`, and dashboard overview payload components.
- Mapping explicitly includes required source fields for:
- Overview KPIs and prediction summary context
- Activity list/detail with splits and optional route signature
- Weekly trend/performance series
- Import progress and quality counters
- Each mapped payload identifies required vs optional DB fields and nullability expectations.
Dependencies:
- Canonical schema baseline item
- `docs/API_CONTRACT.md`
- `docs/PRODUCT.md` and `docs/product/PRODUCT.md`
Risks:
- Unclear mapping can lead to placeholder UI data or unstable endpoint behavior.

Feature: Seed Dataset Design for MVP Frontend Coverage
Description: Define the initial population dataset needed to exercise frontend flows and API responses with realistic, non-trivial data.
Priority: High
Area: Seed data requirements
Reason: Frontend implementation and API integration need reliable representative data before live ingestion is complete.
Acceptance Criteria:
- Seed scope includes at minimum:
- 1 athlete context (`athlete_001`)
- 2 imports (one completed, one in-progress)
- 20-50 staging rows with at least one duplicate candidate and one rejected row
- 30-60 normalized activities covering at least 12 weeks
- Splits for at least 60% of seeded activities
- 12 consecutive weekly feature rows
- Route signatures for a meaningful subset of activities (20-40%)
- Seed coverage supports all dashboard states: success, empty, error (via controlled fixtures), and stale metadata scenarios.
Dependencies:
- Ingestion/staging structure item
- Frontend data contract readiness mapping item
Risks:
- Underpowered seed data can create false confidence and hide edge cases until late integration.

Feature: Deterministic Population Workflow
Description: Define the ordered workflow to populate data so normalized records, aggregates, and quality counters are consistent and reproducible.
Priority: High
Area: Data population sequencing
Reason: Reproducible population is required for stable implementation planning, testing, and troubleshooting.
Acceptance Criteria:
- Population order is documented and approved:
- seed athlete context
- insert import/raw file metadata
- insert staging rows
- run normalize pass into canonical tables
- generate split rows
- compute weekly feature aggregates
- attach optional route signatures
- validate endpoint-ready payload shape
- Workflow includes clear rerun/idempotency expectations to avoid duplicate normalized activities.
Dependencies:
- Seed dataset design item
- Dedupe strategy and constraints item
Risks:
- Non-deterministic sequencing can create inconsistent weekly aggregates and unstable test outcomes.

Feature: Data Quality and Validation Gate for Seeded Database
Description: Define objective validation checks that must pass before seeded data is considered frontend-ready.
Priority: Medium
Area: Data quality verification
Reason: Ensures seeded data is trustworthy and aligned with API/frontend expectations before implementation proceeds.
Acceptance Criteria:
- Validation checks confirm:
- no duplicate normalized records by `(athleteId, dedupeHash)`
- non-negative distance/time/count metrics
- valid temporal ordering (`occurredAt <= endedAt`, correct weekly window bounds)
- monotonic split offsets by activity
- weekly aggregate reconciliation against source activities for sampled weeks
- Validation output is documented as a repeatable checklist for implementation handoff.
Dependencies:
- Deterministic population workflow item
- Frontend data contract readiness mapping item
Risks:
- Weak validation allows silent data defects that appear later as frontend or API bugs.

## Product Assumptions
- The request is for product-level database requirements and backlog slicing, not direct code/migration implementation in this step.
- MVP remains single-athlete runtime, but schema must keep `athleteId` for forward compatibility.
- API namespace remains `/api/v1` and additive-only, so data design should avoid breaking contract changes.
- Existing docs (`docs/CONTEXT.md`, `docs/DB_SCHEMA.md`, `docs/API_CONTRACT.md`, `docs/PRODUCT.md`) remain source-of-truth over ad hoc additions.

## Prioritisation Summary
- Highest priority is schema and ingestion structure because they unlock all downstream population and frontend/API behavior.
- Next priority is data-contract mapping to prevent schema/UI drift and guarantee required payload coverage.
- Seed dataset design and deterministic population follow immediately to enable implementation planning with realistic data.
- Validation gates are medium priority but mandatory before considering the dataset frontend-ready.

## Recommended Next Item
Feature: Canonical Normalized Schema Baseline

This is the first implementation candidate because every subsequent step (ingestion structure, seed population, API payload readiness, and frontend integration) depends on finalized canonical tables, keys, and constraints.
