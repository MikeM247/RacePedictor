# Milestone 3 Product Owner Acceptance

**Review date:** 2026-08-10  
**Decision:** PASS - GO for Milestone 4  
**Production approval:** No  
**Review method:** requirements-led Product Owner role gate against the approved backlog, formal QA record, executable evidence, and product regressions

## Product Owner gate

| Gate criterion | Decision | Evidence and finding |
|---|---|---|
| Connect, status, bounded backfill, disconnect, reconnect, denied, expired, and revoked journeys work without owner credentials. | PASS | Core lifecycle, provider repository, route, and worker fixtures cover each state; the backfill route returns explicit bounds and queue identity. |
| Webhook create/update/delete/deauthorization persist durably and meet callback timing. | PASS | Strict fixtures write immutable raw input and atomic event/job state before acknowledgement; the five-delivery synthetic journey completes below two seconds. |
| A synthetic lifecycle produces one traceable canonical activity and private raw objects. | PASS | Detail/laps/streams are checksum-addressed, normalized into Activity/split/route, linked by provenance and revision, and emitted once to sync/analytics. |
| Backfill, webhook retry, and manual history overlap do not duplicate activities. | PASS | Deterministic provider identity, canonical hash, source references, exact/fuzzy matching, and ambiguous-stop tests pass. |
| Credentials and payloads remain private. | PASS | AES-GCM repository, response redaction, metadata-only structured persistence, private R2 adapter, non-disclosure route tests, and privacy scan pass. |
| Current Strava assumptions are recorded for production verification. | PASS | M3 progress links official authentication/webhook/rate-limit/reference documents; operations plan leaves application capacity and free-tier revalidation to M8. |
| Formal QA is green before acceptance. | PASS | M3 QA records 56 core, 33 DB, 54 web, 18 local, 11 browser checks, Prisma/type/build, and dependency audit passing. |

## Feature acceptance

### Owner connection and revocation

PASS for M3 service/API scope. Owner/athlete scope, state, redirect, grants, provider identity, token expiry/rotation, disconnect, and deauthorization are enforced. The safe Connected/Action required/Disconnected/Error state contract is present. Its dashboard presentation and freshness copy are an explicit M4 dependency, not a production-ready M3 claim.

### Durable webhook receipt

PASS. Receipt is narrow, durable, idempotent, fast, provider-resolved, and independent of the local computer. It stores no structured raw payload and performs no full activity fetch in the callback request.

### Private raw provider retention

PASS. The implementation retains exact approved endpoint responses privately with integrity metadata, athlete namespace, immutable replay, no public listing, and only short-lived authorised read capability.

### Canonical activity and manual-history reconciliation

PASS. The behavior is provider-neutral at the canonical boundary, traceable to every source, deterministic on overlap, safe on ambiguity, revisioned on change, tombstoned only when provider-owned, and isolated from approved plans. An affected-analytics marker is produced in the same transaction; its cloud consumer is an M4/M6 dependency.

## Product constraints

| Constraint | Decision |
|---|---|
| Strava first; no Garmin-specific implementation in this phase | PASS |
| One athlete in the product now; future athletes without rearchitecture | PASS - all new identities, routes, jobs, objects, sources, and cursors are athlete-scoped |
| Raw provider data in cloud object storage, not structured database/browser | PASS |
| RacePredictor receives only selected structured Second Brain fields | PASS - M3 did not widen or use that boundary |
| Online ingestion must not depend on the local Obsidian computer | PASS for M3 architecture/runtime; online dashboard consumption is M4 |
| Approved plans cannot be implicitly changed by ingestion | PASS |
| Free tier and no external authentication until requested | PASS - no service was provisioned and no credential was requested |

## Accepted dependencies, not exceptions

- M4 must expose the actor-scoped cloud activity read model and separate provider, ingestion, local-device, and Second Brain freshness states.
- M6 must compose scheduled retry/reconciliation recovery and add real-PostgreSQL concurrent-claim evidence where available.
- M8 must verify current Strava application capacity, callback/subscription behavior, free-tier quotas, Neon/R2/Vercel behavior, and the live owner-authenticated journey.

These dependencies do not waive any privacy, security, tenancy, history-retention, or plan-safety requirement.

## Product Owner decision

**PASS - GO for M4.**

M3 provides the complete credential-free Strava ingestion capability required at this point in the sequence. The result is not yet a deployable online product: M4-M7 and the owner-authenticated M8 gate remain mandatory.

**Product Owner:** Product Owner role gate  
**Next gate:** M4 - online dashboard and sync visibility
