# Milestone 3 Formal QA Gate

**Date:** 2026-08-10  
**Decision:** PASS  
**Scope:** credential-free Strava connection and automatic-ingestion release candidate  
**Production decision:** not approved; external provisioning remains M8

## Acceptance trace

| Required outcome | Evidence | Result |
|---|---|---|
| Authenticated athlete-only OAuth operations | M2 route/proxy guard plus actor-scoped Strava handlers and cross-athlete state tests | PASS |
| Opaque, expiring, single-use callback state | Core lifecycle and Prisma attempt tests cover actor/athlete/redirect binding, expiry, denial, replay, and duplicate parameters | PASS |
| Encrypted, rotating credentials with no browser/log exposure | AES-GCM athlete/provider binding, Prisma rotation, provider transport, redaction, and response-shape tests | PASS |
| Bounded initial and owner-requested history | Strict 366-day/10-page/300-activity maximum; default 90-day/5-page/150-activity initial job; actor-scoped 202 route | PASS |
| Durable fast webhook receipt | Raw immutable write and event/job transaction occur before acknowledgement; five synthetic receipts complete under two seconds | PASS |
| Duplicate and altered-event safety | Stable provider key, exact replay reuse, altered retry conflict, unique athlete/provider event and job keys | PASS |
| Private immutable raw retention | Conditional R2 write, athlete prefix, SHA-256/size validation, verified replay, no list/public URL, <=900-second authorised read | PASS |
| Retryable asynchronous processing | Optimistic fenced claim, lease token, stale recovery, `availableAt`, max-attempt dead letter, atomic settlement | PASS |
| Strict provider minimization | Only detail, laps, six approved streams, and bounded summaries are projected; exact bytes remain raw | PASS |
| Idempotent canonical normalization | Transactional Activity/split/route/source/revision/sync/analytics persistence and deterministic hash replay | PASS |
| Manual/GPX reconciliation and retention | Exact/fuzzy/ambiguous tests; local provenance preserved; provider deletion inactivates only its source when canonical is local | PASS |
| Deauthorization | Worker clears only the claimed athlete credentials and retains canonical/raw history | PASS |
| Existing product behavior | Local suites 18/18 and browser journeys 11/11 | PASS |
| Production build and migration reproducibility | Prisma format/validate/generate, every PGlite migration, TypeScript, and Next build | PASS |

## Final command evidence

- `npm run test:cloud`: core 56/56, database 33/33, web 54/54, TypeScript PASS.
- `npm run build`: PASS after the cloud test sequence.
- Local compatibility: 1 analytics + 2 activity + 5 import + 6 coaching + 3 pipeline + 1 Obsidian = 18/18 PASS.
- `npm run test:e2e --workspace @racepredictor/web`: Chromium 11/11 PASS.
- `npx prisma format`, `validate`, and `generate`: PASS.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: no whitespace error; repository line-ending notices only.

## Defects found and remediated during M3

| Finding | Resolution | Final evidence |
|---|---|---|
| Canonical persistence initially lacked the relation-order uniqueness Prisma required for its one-to-one analytics marker. | Added the matching composite uniqueness and forward-migration index. | Prisma validate/generate and every migration pass. |
| A provider delete could tombstone a manual/GPX canonical activity that had only acquired Strava provenance. | Added soft deletion/reactivation of the Strava source reference and retained the local canonical activity. | Focused retention/recreation test and full DB suite pass. |
| The first Node test import used the browser-oriented `next/server` specifier. | Switched to the Node-compatible Next export and completed declarations for the new adapters. | Focused web tests, typecheck, full suite, and build pass. |
| The first direct invalid-backfill test expected a wrapped HTTP response from an unwrapped handler. | Corrected the test to assert the typed route error; product wrapper behavior was unchanged. | Focused and full web suites pass. |

## Security and privacy audit

- No plaintext provider credential fields or raw provider body columns exist.
- Token-shaped fixtures are explicit synthetic protocol tests; no real secret or account identifier is present.
- Webhook known/unknown/conflict/storage failures do not disclose athlete or payload differences.
- R2 keys are athlete-scoped, immutable, and inaccessible without a current athlete scope.
- The public webhook is the exact proxy exception; suffix paths remain protected.
- Owner backfill and all provider management routes use the actor-scoped security wrapper.
- No Garmin provider integration, new plan mutation, arbitrary Obsidian prose, vault path, or whole-vault upload was introduced.

## QA conclusion

M3 meets its credential-free exit gate and is suitable to proceed to M4. The five carried risks in `cloud-strava-sync-m3.md` are explicit later-gate work, not hidden M3 failures. No external service should be enabled and no real credential should be requested yet.
