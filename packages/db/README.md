# @racepredictor/db

Persistence, ingestion, and analytics package. PostgreSQL/Prisma remains the deployment target; a private SQLite execution profile supports the single-user local Garmin and Obsidian workflow without requiring a database service.

## Required environment

- Copy `.env.example` to `.env` for local Prisma commands.
- `DATABASE_URL` is the pooled/runtime PostgreSQL connection string.
- `DIRECT_URL` is the direct PostgreSQL connection string used by migrations. A
  local database may use the same non-production URL for both values; Neon must
  use its separate pooled and direct URLs.

## Commands

- `npm run db:generate --workspace @racepredictor/db`
- `npm run db:migrate --workspace @racepredictor/db`
- `npm run db:migrate:deploy --workspace @racepredictor/db`
- `npm run db:reset --workspace @racepredictor/db`
- `npm run db:refresh:local -- --source "C:\path\to\Activities.csv"`
- `npm run db:test:local-pipeline --workspace @racepredictor/db`
- `npm run db:test:local-analytics --workspace @racepredictor/db`
- `npm run db:test:obsidian --workspace @racepredictor/db`

See [Local Garmin → Obsidian workflow](../../docs/LOCAL_GARMIN_SECOND_BRAIN.md) for paths, options, data handling, and rerun behavior.
