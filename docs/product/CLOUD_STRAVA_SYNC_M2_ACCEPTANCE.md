# Milestone 2 Product Owner Acceptance - Cloud-Compatible Foundation

**Review date:** 2026-08-10  
**Milestone:** M2 - cloud-compatible foundation  
**Reviewed workspace:** `codex/cloud-strava-sync` at base `d07b9ad` plus the QA-reviewed working-tree implementation  
**Test data:** synthetic two-user/two-athlete fixtures, deterministic local adapters, and embedded PostgreSQL  
**Product Owner decision:** **PASS - GO for Milestone 3**  
**Release decision:** Not approved for deployment or cloud activation; M3-M8 remain required.

## Review Basis

This is an independent requirements review, not an approval of the implementation summary alone. The review used:

- `docs/product/CLOUD_STRAVA_SYNC_BACKLOG.md`
- `docs/product/CLOUD_STRAVA_SYNC_M1_ACCEPTANCE.md`
- `docs/plans/CLOUD_STRAVA_SECOND_BRAIN_ARCHITECTURE.md`
- `docs/plans/CLOUD_STRAVA_SYNC_MILESTONES.md`
- `docs/plans/CLOUD_STRAVA_SYNC_TEST_STRATEGY.md`
- `docs/plans/CLOUD_STRAVA_SYNC_OPERATIONS.md`
- `docs/progress/cloud-strava-sync-m2.md`
- `docs/progress/cloud-strava-sync-m2-qa.md`
- `packages/core/src/contracts`, `packages/core/src/ports`, and `packages/core/test/cloud-contracts.test.ts`
- `packages/db/prisma/schema.prisma`, the M2 migration, and the cloud schema/adapter/migration tests
- `apps/web/lib/server`, `apps/web/proxy.ts`, and `apps/web/test/route-security.test.ts`

The Product Owner also reran `npm run test:cloud` on 2026-08-10. It passed: core 24/24, database cloud 11/11, web 38/38, and web TypeScript. Independent QA separately recorded a passing production build, Prisma validation/generation, all Phase 1 database regressions, browser product regression, dependency audit, privacy/secret scan, and diff hygiene.

## M2 Feature Acceptance Criteria

### Reproducible cloud-compatible environments

| Acceptance criterion | Decision | Evidence and Product Owner finding |
|---|---|---|
| Production-mode build and a Vercel-compatible health endpoint work without live accounts. | PASS | Independent QA records a passing Next.js 16 production build. `apps/web/app/api/v1/health/route.ts` and `apps/web/test/cloud-server-foundation.test.ts` prove a non-sensitive, truthful health response without external credentials. |
| Pooled runtime database access and a separate explicit migration path are supported; migrations do not run at application start. | PASS | `packages/db/prisma/schema.prisma` separates `DATABASE_URL` and `DIRECT_URL`; `packages/db/.env.example`, package scripts, and the operations plan distinguish runtime from deliberate migration execution. No request or startup path invokes migrations. |
| A private R2-like object-storage boundary is testable without credentials and forbids anonymous listing/read. | PASS | `packages/db/src/cloud/in-memory-raw-object-store.js` and `packages/db/test/cloud-adapters.test.js` require athlete scope, validate checksum/key prefix, preserve immutable replay, bound signed access, and expose no anonymous list/read operation. The real R2 adapter remains M3/M8 work. |
| Development and preview boundaries cannot reference production credentials, athlete data, object keys, or device credentials. | PASS | `apps/web/lib/server/cloud-environment.ts`, server-only composition, `.env` ignore rules, and environment/redaction tests expose only non-secret feature state. The operations plan keeps preview cloud-disabled and prohibits production data or credentials. |
| Secret names, owners, rotation, and local/test substitutes are documented without values in Git. | PASS | `docs/plans/CLOUD_STRAVA_SYNC_OPERATIONS.md` contains the secret inventory, owner, first-use milestone, rotation procedure, and substitute policy. Independent QA's tracked-secret scan passed. |
| Build, migration, feature-disable, recovery, and rollback behavior are exercised and evidenced. | PASS | The production build and embedded PostgreSQL migration pass; the migration test proves failed multi-write rollback; route-security tests prove cloud-enabled fail-closed and cloud-disabled local behavior; the operations plan defines additive forward recovery and non-destructive feature containment. |
| Free-tier assumptions and measurable warning thresholds are documented for later verification. | PASS | The operations plan records Vercel Hobby, Neon Free, R2, Strava, and queue assumptions as unverified planning inputs, requires M8 revalidation, and requires conservative warning thresholds before activation. |

### Owner authentication and athlete-scoped authorization

| Acceptance criterion | Decision | Evidence and Product Owner finding |
|---|---|---|
| Anonymous visitors cannot read or mutate protected health, coaching, provider, sync, raw-object, or snapshot data. | PASS | `apps/web/test/route-security.test.ts` inventories all 23 API route files, classifies only health/session as public, and requires wrappers on all 21 sensitive handlers. Representative activity, dashboard, import, coaching, API-boundary, and dashboard-page requests fail before local operations. |
| One owner, one athlete, and one access relationship are supported without signup, invitations, role management, or athlete switching. | PASS | `User`, `Athlete`, and `AthleteAccess` are present in the Prisma schema and migration. No multi-athlete product controls or account-management UI were added. |
| Every new owned cloud entity is athlete-scoped directly or through an enforced parent. | PASS | Schema and migration tests cover provider connections, webhook events, jobs, raw objects, activity source/revisions, sync changes, paired devices, and snapshots. Composite foreign keys reject a cross-athlete source relation. |
| Cloud repositories and application operations receive actor and athlete scope; no global-athlete path can execute in cloud mode. | PASS | Core ports accept athlete scope, and cloud adapters enforce it. The security wrapper passes `ActorContext` only to explicitly actor-scoped handlers; existing local/global handlers return the same non-disclosing `503` for every authenticated athlete before execution. Local-only Phase 1 behavior remains available only with cloud mode disabled. |
| A synthetic actor cannot access, mutate, infer, or obtain object access for another athlete. | PASS | Actor, object-store, job, sync, snapshot, route, and PostgreSQL tests use separate athlete A/B fixtures and reject forged or cross-athlete access. Athlete-local cursors avoid leaking another athlete's volume. |
| Session, device, and provider credentials are protected, revocable where represented, and absent from client output/log evidence. | PASS | Provider credentials use a versioned AES-256-GCM envelope bound to athlete/provider; device credentials are represented only by hashes and revocation state; no real session credential exists in M2. Tamper, wrong-key, wrong-athlete, schema-column, health/session redaction, and secret-scan evidence passes. Real session lifecycle remains an M8 gate. |
| Authentication failures are stable and non-disclosing, and production never falls back to local unauthenticated behavior. | PASS | Route-security and server-foundation tests assert standard `401`/`503` envelopes. Headers, environment declarations, and synthetic resolver injection cannot create a production actor. Cloud mode never falls back to local handlers. |

### Athlete-scoped persistence and migrations

| Acceptance criterion | Decision | Evidence and Product Owner finding |
|---|---|---|
| Migrations add only the required cloud entities and preserve canonical activity, split, weekly feature, plan, and calendar concepts. | PASS | `packages/db/prisma/migrations/20260810120000_cloud_athlete_scoped_sync/migration.sql` is additive. The existing canonical and coaching models remain; Phase 1 unit, integration, and browser regressions pass. |
| Provider activity uniqueness includes athlete, provider, and provider activity identifier. | PASS | `ActivitySourceReference` and its tested scoped uniqueness/relations prevent provider retry from creating a duplicate source reference across the same athlete/provider/source object. |
| Raw-object records contain scoped provenance/checksum metadata but no raw body in Neon. | PASS | `RawObject` stores athlete/provider, storage key, kind, checksum, content type, size, version, capture, and processing metadata. Cloud schema and embedded PostgreSQL tests reject prohibited raw body/payload columns. |
| Webhook/job state is durable, retryable, terminal, and diagnostically safe. | PASS | Schema fields cover athlete-scoped idempotency, status, attempt, availability, terminal state, and diagnostic code. The deterministic queue tests prove enqueue replay, claim, retry delay, completion, terminal failure, and cross-athlete denial without raw payloads or secrets in diagnostics. |
| Sync changes are append-only in use and use a monotonic athlete-local cursor. | PASS | `(athleteId, cursor)` is unique. Sync adapter tests prove independent cursor `1` for two athletes, ordered listing, monotonic acknowledgement, replay, and forged-scope denial. |
| Second Brain snapshots are immutable, scoped, versioned, hash-checked, and resolve a latest accepted revision. | PASS | The strict repository rejects wrong hashes, unknown prose, cross-athlete writes, conflicting/stale/skipped revisions, and duplicate content; identical revision/hash replay is reused. Prisma uniquely scopes revision and content hash, and the latest query is deterministic. |
| Persistence tests cover forward migration, constraints, replay, transaction rollback, cross-athlete isolation, and Phase 1 compatibility. | PASS | Embedded PostgreSQL applies every migration, preserves a legacy athlete-scoped row, rejects invalid tenant relations and duplicate local cursors, and rolls back a failed multi-write transaction. Cloud adapter replay tests and the complete local regression suite provide the remaining compatibility evidence. |

## Original QA Blockers and Remediation Review

| QA finding | Final decision | Evidence |
|---|---|---|
| Sensitive legacy API routes and dashboard pages initially bypassed authentication. | RESOLVED | All 21 sensitive handlers use `withSensitiveRoute`; Proxy protects `/api/v1/:path*` and `/dashboard/:path*`; route inventory and representative read/write tests pass. |
| Authentication alone initially allowed legacy global-athlete operations to remain unsafe. | RESOLVED | Cloud mode blocks every legacy handler before execution with identical `503` responses. Only explicit `cloudHandling: actor-scoped` operations receive the actor's active athlete. |
| Plain Prisma validation lacked the local `DIRECT_URL` example. | RESOLVED | `packages/db/.env.example` and operations documentation include separate runtime/migration placeholders; QA records passing plain validate/generate. |
| Incremental Next.js type metadata made the serial cloud-test/build gate stale. | RESOLVED | Web gate caching was corrected; QA records the exact `test:cloud` then production-build sequence passing. |
| One Playwright locator matched both a heading and loading copy. | RESOLVED | The locator now uses the exact accessible name; the affected journey passes. QA classified this as test-only, with no product defect. |

## Milestone 2 Product Owner Gate

| Gate criterion | Decision | Evidence and finding |
|---|---|---|
| Production shell and health work in local/isolated CI without accounts. | PASS | Production build and safe health tests pass without live services. |
| Anonymous and cross-athlete attempts fail in automated and product-level tests. | PASS | Handler, Proxy, actor, repository, object, queue, sync, snapshot, and PostgreSQL negative paths pass. |
| Existing Phase 1 journeys and data remain intact after migration. | PASS | Additive migration preserves legacy ownership data; local analytics/activity/import/pipeline/coaching/Obsidian suites and browser journeys pass. |
| Secrets are absent from source, logs, screenshots, and fixtures; production names are documented for M8. | PASS | Secret/privacy scan and redaction tests pass; the M8 inventory contains names and rotation rules only. |
| Build, migration, feature-disable, rollback, and free-tier evidence is recorded. | PASS | `docs/progress/cloud-strava-sync-m2.md`, independent QA, migration tests, route-security tests, and the operations plan provide the required evidence. |
| Product Owner decision and evidence are recorded before M2 is accepted. | PASS | This document records the independent decision, scope, evidence, risks, and next gate. |

## Product Constraints Carried Forward

| Approved constraint | M2 decision |
|---|---|
| Online RacePredictor must ultimately work while the local computer is off. | PASS for M2 scope: the cloud authority/runtime seams exist; the usable cloud dashboard remains M4. |
| Strava first; Garmin-specific work is excluded. | PASS: Strava is additive and is the only provider enum/plan for this programme; no Garmin cloud capability was added. |
| Raw provider payloads stay in private cloud object storage. | PASS: storage ports and metadata-only Neon schema enforce this boundary; real R2 implementation is M3/M8. |
| RacePredictor receives only selected structured Second Brain fields. | PASS: the five-section `second-brain-context.v1` contract is strict, bounded to 64 KiB, hashable, athlete-scoped, and rejects prose, paths, attachments, vault data, and plan mutations. |
| One athlete now without future rearchitecture. | PASS: actor, access, schema, repository, object, job, cursor, and snapshot boundaries are athlete-scoped while the UI remains single-athlete. |
| Existing approval/plan safety remains intact. | PASS: context/ingestion contracts expose no plan mutation; Phase 1 proposal, approval, version, calendar, and Today regressions remain green. |
| Stay free and require owner authentication only at the external provisioning gate. | PASS: M2 used no external credentials or paid resource. Current free-tier assumptions are explicitly deferred for M8 verification. |

## Risks and Deferred Work

| ID | Risk / deferred item | Blocking M3? | Owner and required gate |
|---|---|---|---|
| M2-R01 | Deterministic storage/queue adapters can differ from managed R2 and the selected queue. | No | Engineering validates real Strava/R2/job behavior in M3; DevOps revalidates managed services in M8. |
| M2-R02 | No real owner identity adapter or session lifecycle exists; production correctly remains inaccessible. | No | Authentication/DevOps implements and proves the real identity path in M8 before any cloud activation. |
| M2-R03 | The online dashboard still uses no actor-scoped cloud data source. | No | M4 replaces blocked legacy cloud reads and proves offline-local-machine behavior and freshness wording. |
| M2-R04 | The full local cursor agent and controlled Obsidian publisher do not exist yet. | No | M5 implements transactional replay, device revocation, selected-field publication, and generated-span preservation. |
| M2-R05 | Free-tier quotas, provider approval, regions, retention, and commercial terms remain unverified external assumptions. | No | M6 defines observable guardrails; M8 verifies current provider terms and thresholds before enabling services. |
| M2-R06 | The reviewed implementation is currently an uncommitted working tree based on `d07b9ad`. | No for starting M3; yes for release/merge traceability | Project Manager/DevOps must commit the accepted workspace, rerun required gates, and attach the resulting immutable revision before merge or deployment. |

No accepted risk weakens tenant isolation, Second Brain privacy, credential protection, plan safety, or fail-closed production behavior. No M2 exception is required.

## Product Owner Decision

**PASS - GO for Milestone 3.**

Milestone 2 has met every applicable approved acceptance criterion. It establishes a credential-free, athlete-scoped, privacy-bounded, replay-safe foundation while keeping cloud functionality fail-closed and preserving the accepted local Phase 1 product.

This decision authorizes M3 implementation of Strava OAuth, webhook receipt, durable ingestion, raw retention, normalization, bounded backfill, and reconciliation using synthetic/test adapters. It does not authorize production deployment, real Strava/R2/Neon/Vercel credentials, cloud dashboard activation, additional-athlete UI, Garmin integration, whole-vault sync, paid services, or autonomous plan changes.

**Product Owner:** Product Owner agent, independent M2 requirements review  
**Decision date:** 2026-08-10  
**Decision:** PASS  
**Next gate:** Milestone 3 - Strava automatic ingestion
