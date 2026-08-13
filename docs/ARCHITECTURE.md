# ARCHITECTURE

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

Cloud coaching commands outside the local authoring workflow are limited to approved-plan selection and owner-authored future-session amendments. Plan selection moves the active designation between already-approved projections through a serializable, optimistic transaction. A future-session amendment writes the effective overlay and append-only reasoned history in the same athlete-scoped serializable transaction while the approved plan JSON and prescribed session remain immutable. Both commands emit ordered plan/calendar changes so the paired local projection converges.

Calendar mutation routes require the signed-in owner session and an expected revision. PostgreSQL serialization/deadlock failures (`P2034`), competing unique writes, and stale revisions are translated to the same `409 CONFLICT` reload-and-review outcome. The server intentionally does not retry a human-authored edit against unseen values. Calendar and Today read the effective projection, with original prescription and amendment history retained for later AI review. Proposal generation, approval, and automatic adaptation remain outside these commands. See `docs/adr/0004-approved-plan-selection.md` and `docs/adr/0005-reasoned-future-session-amendments.md`.
