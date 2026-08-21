# Milestone 2 Evidence — Cloud-Compatible Foundation

**Milestone:** M2 — cloud contracts, athlete-scoped persistence, fail-closed authentication, storage/queue/sync seams  
**Date:** 2026-08-10  
**Status:** Complete — independent QA and Product Owner passed

## Delivered scope

- Shared strict contracts for authenticated actor scope, Strava-neutral provider state, local-device sync, freshness, and `second-brain-context.v1`.
- Clean domain ports for provider, canonical activity, connection, raw object, durable job, sync, snapshot, and local projection boundaries.
- Additive Strava activity source without removing CSV, GPX, TCX, or manual compatibility.
- Athlete-scoped Prisma schema and additive forward migration for user/access, provider connections, webhook events, ingestion jobs, raw object metadata, source references, revisions, change feed, paired devices, and structured snapshots.
- Pooled runtime `DATABASE_URL` separated from migration `DIRECT_URL`.
- AES-256-GCM credential envelope with versioned key ring and athlete/provider authenticated binding.
- Deterministic private raw-object, durable-job, sync, and immutable-snapshot adapters for local/CI product testing.
- Fail-closed production authentication seam, safe synthetic test actor injection, redacted API envelopes, non-sensitive health endpoint, and session status endpoint.
- Route-level authorization on all 21 sensitive API handlers plus a Next.js 16 request boundary for every dashboard page and API route.
- Legacy local/global handlers remain unavailable in authenticated cloud mode until their M3/M4 replacements explicitly consume the actor's athlete scope.
- Credential-free operations, feature-disable, migration/recovery, free-tier guardrail, and M8 provisioning plan.
- One repeatable `npm run test:cloud` gate.

## Requirement and acceptance evidence

| M2 outcome | Evidence | Result |
|---|---|---|
| Production-compatible shell and health | Next 16 route handlers, configuration validation, production build | Pass |
| Anonymous access fails closed | All 21 sensitive handlers and all dashboard pages deny production/cloud requests before local data access; health/session remain public | Pass |
| Cross-athlete access is denied | Two-athlete contract, raw store, queue, sync, snapshot, and PostgreSQL FK tests | Pass |
| Future athletes require no schema/auth redesign | `User`/`Athlete`/`AthleteAccess`; athlete scope at every new owned boundary | Pass |
| Only selected structured context can persist | Exact five-section strict schema, no free text, local/cloud parser reuse, JSON context column | Pass |
| Credentials are not plaintext or exposed | AES-GCM envelope, no token-shaped columns, health/session redaction tests | Pass |
| Raw bodies remain outside Neon | `RawObject` contains key/checksum/type/size only; prohibited-column tests | Pass |
| Jobs/replay are durable by contract | Athlete-scoped idempotency, claim/retry/fail/complete state adapter and schema | Pass |
| Sync cursors do not leak other-athlete volume | Athlete-local cursor uniqueness and independent two-athlete tests | Pass |
| Existing Phase 1 remains intact | Full local unit/integration and browser regression evidence | Pass |
| No owner credentials required in M2 | All adapters and tests are local/embedded; production remains disabled/fail-closed | Pass |

## Automated QA evidence

| Gate | Result |
|---|---|
| Core contract/domain | 24/24 pass |
| Cloud adapters/schema/migration | 11/11 pass |
| Web route/view-model | 38/38 pass, including 9/9 route-security and route-inventory checks |
| Web TypeScript | Pass |
| Production Next.js build | Pass; health and session routes included |
| Prisma format/validate/generate | Pass |
| Embedded PostgreSQL migration | Pass from all existing migrations through M2; legacy row preserved and failed multi-write transaction rolled back |
| Local analytics/activity/pipeline/coaching/import/Obsidian | 1/1, 2/2, 3/3, 6/6, 5/5, 1/1 pass |
| Browser product regression | Initial full run: 10/11 product journeys pass; one ambiguous test locator was corrected and the affected journey then passed 1/1. No product defect found. |
| Dependency audit | 0 vulnerabilities after adding embedded PostgreSQL test dependency |
| Diff whitespace | Pass; repository line-ending notices only |

## Product testing

- Production health reports only non-sensitive configuration and degrades while owner authentication is unconfigured.
- Production cannot accept a synthetic actor even when an attacker supplies a header or code injects a resolver.
- Two synthetic athletes may reuse local cursor `1` independently, while cross-athlete raw objects, jobs, snapshots, and source relations are denied.
- Selected context persists its exact field names and structured JSON, but unknown text/note/path/plan fields reject before storage.
- Credential ciphertext cannot be opened after ciphertext, key, athlete, or provider tampering.
- Existing Today, Plan approval/versioning, Calendar audit, Activities/import, Settings, and mobile-baseline journeys remain usable.
- The exact `test:cloud` then production-build order is deterministic after disabling stale Next development type caching.

## Known limitations and later gates

- No real owner identity adapter exists by design; production remains fail-closed until M8 authentication.
- No external Neon, R2, Strava, or managed-queue resource is provisioned. PostgreSQL migration behavior is exercised locally with an embedded PostgreSQL engine; real-service verification remains M8.
- M2 provides provider/storage/queue ports and deterministic adapters. M3 supplies the real Strava/R2/durable ingestion implementations.
- The cloud dashboard is not enabled in M2. M4 replaces production local reads only after ingestion is trustworthy.

## Gate decision

QA decision: **PASS**; no open M2 blocker. See `cloud-strava-sync-m2-qa.md`.  
Product Owner decision: **PASS — GO for M3**. See `../product/CLOUD_STRAVA_SYNC_M2_ACCEPTANCE.md`.
