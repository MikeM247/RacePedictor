# DB_SCHEMA

## Overview
The MVP schema is anchored on four primary Prisma models provided for implementation planning:
- `Activity`
- `ActivitySplitKm`
- `WeeklyFeature`
- `RouteSignature`

This keeps ingestion/output explainable while protecting Neon free-tier limits (no row-per-trackpoint storage in MVP).

## Canonical MVP Models

### `Activity`
Purpose: normalized activity record and top-level prediction inputs.

Required fields:
- Identity/source: `id`, `athleteId`, `sourceType`, `sourceFileId?`, `sourceActivityId?`
- Time: `occurredAt`, `endedAt`, `elapsedTimeS`, `movingTimeS?`
- Sport/performance: `sport`, `distanceM`, `avgPaceSecPerKm`, `best1kSec?`, `best5kSec?`
- Elevation: `elevationGainM`, `elevationLossM`, `minElevationM?`, `maxElevationM?`
- Heart rate: `avgHrBpm?`, `maxHrBpm?`, `minHrBpm?`, `hrAvailable`
- Cadence: `avgCadenceSpm?`, `maxCadenceSpm?`, `cadenceAvailable`
- Quality signals: `paceVariability?`, `hrDriftPct?`, `hillDifficulty?`
- Dedupe/meta: `dedupeHash`, `createdAt`
- Relations: `splits ActivitySplitKm[]`, `routeSignature RouteSignature?`

Indexes/constraints:
- `@@index([athleteId, occurredAt(sort: Desc)])`
- `@@index([athleteId, sport, occurredAt(sort: Desc)])`
- `@@unique([athleteId, dedupeHash])`

### `ActivitySplitKm`
Purpose: per-km splits to support explainable pacing and workload features.

Required fields:
- Identity: `id`, `activityId`, `athleteId`, `splitIndex`
- Time: `startOffsetS`, `endOffsetS`, `durationS`
- Distance/pace: `distanceM`, `paceSecPerKm`
- Terrain/effort: `elevGainM`, `elevLossM`, `avgHrBpm?`, `maxHrBpm?`, `avgCadenceSpm?`
- Meta: `createdAt`

Relation:
- `activity Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)`

Indexes:
- `@@index([activityId, splitIndex])`
- `@@index([athleteId, createdAt])`

### `WeeklyFeature`
Purpose: weekly-first feature store for prediction and dashboard trends.

Required fields:
- Identity/time window: `id`, `athleteId`, `weekStartDate`, `weekEndDate`
- Volume/load: `runCount`, `totalDistanceM`, `totalElapsedTimeS`, `totalElevationGainM`
- Long run: `longRunDistanceM`, `longestRunId?`
- Intensity mix: `easyDistanceM`, `moderateDistanceM`, `hardDistanceM`
- Aggregates: `avgPaceSecPerKm?`, `avgHrBpm?`
- Explainable load proxies: `strainScore?`, `monotonyScore?`, `consistencyScore?`
- Quality: `dataCompleteness`
- Meta: `createdAt`

Indexes/constraints:
- `@@unique([athleteId, weekStartDate])`
- `@@index([athleteId, weekStartDate(sort: Desc)])`

### `RouteSignature`
Purpose: optional compact route representation without vector search dependency.

Required fields:
- Identity: `id`, `activityId` (unique), `athleteId`
- Geometry summary: `startLat`, `startLon`, `endLat`, `endLon`, `bboxMinLat`, `bboxMinLon`, `bboxMaxLat`, `bboxMaxLon`
- Compact route data: `polyline?`, `elevProfile?`
- Dedupe/similarity: `routeHash`
- Meta: `createdAt`

Relation:
- `activity Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)`

Indexes:
- `@@index([athleteId, routeHash])`

## Staging + Import Metadata (supporting tables)
The model set above remains canonical for normalized data. Keep lightweight ingestion metadata tables to preserve idempotency:
- `imports` (status/progress/cursor)
- `raw_files` (filename/checksum/parser summary only; no full payload storage by default)
- `staging_activities` (parse outputs before normalization)

## Dedupe Strategy
1. Use `sourceActivityId` when available from provider/file.
2. Always compute `dedupeHash` from canonical signature for fallback + idempotency.
3. Enforce uniqueness at normalized layer via `@@unique([athleteId, dedupeHash])`.

Canonical `dedupeHash` input guidance:
- rounded start time
- duration
- distance
- elevation gain
- sparse route sample hash (when available)

## Free-tier Safety Rules
- Trackpoints table is not part of MVP.
- `RouteSignature.polyline` stores downsampled/encoded geometry only.
- `raw_files` stores metadata/checksums, not large raw payload blobs.
- GPX/TCX MVP flow assumes single file => single activity.
- CSV bulk normalization is batched via cursor.

## Migration Rules
- Any change to these canonical models must be reflected in:
  - `docs/API_CONTRACT.md`
  - `docs/CONTEXT.md` (if behavior/scope changes)
  - `docs/ROADMAP.md` (if milestone sequencing changes)

## Phase 1 Coaching Extension

`Activity` remains the canonical history source. Persist the shared coaching concepts with these invariants:

- `CoachingArtifact` / `ContextSnapshotMetadata`: artifact ID/type/direction, schema version, content hash, configured path label, history fingerprint, status, and timestamps; unique identity/hash makes publication/import idempotent.
- `PlanProposal`: athlete/artifact IDs, revision, status (`proposed`, `withdrawn`), structured `GoalDraft`, `WeeklyRoutine`, sessions, assumptions, and freshness/acknowledgement. An activation/source relation records the decision and uniquely prevents a second activation.
- `SettledGoal`: immutable approved goal snapshot linked to its source proposal/history fingerprint.
- `TrainingPlan`: version/revision, approved status (`active`, `retired`), settled goal, date range/timezone, rationale, source proposal, and approval time. Draft state lives in `PlanProposal`; one active plan per athlete and replacement retires the prior plan atomically with goal promotion.
- `PlannedSession`: immutable prescription linked to the plan, sequence/key, prescribed local date, type (`run|strength|cross_train|rest`), title, intent, target, duration, and structured prescription.
- Calendar edit/audit rows: amend/reschedule/skip/restore request, expected/result revision, changed fields, before/after values, actor, required reason, and time; effective state derives from prescription plus ordered edits.
- `ReminderPreferences`: one row per athlete; daily enabled, 06:30, `Africa/Johannesburg` default, and explicit external status (`not_configured`, `prepared`, `scheduled`, `attention`, `disabled`). A generated handoff sets `prepared`; only explicit user confirmation may set `scheduled`.

Proposal activation is atomic and concurrency-checked; settled goals and activated prescriptions are not changed in place. New activities may stale a proposal fingerprint but never mutate a plan automatically in Phase 1.

## Cloud Strava and Sync Extension (Approved; implementation tracked by milestone)

Neon remains the structured authority. Add these athlete-scoped concepts without replacing the canonical activity, feature, or coaching models:

- `User`, `Athlete`, `AthleteAccess`: one owner/athlete seed path now, future access boundary later.
- `ProviderConnection`: provider state plus encrypted credential envelope; unique by athlete/provider.
- `ProviderWebhookEvent`, `IngestionJob`: durable receipt, idempotency, attempts, next-attempt/terminal state, and non-secret diagnostic code.
- `RawObject`: R2 object key, provider, checksum, content type, byte size, capture time, and processing state; never the raw body.
- `ActivitySourceReference`, `ActivityRevision`: provider/file provenance, provider identifier uniqueness, updates, and tombstones without collapsing canonical history.
- `SyncChange`: append-only athlete-scoped sequence/cursor for local projections.
- `PairedDevice`: athlete-scoped hashed/revocable device credential and sync state.
- `SecondBrainSnapshot`: immutable strict versioned allowed payload, revision, hash, timestamps, and athlete scope.
- `TrainingPlanProjection`: strict already-approved plan JSON used by online Plan/Calendar/Today; publication is device-fenced and appends plan/session `SyncChange` rows.
- `CalendarSessionProjection`: one athlete/plan/session row containing immutable prescribed JSON, current effective JSON/status, and an optimistic positive revision. The composite identity is unique and belongs to the corresponding athlete-scoped `TrainingPlanProjection`.
- `CalendarSessionAmendment`: append-only amend/reschedule/skip/restore history with changed fields, before/after snapshots, signed-in user identity, required 1-500 character reason, request time, request hash, and athlete-scoped idempotency key. Session revision and idempotency uniqueness prevent two competing writes from being recorded as the same next state.
- `OperationalUsageBucket`: durable metric/window counter for provider requests, invocation count, and measured transfer. Raw-storage and database-size signals are read from authoritative aggregate/database values; no athlete payload or secret is stored in usage buckets.

The local SQLite schema adds `local_sync_state`, `cloud_sync_entities`, `cloud_activity_mappings`, and `local_second_brain_publications`. They hold a replayable structured projection, its cursor/failure state, cloud-to-local activity identity, and local-only logical source references. Obsidian paths and device credentials are not stored in these tables.

Every owned uniqueness/index rule includes athlete scope where the identifier is not globally safe. Provider activity identity is unique by athlete/provider/provider activity ID; snapshot revision and content hash are idempotency boundaries; sync sequence is monotonic per athlete. Raw bytes live privately in R2. Database migrations are explicit release operations and are not run automatically at application startup.

Future-session projection updates and amendment-history inserts share one serializable transaction. A stale revision updates no row; Prisma `P2034` serialization/deadlock conflicts and competing unique writes are surfaced as an application revision conflict. They are not automatically retried because the owner must reload and review the effective values before deciding whether the stated reason still applies.

Operational buckets are unique by `(metric, windowStart)` and indexed by `(metric, windowEnd)`. The application uses UTC daily and 15-minute windows. They are operational aggregates rather than athlete-owned domain records and cannot contain provider identifiers, activity data, raw keys, credentials, or error messages.
