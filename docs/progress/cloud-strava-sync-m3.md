# Milestone 3 Evidence - Strava Automatic Ingestion

**Milestone:** M3 - Strava OAuth, durable webhook ingestion, private raw retention, and canonical normalization  
**Date:** 2026-08-10  
**Status:** Complete - automated QA and Product Owner gate passed

## Delivered scope

- Actor- and athlete-scoped Strava OAuth start, callback, status, refresh, disconnect, and provider-deauthorization behavior.
- A 256-bit opaque, hash-only, actor/athlete/redirect-bound, ten-minute, single-use OAuth state.
- Minimum `activity:read_all` scope, encrypted token storage, atomic rotating refresh tokens, and current `/oauth/revoke` behavior.
- A bounded owner-requested backfill API plus an automatically queued 90-day initial backfill after connection.
- Strict webhook subscription verification and create, update, delete, and athlete-deauthorization receipt.
- Raw-body-first acknowledgement: immutable private R2 write and one atomic Neon event/job transaction precede a successful webhook response.
- Exact event replay reuse, altered replay rejection, one-athlete provider resolution, non-disclosing public failures, and a measured synthetic response below two seconds.
- Durable worker claims with lease-token fencing, retry timing, stale recovery, maximum attempts, dead-letter state, and atomic event/job settlement.
- Provider detail, lap, stream, and bounded list clients that retain exact bytes but project only approved canonical fields.
- Content-addressed athlete/provider R2 keys, checksums, byte size, conditional immutable writes, verified replay, and short-lived authorised reads only.
- Canonical Activity, split, route, provenance, revision, sync-change, and affected-analytics persistence in one serializable transaction.
- Deterministic overlap handling for Strava, prior CSV/GPX/manual history, webhook replay, and bounded backfill; ambiguous matches stop for review.
- Provider deletes tombstone Strava-owned activities. When Strava was matched to a manual/GPX canonical activity, only the Strava provenance link is made inactive; the local activity remains live and can be relinked on provider recreation.
- Immediate post-response processing through the runtime's background-work hook. The persisted Neon job remains authoritative if acceleration fails.

## Clean architecture boundaries

| Boundary | Responsibility |
|---|---|
| Core contracts/use cases | OAuth lifecycle, webhook receipt, strict provider DTOs, normalization, reconciliation, retry classification, and worker state transitions |
| Database adapters | Encrypted provider connection, OAuth attempt, immutable raw metadata, webhook/event/job persistence, lease fencing, canonical transaction, revisions, and sync cursor |
| Web adapters | Safe Strava HTTP/OAuth transport, callback/webhook/backfill routes, R2/runtime configuration, and post-response scheduling |
| Product shell | Connection and ingestion state presentation is deliberately consumed in M4; M3 exposes safe state and operations without weakening the M2 cloud guard |

## Automated evidence

| Gate | Result |
|---|---|
| Core unit/contract/service suite | PASS - 56/56 |
| Database adapter, migration, R2, worker, and canonical suite | PASS - 33/33 |
| Web route, security, transport, and regression suite | PASS - 54/54 |
| TypeScript | PASS |
| Prisma format, validate, and client generation | PASS |
| Embedded PostgreSQL applies every forward migration | PASS |
| Production Next.js build | PASS; Strava connect/callback/status/disconnect/backfill/webhook routes present |
| Existing local analytics/activity/import/coaching/pipeline/Obsidian suites | PASS - 18/18 |
| Existing desktop and 390px product journeys | PASS - Playwright 11/11 |
| Dependency audit | PASS - 0 vulnerabilities |
| Diff whitespace check | PASS; line-ending notices only |

## Product evidence

- Synthetic owner connection validates the exact callback, granted scope, state replay/expiry, encrypted persistence, refresh rotation, truthful status, disconnect, reconnect, denied consent, and deauthorization.
- Synthetic webhook create/update/delete/deauthorization deliveries are durably stored and acknowledged in under the documented two-second callback limit.
- A synthetic activity produces one normalized canonical Activity with split/route/provenance/revision/sync/analytics evidence after three exact provider responses are retained immutably.
- Webhook replay, backfill overlap, and prior manual history do not create duplicate activities. Ambiguous history is reported without mutation.
- Raw provider bodies never enter structured database columns or browser responses; only key/checksum/type/size/capture metadata is persisted in Neon.
- Existing plan approval, version history, calendar, Today, reminders, local imports, and user-authored Obsidian content remain unchanged and green.

## Current provider basis

- Strava access tokens are treated as expiring credentials and every returned refresh token replaces the previous token atomically.
- The application requests only `activity:read_all` for the approved ingestion behavior.
- Webhooks have no POST signature, so receipt uses exact subscription identity, strict documented shape, athlete-resolved connected provider identity, private raw retention, and one non-disclosing valid-event failure response.
- Default Strava rate-limit responses are respected through provider retry timing or the next quarter-hour boundary; production application-specific capacity remains an M8 verification.

Official references used for the implementation and M8 revalidation: [authentication](https://developers.strava.com/docs/authentication/), [webhooks](https://developers.strava.com/docs/webhooks/), [rate limits](https://developers.strava.com/docs/rate-limits/), and [API reference](https://developers.strava.com/docs/reference/).

## Risks carried forward

| ID | Risk / deferred item | Required gate |
|---|---|---|
| M3-R01 | No real Strava, R2, Neon, Vercel, or owner identity credential was used; external behavior and current free-tier limits are not yet production evidence. | M8 authenticated provisioning and smoke test |
| M3-R02 | Embedded PostgreSQL proves migrations and lifecycle predicates but cannot prove two independent server connections racing for one job. Guarded atomic claims are covered deterministically. | M6 CI real-PostgreSQL concurrency check or M8 disposable Neon branch |
| M3-R03 | Failed jobs are durable, discoverable, fenced, and retryable, but the scheduled polling/reconciliation trigger is not provisioned. Immediate post-response acceleration is active in composition. | M6 recovery automation; M8 platform cron configuration |
| M3-R04 | Safe provider/ingestion states exist, but their online dashboard presentation and separate freshness wording are M4 scope. | M4 component and browser gate |
| M3-R05 | Canonical mutation writes an affected-activity recompute marker; the cloud dashboard analytics consumer is not yet composed. | M4 cloud read/analytics composition and M6 recovery gate |

No accepted risk weakens athlete isolation, credential protection, raw-object privacy, canonical history retention, plan immutability, or the selected Second Brain boundary.

## Milestone decision

QA: **PASS**.  
Product Owner: **PASS - GO for M4**.  
Production activation: **NOT AUTHORISED** until M8.

Detailed gate records: `cloud-strava-sync-m3-qa.md` and `../product/CLOUD_STRAVA_SYNC_M3_ACCEPTANCE.md`.
