# ROADMAP

This roadmap tracks execution status, but `docs/CONTEXT.md` is the planning source of truth for scope, constraints, non-goals, and milestone order. If wording conflicts, follow `CONTEXT.md` and update this roadmap accordingly.

## Status key

- [ ] Not started
- [~] In progress
- [x] Done

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
- [ ] Implement `ActivitySplitKm`
- [ ] Implement `WeeklyFeature`
- [ ] Implement `RouteSignature`
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

## Deferred epics (post-MVP)

- [ ] Auth (email/password + JWT HTTP-only cookies)
- [ ] Mobile app in `apps/mobile` using same contracts/core
- [ ] Optional vector search (pgvector) when semantic retrieval is clearly needed
