# Milestone 1 Product Owner Acceptance — Cloud Strava and Selected Second Brain Sync

**Review date:** 2026-08-10  
**Milestone:** M1 — Requirements, architecture, and test strategy  
**Product Owner decision:** **PASS — approved to proceed to Milestone 2**  
**Release blockers:** None for Milestone 1  
**Decision scope:** Planning and architecture acceptance only; this is not approval of implemented cloud behavior, external provisioning, or production release.

## Review Basis

The Product Owner independently reviewed Milestone 1 against the user-approved requirements and the M1 gate in `docs/product/CLOUD_STRAVA_SYNC_BACKLOG.md`.

Primary evidence:

- `docs/adr/0003-cloud-strava-second-brain-sync.md`
- `docs/plans/CLOUD_STRAVA_SECOND_BRAIN_ARCHITECTURE.md`
- `docs/plans/CLOUD_STRAVA_SYNC_TEST_STRATEGY.md`
- `docs/plans/CLOUD_STRAVA_SYNC_MILESTONES.md`
- `docs/product/CLOUD_STRAVA_SYNC_BACKLOG.md`
- `docs/CONTEXT.md`
- `docs/ARCHITECTURE.md`
- `docs/API_CONTRACT.md`
- `docs/DB_SCHEMA.md`
- `docs/UI_UX_SPEC.md`
- `docs/ROADMAP.md`
- `docs/progress/sdlc-progress.md`

Relevant accepted baseline evidence supplied to this review:

- Core tests: 15/15 passed.
- Web tests: 22/22 passed.
- Web typecheck: passed.
- Local Garmin pipeline regression: 3/3 passed.
- Local coaching regression: 6/6 passed.
- Repository diff check: passed; line-ending warnings are non-failing workspace warnings.

These baseline results show that the accepted local product remained stable before cloud implementation. They do not claim that any M2–M8 cloud capability is implemented or tested.

External contract checks used only to validate planning assumptions:

- Strava's official webhook contract supports activity create/update/delete and athlete deauthorization events, requires acknowledgement within two seconds, and separates callback validation from asynchronous processing: https://developers.strava.com/docs/webhooks/
- Neon currently publishes a Free plan: https://neon.com/pricing
- Cloudflare R2 currently publishes included free Standard-storage usage and S3-compatible access: https://developers.cloudflare.com/r2/pricing/
- Vercel documents the Hobby plan and its restrictions: https://vercel.com/docs/accounts/plans/hobby

## User Requirement Acceptance Matrix

| ID | Approved requirement | Decision | Evidence and Product Owner finding |
|---|---|---|---|
| UR-01 | RacePredictor itself must be online and must not depend on the local computer being on. | PASS | ADR 0003 makes Neon/cloud APIs authoritative and the architecture requires online dashboard reads to continue while the local agent is offline. M4 and M8 contain objective offline-dashboard product checks. |
| UR-02 | Implement Strava first for automatic activity ingestion. | PASS | Strava is the only provider implementation in ADR 0003, architecture, backlog, roadmap, and milestones. OAuth, bounded backfill, webhook lifecycle, retries, raw retention, normalization, and reconciliation have explicit M3 acceptance evidence. |
| UR-03 | Retain raw provider payloads in cloud storage. | PASS | Private Cloudflare R2 is the selected raw store; Neon stores checksum/provenance metadata only. Athlete authorization, immutability, checksum verification, and short-lived access are specified and testable. |
| UR-04 | RacePredictor receives only selected structured Second Brain fields. | PASS | `second-brain-context.v1` has five closed optional sections, exact nested allow-lists, cardinality/value limits, a 64 KiB ceiling, strict unknown-field rejection, canonical hashing, and immutable monotonic revisions. There is no arbitrary free-text field. |
| UR-05 | The complete Obsidian vault remains local. | PASS | The ADR, architecture, context, API, UX, backlog, and test strategy prohibit Markdown, note bodies/titles, backlinks, attachments, vault identity, local paths, credentials, and arbitrary note metadata from crossing the boundary. Local and cloud validation are both required. |
| UR-06 | Cloud structured workouts and plans remain authoritative while local Obsidian supplies selected context. | PASS | Authority is explicitly separated among Neon, R2, Obsidian, and the local SQLite projection. Cursor pull is cloud-to-local; selected snapshot publication is local-to-cloud. Failures in one direction cannot undo the other. |
| UR-07 | Implement one athlete now but avoid a future multi-athlete rearchitecture. | PASS | The product exposes one owner/athlete and no athlete-management UI. `User`, `Athlete`, `AthleteAccess`, athlete-scoped repositories, provider connections, jobs, objects, sync cursors, devices, and snapshots are required now, with two-actor/two-athlete negative tests planned throughout. |
| UR-08 | Garmin-specific behavior is not essential in this phase. | PASS | Garmin integration, credentials, metrics, fields, and UI are explicitly out of scope. The existing Garmin/manual pipeline is retained only as regression and reconciliation history. |
| UR-09 | Keep the solution free for now. | PASS | Vercel Hobby, Neon Free, and R2 Standard free usage are the only approved production services. The plan requires thresholds, safe degradation, no automatic paid upgrade/spend, and M8 verification against then-current terms. |
| UR-10 | Ask the user only when authentication is required. | PASS | M1–M7 use fail-closed boundaries, synthetic actors, fixtures, and test adapters. External account choice, login, consent, DNS, and credentials are isolated to M8 and visibly marked Authentication required. |
| UR-11 | Show a visual plan and update it after every milestone. | PASS | `CLOUD_STRAVA_SYNC_MILESTONES.md` contains the M1–M8 visual tracker, status table, feedback cadence, evidence fields, and state legend. It truthfully shows M1 In review, M2–M7 Planned, and M8 blocked until authentication is requested. |
| UR-12 | Plan architecture, implementation, automated QA, and product testing for every step. | PASS | The backlog supplies 21 bounded implementation-ready stories; the architecture assigns clean-layer responsibilities; the test strategy maps test design and exit evidence across all eight milestones; the progress and roadmap documents share the same sequence. |
| UR-13 | Run automated QA and product testing throughout, especially at milestone completion. | PASS | Each milestone has planned lower-layer automation, cumulative regression, critical product journeys, failure evidence, and a PO evidence review. Testing is not deferred to M6; M6 is the cumulative hardening gate. |
| UR-14 | Product Owner must sign off against requirements before completion. | PASS | Every milestone has a PO gate. M7 requires requirement-by-requirement release-candidate acceptance, and M8 requires a final review of production-only evidence before the programme can be marked complete. |
| UR-15 | Follow clean architecture and clean code; implement only needed scope. | PASS | Core owns contracts/use cases/ports, database packages own persistence/projection, and the web app composes adapters and renders prepared view models. Garmin, multi-athlete UI, whole-vault sync, autonomous coaching changes, paid services, native mobile, and speculative ML/plugin work are excluded. |
| UR-16 | Preserve existing coaching approval and plan safety. | PASS | Activity ingestion and selected context publication have no route or state transition that can approve, activate, adapt, replace, or edit a plan. Existing explicit approval, immutable plan, calendar audit, Today, and reminder regressions remain mandatory. |

## Milestone 1 Backlog Gate

| Gate criterion | Decision | Evidence |
|---|---|---|
| Authority boundaries match all approved requirements and preserve plan safety. | PASS | ADR 0003 authority table/decision, architecture authority table and conflict rules, CONTEXT cloud addendum, negative plan-state tests in the strategy. |
| MVP and out-of-scope boundaries reject Garmin-specific, multi-athlete UI, paid-service, and whole-vault expansion. | PASS | Backlog explicit MVP/out-of-scope sections, ADR alternatives/consequences, CONTEXT and ROADMAP deferrals. |
| API and snapshot contracts are versioned, additive, testable, and privacy-bounded. | PASS | Additive `/api/v1` families are identified; `second-brain-context.v1` has an exact closed shape, hash/revision semantics, error behavior, limits, fixtures, and a contract-test matrix. Implementation of those contracts is correctly scheduled from M2 onward. |
| Visual tracker and milestone evidence process exist and show truthful status. | PASS | Milestone plan diagram/table and progress document agree on current and future states; M8 alone is owner-authentication dependent. |
| M1 automated and document checks pass. | PASS | Supplied baseline regression counts and web typecheck pass; current `git diff --check` passes. The test strategy defines the required cloud contract/document matrix for implementation milestones and does not misrepresent it as already executed. |
| Product Owner decision and evidence are recorded before M1 is accepted. | PASS | This requirement-by-requirement review records the evidence, risks, decision, reviewer role, and date. |

## Risks and Gaps

| ID | Risk or gap | Severity for M1 | Treatment and later gate |
|---|---|---|---|
| RG-01 | Real Vercel, Neon, R2, DNS, identity, and Strava application behavior has not been exercised. | Non-blocking; expected | Owner-authenticated provisioning and bounded live smoke are intentionally M8. M1 approval does not imply those checks pass. |
| RG-02 | Free-tier limits, billing terms, platform availability, and Strava capacity/rate limits can change. R2 included usage is not an unlimited hard storage guarantee. | Non-blocking; monitored | M6 requires measurable thresholds and safe degradation; M8 re-verifies current plans, prevents automatic paid upgrades/spend, and blocks completion if the free operating boundary cannot be maintained. |
| RG-03 | Cloud contract, schema, repository, adapter, sync-agent, and UI tests do not exist yet. | Non-blocking; planned work | This is the intended boundary of the docs-first M1. M2–M5 cannot pass on design evidence; they require the exact automated and product evidence in the strategy. |
| RG-04 | Existing `docs/PRODUCT.md` remains explicitly v1/local in scope rather than duplicating the active Phase 2 programme. | Low; non-blocking | `docs/CONTEXT.md` is the declared source of truth and explicitly distinguishes the accepted local Phase 1 baseline from active Phase 2. Cloud documents, roadmap, architecture, API, schema, UX, and progress are aligned. Add a cross-reference if future readers misinterpret the v1 document as current Phase 2 scope. |
| RG-05 | Production identity-provider selection/configuration and external credential ownership remain unset. | Non-blocking; intentionally deferred | M2 implements and tests fail-closed `ActorContext` and authorization seams. M8 is the only owner-interruption point and must prove the real adapter before production acceptance. |
| RG-06 | Synthetic fixtures cannot reveal every reconciliation difference between real Strava history and prior CSV/GPX exports. | Non-blocking; controlled | M6 performs privacy-safe shadow rehearsal. M8 uses a bounded reversible production activity/backfill and blocks broad cutover on unexplained discrepancies. |

No risk above removes a required M1 decision, weakens a privacy or plan-safety boundary, or prevents the M2 foundation from being implemented and tested. Therefore none is a Milestone 1 release blocker.

## Product Owner Decision

**Decision: PASS — Milestone 1 is accepted and Milestone 2 may begin.**

The requirements, architecture, privacy boundary, versioned snapshot shape, future-athlete seams, milestone plan, implementation stories, automated QA strategy, product-test strategy, and sign-off process are sufficiently specific and mutually consistent for the cloud foundation to proceed.

This approval is deliberately narrow:

- It approves the M1 planning/architecture gate.
- It does not assert that cloud ingestion, online reads, local sync, or deployment exists.
- It does not authorize Garmin-specific work, additional athletes, whole-vault transfer, paid services, or autonomous plan changes.
- It does not waive any later automated, product, security, privacy, migration, rollback, or production smoke gate.

**Product Owner:** Product Owner agent, independent M1 requirements review  
**Decision date:** 2026-08-10  
**Accepted gaps:** RG-01 through RG-06 as non-blocking risks with mandatory later gates  
**Next gate:** Milestone 2 — cloud-compatible contracts, tenant-safe persistence, fail-closed authentication, storage, queue, sync, and test-harness foundations.
