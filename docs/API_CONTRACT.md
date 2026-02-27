# API_CONTRACT

## API Namespace
- Base path: `/api/v1`
- Content type: `application/json`
- Contract source of truth: Zod schemas in `packages/core`

## Versioning & Compatibility Policy (v1)
- **Additive-only policy:**
  - Allowed: adding optional fields, adding new endpoints, adding new enum members with safe defaults.
  - Disallowed: removing/renaming fields, changing field types incompatibly, changing endpoint semantics unexpectedly.
- Breaking changes require a new major namespace (e.g., `/api/v2`).

## Endpoint List (v1)

### Health
- `GET /api/v1/health`
  - Purpose: service liveness/readiness check.
  - Response: `{ ok: true, version: string, timestamp: string }`

### Ingestion
- `POST /api/v1/activities:ingest`
  - Purpose: submit one or more source activities into staging.
  - Request: `{ source: string, activities: SourceActivityInput[] }`
  - Response: `{ accepted: number, duplicates: number, rejected: number }`

### Activities
- `GET /api/v1/activities`
  - Purpose: list normalized activities.
  - Query: pagination + optional filters (`date_from`, `date_to`, `athlete_id`, `source`).
  - Response: `{ items: ActivitySummary[], next_cursor?: string }`

- `GET /api/v1/activities/:activity_id`
  - Purpose: retrieve full normalized activity detail.
  - Response: `{ activity: ActivityDetail }`

### Dashboard
- `GET /api/v1/dashboard/overview`
  - Purpose: aggregate KPIs for desktop dashboard header/cards.
  - Query: optional date range.
  - Response: `{ totals: DashboardTotals, trends: DashboardTrendPoint[] }`

- `GET /api/v1/dashboard/performance`
  - Purpose: chart-ready performance series.
  - Query: `metric`, optional date range, optional grouping.
  - Response: `{ metric: string, series: PerformanceSeriesPoint[] }`

## Zod-Backed Contract Conventions
- Each endpoint has explicit `RequestSchema` and `ResponseSchema` in `packages/core`.
- Handlers parse incoming data via `safeParse` (or equivalent) before business logic.
- Outbound payloads are validated against response schemas in non-production and optionally sampled in production.
- Shared types are inferred from schemas (`z.infer`) to avoid drift.

## Error Envelope (Recommended)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": []
  }
}
```

- Standard error codes:
  - `VALIDATION_ERROR`
  - `NOT_FOUND`
  - `CONFLICT`
  - `RATE_LIMITED`
  - `INTERNAL_ERROR`

## Contract Change Checklist
- Update relevant Zod schemas in `packages/core`.
- Confirm additive-only compatibility for `/api/v1`.
- Document endpoint/field changes in this file.
- Add/update tests for request parsing and response shape.
