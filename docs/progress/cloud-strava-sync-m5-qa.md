# Milestone 5 Formal QA Gate

**Date:** 2026-08-10  
**Decision:** PASS  
**Scope:** paired-device security, local projection, Obsidian preservation, approved-plan publication, and selected Second Brain publication  
**Production decision:** not approved; real owner identity, cloud resources, and final device enrolment remain M8

## Acceptance trace

| Required outcome | Evidence | Result |
|---|---|---|
| Owner pairing and separate credential | Owner route wrapper, one-time enrolment response, hashed database credential, DPAPI store, and stdin-only CLI | PASS |
| Replay, re-pair, invalid token, cross-athlete denial, revoke | Core, DB, route, and browser tests; predecessor is revoked without provider/session mutation | PASS |
| Device Active/Stale/Error/Revoked status | Device facts include paired/seen/error/lifecycle; failure-report endpoint and status projection have independent state tests | PASS |
| Bounded initial/incremental download | Maximum 500 changes/page and 100 pages/run; pagination integration covers activities, revisions, plans, and sessions | PASS |
| Transaction and cursor safety | Entity batch is transactional; cursor commits only after atomic note write; partial-failure/replay tests | PASS |
| Correction/deletion and dedupe | Cloud/local ID mapping plus revision-fenced upsert and tombstone integration tests | PASS |
| User Markdown protection | Atomic owned-span writer; CRLF prefix comparison is byte-exact; replay yields one span | PASS |
| Offline recovery | Pre-commit local failure and post-commit acknowledgement outage both recover without reset | PASS |
| Selected fields only | Strict v1 schema, exact selected/present equality, 64 KiB bound, canonical hash, prohibited-key tests, no vault scan | PASS |
| Immutable snapshots | Device-fenced repository tests cover replay, revision conflict/gap/stale, latest-after-revoke | PASS |
| Plan safety | Context contract has no plan fields; approved-plan publisher rejects drafts and emits plan/session changes separately | PASS |
| Automatic local operation | Scheduled-task installer and hidden runner implemented; PowerShell parser gate passes | PASS |
| Product usability | Desktop/mobile Settings pairing/revocation plus existing online/local browser journeys pass | PASS |

## Final command evidence

- `npm run test:cloud`: core 71/71, database 44/44, web 64/64, TypeScript PASS.
- `npm run build`: PASS; all owner/device/snapshot/plan sync routes are present and dynamic.
- Combined local compatibility and M5 sync suite: 24/24 PASS.
- `npm run test:e2e --workspace @racepredictor/web`: Chromium 11/11 PASS.
- `npm run test:e2e:online --workspace @racepredictor/web`: Chromium 4/4 PASS.
- Prisma format/validate/generate and embedded PostgreSQL all-migration replay: PASS.
- Actual Windows DPAPI save/load/clear round trip with a synthetic credential: PASS.
- Scheduled-task PowerShell parser check: PASS.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: no whitespace error; line-ending notices only.

## Defects found and remediated during M5

| Finding | Resolution | Final evidence |
|---|---|---|
| Source-reference path validation originally occurred after the cloud publication call. | Validate all logical source references before credential use or any network write. | Privacy test asserts the invalid path causes no second cloud call. |
| The first DPAPI command used an unavailable shortened .NET type name. | Load `System.Security` and use fully-qualified `System.Security.Cryptography` types. | Real Windows DPAPI round trip passes. |
| Local projection failures were visible only in local SQLite, so online device Error could not become truthful. | Add a device-authenticated safe diagnostic endpoint; failed sync/publication reports a stable code best-effort, and acknowledgement clears it. | Route classification, device repository, and status projection gates pass. |
| The local Playwright configuration began collecting the separate online fixture suite, causing a combined-server timeout. | Explicitly ignore the online spec in the local config; keep it in its dedicated config. | Local 11/11 and online 4/4 pass independently. |

## Security and privacy audit

- Proxy bypass applies only to the exact five self-authenticated device routes; every such handler independently requires a valid active device token.
- Owner list/pair/revoke routes retain browser-session authentication and athlete scope.
- Token lookup uses a dummy hash and timing-safe comparison; failures use one generic unauthenticated response.
- Only the one-time enrolment response contains the plaintext device token. List/status APIs expose no hash or secret.
- Revocation is checked again inside snapshot/plan persistence transactions, fencing races with a request authenticated just before revocation.
- Cloud responses and local generated notes contain no raw object body/key, credential, vault path, arbitrary note, or stack.
- Stable device diagnostic codes are bounded and contain no error message, path, or payload content.

## QA conclusion

M5 satisfies its credential-free gate with no open release blocker. Installing the task, pairing the real computer, and proving the managed end-to-end journey correctly remain M8 actions because they require the live URL, real owner identity, and platform/provider authentication.
