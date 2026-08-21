# Milestone 4 Evidence - Online Dashboard and Sync Visibility

**Milestone:** M4 - cloud-authoritative dashboard reads, change feed, and independent freshness visibility  
**Date:** 2026-08-10  
**Status:** Complete - automated QA and Product Owner gate passed

## Delivered scope

- Actor-scoped cloud Activity list/detail/split repositories and APIs with deterministic bounded pagination and safe cursor rejection.
- A bounded athlete-scoped sync-change feed with empty, pagination, replay, correction/deletion tombstone, stale cursor, and foreign-athlete behavior.
- Independent provider, ingestion, activity, local-device, and Second Brain status projections.
- Objective `Never`, `Current`, `Stale`, `Retrying`, `Action required`, and `Unavailable` status rules.
- A cloud dashboard projection that derives live performance estimates and weekly trends from structured canonical activities only.
- An online dashboard shell with distinct loading, ready, empty, stale, and recoverable error behavior.
- Five independently labelled freshness cards; an offline local device or old Second Brain snapshot never makes current cloud workouts appear missing.
- An athlete-scoped, strictly validated cloud projection for previously approved structured training plans.
- Cloud-backed active plan, immutable history, plan detail, Calendar, and Today read APIs.
- Online Plan and Calendar screens are deliberately read-only. Plan creation, approval, and schedule edits remain in the local authoritative coaching workflow and appear online only after structured synchronization.
- A non-production UI fixture seam for online product testing. It selects the online components only; it cannot create an actor, bypass route security, or read cloud data, and is disabled in production.

## Privacy and authority boundary

- Cloud dashboard reads use PostgreSQL adapters and authenticated athlete scope; no production cloud path falls back to local SQLite or Obsidian.
- Training plan projections accept only the existing strict `trainingPlanSchema`, validate athlete/id/version/status/content-hash consistency, and reject inconsistent rows.
- No vault note, arbitrary Markdown, relative path, credential, provider raw body, private object key, or diagnostic stack is exposed.
- Second Brain age is independent of workout freshness. No UI wording claims an activity was AI-reviewed or that a plan was adapted online.
- Existing local plan approval, version history, calendar audit, Today, manual import, and Obsidian behavior remains unchanged.

## Automated evidence

| Gate | Result |
|---|---|
| Core unit/contract/service suite | PASS - 65/65 |
| Database adapter/migration/cloud suite | PASS - 39/39 |
| Web route/security/component/regression suite | PASS - 59/59 |
| TypeScript | PASS |
| Prisma format, validate, client generation | PASS |
| Embedded PostgreSQL applies every forward migration | PASS |
| Production Next.js build after cumulative cloud tests | PASS; dashboard, activity, coaching, status, and change-feed routes present |
| Existing local analytics/activity/import/coaching/pipeline/Obsidian suites | PASS - 18/18 |
| Existing local desktop and 390px product journeys | PASS - Playwright 11/11 |
| New online/offline/read-only/recovery browser journeys | PASS - Playwright 3/3 |
| Dependency audit | PASS - 0 production vulnerabilities |
| Diff whitespace check | PASS; line-ending notices only |

## Product evidence

- The online dashboard renders current performance data while showing the home computer and Second Brain snapshot as stale independent signals.
- A service outage produces a distinct error panel and retry action rather than stale local fallback data.
- Online Plan shows the last explicitly approved structured version and immutable history without proposal or approval controls.
- Online Calendar shows approved sessions but no move/skip/restore controls; it explains where authoritative changes occur.
- Calendar remains usable at the 390px baseline.
- Direct API product tests prove Calendar and Today are built from cloud repositories without instantiating the local coaching service.
- Route and repository tests prove actor A cannot use actor B's resources or cursor, and protected production routes remain closed without an authenticated actor.

## Risks carried forward

| ID | Risk / deferred item | Required gate |
|---|---|---|
| M4-R01 | Online browser journeys use a privacy-safe UI fixture and route fixtures because the real owner identity adapter is intentionally deferred. | M8 owner-authenticated production smoke |
| M4-R02 | Approved plan projection persistence exists, but publication from the local coaching store is M5 scope. | M5 structured local sync |
| M4-R03 | The online dashboard consumes latest canonical activities directly; scheduled recompute/reconciliation operations remain incomplete. | M6 recovery and operations gate |
| M4-R04 | Real Neon query plans and managed-service behavior are not credential-free evidence. | M6 representative-volume review and M8 disposable/production verification |

No accepted risk permits a production authentication bypass, cross-athlete access, local-data fallback, whole-vault upload, provider-secret exposure, or implicit plan change.

## Milestone decision

QA: **PASS**.  
Product Owner: **PASS - GO for M5**.  
Production activation: **NOT AUTHORISED** until M8.

Detailed gate records: `cloud-strava-sync-m4-qa.md` and `../product/CLOUD_STRAVA_SYNC_M4_ACCEPTANCE.md`.

