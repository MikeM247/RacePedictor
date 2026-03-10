# API_CONTRACT

## API Namespace
- Base path: `/api/v1`
- Content type: `application/json`
- Contract source of truth: Zod schemas in `packages/core`

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
  - Request: multipart form with `file`, `sourceType`, optional `idempotencyKey`.
  - Response:
    - `{ importId, status, stagedCount, duplicateCount, rejectedCount, parseWarnings }`

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
