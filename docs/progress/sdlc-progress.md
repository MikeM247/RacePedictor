# SDLC Progress

Last updated: 2026-08-24

## 2026-08-20 Night Ops UI Refresh

**Outcome:** RacePredictor's canonical dashboard routes now use the Night Ops dark analytical visual system, with workout-first Today, readable Calendar summary/detail behavior, explicit-week Plan progress, and stable Activities detail.

**Current gate:** Exact-preview Product Owner acceptance.

**Status:** Implementation, full regression, responsive/accessibility browser validation, and the local preview presentation are complete. The exact validated preview remains open for Product Owner review. The refresh does not alter coaching authority, plan immutability, amendment history, data contracts, authentication, or provider boundaries.

| Role | Status | Evidence / next action |
|---|---|---|
| Product Owner | Direction accepted | Option 2 — Night Ops selected; review exact preview after QA |
| UX/UI | Complete | `docs/UI_GUIDELINES.md`, `docs/UI_UX_SPEC.md`, and `docs/design/screens.md` aligned with delivery |
| Engineering | Complete | Shared shell/Today, Calendar/Plan/secondary screens, and Activities/Login slices implemented |
| QA | Passed | Typecheck, 87/87 web unit tests, production build, 17/17 local E2E, 7/7 online E2E, 3/3 auth E2E, responsive route-chain, focus, overflow, reduced-motion, forced-colour, and zoom-proxy gates passed |
| Product Owner Review | Presented | Exact local preview is open at `http://127.0.0.1:3310/dashboard` for review against workout-first, readable Calendar, truthful status, and safety criteria |
| Launch | Not Started | Promote only the exact accepted preview |

## 2026-08-13 Reasoned Future-session Amendments

**Outcome:** the owner can amend future active-plan sessions in RacePredictor, with a mandatory durable reason available to later AI coaching review while the approved plan remains unchanged.

**Current gate:** Engineering implementation

**Status:** Product story, architecture decision, and UX flow accepted. Core/local, cloud, and UI slices are in progress. QA, Product Owner acceptance, and production launch remain gated.

| Role | Status | Evidence / next action |
|---|---|---|
| Product Owner | Accepted for implementation | `docs/product/FUTURE_PLAN_SESSION_EDITING.md` |
| Architect | Decision gate complete | `docs/adr/0005-reasoned-future-session-amendments.md` |
| UX/UI | Design gate complete | Calendar-centred edit flow with required reason, approved/effective comparison, history, and accessible conflict handling |
| Engineering | In Progress | Implement additive amendment contracts, persistence, projections, AI review context, owner API, and UI |
| QA | Not Started | Run focused and full automated gates after engineering handoff |
| Product Owner Review | Not Started | Complete preview journey and requirement-by-requirement acceptance after QA PASS |
| Launch | Not Started | Promote the exact accepted preview and smoke test production |

## Cloud Strava and Second Brain Programme

**Outcome:** always-available, Strava-first RacePredictor with private raw retention and selected structured Second Brain sync.

**Current gate:** Milestone 8 owner-authenticated provisioning and production smoke.

**Status:** Owner-authenticated production foundation live; awaiting provider authentication. Milestones 1-7 have passed. M8 is partially accepted but not complete.

| Milestone | Status | Gate evidence |
|---|---|---|
| M1 Decisions/contracts | Accepted | ADR 0003, architecture plan, backlog, test strategy, source-doc alignment, baseline tests, and M1 Product Owner acceptance |
| M2 Cloud foundation | Accepted | Contract, migration, tenant, auth/storage, product-shell, QA, and Product Owner evidence |
| M3 Strava ingestion | Accepted | OAuth/webhook/raw-storage/worker/canonical/backfill evidence; core 56, DB 33, web 54, local 18, browser 11; QA and Product Owner PASS |
| M4 Online dashboard | Accepted | Core 65, DB 39, web 59, local 18, browser 14; cloud reads/status/change feed/read-only coaching; QA and Product Owner PASS |
| M5 Local structured sync | Accepted | Core 71, DB 44, web 64, local 24, browser 15; pairing/DPAPI/scheduler, cursor replay/recovery, approved-plan and selected-context publication; QA and Product Owner PASS |
| M6 QA and hardening | Accepted | Core 77, DB 47, web 68, local 24, browser 15; recovery/guardrails/shadow/rollback/full journey; QA and Product Owner PASS |
| M7 Product acceptance | Accepted for production verification | All 16 original requirements and 21 final items reviewed; five production dependencies have bounded M8 checks |
| M8 Provisioning/smoke | In progress — provider authentication | Vercel Hobby, Neon Free, 10 migrations, 24 tables, owner grant, Production/Preview configuration, Ready preview, Current production, health/access-control checks, and real GitHub owner dashboard/Settings smoke pass. R2, Strava, and local selected-field live journeys remain |

The current visual tracker is `docs/plans/CLOUD_STRAVA_SYNC_MILESTONES.md`. This programme does not reopen the accepted Phase 1 coaching safety boundaries: activity ingestion or selected context publication cannot approve, activate, or adapt a plan.

## Current Delivery

**Outcome:** Phase 1 local-first digital coach

**Current gate:** Phase 1 accepted

**Gate status:** Passed; all release-blocking QA findings were remediated, the integrated automated gate is green, and Product Owner acceptance is recorded in `docs/product/PHASE_1_ACCEPTANCE_REVIEW.md`.

## Scope Decisions

- [x] Codex/Second Brain owns AI conversation; app owns agreed structured state.
- [x] Single local athlete, `Africa/Johannesburg`, configurable 06:30 reminder default.
- [x] Manual bounded CSV and one-activity GPX imports.
- [x] Explicit proposal approval and immutable plan versioning.
- [x] Interactive calendar adjustments preserve prescription history.
- [x] In-app Today card separated from Codex recurring-reminder delivery.
- [x] Automatic Garmin sync and automatic post-run review/adaptation deferred to Phase 2.

## Role Gate

| Role | Status | Evidence / next action |
|---|---|---|
| Product Owner | Accepted | Every Phase 1 feature group was reviewed against working evidence; accepted gap is limited to trustworthy activity-to-session completion matching deferred to Phase 2 |
| Architect | Decision gate complete | `docs/adr/0002-digital-coach-control-boundaries.md` and aligned source docs |
| UX/UI | Complete | Desktop and 390px critical journeys, recovery states, deep links, dialogs, and truthful reminder statuses pass browser automation |
| Engineering | Complete | Local history/context, atomic proposal replacement, calendar editing, Today, reminder handoff, shared contracts, and compatibility behavior are implemented |
| QA | Passed | Core 15/15, web 22/22, local DB 17/17, DB-3/4/5/6 gates, production build/typecheck, Playwright 9/9, dependency audit, privacy scan, and diff hygiene pass |

## Delivery Slices

| Slice | Status | Exit evidence |
|---|---|---|
| P1.0 Decision/docs gate | Complete | Product backlog, ADR, screens, and consistent source docs |
| P1.1 Complete history + context artifact | Complete | Bounded CSV/GPX, cross-format dedupe, complete-history fingerprint, note warnings, and atomic publication pass |
| P1.2 Proposal import + approval/versioning | Complete | Strict validation, hashing/idempotency, durable rejection, atomic goal/plan replacement, and read-only history pass |
| P1.3 Interactive calendar | Complete | Seven-day/agenda views, immutable prescriptions, reschedule/skip/restore audit, warnings, recovery, deep links, and responsive checks pass |
| P1.4 Today + reminder handoff | Complete | Timezone states, prescription/countdown/warnings, deterministic cue, configurable preferences, handoff boundaries, and external-status separation pass |
| P1.5 Release gate | Complete | Integrated automation and Product Owner acceptance are recorded in the Phase 1 acceptance review |

## Definition of Done

- Every acceptance criterion in the Phase 1 backlog has implementation evidence or an explicitly accepted gap.
- All touched workspaces pass lint, typecheck, unit, integration, and applicable browser tests.
- No private athlete data appears in fixtures, Git, logs, or screenshots.
- API, schema, architecture, UX, roadmap, and progress docs match delivered behavior.
- Product Owner completes the final end-to-end review before the app is presented as Phase 1 complete.

## Next Handoff

Use the accepted Phase 1 journey. Do not begin autonomous review/adaptation or Garmin account integration under this Phase 1 scope.

Accepted Phase 1 gap: imported activities are not matched reliably to prescribed sessions, so the app does not infer workout completion or perform post-run review. Trustworthy matching, review, and adaptation remain Phase 2 work.

## 2026-08-08 Gaterite Plan Access Enhancement

- Outcome: the Second Brain plan family `RP-HM-GATERITE-20261004-SUB2` is available in RacePredictor for review and daily use.
- Version state: v1.0.0 is retained as superseded/withdrawn; the athlete-approved v1.1.0 is active as app plan version 2 with 28 canonical sessions from 2026-08-09 through 2026-10-04.
- UI behavior: Plan keeps the active approved version in focus, surfaces only newer persisted drafts behind an explicit **Review saved draft** action, hides superseded or withdrawn drafts, and keeps approved versions perusable through immutable plan history.
- Product acceptance: live Plan, Calendar, and Today walkthrough passed. Plan exposed all 28 prescriptions, Calendar exposed the 2026-08-09 bridge session and controls, and Today exposed the active goal, countdown, rest state, and Plan v2. Repeated Today to Plan navigation keeps Plan v2 in focus, leaves creation collapsed, and no longer raises a page-load error.
- QA: production build and typecheck passed; Core 15/15, Web 22/22, local DB 18/18, and Chromium Playwright 11/11 passed; proposal/hash, privacy, and diff-hygiene checks passed.
- External checks: Neon-backed normalize/contracts gates and the npm registry audit were unreachable from the current environment. They are not part of the local plan-access execution path and did not block this local release decision.
