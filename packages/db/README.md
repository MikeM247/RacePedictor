# @racepredictor/db

Persistence, ingestion, and analytics package. PostgreSQL/Prisma remains the deployment target; a private SQLite execution profile supports the single-user local Garmin and Obsidian workflow without requiring a database service.

The online V2 Coach adds an athlete-scoped Neon conversation repository and additive migration `20261022120000_v2_coach_conversations`. Coach messages and bounded turn snapshots are intentionally excluded from local device sync and Second Brain publication. Test it through the explicit `db:test:cloud` command before rollout. For Preview / Git branch `work`, the application uses the validated `RACEPREDICTOR_V2_DATABASE_URL` and `RACEPREDICTOR_V2_DATABASE_URL_UNPOOLED` overrides; Prisma CLI still requires those values explicitly mapped to its standard variables before running migration status/deploy. See [the V2 Coach implementation plan](../../docs/plans/V2_FIRST_ITERATION_ARCHITECTURE_IMPLEMENTATION_PLAN.md).

## Required environment

- Copy `.env.example` to `.env` for local Prisma commands.
- `DATABASE_URL` is the pooled/runtime PostgreSQL connection string.
- `DATABASE_URL_UNPOOLED` is the direct PostgreSQL connection string used by migrations. A
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
