# API_CONTRACT

## API Namespace
- Base path: `/api/v1`
- Content type: `application/json`
- Contract source of truth: Zod schemas in `packages/core`
- Implemented schema modules:
  - `packages/core/src/contracts/dashboard.ts`
  - `packages/core/src/contracts/activity.ts`
  - `packages/core/src/contracts/weekly.ts`
  - `packages/core/src/contracts/imports.ts`
  - `packages/core/src/contracts/coaching.ts`

## Versioning & Compatibility Policy (v1)
- Additive-only for existing endpoints and fields.
- Allowed additive changes:
  - Add new endpoints under `/api/v1`.
  - Add new optional request fields.
  - Add new nullable/optional response fields.
  - Add new values to documented enums only when clients are expected to handle unknown values safely.
- Forbidden in-place changes:
  - Rename/remove endpoints.
  - Rename/remove existing request or response fields.
  - Tighten validation in a way that rejects previously valid requests.
  - Change semantic meaning or units of existing fields.
- Breaking request/response changes require a new namespace (`/api/v2`).
- Deprecations must be documented in this file and remain available for the full v1 window.

## Core Domain Alignment
This contract is aligned to Prisma-style domain models:
- `Activity`
- `ActivitySplitKm`
- `WeeklyFeature`
- `RouteSignature`

## Endpoint List (v1)

### Health
- `GET /api/v1/health`
  - Response: `{ ok: true, version: string, timestamp: string }`

### Imports
- `POST /api/v1/imports/upload`
  - Purpose: create import + parse file + write staging rows.
  - Request: multipart form with one bounded `file`; supported content is inferred and validated as CSV or GPX.
  - Response:
    - `{ data: { importId, status, sourceType, reused, stagedCount, normalizedCount, duplicateCount, rejectedCount, parseWarnings, coverage, totalNormalizedActivities, analyticsRefreshed } }`

- `POST /api/v1/imports/:id/normalize`
  - Purpose: cursor-batched normalization into `Activity` + related tables.
  - Request: `{ cursor?: string, batchSize?: number }`
  - Response:
    - `{ importId, normalizedCount, skippedCount, errorCount, nextCursor?: string, hasMore: boolean }`

### Activities
- `GET /api/v1/activities`
  - Query: date range, sport, pagination cursor.
  - Response: `{ items: ActivitySummary[], nextCursor?: string }`

- `GET /api/v1/activities/:activityId`
  - Response: `{ activity: ActivityDetail }`
  - `ActivityDetail` includes core `Activity` fields plus optional nested:
    - `splits: ActivitySplitKmDTO[]`
    - `routeSignature?: RouteSignatureDTO`

- `GET /api/v1/activities/:activityId/splits`
  - Response: `{ activityId: string, items: ActivitySplitKmDTO[] }`

- `GET /api/v1/activities/:activityId/coach-review`
  - Purpose: read the latest athlete-scoped asynchronous coach review for an activity.
  - Response: `{ data: { activityId, status, review, requestId, updatedAt, readRevision } }`.
  - `status`: `not_requested | queued | processing | ready | retry_wait | attention`.
  - `review` is nullable and contains measured activity facts, the matched plan/session when unambiguous, evidence labels, limitations, and bounded natural-language feedback.

- `POST /api/v1/activities/:activityId/coach-review`
  - Purpose: queue or re-queue one activity for the local AI review job.
  - Response: `{ data: { activityId, requestId, status, reused, updatedAt } }`.

- `GET /api/v1/coaching/activity-reviews/latest`
  - Query: optional `limit` capped at 40.
  - Response: `{ data: { items: ActivityCoachReviewSummary[] } }`.
  - The cloud read path reconciles eligible running activities created in the last 48 hours into the durable review queue; this reconciliation is bounded and idempotent.

Device-only review exchange:

- `GET /api/v1/sync/device/activity-reviews`
  - Purpose: claim bounded queued review requests for the paired local device.
  - Response: `{ data: { items: [{ requestId, activityId, leaseToken, status: "processing" }] } }`.

- `POST /api/v1/sync/device/activity-reviews/publish`
  - Purpose: publish one locally generated, schema-validated review while holding its device lease.
  - Request: review artifact plus `requestId`, `leaseToken`, and `expectedActivityRevision`.
  - The device route never accepts arbitrary athlete scope; the authenticated paired device supplies it.

### Features (weekly-first)
- `GET /api/v1/features/weekly`
  - Query: `athleteId?`, date range, pagination cursor.
  - Response: `{ items: WeeklyFeatureDTO[], nextCursor?: string }`

- `GET /api/v1/features/weekly/:athleteId`
  - Query: optional date range.
  - Response: `{ athleteId: string, items: WeeklyFeatureDTO[] }`

### Data Quality
- `GET /api/v1/data-quality/summary`
  - Purpose: page-level ingestion quality snapshot for Data Quality workflows.
  - Query: optional date range.
  - Response: `{ summary: DataQualitySummaryDTO, recentIssues: ValidationIssueDTO[] }`

### Settings
- `GET /api/v1/settings`
  - Purpose: fetch local dashboard preferences (single local athlete runtime).
  - Response: `{ settings: SettingsDTO }`

- `PUT /api/v1/settings`
  - Purpose: update persisted local dashboard preferences.
  - Request: `{ settings: SettingsUpdateDTO }`
  - Response: `{ settings: SettingsDTO, updatedAt: string }`

### Predictions / Insights
- `POST /api/v1/predictions`
  - Request: `{ athleteId, targetDistanceM, targetDate? }`
  - Response: `{ predictedTimeS, predictedPaceSecPerKm, bandLowS, bandHighS, modelVersion, drivers: DriverDTO[] }`

- `GET /api/v1/insights`
  - Query: `athleteId`, optional date range.
  - Response: `{ cards: InsightCardDTO[], generatedAt: string }`

### Dashboard
- `GET /api/v1/dashboard/overview`
  - Response contract (source of truth: `packages/core/src/contracts/dashboard.ts`):
    - `DashboardFetchResult` (discriminated by `fetchStatus`)
      - `success`: `{ fetchStatus, stale, data }`
      - `empty`: `{ fetchStatus, stale }`
      - `error`: `{ fetchStatus, stale, errorMessage }`
    - `DashboardOverviewData` includes:
      - `predictionSummary: PredictionSummary`
      - `driverContributions: DriverContribution[]`
      - `featureTrendPoints: FeatureTrendPoint[]`
      - `importProgress: ImportProgress`
    - `DashboardStaleMetadata` includes `isStale`, optional `staleReason`, optional `staleAtIso`
  - Compatibility note: these dashboard contract additions are additive-only within `/api/v1`.

## Page-state Envelope Contract (loading excluded)
To keep page-state behavior consistent with `PRODUCT.md`/`UI_UX_SPEC.md`, endpoints that back dashboard pages SHOULD return a discriminated fetch envelope when the page can be fully represented by one payload.

- `fetchStatus: "success"`
  - Contains `data` payload and optional stale metadata.
- `fetchStatus: "empty"`
  - Represents valid "no data for selected filters/time range" state.
- `fetchStatus: "error"`
  - Represents recoverable domain/service failures with user-displayable `errorMessage`.

`GET /api/v1/dashboard/overview` is the canonical v1 implementation of this pattern and is the reference for stale + empty + error semantics.

## DTO Guidance (mapped to models)
- `ActivitySummary`: key listing fields (`id`, `occurredAt`, `sport`, `distanceM`, `elapsedTimeS`, `avgPaceSecPerKm`, `elevationGainM`, availability flags).
- `ActivityDetail`: full activity record + splits + route signature (if present).
- `WeeklyFeatureDTO`: fields from `WeeklyFeature` with explainable load scores and completeness.
- `RouteSignatureDTO`: compact geometry metadata, optional polyline, route hash.
- `DataQualitySummaryDTO`: ingestion counters for `stagedCount`, `normalizedCount`, `duplicateCount`, `rejectedCount`, `errorCount`, and latest normalize cursor progress.
- `ValidationIssueDTO`: normalized quality issue shape (`code`, `message`, `severity`, optional `activityExternalId`, optional `occurredAt`).
- `SettingsDTO`: persisted local dashboard preferences (default date range, source visibility, timezone/display options).
- `SettingsUpdateDTO`: partial update shape for mutable settings keys.

## Validation and Error Contracts
- Request and response payloads must have Zod schemas.
- Standard error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": []
  }
}
```

Standard codes:
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

## Idempotency + Dedupe Contract Notes
- Normalize upserts must be idempotent.
- Primary dedupe key path: `sourceActivityId` when available.
- Fallback dedupe key path: `dedupeHash`.
- Retrying `normalize` with same cursor must not create duplicate `Activity` records.

## Phase 1 Coaching Contracts (Implemented; release revalidation pending)

- `GET|PUT /api/v1/coaching/profile` reads or updates the single-athlete coaching profile.
- `GET|PUT /api/v1/coaching/routine` reads or updates the interactive seven-day weekly routine.
- `GET /api/v1/coaching/context/current` returns the latest validated `coaching-context.v1` envelope as `{ context }`, or `null` before publication.
- `POST /api/v1/coaching/context/publish` saves profile/routine plus a draft planning goal, atomically publishes `coaching-context.v1`, and returns artifact ID/hash plus metadata. Publishing does not settle or activate the draft goal.
- `POST /api/v1/coaching/proposals/import` validates an explicitly selected `coaching-plan-proposal.v1` or `coaching-plan-proposal.v2`; duplicate imports are idempotent and return the existing proposal. V1 remains strict and has no milestones. V2 requires a `milestones` array (up to 12 race milestones), validates unique IDs/dates and dates no later than the main performance target, and includes milestones in `contentHash` and approval comparison.
- `GET /api/v1/coaching/proposals/latest` returns the latest proposal, including a withdrawn proposal, for recovery/inspection.
- `POST /api/v1/coaching/proposals/:proposalId/decision` accepts `{ decision: "approve" | "reject", expectedRevision, replacingPlanId?, acknowledgeStale? }`. Replacing an active plan requires its exact ID. Approval atomically settles the proposal goal, retires the prior plan, and activates the new immutable version; rejection/failure leaves the active goal and plan unchanged.
- `GET /api/v1/coaching/plans/active`, `GET /api/v1/coaching/plans/history`, and `GET /api/v1/coaching/plans/:planId` return the active plan, newest-first approved history, and one approved version respectively. Draft proposals are excluded from plan history.
- `POST /api/v1/coaching/plans/:planId/activate` accepts strict `{ expectedActivePlanId: string | null }` from a signed-in owner. It atomically retires the observed active approved plan and activates the selected approved version without editing its goal, sessions, prescriptions, approval metadata, or content hash. A stale observed ID returns `409 CONFLICT`; device credentials, drafts, foreign/missing plans, and inconsistent projections fail closed.
- `GET /api/v1/coaching/calendar?from&to` returns the effective session at the top level plus its immutable `original` prescription and ordered `amendments`; Today uses the same effective projection. `POST /api/v1/coaching/calendar/sessions/:sessionId/edits` remains the compatible mutation route and accepts `CalendarEditRequest` (`amend|reschedule|skip|restore`, `expectedRevision`, required trimmed `reason` of 1-500 characters, and operation-specific `changes`).
- `POST /api/v1/coaching/calendar/sessions/:sessionId/amendments` is the additive authenticated cloud mutation route, and `GET` on the same path returns the owner-scoped amendment history. POST requires a signed-in owner session plus an idempotency key. A stale `expectedRevision`, competing unique write, or PostgreSQL serializable write conflict returns `409 CONFLICT` with an instruction to reload and review the latest values; the server does not retry a human-authored change automatically.
- `GET /api/v1/coaching/today?date` returns the local approved goal/plan/session overview with `no-plan`, `rest`, `upcoming`, `skipped`, `missed`, or `stale` state. It does not infer completion from imported activities. Additive `todayScheduleKind` distinguishes `prescribed_session`, `prescribed_rest`, `unscheduled`, and `unavailable`; `nextWorkout` is the next effective future non-rest, non-skipped session or `null`. Older responses omitting the additive fields must be treated as unavailable by clients.
- `GET /api/v1/coaching/goal-context/active` returns `{ context }` with a strict goal-context state: `ready` includes the active plan-linked approved goal, milestone list, and projection metadata; `goal_only` includes a settled local goal with no active plan; `no_active_plan` means no cloud active plan and does not prove that a local goal is absent; `projection_pending` means the approved cloud plan exists but its paired-device sidecar has not arrived; `unavailable` means context could not be verified. Missing or mismatched fields never become inferred targets.
- `GET|PUT /api/v1/coaching/reminder-preferences` uses `ReminderPreferences`, default `{ enabled: true, localTime: "06:30", timezone: "Africa/Johannesburg" }`, and returns persisted `externalStatus`/`externalReference` separately.
- `POST /api/v1/coaching/reminder-handoffs` produces a versioned prepared-not-scheduled Codex handoff. `PUT /api/v1/coaching/reminder-handoffs/status` accepts `{ externalStatus: "scheduled" | "attention", externalReference }`; `scheduled` requires an explicit user-supplied reference and is never inferred from delivery.

Coaching request boundaries use shared Zod validation. Every request/response shape has a shared schema and contract-test coverage; handlers return standard `{ data }` success / `{ error: { code, message, details } }` failure envelopes. Phase 1 exposes no activity-to-session completion matcher or automatic review/adaptation endpoint.

## Cloud Strava and Second Brain Contracts (Approved; implementation tracked by milestone)

All new endpoints remain additive under `/api/v1`, require an authenticated actor and athlete authorization unless explicitly noted, and use the standard envelopes above.

- Health/session: non-sensitive health plus authenticated actor/session state.
- Provider lifecycle: Strava connect, callback, status, bounded backfill, and disconnect.
- Webhook/jobs: public Strava subscription validation/receipt with durable idempotent handoff; protected internal processing and reconciliation triggers.
- Operations: `GET /api/v1/operations/status` requires the owner session and returns only measured planning signals, warning/hard-stop thresholds, processing state, and supported owner action. `GET|POST /api/v1/internal/reconciliation` requires `Authorization: Bearer $CRON_SECRET`; GET is the daily Vercel Cron contract and POST is the bounded operator trigger.
- Cloud reads/status: existing activity/dashboard/coaching reads backed by cloud services plus independent provider-ingestion, activity, local-device, and Second Brain freshness.
- Owner local-device management: `GET|POST /api/v1/sync/devices` and `DELETE /api/v1/sync/devices/{deviceId}` use the browser owner session. Only enrolment returns the device token.
- Self-authenticated local sync: `GET /api/v1/sync/device/changes`, `POST /api/v1/sync/device/acknowledge`, `POST /api/v1/sync/device/failure`, and `POST /api/v1/sync/device/plans` require the independently revocable device bearer credential. `POST /api/v1/sync/device/plan-goal-context` publishes an immutable goal/milestone sidecar only when the already-published approved plan version, goal identity/revision, approval hash, and milestones match. Replays of identical content are idempotent; changed content for that plan conflicts. This operation does not activate or select a plan.
- Explicit local plan publication: `npm run sync:local -- publish-plan <approved-plan.json>` publishes the approved plan, then attempts its sidecar from a locally verifiable approval source. `npm run sync:local -- publish-plan-goal-context <approved-plan-id>` retries only the sidecar and supports verified historical backfill; it never publishes or activates the plan. Both commands require paired-device credentials. These commands are manual and separate from scheduled `sync-and-publish` Second Brain publication.
- Second Brain: `POST /api/v1/second-brain-context/snapshots` requires the device credential and publishes one immutable strict snapshot. Latest revision/time/age is exposed through the safe sync-status projection, not through vault data.

`second-brain-context.v1` is separate from `coaching-context.v1`. Its strict envelope is `schemaVersion`, `athleteId`, `revision`, `publishedAt`, `contentHash`, `selectedFields`, and `context`. The only optional context sections are `availability`, `trainingPreferences`, `constraints`, `wellbeingCheckIns`, and `activityReflections`; their exact closed fields and numeric/cardinality limits are defined in `docs/plans/CLOUD_STRAVA_SECOND_BRAIN_ARCHITECTURE.md`. Version 1 permits no arbitrary free text, goal or prescription, note/vault identity, path, attachment, secret, or raw provider data. `selectedFields` must exactly match the present sections, and the encoded request is limited to 64 KiB.

Cloud authorization errors add stable `UNAUTHENTICATED` and `FORBIDDEN` codes; provider and durable-work failures use non-secret `RATE_LIMITED`, `UNAVAILABLE`, and `CONFLICT` outcomes as applicable. Provider/device tokens and raw-object keys are never returned by status or dashboard contracts. A short-lived raw-object access result may be created only after current athlete authorization.

Scheduled reconciliation is bounded to 25 connected athletes and 25 claimed jobs per invocation. Each athlete receives one stable 48-hour reconciliation request with at most three pages and 90 activities. The handler records invocation usage before work; a hard-stop guardrail returns a successful paused result with no new work rather than deleting or bypassing durable state.
