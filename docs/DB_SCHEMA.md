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
