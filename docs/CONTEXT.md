# CONTEXT

## Purpose
RacePredictor is a monorepo-based product to ingest race/activity data, normalize it, and deliver a desktop-first analytics dashboard with stable public APIs.

This document is the **source of truth** for:
- Scope for v1 delivery.
- Delivery constraints and quality gates.
- Explicit non-goals.
- Milestone execution order.

If any planning doc (`ROADMAP.md`, `PRODUCT_EPICS_EXECUTION_PLAN.md`, `PRODUCT.md`, or other implementation-planning notes) conflicts with this document, **`CONTEXT.md` takes precedence** and the conflicting wording must be updated.

## In-Scope (v1)
- Monorepo with clear package/app boundaries:
  - `apps/web` for the dashboard.
  - `packages/core` for shared business logic and contracts.
  - `packages/db` for data modeling and persistence logic.
  - `packages/ui` for reusable UI primitives.
- Versioned REST API under `/api/v1`.
- Zod-backed request/response contracts.
- Data ingestion pipeline with deduplication and normalized storage.
- Canonical normalized models: `Activity`, `ActivitySplitKm`, `WeeklyFeature`, and optional `RouteSignature` for compact route metadata.
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

## Approved Phase 1 Digital Coach Scope (2026-08-05)

The analytics dashboard and ingestion pipeline above are the data foundation for a **local-first digital coach for one athlete**. Where older v1 language is narrower, this section and `docs/product/PHASE_1_DIGITAL_COACH_BACKLOG.md` define the current target.

- AI goal/plan conversation occurs in Codex using the athlete's Second Brain; the app does not embed chat in Phase 1.
- The app owns canonical history plus the explicitly settled goal, active versioned plan, effective calendar, and reminder preferences.
- Codex consumes `coaching-context.v1` and returns a validated `coaching-plan-proposal.v1` draft/proposal; import never activates it.
- History enters through manual bounded CSV or single-activity GPX upload with validation and dedupe.
- Calendar changes require a reason and preserve the approved prescription plus revision/audit history. Future sessions may be amended, rescheduled, skipped, or restored; a past session may only be recorded as skipped. This does not imply a reviewed or completed workout.
- Today works in-app. Daily reminder preference defaults to 06:30 `Africa/Johannesburg`, is configurable, and is handed off separately to a recurring Codex automation.

Phase 2 defers automatic Garmin sync, automatic post-run review/adaptation, autonomous plan/calendar changes, and app-owned push/email/SMS delivery. See `docs/adr/0002-digital-coach-control-boundaries.md`.

## Approved Cloud Strava and Second Brain Sync Scope (2026-08-10)

The earlier local-only/authentication deferrals continue to describe Phase 1, but no longer describe the active Phase 2 programme. The current approved outcome is an authenticated, always-available RacePredictor for one owner/athlete:

- Vercel hosts the online Next.js application; Neon is authoritative for structured activities, approved plans, calendars, revisions, and sync state.
- Strava is the only automatic activity provider in this programme. Garmin-specific integration and fields remain out of scope.
- Raw provider payloads are retained privately in Cloudflare R2; Neon stores provenance and checksum metadata, not payload bodies.
- Local Obsidian remains authoritative for qualitative source material. RacePredictor receives only the five optional, strictly structured `second-brain-context.v1` sections selected locally: availability, training preferences, dated constraints, wellbeing check-ins, and activity reflections.
- Version 1 has no arbitrary text, note identity, vault path, goal, or plan prescription. Unknown or unselected fields are rejected locally and in the cloud.
- The product exposes one athlete, while actor, repository, provider, object, device, job, change-feed, and snapshot boundaries are athlete-scoped for later expansion.
- Cloud workouts and plans can be pulled into a local SQLite projection through a replay-safe cursor. The online product does not depend on the local computer being on.
- Neon stores the owner-authored effective overlay and append-only reasoned history for future-session amend/reschedule/skip/restore actions and past-session skip records. A past skip cannot amend, move, restore, or alter the approved prescription. Calendar and Today show the effective projection while retaining the original prescription; competing edits require reload and review rather than an automatic retry.
- Automatic review/adaptation and autonomous plan changes remain out of scope; ingestion or context publication cannot mutate an approved plan.
- Free-tier operation optimizes for durable recovery and truthful freshness, not a real-time or uptime guarantee.

The approved decision, delivery stories, architecture, tests, and visual status are in ADR 0003 and the `CLOUD_STRAVA_*` documents under `docs/plans` and `docs/product`. External platform and provider authentication is intentionally deferred until Milestone 8.
