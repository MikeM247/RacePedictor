# DB_SCHEMA

## Overview
The data model separates **staging ingestion** from **normalized domain storage** to ensure traceability, idempotency, and clean downstream querying.

## Schema Layers

### 1) Staging Layer
Purpose: preserve raw source payloads and ingestion metadata before normalization.

Suggested tables:
- `staging_activity`
  - `id` (pk)
  - `athlete_id` (fk/reference)
  - `source` (text)
  - `source_type` (text; normalized source/provider discriminator)
  - `source_activity_id` (text, nullable for weak sources)
  - `dedupe_hash` (text)
  - `payload_json` (jsonb)
  - `ingested_at` (timestamptz)
  - `ingest_batch_id` (uuid/text)
  - `parse_status` (enum/text)
  - `parse_error` (text, nullable)

Staging payload policy (v1/MVP):
- `payload_json` stores **minimal ingestion metadata only** by default:
  - source file checksum/hash
  - parser version used
  - parser/ingestion summaries (counts, warnings, bounds)
- Full raw payload/body storage is excluded from MVP default behavior.

### 2) Normalized Layer
Purpose: canonical relational model used by APIs and analytics.

Suggested tables:
- `activity`
  - `id` (pk)
  - `athlete_id` (fk)
  - `source`
  - `source_type`
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

- `activity_track` (optional, default OFF in MVP)
  - `activity_id` (pk/fk)
  - `track_encoding` (text, e.g. `encoded_polyline`)
  - `track_blob` (bytea/text; compressed per-activity geometry payload)
  - `point_count` (int)
  - `bounding_box` (jsonb, nullable)
  - `created_at`

- `training_features` (derived aggregates for modeling/training)
  - `id` (pk)
  - `athlete_id` (fk)
  - `period_type` (enum/text: `weekly` | `daily`; MVP default `weekly`)
  - `period_start` (date/timestamptz)
  - `period_end` (date/timestamptz)
  - `feature_payload` (jsonb or typed feature columns)
  - `computed_at` (timestamptz)

Feature aggregation policy (v1/MVP):
- Primary storage and read path uses `period_type = weekly`.
- `daily` period support is optional and deferred until required by downstream consumers.
- `period_start`/`period_end` define inclusive aggregation windows for reproducible feature recomputation.

Track storage policy:
- Row-per-point storage is **explicitly excluded from MVP**.
- Future route/track persistence should use a per-activity encoded/compressed blob format (encoded polyline + compression).

## Dedupe Strategy
Primary strategy:
1. Attempt uniqueness via (`athlete_id`, `source_type`, `source_activity_id`) when `source_activity_id` exists.
2. Fallback uniqueness via (`athlete_id`, `dedupe_hash`) when source identifiers are missing or unreliable.

### `dedupe_hash` guidance
- Deterministic hash of a canonical activity signature when source identifiers are absent/unreliable.
- Canonical signature inputs SHOULD include:
  - athlete identifier (`athlete_id` or stable external athlete ref)
  - rounded activity start time (e.g. nearest minute)
  - normalized duration (seconds)
  - normalized distance (meters)
  - normalized elevation gain (meters)
  - optional route fingerprint sample (e.g. sparse lat/lng sample hash) when track data exists
- Exclude volatile fields (sync timestamps, mutable annotations).

## Key Indexes

### Staging
- Unique partial index: (`athlete_id`, `source_type`, `source_activity_id`) where `source_activity_id` is not null.
- Unique index: (`athlete_id`, `dedupe_hash`).
- Index: `ingested_at` for batch windows.
- Index: `parse_status` for retry workflows.

### Normalized
- Unique partial index: (`athlete_id`, `source_type`, `source_activity_id`) where `source_activity_id` is not null.
- Unique index: (`athlete_id`, `dedupe_hash`).
- Index: (`athlete_id`, `started_at desc`) for timeline queries.
- Index: (`activity_type`, `started_at desc`) for filtered analytics.
- Optional BRIN index on `started_at` for large append-heavy datasets.
- Optional index on `activity_track(activity_id)` only when track storage is enabled.

## Data Flow
1. Receive payload → write to `staging_activity`.
2. Validate/transform → compute `dedupe_hash`.
3. Upsert into normalized tables using dedupe rules.
4. Mark staging row parse status and linkage metadata.

## Migration Rules
- All schema changes via migrations in `packages/db`.
- Backfills are explicit and idempotent.
- Any index or dedupe change must be documented here and in release notes.
