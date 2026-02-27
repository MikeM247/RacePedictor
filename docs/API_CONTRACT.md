# API_CONTRACT

## API Namespace
- Base path: `/api/v1`
- Content type: `application/json`
- Contract source of truth: Zod schemas in `packages/core`

## Versioning & Compatibility Policy (v1)
- Additive-only for existing endpoints and fields.
- Breaking request/response changes require a new namespace (`/api/v2`).

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

### Predictions / Insights
- `POST /api/v1/predictions`
  - Request: `{ athleteId, targetDistanceM, targetDate? }`
  - Response: `{ predictedTimeS, predictedPaceSecPerKm, bandLowS, bandHighS, modelVersion, drivers: DriverDTO[] }`

- `GET /api/v1/insights`
  - Query: `athleteId`, optional date range.
  - Response: `{ cards: InsightCardDTO[], generatedAt: string }`

### Dashboard
- `GET /api/v1/dashboard/overview`
  - Response includes:
    - prediction summary
    - latest weekly load snapshot
    - import/normalize progress summary

## DTO Guidance (mapped to models)
- `ActivitySummary`: key listing fields (`id`, `occurredAt`, `sport`, `distanceM`, `elapsedTimeS`, `avgPaceSecPerKm`, `elevationGainM`, availability flags).
- `ActivityDetail`: full activity record + splits + route signature (if present).
- `WeeklyFeatureDTO`: fields from `WeeklyFeature` with explainable load scores and completeness.
- `RouteSignatureDTO`: compact geometry metadata, optional polyline, route hash.

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
