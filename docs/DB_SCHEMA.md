# DB_SCHEMA

## Overview
The data model separates **staging ingestion** from **normalized domain storage** to ensure traceability, idempotency, and clean downstream querying.

## Schema Layers

### 1) Staging Layer
Purpose: preserve raw source payloads and ingestion metadata before normalization.

Suggested tables:
- `staging_activity`
  - `id` (pk)
  - `source` (text)
  - `source_activity_id` (text, nullable for weak sources)
  - `dedupe_hash` (text)
  - `payload_json` (jsonb)
  - `ingested_at` (timestamptz)
  - `ingest_batch_id` (uuid/text)
  - `parse_status` (enum/text)
  - `parse_error` (text, nullable)

### 2) Normalized Layer
Purpose: canonical relational model used by APIs and analytics.

Suggested tables:
- `activity`
  - `id` (pk)
  - `athlete_id` (fk)
  - `source`
  - `source_activity_id` (nullable)
  - `dedupe_hash`
  - `activity_type`
  - `started_at`
  - `duration_seconds`
  - `distance_meters`
  - `elevation_gain_meters`
  - `avg_heart_rate`
  - `max_heart_rate`
  - `created_at`
  - `updated_at`

- `activity_metric`
  - `activity_id` (fk)
  - `metric_name`
  - `metric_value`
  - `metric_unit`

- `athlete`
  - `id` (pk)
  - `external_ref`
  - `display_name`
  - `created_at`

## Dedupe Strategy
Primary strategy:
1. Attempt uniqueness via (`source`, `source_activity_id`) when `source_activity_id` exists.
2. Fallback uniqueness via (`source`, `dedupe_hash`) when source identifiers are missing or unreliable.

### `dedupe_hash` guidance
- Deterministic hash of selected stable fields, e.g.:
  - source
  - activity start timestamp (normalized)
  - duration
  - distance
  - athlete external reference
- Exclude volatile fields (sync timestamps, mutable annotations).

## Key Indexes

### Staging
- Unique partial index: (`source`, `source_activity_id`) where `source_activity_id` is not null.
- Unique index: (`source`, `dedupe_hash`).
- Index: `ingested_at` for batch windows.
- Index: `parse_status` for retry workflows.

### Normalized
- Unique partial index: (`source`, `source_activity_id`) where `source_activity_id` is not null.
- Unique index: (`source`, `dedupe_hash`).
- Index: (`athlete_id`, `started_at desc`) for timeline queries.
- Index: (`activity_type`, `started_at desc`) for filtered analytics.
- Optional BRIN index on `started_at` for large append-heavy datasets.

## Data Flow
1. Receive payload → write to `staging_activity`.
2. Validate/transform → compute `dedupe_hash`.
3. Upsert into normalized tables using dedupe rules.
4. Mark staging row parse status and linkage metadata.

## Migration Rules
- All schema changes via migrations in `packages/db`.
- Backfills are explicit and idempotent.
- Any index or dedupe change must be documented here and in release notes.
