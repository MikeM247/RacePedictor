# Product Data Requirements

## Purpose
This document defines the data required to support the RacePredictor final product goals, with an implementation-first focus for database structure and initial population.

It is intended to answer:
- What data entities are required?
- Which fields are mandatory vs optional?
- How entities relate to each other?
- What minimum seed data is needed to unlock end-to-end product behavior?

## Scope Baseline
This data definition aligns with the current v1 product direction:
- Desktop-first analytics dashboard.
- `/api/v1` additive contract model.
- Single local athlete runtime in MVP.
- Weekly-first feature aggregation.
- Deterministic ingestion and dedupe.

## Data Domains Required

### 1) Athlete Context
Even in single-athlete runtime, all records should remain keyed by `athleteId` to preserve forward compatibility.

Required:
- `athleteId` (string, stable identifier)

Recommended for future-safe setup:
- `displayName`
- `timezone`
- `preferredUnits` (metric/imperial)

Notes:
- MVP can use one seeded athlete (`athlete_001`), but keep schema multi-athlete compatible.

### 2) Import and Staging Domain
Required to support upload, parse, normalize, dedupe, and retry workflows.

Core tables:
- `imports`
- `raw_files`
- `staging_activities`

Required data points:
- Import lifecycle: `importId`, `status`, created/updated timestamps, optional normalize cursor.
- Source metadata: filename, checksum/hash, source type, parse warnings summary.
- Staging rows: parsed activity payload needed for deterministic normalize pass.

Why required:
- Supports Data Quality page counters.
- Enables idempotent retries and traceability between upload and normalized domain data.

### 3) Normalized Activity Domain
Primary canonical table: `Activity`.

Required fields:
- Identity/source: `id`, `athleteId`, `sourceType`, optional `sourceFileId`, optional `sourceActivityId`
- Timing: `occurredAt`, `endedAt`, `elapsedTimeS`
- Core performance: `sport`, `distanceM`, `avgPaceSecPerKm`
- Elevation: `elevationGainM`, `elevationLossM`
- Dedupe/meta: `dedupeHash`, `createdAt`

Optional but strongly recommended:
- `movingTimeS`
- HR and cadence fields plus availability flags
- quality signals (`paceVariability`, `hrDriftPct`, `hillDifficulty`)
- best effort fields (`best1kSec`, `best5kSec`)

Why required:
- Powers activity listing/detail, overview metrics, and prediction inputs.

### 4) Split Domain
Canonical table: `ActivitySplitKm`.

Required fields:
- `id`, `activityId`, `athleteId`, `splitIndex`
- `startOffsetS`, `endOffsetS`, `durationS`
- `distanceM`, `paceSecPerKm`
- `elevGainM`, `elevLossM`
- `createdAt`

Optional:
- `avgHrBpm`, `maxHrBpm`, `avgCadenceSpm`

Why required:
- Supports detailed pacing analysis in activity detail workflows.

### 5) Weekly Feature Domain
Canonical table: `WeeklyFeature`.

Required fields:
- Window identity: `id`, `athleteId`, `weekStartDate`, `weekEndDate`
- Volume: `runCount`, `totalDistanceM`, `totalElapsedTimeS`, `totalElevationGainM`
- Long run: `longRunDistanceM`, optional `longestRunId`
- Intensity: `easyDistanceM`, `moderateDistanceM`, `hardDistanceM`
- Quality/completeness: `dataCompleteness`
- `createdAt`

Optional but important for analysis quality:
- `avgPaceSecPerKm`, `avgHrBpm`
- explainable load proxies (`strainScore`, `monotonyScore`, `consistencyScore`)

Why required:
- Drives weekly trends, comparison, and prediction context.

### 6) Route Signature Domain (Optional but Product-Relevant)
Canonical table: `RouteSignature`.

Required fields when present:
- `id`, `activityId` (unique), `athleteId`
- start/end coordinates
- bounding box coordinates
- `routeHash`
- `createdAt`

Optional:
- `polyline`, `elevProfile`

Why required:
- Enables route-aware detail without high-cost trackpoint storage.

### 7) Prediction and Insight Output Domain
Prediction and insight data may be computed at request time or persisted as snapshots.

Required output data shape:
- Prediction summary: `predictedTimeS`, `predictedPaceSecPerKm`, `bandLowS`, `bandHighS`, `modelVersion`, `generatedAt`
- Driver contributions: `key`, `label`, `contributionPct`, `direction`, `confidence`
- Insight cards: id/type/title/body/severity/timestamps (shape can stay additive)

Recommendation:
- Start with compute-on-read from normalized + weekly data.
- Add persisted snapshots later only if performance requires it.

## Required Relationships
- `ActivitySplitKm.activityId -> Activity.id` (cascade delete)
- `RouteSignature.activityId -> Activity.id` (cascade delete, unique)
- `WeeklyFeature.longestRunId -> Activity.id` (nullable FK recommended)
- All domain tables keyed by `athleteId` for query partitioning

## Required Constraints and Indexes

### Activity
- Unique dedupe: `UNIQUE (athleteId, dedupeHash)`
- Query indexes:
  - `(athleteId, occurredAt DESC)`
  - `(athleteId, sport, occurredAt DESC)`

### ActivitySplitKm
- `(activityId, splitIndex)`
- `(athleteId, createdAt)`

### WeeklyFeature
- `UNIQUE (athleteId, weekStartDate)`
- `(athleteId, weekStartDate DESC)`

### RouteSignature
- `UNIQUE (activityId)`
- `(athleteId, routeHash)`

## Minimum Seed Dataset for Initial Population
To validate end-to-end product behavior early, seed at least:

1. Athlete
- 1 athlete record (`athlete_001`)

2. Imports + staging
- 1 completed import and 1 in-progress import
- 20-50 staging activity rows including:
  - at least 1 duplicate candidate
  - at least 1 rejected row

3. Activities
- 12+ weeks of normalized activity records (recommended 30-60 activities)
- Mixed distances and intensity to support trend and prediction behavior

4. Splits
- Splits for at least 60% of activities
- Consistent split indexing and distance coverage

5. Weekly features
- 12 consecutive weekly aggregates derived from seeded activities
- Include varied completeness values

6. Route signatures
- Route signatures for a subset of activities (20-40%)

7. Prediction/insight response fixtures
- At least one realistic overview payload for UI and API contract tests

## Population Order (Recommended)
1. Seed athlete context.
2. Insert import metadata and raw file metadata.
3. Insert staging rows.
4. Run normalize logic to create `Activity`.
5. Generate and insert `ActivitySplitKm`.
6. Aggregate and insert `WeeklyFeature`.
7. Insert optional `RouteSignature`.
8. Validate dashboard/prediction output shapes against API contracts.

## Data Quality Rules Required for Population
- No duplicate normalized activities for same `(athleteId, dedupeHash)`.
- Distances and durations must be non-negative.
- Time windows must be valid (`occurredAt <= endedAt` and weekly ranges ordered).
- Split offsets must be monotonic within each activity.
- Weekly feature totals should reconcile with underlying activities for same window.

## Definition of "Data Ready" for Database-First Start
The data layer is ready for application wiring when:
- Canonical tables and supporting ingestion tables exist.
- Required constraints and indexes are in place.
- Minimum seed dataset above is loaded.
- Example `/api/v1` response payloads can be constructed from stored data without placeholder-only values.

## Cross-References
- `docs/PRODUCT.md`
- `docs/CONTEXT.md`
- `docs/DB_SCHEMA.md`
- `docs/API_CONTRACT.md`
