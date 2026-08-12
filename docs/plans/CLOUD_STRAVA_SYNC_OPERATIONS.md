# Cloud Strava Sync Operations Plan

## DevOps Summary

- **Objective:** operate the athlete-scoped cloud foundation and implemented Strava ingestion safely while the online dashboard, local Second Brain sync, recovery automation, and real identity provider are introduced in later milestones.
- **Target environment:** local development and automated tests now; preview and production only after M8 provisioning and authentication.
- **Current status:** M3 implements the credential-free Strava OAuth/webhook/activity adapters, private R2 adapter, Neon-backed durable jobs, canonical persistence, and background-work composition. It has no identity-provider adapter, deployed database, object-storage bucket, webhook subscription, or provider credentials.
- **Recommended next action:** keep `RACEPREDICTOR_CLOUD_MODE=disabled` outside isolated tests until M4--M7 are accepted and M8 provisioning is complete.

This document names configuration only. It must never contain connection strings, API tokens, encryption keys, webhook verification values, or real account identifiers.

## Current Repository Boundaries

| Environment | Cloud mode | Authentication | Database and provider adapters | Intended use |
|---|---|---|---|---|
| Local development | `disabled` by default | Synthetic actor only when explicitly injected in code; never from headers or environment | Existing local SQLite workflow remains available; no cloud connection required | Build and develop the existing local dashboard safely |
| Automated tests | Explicit test values only | Synthetic actor is allowed only through test composition | No external network, cloud database, storage, or Strava account required | Deterministic unit, contract, and migration checks |
| CI | `disabled` unless a future isolated integration job supplies non-production infrastructure | No real identity session required | Run build, type checks, unit/contract/migration checks without secrets | Reproducible quality gates |
| Preview | `disabled` initially | No production identity configuration | No production data or provider connection | Review UI and deployment shape without importing data |
| Production | Enabled only after M8 gate | Real identity-provider adapter required; fail closed otherwise | Neon, R2, Strava, queue and sync adapters must be configured together | Personal online dashboard, restricted to authorised athlete access |

The current `/api/v1/auth/session` endpoint can report safe unauthenticated status. It does not establish a session. The production composition deliberately ignores synthetic actors even if one is supplied in code.

## Implemented Non-Secret Configuration

The server reads these values today. They are safe to document and may be used in local test configuration or platform configuration; none is a credential.

| Variable | Allowed values / use | Default | Exposure rule |
|---|---|---|---|
| `RACEPREDICTOR_CLOUD_MODE` | `disabled` or `enabled`; master cloud feature gate | `disabled` | Server only |
| `RACEPREDICTOR_STRAVA_INGESTION_ENABLED` | `true` or `false`; only effective when cloud mode is enabled | `false` | Server only |
| `RACEPREDICTOR_SECOND_BRAIN_SYNC_ENABLED` | `true` or `false`; only effective when cloud mode is enabled | `false` | Server only |
| `RACEPREDICTOR_OWNER_AUTH_CONFIGURED` | `true` or `false`; declares M8 identity-provider completion but never authenticates a request | `false` | Server only |
| `RACEPREDICTOR_RELEASE` | Optional non-secret release label, truncated to 40 characters | unset | Server only; a safe version may appear in health status |
| `VERCEL_GIT_COMMIT_SHA` | Platform release identifier, preferred over `RACEPREDICTOR_RELEASE` when present | platform supplied | Server only; safe version may appear in health status |
| `NODE_ENV` | `development`, `test`, or `production`; controls the synthetic-actor boundary | runtime supplied | Server only |
| `STRAVA_WEBHOOK_SUBSCRIPTION_ID` | Positive Strava subscription identifier; exact-match receipt control | unset | Server only; do not expose connected athlete information |

`DATABASE_URL` is not exposed by the configuration module or health endpoint. Tests assert that both this variable and an example auth secret are redacted from public responses.

## Planned Secret Inventory and Ownership

These variables are implemented as fail-closed server configuration where M3 uses them, but remain unprovisioned until M8. They must not be added to client-side variables or committed `.env` files.

| Secret / setting name | Owner | First needed | Storage and rotation expectation |
|---|---|---|---|
| `DATABASE_URL` | Platform owner | M8 production runtime | Neon pooled runtime connection string. Store only in Vercel encrypted environment settings. Rotate through Neon, update Vercel, verify a new deployment, then revoke the old credential. |
| `DIRECT_URL` | Platform owner | M8 migration workflow | Neon direct (non-pooled) migration connection string. Store only in a protected migration environment/CI secret; never expose to Vercel request runtime. Rotate with `DATABASE_URL` as one database credential change. |
| `RACEPREDICTOR_TOKEN_ENCRYPTION_KEY` | Platform owner | M3 provider credential envelope | Random application-managed key held only in encrypted platform secrets. Version keys, retain the previous key until all active connection records are re-encrypted, then revoke it. Never log plaintext or derived material. |
| `STRAVA_CLIENT_ID` | Platform owner | M3 OAuth connection | Server-only Strava application identifier. Treat as configuration with the same protection as the secret because it is coupled to the OAuth application. |
| `STRAVA_CLIENT_SECRET` | Platform owner | M3 OAuth connection | Store only in Vercel encrypted environment settings. Rotate in Strava, update the deployed secret, validate a reconnect/token refresh, then revoke the prior value. |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Platform owner | M3 webhook subscription | High-entropy verification value, distinct per environment. Rotate by updating the Strava subscription handshake before revoking the previous value. |
| `STRAVA_WEBHOOK_SUBSCRIPTION_ID` | Platform owner | M3 webhook receipt | Provider-assigned positive identifier. It is not a signature or secret; store server-side and require an exact event match. |
| `R2_ACCOUNT_ID` | Platform owner | M3 raw-object adapter | Server-only Cloudflare account configuration. Do not expose it in browser bundles. |
| `R2_ACCESS_KEY_ID` | Platform owner | M3 raw-object adapter | Scoped to the single RacePredictor bucket and least required object operations. Replace key, deploy, test write/read, then revoke old key. |
| `R2_SECRET_ACCESS_KEY` | Platform owner | M3 raw-object adapter | Pair with the access-key ID; encrypted platform secret only. Same staged rotation process. |
| `R2_BUCKET` | Platform owner | M3 raw-object adapter | Bucket name; non-secret but server-only to prevent coupling clients to storage topology. |
| `R2_ENDPOINT` | Platform owner | M3 raw-object adapter | S3-compatible endpoint; server-only. |
| `CRON_SECRET` | Platform owner | M6 scheduled recovery | High-entropy bearer secret that Vercel sends as `Authorization: Bearer ...` to the bounded internal recovery trigger. Neon job state remains authoritative; the scheduler is not the queue of record. |
| `AUTH_SECRET` | Platform owner | M8 owner session | High-entropy Auth.js signing secret. Store only in Vercel encrypted environment settings and rotate deliberately because existing sessions will be invalidated. |
| `AUTH_GITHUB_ID` | Platform owner | M8 owner sign-in | GitHub OAuth application client ID. Keep server-side with the related secret. |
| `AUTH_GITHUB_SECRET` | Platform owner | M8 owner sign-in | GitHub OAuth application client secret. Copy directly from GitHub to Vercel; never place it in chat, source control, or local documentation. |
| `RACEPREDICTOR_OWNER_AUTH_SUBJECT` | Platform owner | M8 owner allow-list | Stable `github:<numeric-account-id>` subject for the single owner. This is not a credential, but must remain server-side so the allow-list cannot be influenced by a browser. |
| `RACEPREDICTOR_OWNER_ATHLETE_ID` | Platform owner | M8 identity provisioning | Stable athlete tenant to grant to the owner. The current single-athlete value is `athlete_001`; future athletes are added through persisted access rows rather than a code change. |
| Local-device pairing and signing material | Local device owner | M5 sync agent | Generate on the local device, persist only in its protected local configuration, and store only hashes/public material in Neon. Revoke a lost device server-side and re-pair. |

Provider access and refresh tokens are never environment variables. Once M3 is active they are encrypted per `ProviderConnection` using the versioned ciphertext, IV, and authentication-tag fields already present in the schema.

## Database Operations

### Connection topology

Prisma reads pooled runtime `DATABASE_URL` and separate migration `DIRECT_URL` values from `packages/db/prisma/schema.prisma`. For Neon:

- **Runtime:** use the Neon pooled connection string as `DATABASE_URL`, with the provider-recommended pooled/transaction mode for Vercel serverless requests.
- **Schema migration:** use an unpooled/direct Neon string as `DIRECT_URL` in the protected migration environment. The schema separation is implemented and validated locally; M8 supplies the real protected value and regenerates the client before deployment.
- **Safety:** application code and browser code must never receive `DIRECT_URL`. A migration command must use the direct connection deliberately, never by copying a production runtime value to a laptop.

### Additive migration already present

`20260810120000_cloud_athlete_scoped_sync` is additive and backfills `athletes` from existing athlete-scoped records before it adds tenant foreign keys. It adds source type `strava`, identity/access, provider connection, webhook/job, raw-object pointer, revision, device, sync-change, and selected Second Brain snapshot structures. It does not add plaintext token fields or raw provider payload columns.

### M8 migration and recovery runbook

1. Take and verify a Neon restore point/export according to the selected Neon plan before changing the production schema.
2. Confirm the target database is production by its non-secret project/environment label and confirm the deployed application is still cloud-disabled.
3. Run `npm run db:generate` against the checked-in schema.
4. Run `npm run db:migrate:deploy` once, from a protected migration environment with `DIRECT_URL`; record the migration output without connection details.
5. Query only aggregate/non-sensitive checks: migration table entry, expected new tables, and count of backfilled `athletes` versus distinct legacy `athleteId` values.
6. Deploy the application with cloud features still disabled; run health and existing local regression checks.
7. Enable one feature at a time only after its adapter and authentication checks pass.

If migration validation fails, stop feature enablement. Restore through Neon’s documented point-in-time/branch recovery process or deploy the previous application version against the compatible additive schema. Do not use `db:reset`, `prisma migrate reset`, table drops, truncation, or ad-hoc row deletion against any shared or production database.

## Feature Disable and Rollback

| Situation | Immediate containment | Recovery |
|---|---|---|
| Strava ingestion defect | Set `RACEPREDICTOR_STRAVA_INGESTION_ENABLED=false` and keep cloud mode on only if another feature needs it | Fix and test the adapter; replay idempotently from persisted event/job records and raw objects after validation |
| Second Brain sync defect | Set `RACEPREDICTOR_SECOND_BRAIN_SYNC_ENABLED=false` | Preserve immutable snapshots and sync cursor history; repair local agent or API contract before resuming from the last acknowledged cursor |
| Broad cloud incident | Set `RACEPREDICTOR_CLOUD_MODE=disabled` | Dashboard returns to its established local path; diagnose cloud services without accepting new cloud writes |
| Identity-provider outage or suspected access issue | Do not add a bypass; fail closed | Restore provider configuration or roll back the identity adapter after confirming athlete-access scoping |
| Bad application deployment | Roll back to the prior Vercel deployment | Keep migrations additive and backward compatible; do not roll back schema by deletion |
| Token-encryption issue | Disable ingestion and block token use | Restore an available key version, re-encrypt records in a controlled job, and require reconnect only when recovery is impossible |

Deleting raw objects, snapshots, webhook events, or jobs is not an operational response. These records are recovery evidence and must follow a separately approved retention/deletion policy.

## Free-Tier Guardrails — Revalidate at M8

The following are planning assumptions, not deployment facts. Confirm current provider terms, quotas, region availability, retention, and commercial-use eligibility during M8 before selecting production settings.

| Service | Planning assumption | Guardrail |
|---|---|---|
| Vercel Hobby | Suitable for the personal online dashboard; functions and scheduled work have plan limits | Keep webhook responses short, avoid long work in request handlers, and monitor function/cron limits before enabling reconciliation |
| Neon Free | Small serverless Postgres allocation with scale-to-zero and compute/storage limits | Use pooled runtime connections, preserve indexes, keep raw bodies out of Postgres, and monitor database size/compute before multi-athlete expansion |
| Cloudflare R2 | Free object-storage allowance sufficient for an initial single-athlete raw archive | Immutable key naming, checksums, object-size limits, lifecycle/retention review, and usage monitoring; never proxy whole raw bodies through function responses |
| Strava | One connected athlete and webhook/OAuth limits subject to Strava approval and policy | Use webhook acknowledgement plus durable idempotent jobs, rate-limit fetches, and implement reconciliation rather than polling frequently |
| Queues | Current Vercel Queue capability/terms may be beta or plan dependent | Persist the source event/job in Neon before queue dispatch and retain a reconciliation path if queue delivery changes or is unavailable |

The checked-in Vercel schedule calls the recovery route once daily at `03:00` UTC, within the Hobby minimum interval. The route accepts Vercel's `GET` request and an operator `POST`, but both fail closed without the same `CRON_SECRET`. Webhook-triggered background work remains the normal immediate path; this daily pass recovers missed, retryable, or interrupted work. Vercel may deliver a Hobby cron at any point within the configured hour and does not retry a failed invocation, so the durable Neon job state and idempotent next run remain authoritative.

### Strava read pacing (implemented 2026-08-12)

The shared application budget reserves each planned Strava read before network I/O, conservatively stopping at 80 requests in a quarter-hour window. A normal activity expansion reserves three reads; each history/reconciliation page reserves one. A planned budget pause retains the durable batch checkpoint, does not consume an attempt, and releases work for the next quarter-hour boundary plus five seconds. A recoverable provider retry also retains the checkpoint. The daily Vercel cron remains recovery-only, so a very large historical import can continue on a later scheduled pass rather than immediately after a pause.

Verified on 2026-08-10 against Vercel's official [Cron overview](https://vercel.com/docs/cron-jobs), [management/security guidance](https://vercel.com/docs/cron-jobs/manage-cron-jobs), and [usage/plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing). Hobby currently permits daily cron execution with hourly precision; M8 must revalidate this before production enablement.

M8 must explicitly record the verified limits and define warning thresholds at a conservative level (for example, alert before 80% of the selected plan’s storage, compute, function, object-operation, or API-call allocation), rather than hard-coding today’s public quota figures.

## CI/CD and Validation

Current package scripts relevant to this work:

| Check | Command | Environment expectation |
|---|---|---|
| Web type check | `npm run lint --workspace @racepredictor/web` | No secrets; cloud mode disabled |
| Web unit/contract tests | `npm run test --workspace @racepredictor/web` | Test-only synthetic actor injection; no external services |
| Web build | `npm run build --workspace @racepredictor/web` | No secrets required while adapters remain disabled |
| Prisma client | `npm run db:generate` | `DATABASE_URL` may be needed by tooling depending on installed Prisma behavior; use a non-production local/test URL only |
| Migration deployment | `npm run db:migrate:deploy` | M8 protected migration environment only; direct Neon connection, never a browser or request runtime |
| Embedded PostgreSQL migration/tenant gate | `npm run db:test:cloud` | No credentials; applies every migration to an isolated in-memory PostgreSQL engine |
| Database contract/integrity gate | `npm run db:test:contracts` and `npm run db:test:gate` | Isolated disposable PostgreSQL connection; never production |

Before every milestone completion, run the tests owned by that milestone plus the current regression suite. Before a production release, require successful build, types, unit/contract checks, migration validation, deployment health check, authenticated tenant-bound smoke test, Strava webhook verification, raw-object integrity check, and Second Brain selected-field boundary test.

## M8 Authentication and Provisioning Checklist

This is deliberately deferred because it requires account authentication and user action.

Current evidence on 2026-08-10: the existing Vercel Hobby project `racepedictor` was verified; a Neon Free database named `racepredictor-production` was created in Frankfurt and connected to Vercel Production and Preview; the owner-only Auth.js/GitHub adapter and persisted identity provisioning path are implemented and automated QA is green; and the GitHub OAuth application has been registered. GitHub client-secret transfer, protected database migration, production deployment, Cloudflare R2, Strava registration/webhook subscription, local pairing, and live smoke tests remain incomplete.

1. Authenticate to Vercel, Neon, Cloudflare R2, Strava developer settings, and the chosen identity provider; create separate preview and production environments where the free plans permit it.
2. Use the implemented GitHub owner provider. Configure `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `RACEPREDICTOR_OWNER_AUTH_SUBJECT`, and `RACEPREDICTOR_OWNER_ATHLETE_ID`; set `RACEPREDICTOR_OWNER_AUTH_CONFIGURED=true` only after a real session resolves an `app_users.authSubject` and an `athlete_access` record.
3. Create Neon database(s), provision a pooled `DATABASE_URL` and protected direct migration connection, and execute the migration runbook.
4. Create an R2 bucket and least-privilege credential; configure the raw-object adapter and validate checksum-addressed write/read without exposing an object publicly.
5. Register the Strava application callback URL, OAuth scopes, webhook callback URL, and verify token; configure secrets and complete a manual owner connection.
6. Provision bounded retry/reconciliation scheduling according to verified Vercel capabilities. Neon ingestion jobs remain the durable authority; test duplicate delivery, retry, restart recovery, and replay with a non-production activity.
7. Pair the local Second Brain sync agent only after the selected-field contract is accepted. Confirm its local device secret never reaches the repository or browser.
8. Deploy cloud-disabled first, run smoke checks, then enable authentication, Strava ingestion, and Second Brain sync individually with evidence recorded in the milestone log.

## Deployment Decision

- **Proceed with the M8 owner handoff:** yes; the application and credential-free verification are ready, Vercel and Neon are connected, and the remaining steps are bounded account-owner actions.
- **Present the system as production-complete:** no; production migration/deployment, R2, Strava, local pairing, and live authenticated smoke evidence are still required.

## Local Agent Operations

The local device credential is enrolled through standard input and protected with Windows DPAPI for the current user:

1. Pair the computer in online Settings and copy the one-time credential.
2. From the repository, pipe it to `npm run sync:local -- enroll`; never put it in a command argument or environment variable.
3. Set or supply the non-secret cloud URL, local database path, Obsidian vault path, and athlete ID.
4. Run `npm run sync:local -- sync` for a bounded immediate synchronization.
5. Install periodic execution with `npm run sync:local:install --` plus `-RepositoryPath`, `-DatabasePath`, `-VaultPath`, `-CloudUrl`, optional `-AthleteId`, and optional `-IntervalMinutes` (default 15).

The scheduled task runs hidden as the current interactive Windows user so the same-user DPAPI credential can be decrypted. Its `%LOCALAPPDATA%\RacePredictor\local-sync-config.json` contains only non-secret paths, URL, and athlete ID. Re-pairing or server-side revocation immediately invalidates the old credential; do not copy or attempt to recover the protected credential file.
