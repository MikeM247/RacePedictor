# ARCHITECTURE

## ORBIT post-run review (28 October 2026)

Core owns `activity-reflection.v2`, offer eligibility and DTO contracts. DB repositories serialize activity reflection mutations, retain content-free idempotency receipts, and keep login offers separate from activity completion. Authenticated web handlers derive athlete and login identity only from the trusted session, validate same-origin mutations, and orchestrate offers, explicit save/delete/reopen, archive choice, and feedback-aware Coach turns. React owns accessible form state and opaque session-scoped drafts. AI receives a committed, read-only reflection snapshot and cannot write reflection state. Assessment generation fingerprints athlete-reported RPE and publication validates the captured activity/reflection revisions transactionally. Feature Preview configuration fails closed unless exact branch, Preview environment, dedicated TLS database endpoints, and feature migration selection all agree. Details: [implementation handoff](plans/ORBIT_POST_RUN_REVIEW_IMPLEMENTATION.md).

## Coach discussion archival (25 October 2026)

The V2 Coach reuses its athlete-scoped conversation generation as a discussion boundary. Transactional archive metadata retains original message/turn rows, invalidates pending leases and advances the active generation. Private paginated history reads expose closed generations without sending them to the provider. Core contracts, DB repositories and authenticated web composition preserve existing boundaries. See [Coach chat history](plans/COACH_CHAT_HISTORY.md) and the amendment to ADR 0010.

## Settings-owned milestone timeline (26 October 2026)

Core composes verified goal context, race history and versioned membership state. A shared `/api/v1/coaching/milestones` reader supplies Home and Settings; owner-scoped commands remove, restore, link or unlink without rewriting approved plans, activities or result snapshots. PostgreSQL reads use one repeatable snapshot and mutations use a serializable transaction with management/source revision checks; SQLite uses a reserved write transaction. Database adapters own persistent JSON state. Explicit race identity is independent of time-target evidence. Readers fail closed when management state is unavailable and retain a labelled prior composed view during refresh failures. See [ADR 0011](adr/0011-settings-owned-milestone-timeline.md).

## V2 conversation-led Coach (22 October 2026)

The approved AI Companion direction and mature humanoid male ORBIT likeness now guide the online-first V2 Coach implementation. The [design handoff](plans/V2_AI_COMPANION_DESIGN_HANDOFF.md) pins source artwork and layout; [the first-iteration architecture](plans/V2_FIRST_ITERATION_ARCHITECTURE_IMPLEMENTATION_PLAN.md) describes the conversation service, persistence, APIs, release controls and verification. Shared next-session resolution remains in core and is reused by the Today and Coach views. One authenticated athlete conversation uses a bounded, refreshed training context and server-side OpenAI complete replies. Chat history is retained until explicitly cleared and cannot mutate plans, sessions, completion, goals or wellbeing. The additive persistence remains outside device sync and Second Brain. Local Home/tools remain intact; online UI and generation are independently gated off by default. See [ADR 0010](adr/0010-v2-conversation-led-coach.md).

## Milestone management (21 October 2026)

Settings composes one MilestoneManager and native-dialog achievement/target editors around existing race-history CRUD, activity search and verified goal-context reads. Core owns validation/computation of `milestone-change-request.v1`. Requests are unapproved, athlete-keyed session-storage drafts pinned to plan ID/version/revision/approval hash, goal identity and base milestones. Plan revalidates the current base before handing the complete requested list to the existing planning workflow; it never directly mutates an approved plan. Online users can copy/download for the paired local workflow. No API or database migration is added. Local activity list/detail use the same configured athlete as milestone writes. See [the role handoff and architecture](plans/MILESTONE_MANAGEMENT.md).

## Shared full-screen activity detail (7 October 2026)

Calendar and Training compose the same client-side `ActivityDetailDialog` around the existing `ActivityRecordContent`. Page owners retain activity selection, loading, retry, history and return-context behavior; Calendar requests only the chosen record. The dialog portals to the document body, locks scrolling, inerts background siblings, and uses the shared modal keyboard/focus hook. Calendar keeps Day details as the parent summary; Training leaves its list mounted beneath the dialog. This is a presentation and navigation change with no API, storage, or authority changes. Split target rendering remains in the shared chart component. See [the activity detail and chart contract](plans/ACTIVITY_SPLIT_COMPARISON.md).

## Reviewed split comparison extension (6 October 2026)

One responsive bar-chart component serves Calendar and Training. Browser-safe core calculations are separate from server hashing/source validation and cloud/local repositories. A paired-device workflow prepares and publishes explicitly owner-reviewed pace blocks, independently of plan activation and session completion matching. See [ADR 0009](adr/0009-reviewed-activity-pace-comparisons.md) and [implementation/workflow](plans/ACTIVITY_SPLIT_COMPARISON.md).

## Monorepo Layout

```text
/
├─ apps/
│  └─ web/           # Dashboard application (routing, pages, API composition)
├─ packages/
│  ├─ core/          # Domain logic, schemas/contracts, service interfaces
│  ├─ db/            # DB schema, migrations, repositories, data access
│  └─ ui/            # Shared UI components, tokens, and patterns
└─ docs/             # Product and engineering source documents
```

## Package Responsibilities

### `apps/web`
- Hosts the desktop-first dashboard.
- Composes domain services from `packages/core`.
- Uses presentational + composed components from `packages/ui`.
- Must not define conflicting domain contracts already owned by `packages/core`.

### `packages/core`
- Canonical home for:
  - Domain types.
  - Zod request/response schemas.
  - API contract mappers.
  - Use-cases and validation logic.
- Framework-light and reusable across runtimes.

### `packages/db`
- Owns persistence concerns:
  - Schema definitions.
  - Migrations.
  - Repositories/query adapters.
  - Index/dedupe implementation details.
- Depends on `packages/core` types where practical, never on UI.

### `packages/ui`
- Reusable component library and design primitives.
- No direct DB access.
- No domain-side effects; components receive data via props/contracts.

## Boundary Rules (Must Follow)
1. **Allowed dependencies**
   - `apps/web` → `packages/core`, `packages/ui`, `packages/db` (via service layer only).
   - `packages/db` → `packages/core`.
   - `packages/ui` → shared utilities only (no db/core domain logic coupling).
   - `packages/core` → internal/shared libs, but no `apps/*` or `packages/ui`/`packages/db` runtime coupling.
2. **No reverse imports**
   - Packages must not import from `apps/web`.
3. **Contract ownership**
   - API contracts are authored in `packages/core` and consumed elsewhere.
4. **Persistence encapsulation**
   - SQL/query details remain in `packages/db`; callers use repository/service interfaces.
5. **UI purity**
   - `packages/ui` remains presentation-focused; orchestration occurs in app/core layers.

## Planned Module Boundary Map (R1.1/T02)

The table below maps every planned feature/module in `docs/ROADMAP.md` to its owning layer and explicitly allowed imports. This is the boundary reference to use during implementation planning and code review.

| Planned feature/module | Owning layer | Allowed imports | Forbidden shortcuts / notes |
| --- | --- | --- | --- |
| `POST /api/v1/imports/upload` route handler + request validation | `apps/web` (API composition) + `packages/core` (contracts) | `apps/web` may import `packages/core` contracts and `packages/db` service/repository entrypoints; `packages/core` imports no app/ui/db runtime | Route handlers must not embed raw SQL/ORM calls inline; persistence delegated to db layer interfaces. |
| `POST /api/v1/imports/:id/normalize` orchestration | `apps/web` + `packages/core` use-cases + `packages/db` repositories | `apps/web -> core/db`, `packages/db -> packages/core` | Normalization + dedupe logic in core/db; avoid controller-level data mutation logic tied to DB details. |
| `GET /api/v1/activities` and `GET /api/v1/activities/:activityId` | `apps/web` + `packages/core` contracts + `packages/db` query adapters | Same as above | App layer may shape HTTP response using core contracts, but cannot own query semantics/index hints. |
| `GET /api/v1/features/weekly` | `apps/web` + `packages/core` + `packages/db` | Same as above | Weekly aggregation SQL/materialization logic remains in db layer or core services, not UI/app components. |
| `POST /api/v1/predictions` | `apps/web` + `packages/core` | `apps/web -> packages/core`; optional db reads only through db interfaces | Prediction DTO definitions remain in core; app route must not redefine competing DTOs. |
| Prisma models (`Activity`, `ActivitySplitKm`, `WeeklyFeature`, `RouteSignature`, ingestion support tables) | `packages/db` | `packages/db -> packages/core` types only | No imports from `apps/web`; schema/index/dedupe internals remain encapsulated in db package. |
| Dashboard data-source seam (`DashboardDataSource`, mock/api implementations) | `apps/web` | `apps/web -> packages/core` contracts and app-local adapters | `packages/ui` must not select data sources or perform fetch/orchestration logic. |
| Desktop dashboard layout/panels/components | `packages/ui` (reusable) and/or `apps/web` composition shell | UI can import React/shared style utilities; app composes with prepared props | UI components must not import `packages/db` or call API/DB directly. |
| Typed fixture data mapped to `Activity`, `WeeklyFeature`, prediction DTOs | `apps/web` fixtures using `packages/core` contracts | `apps/web -> packages/core` | Fixture types are contract-consumers only; contracts are authored in core. |
| Panel-by-panel live wiring (import status, timeline, trends, prediction/drivers) | `apps/web` composition + adapters | `apps/web -> packages/core`, `apps/web -> packages/db` via services | Prevent app-layer shortcuts that directly couple components to DB repository/query internals. |

## Import Guardrails for Reviews and Static Checks

- **Red flag pattern:** any `apps/web` file importing db implementation internals (e.g., schema/client/query files) instead of consuming db service/repository interfaces.
- **Red flag pattern:** any `packages/ui` component importing from `packages/db` or app route/data-source files.
- **Red flag pattern:** any package importing from `apps/web`.
- **Minimum static check for boundary drift:** run repository lint plus a targeted import scan for forbidden edges (for example, `rg "from ['\"](\.\./)*apps/web|packages/db" packages`).

If a future planned feature cannot be mapped into this table without violating one of the rules above, architecture must be updated first (docs-first) before implementation.

## Cross-Cutting Architecture Decisions
- API namespace fixed at `/api/v1` for initial release.
- Additive evolution strategy for v1 contracts.
- Ingestion pipeline writes to staging first, then normalization + dedupe pass.
- Documentation-first changes for architecture-impacting decisions.

## Dashboard Data Source Strategy (App Layer)

### Interface definition
- Define a `DashboardDataSource` interface in `apps/web` (app layer), not in UI packages.
- The interface is the only contract consumed by dashboard composition logic.
- Keep methods focused on dashboard use-cases (e.g., loading race cards, predictions, and related metadata).

### Planned implementations (in order)
1. `mockDashboardDataSource` (first)
   - Used for early UI development, local demos, and deterministic flows.
   - Must implement the same `DashboardDataSource` interface as production.
2. `apiDashboardDataSource` (later)
   - Calls real `/api/v1` endpoints.
   - Added once backend routes and contracts are stable.

### Runtime toggle
- Select implementation through an environment toggle such as `NEXT_PUBLIC_USE_MOCKS`.
- Toggle handling belongs to app composition/bootstrap code, not inside UI components.

### UI/business-logic rule
- UI components (especially in `packages/ui`) must not contain business logic.
- UI should receive prepared data and callbacks via props; data-source decisions and transformations stay in app/core layers.

### Acceptance criterion
- Switching between `mockDashboardDataSource` and `apiDashboardDataSource` requires no dashboard component refactor.

## Phase 1 Digital Coach Architecture

The existing ingestion and analytics layers remain the history foundation. The coaching extension adds:

1. **Coach exchange:** app-generated `coaching-context.v1` flows to Codex/Second Brain; validated `coaching-plan-proposal.v1` returns only as a proposal.
2. **Core domain:** shared `CoachingProfile`, `GoalDraft`/`SettledGoal`, `WeeklyRoutine`, `PlanProposal`, versioned `TrainingPlan`, `PlannedSession`, `CalendarEditRequest`, `ContextSnapshotMetadata`, `ReminderPreferences`, and `DailyBrief` contracts and lifecycle rules.
3. **Persistence:** artifact/proposal decisions, settled goals, active/retired plan revisions, sessions, auditable calendar edits, reminder preferences, and atomic activation. Local SQLite is the Phase 1 profile.
4. **App composition:** import/review/approval, Today, Plan, Calendar, Settings, and Codex handoff. UI components cannot activate plans directly.

Data flow: `CSV/one-activity GPX -> Activity history -> coaching context -> Codex proposal -> validated proposal -> explicit atomic activation -> plan/calendar -> Today + reminder handoff`.

Approved prescriptions are not edited in place. Calendar amend/reschedule/skip/restore records the expected revision and a required reason, then preserves the prescription and ordered history. New activity may mark a proposal stale but cannot trigger Phase 1 automatic adaptation. The app owns Today/preferences; Codex owns external motivational wording/delivery, whose status is never inferred. See ADR 0002.

## Cloud Strava and Selected Second Brain Architecture

Phase 2 adds cloud implementations beside the accepted local adapters without weakening package boundaries:

1. `packages/core` owns strict cloud/auth/provider/sync contracts plus pure ports and use cases. It imports no Next.js, Prisma, S3, provider HTTP, or filesystem implementation.
2. `packages/db` implements Neon repositories and the local SQLite projection. Every cloud repository operation is athlete-scoped.
3. `apps/web` authenticates the actor, composes adapters, exposes additive `/api/v1` routes, and renders cloud-backed view models. Server-only secrets and raw payloads never enter client components.
4. Cloudflare R2 retains private raw provider bytes. Neon retains normalized truth, durable jobs, provenance/checksum metadata, revisions, and the cursor change feed.
5. The local agent pulls cloud changes transactionally and publishes only a strict `second-brain-context.v1` snapshot. Obsidian files, Markdown, paths, and arbitrary note metadata never cross the boundary.

Production cloud routes fail closed until owner authentication is configured. The one-athlete UI contains no athlete switcher, while the `User`/`Athlete`/`AthleteAccess` and owned-resource model avoids a later tenant re-architecture. See `docs/adr/0003-cloud-strava-second-brain-sync.md` and `docs/plans/CLOUD_STRAVA_SECOND_BRAIN_ARCHITECTURE.md` for the authoritative topology, contract allow-list, failure rules, and milestone gates.

Operational recovery follows the same boundaries: core evaluates usage and coordinates bounded reconciliation, DB adapters measure durable counters/sizes and claim athlete-scoped jobs, and the web layer authenticates either the owner status read or the independent scheduler secret. The scheduler accelerates recovery but is never the queue of record. At a hard stop, core schedules no work and preserves accepted raw/canonical/sync records. Feature rollback disables new cloud/provider processing without destructive schema or data rollback.

Cloud coaching commands outside the local authoring workflow are limited to approved-plan selection, owner-authored future-session amendments, and owner-recorded past-session skips. Plan selection moves the active designation between already-approved projections through a serializable, optimistic transaction. A future-session amendment or past-session skip writes the effective overlay and append-only reasoned history in the same athlete-scoped serializable transaction while the approved plan JSON and prescribed session remain immutable. Past sessions cannot otherwise be amended, moved, or restored. Both commands emit ordered plan/calendar changes so the paired local projection converges.

Home's goal-first read model is additive. Proposal v1 remains unchanged; v2 may include up to twelve explicitly approved race milestones, included in proposal hashing, review comparison, and the approved plan version. The local paired-device publisher derives a separate immutable `TrainingPlanGoalContextProjection` only from a verifiable approved source proposal and its linked settled-goal snapshot. Neon binds the sidecar to the same athlete, plan version, approval hash, goal revision, and active paired device. Actor-scoped Home reads expose pending/unavailable states when the sidecar is absent or inconsistent. Sidecar publication neither selects nor activates a plan and stays separate from scheduled Second Brain publication. Home reads approved goal/milestone context, effective Today schedule, and latest activity independently; current-fitness estimates remain detail-only and do not produce a race-day progress verdict. See ADR 0008.

Calendar mutation routes require the signed-in owner session and an expected revision. PostgreSQL serialization/deadlock failures (`P2034`), competing unique writes, and stale revisions are translated to the same `409 CONFLICT` reload-and-review outcome. The server intentionally does not retry a human-authored edit against unseen values. Calendar and Today read the effective projection, with original prescription and amendment history retained for later AI review. Proposal generation, approval, and automatic adaptation remain outside these commands. See `docs/adr/0004-approved-plan-selection.md` and `docs/adr/0005-reasoned-future-session-amendments.md`.


## Configurable online coach provider (25 October 2026)

Online activity feedback uses an athlete-scoped, revisioned provider/model selection. Core owns the strict contracts; DB owns the configuration row and request snapshot/provenance; web owns authenticated settings/catalog routes and server-only provider adapters. OpenAI Responses remains supported; OpenRouter uses Chat Completions with strict JSON Schema and required provider parameters. A request captures provider, requested model, and configuration revision at claim time. Cloud-owned requests cannot be claimed or published by paired-device workers. Regeneration bypasses evidence reuse and keeps the prior published review visible until replacement succeeds. Keys remain in server environment variables. See [ADR 0010](adr/0010-configurable-online-coach-provider.md).
