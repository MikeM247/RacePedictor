# CONTEXT

## Purpose
RacePredictor is a monorepo-based product to ingest race/activity data, normalize it, and deliver a desktop-first analytics dashboard with stable public APIs.

This document is the **source of truth** for:
- Scope for v1 delivery.
- Delivery constraints and quality gates.
- Explicit non-goals.
- Milestone execution order.

## In-Scope (v1)
- Monorepo with clear package/app boundaries:
  - `apps/web` for the dashboard.
  - `packages/core` for shared business logic and contracts.
  - `packages/db` for data modeling and persistence logic.
  - `packages/ui` for reusable UI primitives.
- Versioned REST API under `/api/v1`.
- Zod-backed request/response contracts.
- Data ingestion pipeline with deduplication and normalized storage.
- Weekly feature aggregation as the MVP default; daily feature computations are deferred or computed on-demand when enabled.
- Desktop-first dashboard information architecture and baseline responsive behavior.
- Slice-based delivery process with checks and doc updates per story.

## Constraints
- **Contract stability:** `/api/v1` is additive-only after release (no breaking field removals/renames).
- **Schema integrity:** staging ingestion separated from normalized domain schema.
- **Traceability:** every delivered slice updates related docs and acceptance criteria.
- **Boundary enforcement:** apps cannot directly bypass package boundaries.
- **Check discipline:** every slice must run and pass required checks before merge.
- **Ingestion limits (MVP):**
  - GPX/TCX ingestion supports a single file containing a single activity per ingest operation.
  - CSV bulk ingestion is supported only via bounded batches with explicit batch sizing controls.
- **Runtime mode (MVP):** single local athlete profile only; authentication and account flows are intentionally not implemented yet.

## Non-Goals (v1)
- Mobile-first or native mobile UX.
- Multi-tenant customization and white-labeling.
- Authentication UX and account lifecycle flows (signup/login/password reset/session management).
- Real-time streaming guarantees (websocket/SSE-first architecture).
- ML-driven predictive model tuning in production.
- Public plugin ecosystem.

## Milestone Order
1. **Foundation**
   - Monorepo scaffolding and boundary rules.
   - Baseline tooling and CI checks.
2. **Contracts + Schema**
   - API endpoint skeletons under `/api/v1`.
   - Zod contracts.
   - Staging + normalized DB schema.
3. **Ingestion + Dedupe**
   - Raw activity ingestion.
   - Deterministic dedupe strategy and indexes.
4. **Dashboard Vertical Slice**
   - Primary desktop IA and baseline responsive layout.
   - Core read APIs wired to UI.
5. **Hardening**
   - Error handling, observability, and performance checks.
   - Documentation completion and release readiness.

## Quality Gates
- Lint, typecheck, test must pass for touched projects.
- API contract updates reflected in `API_CONTRACT.md`.
- Schema changes reflected in `DB_SCHEMA.md`.
- UX changes reflected in `UI_UX_SPEC.md`.
- Story lifecycle reflected in `ROADMAP.md` and workflow adherence in `CODEX_WORKFLOW.md`.
