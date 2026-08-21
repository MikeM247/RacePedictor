# ADR 0001: Local SQLite execution profile

- Status: Accepted for the single-user local workflow
- Date: 2026-08-04

## Context

RacePredictor's deployment architecture uses PostgreSQL through Prisma. The current workstation has no configured `DATABASE_URL`, PostgreSQL service, or container runtime, while the requested Garmin-to-Obsidian process must run now against private personal data.

## Decision

Keep PostgreSQL/Prisma as the deployment target and add a private local SQLite execution profile inside `packages/db`. The local profile mirrors the existing ingestion boundaries (`imports`, `raw_files`, `staging_activities`, `activities`, and `weekly_features`), stores its files under the Git-ignored `.local` directory, and publishes a contract-shaped dashboard snapshot through the existing app data-source seam.

## Consequences

- The complete personal workflow runs without provisioning a cloud database or installing a machine-wide service.
- Garmin raw data, the SQLite database, and Obsidian outputs stay outside version control.
- The SQLite schema is deliberately local and is not a replacement migration path for the Prisma schema.
- Future server deployment should implement the same importer/analytics interfaces against the existing PostgreSQL models, then switch the app data source without changing dashboard components.
- Any new canonical field must be reviewed for parity between the local execution profile and the PostgreSQL model until the local profile is retired or consolidated.
