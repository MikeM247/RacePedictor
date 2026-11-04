# Local PostgreSQL for voice tests

Configure `COACH_VOICE_TEST_DATABASE_URL` in `packages/db/.env.test.local`.
This file is ignored by Git. The dedicated voice-test command loads it automatically;
the application does not use it for its normal database connection.

From the repository root, with Node 22.13+ and Docker Compose available:

```bash
npm run db:test:voice:setup
npm run db:test:voice
```

Setup creates the local environment file from
`packages/db/.env.test.local.example` if it is missing, starts PostgreSQL 17 on
`127.0.0.1:55432`, applies the repository migrations to `racepredictor_voice_test`,
and generates the Prisma client. It explicitly overrides both Prisma database
variables for those commands and refuses a setup URL outside that local test
database. Existing application database settings are not changed.

The test command runs `coach-voice-repository.test.js`, including its real
PostgreSQL concurrent-admission test instead of skipping it. It makes no speech
provider calls. The full UI/API/provider-mock integration journey runs separately
as part of `npm run verify:staging`.

To stop and remove the disposable test database:

```bash
docker compose -f packages/db/compose.voice-test.yml down
```

Its data lives in temporary container storage. After a container restart or a
new cloud execution environment, rerun setup before testing. The checked-in setup
files remain reusable; the database itself is not a shared or production service.

For a complete check with deployment credentials removed and database connections
pinned to this local database, run:

```bash
npm run verify:staging -- --unit-only
```

Omit `--unit-only` to include the browser suites. See
[the staging verification guide](ORBIT_STAGING_VERIFICATION.md).
