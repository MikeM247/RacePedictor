# Automated Obsidian Second Brain Sync — Product Acceptance

**Date:** 2026-08-28  
**Decision:** Accepted for production verification; not final production acceptance.

| Product acceptance criterion | Evidence | Result |
| --- | --- | --- |
| Only a deliberately configured local source is read and published | `obsidian-selected-context` tests prove the fixed `RacePredictor/second-brain-context.v1.json` source and reject malformed or path-bearing input | Pass |
| The API receives only selected strict structured fields | Core contract and local-sync tests reject unknown/free-text fields and prove logical references stay local | Pass |
| An offline or interrupted publication is not lost or changed | SQLite outbox and exact-replay tests prove immutable retry and independent pull/publish failure handling | Pass |
| A later reversion becomes the effective newest context | Core, repository, schema, and PGlite migration tests prove A → B → A is accepted while an immediate no-op is rejected | Pass |
| Cloud activities, active plan, and effective calendar reach the Second Brain without taking ownership from RacePredictor | Typed local projection tests render cloud-owned output and preserve user-authored note bytes outside the managed span | Pass |
| Marker corruption cannot overwrite a personal note | Dedicated marker, duplicate/orphan, and injection tests fail closed | Pass |
| Scheduled use performs both pull and safe publication | Local task-runner regression proves `sync-and-publish` is used | Pass |
| Current application journeys remain usable | Core/cloud/local regressions, production build, and local/online/auth Playwright suites pass | Pass |

## Automated validation evidence

- Core contract tests: 87 passed.
- Cloud persistence/migration tests: 61 passed.
- Local sync/parser tests: 13 passed.
- Local analytics, activity, import, coaching, pipeline, and Obsidian publisher tests: all passed.
- Web unit tests and type check: passed.
- Production build: passed.
- Playwright: 18 local, 7 online, and 3 authentication tests passed.

## Conditions before final production acceptance

- Run the protected direct-connection migration against the intended Neon production database after a verified restore point.
- Configure and verify owner authentication, R2, Strava, and the selected-context feature flag in Vercel.
- Pair the real local computer, publish one selected context snapshot, pull one cloud plan/calendar update, and verify the managed Obsidian span.
- Complete the existing live Strava webhook and private raw-object checksum smoke checks.
- Resolve or formally accept the current high-severity Prisma tooling audit advisories before release.

The existing M8 programme remains the authority for final production sign-off.
