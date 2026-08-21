# ROADMAP

This roadmap tracks execution status, but `docs/CONTEXT.md` is the planning source of truth for scope, constraints, non-goals, and milestone order. If wording conflicts, follow `CONTEXT.md` and update this roadmap accordingly.

## Status key

- [ ] Not started
- [~] In progress
- [x] Done

## Product Phase 1 — Local Digital Coach

- [x] P1.0 Decision/docs gate: backlog, ADR, contracts, screens, and progress source of truth
- [x] P1.1 Manual CSV/one-activity GPX history and versioned coaching context
- [x] P1.2 Proposal import, explicit atomic activation/replacement, and read-only version history
- [x] P1.3 Owner-selected active approved plan with optimistic conflict protection and cloud-to-local lifecycle sync
- [x] P1.3 Seven-day/agenda calendar with immutable prescriptions and auditable edits
- [x] P1.4 Today plus configurable 06:30 `Africa/Johannesburg` preference and Codex handoff/status separation
- [x] P1.5 Unit/contract/integration/import/timezone/browser gates and Product Owner acceptance

Detailed criteria: `docs/product/PHASE_1_DIGITAL_COACH_BACKLOG.md`. Acceptance evidence: `docs/product/PHASE_1_ACCEPTANCE_REVIEW.md`. The older numbered phases below are retained archival analytics-foundation delivery lanes, not current release status.

## Product Phase 2 — Cloud Strava and Selected Second Brain Sync

- [x] M1 Decisions, versioned boundaries, architecture, backlog, test strategy, and visual progress plan
- [x] M2 Cloud-compatible contracts, tenant-safe persistence, fail-closed auth, storage, and durable-work seams
- [x] M3 Strava OAuth, bounded backfill, webhook lifecycle, private raw retention, normalization, and reconciliation
- [x] M4 Authenticated cloud dashboard plus separate ingestion, activity, local-device, and Second Brain freshness
- [x] M5 Replay-safe cloud-to-local projection and strict selected-field Second Brain publication
- [x] M6 Cumulative automated QA, product testing, security, free-tier guardrails, recovery, and rollback hardening
- [x] M7 Requirement-by-requirement Product Owner acceptance
- [~] M8 Owner-authenticated Vercel/Neon/R2/Strava provisioning and bounded production smoke

Garmin, multi-athlete product controls, automatic post-run review/adaptation, autonomous plan changes, and paid services remain deferred. Detailed status: `docs/plans/CLOUD_STRAVA_SYNC_MILESTONES.md`.

## Product Enhancement — Reasoned Future-session Amendments

- [x] Product story, acceptance criteria, UX flow, and ADR 0005
- [~] Additive core, local, cloud, API, sync/context, and Calendar/Today implementation
- [ ] Unit, integration, security, migration, browser, accessibility, and regression QA
- [ ] Product Owner end-to-end acceptance
- [ ] Verified preview promotion and production smoke

Detailed criteria: `docs/product/FUTURE_PLAN_SESSION_EDITING.md`.

## Phase 1 — Docs first (execution gate)

### R1.1 Finalize planning docs

- [x] Confirm `CONTEXT.md` as source of truth
- [x] Confirm `ARCHITECTURE.md` boundaries
- [x] Confirm `API_CONTRACT.md` endpoint/DTOs
- [x] Confirm `DB_SCHEMA.md` Prisma model alignment
- [x] Confirm `CODEX_WORKFLOW.md` story lifecycle
- [x] Confirm `UI_UX_SPEC.md` desktop dashboard IA

**Acceptance criteria**

- Docs are internally consistent and represent current implementation target.
- `CODEX_WORKFLOW.md` defines explicit story checklist and docs-sync gates with `Updated`/`N/A` resolution.
- `UI_UX_SPEC.md` defines all five dashboard pages and the required loading/empty/error/stale variants for each.

## Phase 2 — Schema + contract baseline

### R2.1 Prisma model baseline

- [x] Implement `Activity`
- [x] Implement `ActivitySplitKm`
- [x] Implement `WeeklyFeature`
- [x] Implement `RouteSignature`
- [x] Implement minimal supporting ingestion tables (`imports`, `raw_files`, `staging_activities`)

**Acceptance criteria**

- Model fields and indexes match `DB_SCHEMA.md`.
- Dedupe uniqueness (`athleteId` + `dedupeHash`) enforced.

### R2.2 API baseline

- [ ] `POST /api/v1/imports/upload`
- [ ] `POST /api/v1/imports/:id/normalize`
- [ ] `GET /api/v1/activities`
- [ ] `GET /api/v1/activities/:activityId`
- [ ] `GET /api/v1/features/weekly`
- [ ] `POST /api/v1/predictions`

**Acceptance criteria**

- Requests/responses are Zod-validated.
- Normalize batching uses cursor semantics.

## Phase 3 — Visual-first dashboard slice

### R3.1 Mocked dashboard

- [ ] Build desktop layout (sidebar, KPI row, drivers, trends, import status)
- [ ] Add typed fixture data mapped to `Activity`, `WeeklyFeature`, and prediction DTOs
- [ ] Add data-source adapter seam (`mock` vs `api`)

**Acceptance criteria**

- Entire dashboard renders with mock data.
- Mock payloads validate against shared contracts.

## Phase 4 — Panel-by-panel live wiring

### R4.1 Import status panel live wiring

- [ ] Wire upload + normalize progress to API

### R4.2 Activity timeline panel live wiring

- [ ] Wire activities list/detail including splits

### R4.3 Features trend panel live wiring

- [ ] Wire weekly features series

### R4.4 Prediction + drivers panel live wiring

- [ ] Wire prediction endpoint and confidence bands

**Acceptance criteria**

- Each panel swaps from mock to live without component contract changes.

## Phase 5 — Hardening and release

- [ ] Structured error handling + useful UI fallbacks
- [ ] Free-tier guardrails enforced (batch sizes, file limits)
- [ ] Deployment documentation (Vercel + Neon)
- [ ] PWA baseline
- [ ] DB-6 gate command (`npm run db:test:gate`) passing with critical checks

## Deferred epics (post-MVP)

- [ ] Auth (email/password + JWT HTTP-only cookies)
- [ ] Mobile app in `apps/mobile` using same contracts/core
- [ ] Optional vector search (pgvector) when semantic retrieval is clearly needed
