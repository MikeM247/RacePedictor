# Milestone 6 Evidence - End-to-End QA and Hardening

**Milestone:** M6 - recovery, observability, free-tier guardrails, shadow comparison, rollback, and cumulative release-candidate QA  
**Date:** 2026-08-10  
**Status:** Complete - automated QA and Product Owner gate passed

## Delivered scope

- Daily free-tier recovery through Vercel Cron using its standard `GET` and `CRON_SECRET` contract. A manually authenticated `POST` uses the same boundary.
- One stable 48-hour reconciliation window per connected athlete, bounded to 25 athletes, 25 claimed jobs, three provider pages, and 90 activities per athlete/run.
- Existing durable job recovery for due retries, interrupted/stale leases, fenced settlement, finite attempts, terminal state, and dead letter.
- Durable usage measurements for private raw bytes, structured database bytes, daily invocations, daily measured transfer, and Strava 15-minute/daily requests.
- Conservative internal planning ceilings with warning at 70% and a hard stop at 85%. A hard stop schedules and processes no new automatic work and preserves accepted data.
- Owner-visible operations status with measured, warning, hard-stop, and supported-action values. Provider, ingestion, activity, local-device, and Second Brain freshness remain independent.
- A strict shadow comparator for source identity/dedupe, start time, distance, duration, split count, and weekly totals. Every discrepancy is an explicit release block.
- A synthetic release journey from webhook receipt and immutable raw capture through canonical mapping, online dashboard, local sync, selected Second Brain publication, cloud outage, and local recovery.
- A backup/restore rehearsal that preserves the approved local plan, Today brief, reminder preference, and synced activity.
- Browser-facing Strava connect, current/action-required/disconnected status, secure OAuth handoff, and disconnect. Disconnect preserves accepted workout and raw history.
- Feature rollback through the existing cloud and Strava ingestion flags; disabled processing does not delete cloud/local records or weaken authentication.

## Cumulative evidence

| Gate | Result |
|---|---|
| Core contracts, services, recovery, shadow, provider, worker, and ingestion | PASS - 77/77 |
| Cloud database, migration, adapter, worker, operational, and full-journey integration | PASS - 47/47 |
| Web route, security, provider, device, operations, and regression | PASS - 68/68 |
| Local analytics/activity/import/coaching/pipeline/sync/Obsidian compatibility | PASS - 24/24 |
| Local desktop/mobile Playwright journeys | PASS - 11/11 |
| Online desktop/mobile Playwright journeys | PASS - 4/4 |
| Production Next.js build and TypeScript | PASS |
| Prisma format, validate, generate, and all-migration replay | PASS |
| Dependency audit | PASS - 0 production vulnerabilities |
| Secret-pattern review | PASS - only one deliberately synthetic redaction fixture matched |
| Diff whitespace check | PASS; line-ending notices only |

## Product evidence

- Settings completes a synthetic Strava disconnected -> OAuth handoff -> connected -> disconnected journey and explains that disconnect preserves accepted history.
- The online dashboard remains useful while the local computer and selected Second Brain snapshot are stale or offline.
- Online Plan and Calendar remain read-only at desktop and 390x844 widths; ingestion still cannot approve, adapt, or mutate a plan.
- Operations warning values and owner action are visible in Settings without identifiers, tokens, raw keys, or diagnostic payloads.
- The synthetic release journey retains exact webhook bytes privately, maps strict provider fields to one canonical workout, derives cloud dashboard data, downloads to SQLite/Obsidian, publishes only availability and wellbeing, then proves local workout/plan/Today/reminder access during a cloud outage.
- Shadow comparison passes representative Strava/CSV/GPX parity and proves every missing, ambiguous, duplicate, timing, distance, duration, split, or weekly discrepancy blocks release.

## Defects found and resolved

| Finding | Resolution |
|---|---|
| The recovery route was initially POST-only with a custom secret name, which did not match Vercel Cron. | Added the Vercel `GET` route, standard `CRON_SECRET`, and a once-daily Hobby-compatible schedule; retained protected POST for operator recovery. |
| The cumulative local Playwright run exposed cold compilation as a fixed 10-second UI assertion failure. | Wait for and validate the actual context-publication response with a bounded 60-second request wait; full suite then passed. |
| The provider routes were complete but the online product had no connect/status/disconnect controls. | Added a minimal Settings panel and responsive browser journey covering the owner workflow and preservation message. |
| A legacy live normalization script attempted the configured external database and could not reach it. | No credential bypass was added. Embedded PostgreSQL migration and all credential-free integration gates pass; live managed-database smoke remains M8. |

## Risks carried forward

| ID | Risk / dependency | Required gate |
|---|---|---|
| M6-R01 | Vercel Hobby recovery runs once per day with hourly precision and no platform retry; immediate webhook acceleration plus durable Neon state are designed to cover normal delivery and the next daily run recovers missed work. | M8 production logs and bounded missed-work smoke |
| M6-R02 | Real Neon two-connection contention and managed networking cannot be proven with the single-process embedded PostgreSQL gate. | M8 managed concurrency/recovery smoke |
| M6-R03 | Privacy-safe fixtures cannot represent every difference in the owner's real CSV/GPX/Strava history. | M8 bounded shadow comparison; any discrepancy blocks cutover |
| M6-R04 | Real owner sessions, provider consent, storage access, and local-device installation are intentionally not configured. | M8 authentication and provisioning |

No accepted risk permits automatic spend, cross-athlete access, plaintext credentials, public raw objects, whole-vault upload, destructive rollback, or implicit plan change.

## Milestone decision

QA: **PASS**.  
Product Owner: **PASS - GO for M7**.  
Production activation: **NOT AUTHORISED** until M8.

Detailed records: `cloud-strava-sync-m6-qa.md`, `cloud-strava-sync-release-candidate.md`, and `../product/CLOUD_STRAVA_SYNC_M6_ACCEPTANCE.md`.
