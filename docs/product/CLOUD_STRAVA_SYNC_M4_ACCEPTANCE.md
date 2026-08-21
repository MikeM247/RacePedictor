# Milestone 4 Product Owner Acceptance

**Review date:** 2026-08-10  
**Decision:** PASS - GO for Milestone 5  
**Production approval:** No  
**Review method:** requirements-led Product Owner gate against the M4 backlog, formal QA record, executable API evidence, browser product journeys, and cumulative regressions

## Product Owner gate

| Gate criterion | Decision | Evidence and finding |
|---|---|---|
| Online dashboard works while the local computer is unavailable and separates activity from Second Brain freshness. | PASS | Online browser journey shows current cloud workout/performance data, stale home device, and stale Second Brain as independent cards. |
| Cursor, backfill, correction/deletion, replay, and cross-athlete tests pass. | PASS | M3 bounded backfill plus M4 sync repository/handler suites cover every required behavior and deny foreign cursors/resources. |
| Plan approval, Calendar, Today, and manual-import safety have no release-blocking regression. | PASS | Local 18/18, web 59/59, existing Playwright 11/11; online Plan/Calendar are read-only and Today explicitly says no online adaptation occurred. |
| Cumulative automated and product suites pass. | PASS | Core 65, DB 39, web 59, local 18, browser 14, Prisma, migration replay, typecheck, build, audit, and diff checks pass. |
| Evidence and known limitations are truthful. | PASS | M4 evidence distinguishes fixture-backed browser proof from M8 real owner identity and managed-service smoke checks. |

## Feature acceptance

### Athlete-scoped change and synchronization status APIs

PASS. Changes are bounded, deterministic, replay-safe, versioned, actor-scoped, and include deletions without exposing another athlete's state. Provider, ingestion, activity, device, and Second Brain states remain independent and use objective state rules. Responses exclude secrets, raw payloads, object keys, local paths, and stacks.

### Authenticated dashboard from cloud-authoritative data

PASS for the credential-free release-candidate scope. Activity, performance, approved plan, immutable history, Calendar, and Today are composed from cloud repositories. Production cloud mode has no local SQLite/Obsidian fallback. The online product remains useful when the home computer is stale/offline and accurately limits only local synchronization and new Second Brain publication.

The real authenticated production session is not claimed here; owner identity is an explicit M8 dependency.

## Product constraints

| Constraint | Decision |
|---|---|
| Strava first; no Garmin-specific phase implementation | PASS |
| Single-athlete UI with future-athlete architecture | PASS - every read, cursor, status, and plan projection is athlete-scoped |
| Raw provider data remains private object storage data | PASS |
| Obsidian remains local and only selected structured fields may later publish | PASS - M4 reads status only and introduces no note-ingestion path |
| Online dashboard cannot silently use stale local data | PASS - cloud composition is exclusive in cloud mode |
| New activities cannot imply AI review or adapt plans | PASS - explicit UI and Today wording plus read-only controls |
| Free tier and no external authentication until actually required | PASS - no external resource or credential was used |

## Accepted dependencies, not exceptions

- M5 must pair a local device, publish approved structured plan projections, consume the cursor feed, and publish only selected structured Second Brain snapshots.
- M6 must add scheduled reconciliation, representative-volume/query-plan evidence, full security hardening, and real-PostgreSQL concurrency where available.
- M8 must install the real identity adapter, provision free-tier services, and repeat the online/offline journey against managed infrastructure.

These dependencies do not waive authentication, athlete isolation, privacy, local-authority, or plan-immutability requirements.

## Product Owner decision

**PASS - GO for M5.**

M4 provides the complete credential-free online dashboard and synchronization-visibility capability required at this point. It is not production-approved until M5-M7 are accepted and M8 production verification passes.

**Product Owner:** Product Owner role gate  
**Next gate:** M5 - local structured sync agent

