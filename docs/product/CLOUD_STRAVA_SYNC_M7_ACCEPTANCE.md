# Milestone 7 Formal Product Owner Acceptance

**Review date:** 2026-08-10  
**Decision:** ACCEPTED FOR PRODUCTION VERIFICATION  
**Reviewer:** Product Owner role gate  
**Production-live decision:** Pending Milestone 8  
**Review method:** independent requirement-by-requirement inspection of implementation evidence, cumulative QA, product journeys, privacy, rollback, documentation, milestone decisions, and explicit production dependencies

## Decision meaning

The credential-free release candidate is accepted. Every requirement that can be objectively proven without external accounts is Pass. Items that inherently require Vercel, Neon, R2, Strava, a real owner session, or the real paired computer are marked Ready for production verification rather than incorrectly claimed as Pass.

There is no unresolved release-candidate blocker. Milestone 8 may begin only with the owner's authentication and consent. This decision does not mark the programme complete or authorize broad real-history import.

## Original user requirements

| ID | Requirement | Decision | Objective finding |
|---|---|---|---|
| UR-01 | RacePredictor is online and does not depend on the local computer. | READY FOR M8 | Cloud-backed pages/status and offline-local browser journeys pass; real Vercel deployment and owner session are the bounded M8 proof. |
| UR-02 | Implement Strava first. | PASS | Strava is the only new provider adapter and Settings exposes its lifecycle. No Garmin automatic adapter was added. |
| UR-03 | Retain raw provider payloads in cloud storage. | PASS / M8 LIVE CHECK | Private immutable R2 adapter, checksum/provenance metadata, raw-first ordering, no public/list access, and replay tests pass; live bucket privacy is M8. |
| UR-04 | Send only selected structured Second Brain fields. | PASS | Exact strict v1 sections, closed nested shapes, 64 KiB bound, content hash, immutable revision, and prohibited-field tests pass. |
| UR-05 | Keep the complete Obsidian vault local. | PASS | No scan/upload path exists; logical source references remain local; controlled generated-span tests preserve user bytes. |
| UR-06 | Cloud workouts/plans are authoritative; Obsidian supplies selected context. | PASS | Neon/R2/local authority boundaries, independent retry directions, cloud reads, local projection, and snapshot publication are implemented and tested. |
| UR-07 | One athlete now, future athletes without rearchitecture. | PASS | One-athlete UI plus User/Athlete/Access and athlete-scoped repository/provider/job/object/device/sync/snapshot boundaries pass cross-athlete denial tests. |
| UR-08 | Garmin-specific behavior is not needed now. | PASS | No new Garmin automatic connection, credential, field, metric, or screen was introduced; accepted local import compatibility remains. |
| UR-09 | Keep it free. | PASS / M8 REVALIDATION | No paid service or automatic spend was enabled; daily Hobby-compatible cron and conservative guardrails exist. Current live terms/quotas must be rechecked at M8. |
| UR-10 | Ask only when authentication is required. | PASS | M1-M7 completed with fixtures/test adapters and fail-closed production boundaries. The process has now reached the M8 authentication point. |
| UR-11 | Maintain a visual plan with milestone feedback. | PASS | The M1-M8 Mermaid tracker and evidence table were updated and user feedback was given after every completed milestone. |
| UR-12 | Plan architecture, implementation, automated QA, and product testing for every step. | PASS | Approved architecture, 21-story backlog, test strategy, operations plan, milestone evidence, and release-candidate pack align. |
| UR-13 | Run automated QA and product testing throughout. | PASS | Every milestone has QA/PO evidence; cumulative results are core 77, DB 47, web 68, local 24, browser 15 plus build/Prisma/audit. |
| UR-14 | Product Owner signs off before completion. | PASS FOR M7 | M1-M6 decisions and this formal M7 decision exist. Final production completion still requires the M8 Product Owner gate. |
| UR-15 | Clean architecture/clean code; only needed scope. | PASS | Core ports/use cases, DB adapters, and web composition remain separated. Garmin, multi-athlete UI, whole-vault sync, native mobile, paid services, and autonomous coaching were not added. |
| UR-16 | Preserve explicit coaching approval and plan safety. | PASS | Ingestion/context have no plan mutation path; approved projection only; plan/history/calendar/Today/reminder local and browser regressions pass. |

## Final sign-off checklist

| # | Final requirement | M7 decision | Evidence or exact M8 check |
|---|---|---|---|
| 1 | Online and authenticated on Vercel Hobby | READY FOR M8 | Deploy, authenticate owner, and verify health/dashboard with local agent stopped. |
| 2 | Neon structured authority remains useful while local is offline | READY FOR M8 | Managed migration plus online/offline production smoke. Credential-free cloud/offline journey already passes. |
| 3 | Strava is the only automatic provider | PASS | Provider/UI/source scan and Strava suites. |
| 4 | Create/update/delete/deauthorization/retry/backfill are durable/idempotent | PASS | Core/DB/web provider, webhook, worker, ingestion, and fault suites. |
| 5 | Raw Strava payloads are private R2 objects with provenance | READY FOR M8 | Adapter/integrity tests pass; prove anonymous read/list failure and one live checksum at M8. |
| 6 | Existing CSV/GPX history reconciles without silent merge/loss | READY FOR M8 | All synthetic discrepancy blocks pass; run bounded real shadow comparison before cutover. |
| 7 | One athlete is exposed in MVP | PASS | UI/product inspection. |
| 8 | Future-athlete-safe model and authorization | PASS | Two-athlete contract/repository/route/object/device/snapshot denial evidence. |
| 9 | No Garmin-specific addition | PASS | Scope/source/product review. |
| 10 | Obsidian qualitative authority remains local | PASS | No vault scan/upload; byte-preservation and logical-ref evidence. |
| 11 | Only selected immutable structured snapshots reach cloud | PASS | Contract/publisher/route/repository/full-journey evidence. |
| 12 | No vault, arbitrary notes, paths, secrets, code, or Codex history upload | PASS | Strict schemas, prohibited-field tests, privacy scan, and product copy. |
| 13 | Cloud activities/plans/calendar/revisions sync locally without overwriting notes | PASS | Transaction/cursor/replay/update/tombstone/owned-span integration. |
| 14 | Activity and Second Brain status are independently truthful | PASS | Core status, API, and offline browser journeys. |
| 15 | Context publication cannot mutate plans | PASS | Contract absence, publisher/plan service separation, regression tests. |
| 16 | Existing approval/history/calendar/Today/reminder safety remains | PASS | Local 24 plus web/browser regression evidence and backup restore. |
| 17 | Free-tier guardrails active; no paid/automatic spend | READY FOR M8 FINAL CHECK | Internal measurement/warn/stop and daily cron pass; verify provisioned plans and billing controls. |
| 18 | Automated QA throughout and cumulative gate green | PASS | M1-M6 QA records and M6 cumulative counts. |
| 19 | Product testing includes complete online/offline sync journey | PASS | Synthetic release journey plus 15 responsive browser journeys. |
| 20 | Privacy/deployment/rollback/limitations are documented | PASS | Architecture/API/schema/operations/evidence pack and risk records. |
| 21 | PO decisions M1-M7 and final M8 verification | READY FOR M8 | M1-M7 records exist; final programme PASS cannot be recorded before M8. |

## Accepted production dependencies

| ID | User impact before M8 | Current workaround | Risk | Owner and mandatory follow-up |
|---|---|---|---|---|
| PD-01 | The dashboard is not yet a live authenticated service. | Accepted local product and credential-free fixtures remain usable. | Identity or deployment configuration may block release. | Platform owner: provision Vercel and real owner identity; run anonymous/foreign/signed-in checks. |
| PD-02 | Real workouts do not yet flow through Neon/R2/Strava. | Manual local CSV/GPX history remains available. | Provider/storage/network behavior may differ from adapters. | Platform owner: bounded OAuth/webhook/raw/canonical smoke; no broad backfill. |
| PD-03 | Real existing history has not been shadow-compared. | Synthetic comparisons exercise every known mismatch class. | Unrepresented mismatch could duplicate or omit a workout. | Product Owner: run bounded comparison; any unexplained mismatch blocks cutover. |
| PD-04 | The real Windows computer is not paired or scheduled. | Local workflows remain manual/available. | Device path/DPAPI/task environment may differ. | Device owner: one-time pair, install task, sync, stop agent, and verify freshness/offline behavior. |
| PD-05 | Current free-tier quotas/billing controls are not yet tied to provisioned accounts. | Conservative internal ceilings stop new work early. | Terms may change or the selected account may not qualify. | Platform owner: revalidate official limits and confirm no automatic spend before enablement. |

These are production-verification dependencies, not accepted privacy, security, correctness, or plan-safety exceptions.

## Evidence reviewed

- `../progress/cloud-strava-sync-release-candidate.md`
- `../progress/cloud-strava-sync-m6.md`
- `../progress/cloud-strava-sync-m6-qa.md`
- `CLOUD_STRAVA_SYNC_M1_ACCEPTANCE.md` through `CLOUD_STRAVA_SYNC_M6_ACCEPTANCE.md`
- `../plans/CLOUD_STRAVA_SECOND_BRAIN_ARCHITECTURE.md`
- `../plans/CLOUD_STRAVA_SYNC_TEST_STRATEGY.md`
- `../plans/CLOUD_STRAVA_SYNC_OPERATIONS.md`
- `../adr/0003-cloud-strava-second-brain-sync.md`
- `../ARCHITECTURE.md`, `../API_CONTRACT.md`, `../DB_SCHEMA.md`, `../ROADMAP.md`

## Product Owner decision

**ACCEPTED FOR PRODUCTION VERIFICATION.**

M7 passes. M8 may start only after requesting the owner's authentication/consent. The programme remains incomplete until the bounded production checks pass and the Product Owner records the final M8 decision.
