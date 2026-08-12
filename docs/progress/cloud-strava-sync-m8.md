# Milestone 8 Progress — Provisioning and Production Smoke

**Date:** 2026-08-12
**Status:** In progress — final live webhook and selected-context checks
**Product decision:** Owner-authenticated Strava history import is live; full M8 sign-off remains withheld

## Completed

- Verified the existing `racepedictor` Vercel project on the free Hobby plan and its `racepedictor.vercel.app` production address.
- Provisioned `racepredictor-production` through the Vercel Neon integration on the Neon Free plan in Frankfurt.
- Connected the Neon resource to Vercel Production and Preview; Preview database branching is enabled.
- Registered a GitHub OAuth application with the production homepage and Auth.js callback URL.
- Added the generated Auth.js session secret and the non-secret owner/athlete bindings to Vercel Production and Preview without exposing their values in logs, chat, or source control.
- Implemented fail-closed owner-only GitHub authentication, persisted identity-to-athlete access lookup, explicit owner provisioning, a responsive login page, and protected dashboard redirects.
- Kept `DIRECT_URL` out of the Vercel request runtime; it remains a protected migration-only credential.
- Applied all 10 forward migrations to the empty Neon production schema and verified 10 successful migration records, 24 public tables, and no prohibited columns.
- Provisioned one owner identity, one athlete, and one owner access grant idempotently in Neon.
- Configured cloud mode, owner auth, disabled provider/sync feature flags, and a protected scheduler secret for Vercel Production and Preview.
- Published commit `2d4f388`, fixed the first Vercel-only dependency-resolution failure, obtained a Ready preview, and promoted the corrected deployment to Current Production.
- Verified the live health response, owner-auth configuration, production release SHA, anonymous dashboard redirect, protected API denial, and production GitHub callback URL.
- Completed the real GitHub OAuth owner consent and verified the authenticated production dashboard and Neon-backed Settings experience.
- Provisioned the private Cloudflare R2 raw-object path and enabled Strava ingestion only after the connection and storage settings were present.
- Completed a real owner Strava OAuth connection with the requested activity-read permission.
- Ran the owner-only bounded 90-day history import. The durable job completed on its first processing attempt and imported workouts, including the prior-day workout, appeared in the authenticated online Activities view.
- Confirmed private raw-object metadata was created alongside the imported activity data; the online activity view exposes structured workout fields only, never raw object URLs or credentials.
- Corrected a production queue idempotency defect: PostgreSQL JSONB object-key ordering could falsely reject an otherwise identical backfill job. The queue now compares the schema-normalised request fields and has a database regression test.
- Observed the conservative 15-minute provider-request guardrail pause after the historical import. It preserved accepted data and resumed at the next natural Strava quarter-hour window.
- Implemented and verified proactive history-import pacing: every provider read reserves shared capacity before network I/O; planned pauses and recoverable failures retain a durable batch checkpoint; the worker yields after a provider-window pause rather than repeatedly reclaiming work. The safeguard is awaiting this release's production deployment and smoke check.

## Automated evidence

- Focused identity repository tests: 3/3 pass.
- Focused owner-auth tests: 5/5 pass.
- Full web tests: 73/73 pass.
- Owner-auth Playwright journeys: 3/3 pass, including mobile width and fail-closed protected routes.
- Full cloud gate, lint/types, and production Next.js build pass.
- Dependency audit reports no known vulnerabilities.
- Exact app-level Vercel build, including fresh Prisma client generation, passes locally.
- Pacing regression: 82/82 core and 54/54 database tests pass, including no-token/no-list on a pre-call deferral, checkpoint resumption, retry checkpoint persistence, and one-job scheduler yield.
- Production deployment is Ready and Current at `https://racepedictor.vercel.app`.
- Live smoke: health 200; anonymous dashboard 307 to `/login`; anonymous dashboard API 401; GitHub provider/callback discovery 200.
- Authenticated owner smoke: production dashboard loads; tenant-scoped status is empty rather than cross-athlete; Settings reports no paired device and keeps disabled Strava processing fail-closed.

The first integrated rerun found that an active Next.js development process could leave partially written `.next/dev` type artifacts, causing later type checks or builds to fail before application validation. The release workflow now uses Next.js's supported custom production TypeScript configuration, excludes the live development cache, and retains strict type checking. Lint and the production build pass with the malformed disposable cache deliberately left in place, proving the remediation rather than masking it by deleting the cache.

## Owner handoff required

1. Perform one live Strava webhook delivery from a newly completed activity and confirm it is accepted once, stored privately, normalised, and visible online without using the manual import action.
2. Install and run the already-paired local sync agent on `Home computer`; it must first pull the cloud cursor successfully.
3. Publish an owner-selected `second-brain-context.v1` input and verify the exact section names/freshness online. The agent must never scan or upload the vault.
4. Deploy and smoke-test the completed history-import pacing hardening before encouraging repeated large import attempts. No quota change or paid plan is authorised.

## Product Owner gate

**Needs Review.** The free-tier production foundation, database, deployment, access controls, private raw write path, real owner login, and bounded history-import path now pass. The milestone cannot pass until the paced release is smoke-tested and automatic-webhook and local selected-field journeys have objective production evidence.
