# ORBIT staging verification

Run from the repository root with Node 24, Docker Compose and Chromium installed:

```bash
npm run verify:staging
```

The runner sets up the disposable PostgreSQL database, runs voice tests, every
core/web/database test file, the normalization/seed/contract/migration gates,
TypeScript, the production build, and the local,
online, Coach, authentication and milestone browser suites. Deployment credentials
are removed from test child processes. Both database URLs are pinned to the
loopback test database. External speech calls use injected test providers; the
browser capture checks use synthetic AudioWorklet samples.

Logs and a JSON summary are written under `.local/staging-verification/<timestamp>/`.
For faster iteration after a failure, rerun named steps:

```bash
npm run verify:staging -- --only=web,typecheck,build,test-e2e-coach-online
```

`--unit-only` runs database setup, voice/core/database/web tests, TypeScript and
the build without browser suites. Playwright suites use dedicated fixture
configurations; online Coach and seeded milestone journeys are not run against
the default local fixture. Configuration-specific readiness tests run in their
matching suite.

## Staging deployment target

The existing Vercel project is `racepedictor`, with staging configured as Preview
on Git branch `work`. The staging origin is
`https://racepedictor-road-to-comrades.vercel.app`.

On 2026-11-03, Vercel metadata confirmed the branch-scoped isolated
`RACEPREDICTOR_V2_DATABASE_URL` and `RACEPREDICTOR_V2_DATABASE_URL_UNPOOLED` variables,
preview authentication settings and the existing Coach/provider variables.
Secret values were not decrypted. Local test URLs belong only to the test runner.

The root and web `vercel-build` commands now share the same implementation.
For Preview/work, that implementation uses the existing staging migration guard,
requires isolated TLS database endpoints and the staging authentication origin,
and requires ingestion and Second Brain publication to be disabled. It deploys
all migrations and checks the progressive session table and attempt columns
before building. These guards must remain intact.

Progressive dictation defaults to disabled when
`RACEPREDICTOR_COACH_PROGRESSIVE_DICTATION_ENABLED` is absent. Deploying the
additive metadata and compatible server is supported before enabling recording.
Keep live progressive recording disabled until the plan's provider pricing,
retention, timestamps and real-device checks are complete. There is no production
mock-provider switch; test providers are injected only in tests.

This verification prepares a staging candidate. It does not deploy code or apply
migrations to the remote staging or production database. After deploying Preview/
work, verify owner login, migration/build logs, ordinary chat and the disabled
progressive capability on the deployed URL before considering activation.

## Fixes verified in this iteration

- Corrected session API generation/sequence mapping into the real repository.
- Bound browser `fetch` correctly in the capture controller.
- Fenced cancelled microphone/session starts, stale results and expired-session resume.
- Included failed audio in queue accounting; scheduled temporary-audio expiry.
- Used half-open timestamp intervals to avoid duplicating words at exact boundaries.
- Prevented repeated review insertion and prevented retries from overwriting edited review text.
- Kept cancellation and insertion responsive while session closure is pending.
- Updated test fixtures for the current minimal Home, mobile navigation and shared 30,000-character message limit.
- Isolated web unit tests from inherited deployment authentication and cloud settings.

## Results — 3 November 2026

All automated verification steps passed. The full sequential run is recorded in
`.local/staging-verification/2026-11-03T04-00-09-869Z/summary.json`.
The additional database script run is recorded in
`.local/staging-verification/2026-11-03T04-01-54-599Z/summary.json`.
A final run after restoring the local container and cleaning generated files also
passed every database script, unit suite, TypeScript and the production build:
`.local/staging-verification/2026-11-03T16-05-03-008Z/summary.json`.
These ignored local directories contain the individual command logs as well.

| Check | Result |
| --- | --- |
| Disposable PostgreSQL setup | All 25 migrations apply |
| Dedicated voice repository checks | 8 passed, including real PostgreSQL concurrency |
| Core tests | 147 passed |
| All database test files | 165 passed |
| Web tests | 236 passed, including real handler/repository integration |
| Normalization, seed, contract readiness, migration/integrity gate | All four scripts passed |
| TypeScript and production build | Passed |
| Local browser suites | 34 default, 9 Home and 10 Readiness passed |
| Online browser suite | 71 passed |
| Coach browser suite | 27 passed |
| Authentication browser suite | 5 passed |
| Milestone browser suites | 16 local, 1 online and 7 Home passed |
| Real HTTP/PostgreSQL dictation and chat journey | 1 passed |

There are 181 passing browser tests and three intentional mode-specific skips:
two API-only Readiness cases in local mode, and one local-endpoint case in online
mode. Their counterparts run in the appropriate suite. No failed tests remain.

The combined integration journey uses real UI, authorization, routes, repositories
and PostgreSQL. Only microphone samples and the external OpenAI transcription/chat
responses are synthetic. It verifies explicit review insertion, no coaching turn
before Send, no uninserted transcript in session storage, a complete 30,000-character
Unicode reflection reaching the provider, durable persistence, duplicate-send
recovery, reload and saved-chat history. Accelerated controller and browser tests
exercise the 900-second capture limit; they do not replace real-time recordings.

The extra database checks exposed seed/import fixtures that did not create their
required athlete. Those fixtures now work with the current foreign keys. The
migration lifecycle gate also pins the direct connection to its disposable schema.
Browser checks exposed and fixed review-text encoding and Settings retry-button
contrast, plus stale Home fixtures, a date-dependent future-race fixture and
navigation races. The full HTTP integration uses `localhost` consistently with
Next's normalized local request URL, preserving the same-origin guard.

This workspace is an automated-verified staging candidate with progressive
dictation disabled by default. No deployment or remote migration was performed.
Post-deployment owner login and migration smoke checks, explicit rollback evidence,
manual screen-reader testing, real-device recordings and live-provider activation
checks remain open in the implementation tracker.

