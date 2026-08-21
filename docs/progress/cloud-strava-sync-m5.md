# Milestone 5 Evidence - Local Structured Sync Agent

**Milestone:** M5 - paired local device, replay-safe cloud projection, approved-plan publication, and selected Second Brain snapshots  
**Date:** 2026-08-10  
**Status:** Complete - automated QA and Product Owner gate passed

## Delivered scope

- One owner-paired, athlete-scoped local device with a credential independent of the browser session and Strava credentials.
- One-time enrolment display, replay detection, re-pair/rotation that revokes the predecessor, explicit revocation, and non-disclosing authentication failures.
- Device-token routes for bounded changes, acknowledgement, safe failure reporting, approved-plan publication, and selected Second Brain snapshot publication.
- Windows DPAPI `CurrentUser` credential protection. The CLI accepts the one-time token only on standard input, never as an argument, vault value, generated note, or repository setting.
- A Windows scheduled-task installer for automatic sync every 5-1440 minutes (15 by default). Its local configuration contains paths, athlete ID, and cloud URL only; the credential remains separately DPAPI protected.
- Bounded initial and cursor-based incremental download of activities, revisions, approved plans, calendar sessions, corrections, and deletions.
- SQLite entity/application transactions followed by an atomic generated-note write and only then durable cursor advancement. Replaying a staged batch is idempotent.
- Missed cloud acknowledgement recovery: after a network failure following local commit, the next empty page re-acknowledges the saved cursor.
- Canonical cloud activities are projected into the existing local activity table, including dedupe mapping, update, and tombstone behavior. Plans, sessions, and revisions remain structured local sync entities.
- Obsidian writes are limited to a visibly owned `racepredictor:cloud-sync` span. Bytes outside the span are preserved.
- Explicit publication of an already approved strict plan; draft plans are rejected and publication appends plan/calendar sync changes.
- `second-brain-context.v1` publication from one explicit structured input with an exact selected-section list. No directory or vault scan exists.
- Logical source references are retained only in local SQLite and are rejected before a cloud write if they contain a path.
- Immutable snapshot revision, content-hash, size, scope, device-status, replay, stale/gap/conflict, and prohibited-field enforcement.
- Online Settings product UI for pair, replace, one-time credential handoff, device status/history, revoke, and the selected-context privacy boundary.
- Dashboard device status now reports device name, paired time, last sync, lifecycle, and safe error state independently of cloud workouts and Second Brain age.

## Authority and privacy boundary

- Neon remains authoritative for cloud activities, approved plan projections, calendars, sync cursors, device hashes, and immutable selected snapshots.
- The local database is a replayable projection. A local failure cannot roll back a Strava event, canonical cloud activity, provider connection, or earlier Second Brain snapshot.
- Obsidian remains authoritative for qualitative source material. RacePredictor receives only the five closed structured sections explicitly selected for a publication.
- Cloud payloads never contain source-note paths, Markdown, attachments, credentials, executable content, raw provider bytes, object keys, or Codex history.
- Snapshot publication and activity ingestion cannot create, approve, activate, replace, or adapt a training plan. The separate plan publisher accepts an already approved `active` or `retired` plan only.

## Automated and product evidence

| Gate | Result |
|---|---|
| Core contract/service suite | PASS - 71/71 |
| Database cloud adapter/migration suite | PASS - 44/44 |
| Web route/security/regression suite | PASS - 64/64 |
| Local analytics/activity/import/coaching/pipeline/sync/Obsidian suite | PASS - 24/24 |
| Existing local desktop/mobile product journeys | PASS - Playwright 11/11 |
| Online dashboard/read-only/pair/revoke product journeys | PASS - Playwright 4/4 |
| TypeScript and production Next.js build | PASS |
| Prisma format, validate, generate, and all-migration replay | PASS |
| Windows DPAPI real save/load/clear round trip | PASS |
| Windows scheduled-task script syntax gate | PASS |
| Dependency audit | PASS - 0 production vulnerabilities |
| Diff whitespace check | PASS; line-ending notices only |

## Product evidence

- Settings shows the existing stale device, replaces it through an owner action, displays the new credential once, and removes it from the page after reload.
- Revocation removes further local-sync access while explicitly confirming that Strava and the browser session are unchanged.
- The local integration journey downloads two pages containing an activity, plan, calendar session, and activity revision; acknowledgement occurs only after the saved cursor.
- A forced note-write failure leaves the cursor unchanged. Replaying the page creates no duplicate entity or generated span.
- A network failure after local commit keeps the cloud and local data intact; the next run resumes at and re-acknowledges the saved cursor.
- Correction and tombstone fixtures update then remove the local activity projection.
- A CRLF user-authored note prefix remains byte-for-byte unchanged around the generated span.
- Selected availability and wellbeing fields publish, while logical source references remain local and an attempted path is rejected before any cloud call.
- Pairing and privacy content remains usable at the 390x844 baseline.

## Risks carried forward

| ID | Risk / deferred item | Required gate |
|---|---|---|
| M5-R01 | Owner-authenticated pairing is proven with injected product identity; the real identity adapter is intentionally absent. | M8 authenticated production smoke |
| M5-R02 | Real Neon concurrent cursor claims and managed-service networking are not credential-free evidence. | M6 concurrency/recovery review and M8 managed smoke |
| M5-R03 | The scheduled task is implemented and syntax-checked but is not installed because its final cloud URL, local paths, and paired credential do not exist yet. | M8 owner setup and live local sync |
| M5-R04 | Automatic post-run AI review/adaptation remains explicitly out of scope. | Separate future Product Owner decision |

No accepted risk permits plaintext credentials, whole-vault upload, arbitrary Markdown mutation, cross-athlete access, production auth bypass, or implicit plan change.

## Milestone decision

QA: **PASS**.  
Product Owner: **PASS - GO for M6**.  
Production activation: **NOT AUTHORISED** until M8.

Detailed gate records: `cloud-strava-sync-m5-qa.md` and `../product/CLOUD_STRAVA_SYNC_M5_ACCEPTANCE.md`.
