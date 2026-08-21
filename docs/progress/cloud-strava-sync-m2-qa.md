# Milestone 2 Independent QA Gate

## QA Result

**PASS**

Milestone 2 satisfies its cloud-foundation acceptance criteria after independent QA found and the delivery team remediated four gate issues: unprotected legacy routes/pages, a missing local `DIRECT_URL` example, stale incremental Next.js type metadata, and an ambiguous Playwright locator. The final implementation fails closed in production/cloud mode, preserves the cloud-disabled Phase 1 workflow, and passes the applicable contract, persistence, security, migration, build, regression, and product-journey checks.

This is approval to complete **M2 only** and proceed to M3. It is not approval to enable cloud mode in production or provision external services.

## Acceptance Criteria Check

| Criterion | Evidence | Result |
|---|---|---|
| Production-compatible shell and health endpoint build without live cloud accounts | `npm run build` completes with Next.js 16 Proxy and all application/API routes; health configuration tests verify truthful `ok`/`degraded` states and secret redaction | PASS |
| Runtime and migration database connections are separated | Prisma schema uses `DATABASE_URL` and `DIRECT_URL`; `.env.example` documents both; plain Prisma validate and generate complete locally | PASS |
| Migrations are explicit rather than application-start side effects | Migration commands are separate scripts and the operations runbook requires deliberate deploy; no application startup path runs migrations | PASS |
| Private object-storage behavior is testable without R2 credentials | `InMemoryRawObjectStore` requires athlete scope, checksum and athlete/provider key prefix; it has no anonymous list/read path, limits signed access to 900 seconds, and preserves immutable replay | PASS |
| Environment boundaries and secret inventory are safe | Server-only environment projection exposes no connection strings or credentials; ignored local environment files are confirmed; tracked-secret pattern scan passes; operations plan names ownership and rotation without values | PASS |
| Build, feature-disable, migration, recovery, and rollback procedures are reproducible | Operations plan records feature gates, additive migration workflow, forward recovery, and non-destructive rollback; embedded PostgreSQL applies every migration and verifies rollback behavior | PASS |
| Free-tier assumptions and warning policy are documented for later verification | Vercel, Neon, R2, Strava, and queue assumptions are explicitly marked as planning assumptions with an M8 revalidation and conservative warning-threshold requirement | PASS |
| Anonymous visitors cannot read or mutate sensitive online data | Next Proxy protects `/dashboard/:path*` and `/api/v1/:path*`; 21 of 23 API route files are classified sensitive and independently wrapped; health and session are the two explicit public routes; representative reads and writes return stable `401` before local operations | PASS |
| Production cannot gain an actor from headers, environment declarations, or synthetic test injection | Production composition ignores synthetic resolvers; hostile header/environment tests remain unauthenticated even when auth is declared configured | PASS |
| Legacy local/global operations cannot become cross-athlete cloud paths | Authenticated cloud requests to legacy handlers and dashboard pages receive identical non-disclosing `503` responses before the handler executes; only an explicit `cloudHandling: actor-scoped` opt-in receives `security.actor.activeAthleteId` | PASS |
| One-owner data model allows future athletes without exposing multi-athlete product controls | `User`, `Athlete`, and `AthleteAccess` exist; owned cloud records and composite relations are athlete-scoped; no signup, invitation, role-management, or athlete-switching UI was added | PASS |
| Cross-athlete reads, mutations, existence inference, and object access are denied | Two-athlete actor, object, job, sync, snapshot, and PostgreSQL composite-FK tests reject forged/cross-tenant access; legacy handler responses do not disclose resource existence | PASS |
| Provider credentials are protected and revocable by design | AES-256-GCM envelope uses versioned keys plus athlete/provider authenticated binding; tamper/wrong-key/wrong-athlete tests fail; schema contains no plaintext token-shaped fields | PASS |
| Raw provider bodies remain outside Neon | `RawObject` stores athlete/provider, storage key, kind, checksum, size, type, version, and capture metadata only; schema tests reject raw body/payload columns | PASS |
| Ingestion state is durable and safe to replay | Schema persists scoped event/job state, attempts, availability/terminal status, and diagnostic codes; adapter tests prove scoped idempotency, retry, completion, failure, and terminal replay behavior | PASS |
| Sync cursors are monotonic and athlete-local | `(athleteId, cursor)` uniqueness and independent two-athlete cursor/acknowledgement tests prevent another athlete's volume from being inferred | PASS |
| Second Brain input is a strict selected-field channel | `second-brain-context.v1` accepts only availability, training preferences, structured constraints, bounded wellbeing check-ins, and bounded activity reflections; strict schemas reject prose, unknown fields, paths, attachments, vault material, and plan mutations | PASS |
| Second Brain snapshots are immutable, versioned, scoped, and integrity checked | Snapshot repository validates deterministic SHA-256 content, exact selected-field parity, monotonic revision, idempotent replay, stale/conflicting revisions, and athlete ownership; schema uniquely scopes revision and content hash | PASS |
| Existing Phase 1 data and product journeys remain intact | Forward migration preserves a legacy row before tenant FKs; local analytics, activity, import, pipeline, coaching, and Obsidian tests pass; browser journeys cover Today, Plan approval/history, Calendar, Settings, imports, error states, and 390 px behavior | PASS |
| M2 remains credential-free | All gate checks use synthetic data, in-memory adapters, and embedded PostgreSQL; real Vercel, Neon, R2, Strava, queue, and identity authentication remain gated to later milestones | PASS |

## Issues Found

### Blocking defects found and remediated during QA

- **[Resolved, Critical] Sensitive application surfaces were initially not using the authentication seam.** Activities, dashboard, coaching, and import handlers could execute without authentication. All 21 sensitive API routes now have handler-level protection, and Proxy also protects the dashboard and API front door. A route-inventory test fails if a future route is not explicitly classified.
- **[Resolved, High] Authentication alone initially left legacy global-athlete operations unsafe for a future authenticated actor.** Cloud/production now blocks those handlers with a non-disclosing `503` before execution. Only handlers explicitly proven actor-scoped can opt in; tests use separate athlete A and B actors and assert zero legacy operation calls.
- **[Resolved, High] Plain Prisma validation initially failed because `DIRECT_URL` was absent from the local example/configuration.** The example and database documentation now define pooled/runtime versus direct/migration use. Plain validate and generate pass.
- **[Resolved, High] The first `test:cloud` then `build` sequence exposed stale `.next/dev/types` entries retained by TypeScript incremental metadata.** Web gate incremental caching is disabled so type and build gates evaluate the live generated type set. The exact serial sequence now passes.
- **[Resolved, Test-only] One post-change Playwright run matched both `Today` and `Loading today's coaching...`.** The locator now uses the exact accessible name; the affected scenario passes. No product behavior changed.

### Open defects

- None blocking M2 completion.

## Validation Summary

- **Cloud gate:** PASS — `npm run test:cloud` in the final serial run.
  - Core contracts/domain: **24/24**.
  - Database cloud adapters/schema/embedded migration: **11/11**.
  - Web unit/route/security/regression: **38/38**, including **9/9** route-security checks.
  - TypeScript: PASS.
- **Build:** PASS — `npm run build`; optimized Next.js 16 production build lists Proxy plus all expected pages and API handlers.
- **Prisma:** PASS — plain `npx prisma validate --schema prisma/schema.prisma` and plain Prisma client generation with the documented local configuration.
- **Migration:** PASS — every checked-in migration applies to embedded PostgreSQL; legacy data remains; cross-athlete composite relations and athlete-local cursor constraints reject invalid writes; a forced transaction rollback leaves no partial record.
- **Focused security:** PASS — `node --experimental-strip-types --test test/route-security.test.ts`, **9/9**.
- **Phase 1 database regressions:** PASS — local analytics **1/1**, activities **2/2**, import **5/5**, Garmin/local pipeline **3/3**, coaching **6/6**, and Obsidian publisher **1/1**.
- **Playwright / E2E:** PASS for product behavior. An independent pre-remediation full run passed **11/11**. The post-security full run exercised all journeys and produced **10/11** with one test-only strict-locator ambiguity; after the locator correction, the affected scenario passed **1/1**.
- **Dependency audit:** PASS — `npm audit --omit=dev --audit-level=high`, 0 production vulnerabilities.
- **Secret and privacy scan:** PASS — no tracked secret patterns found outside examples/docs/tests; health/session fixtures expose no secrets, tokens, private athlete data, or vault content.
- **Diff hygiene:** PASS — `git diff --check` exits 0; only repository line-ending notices are emitted.

## Product Test Evidence

- A production/cloud anonymous request is denied for activity reads, dashboard reads, coaching mutation, file import, API front-door access, and dashboard-page access before any local operation occurs.
- Attacker-controlled bearer/header/environment values cannot construct a production actor.
- Authenticated athlete A and athlete B receive the same non-disclosing response from legacy global handlers, and the underlying operation is never called.
- An explicitly actor-scoped cloud handler receives the authenticated athlete identity, proving the intended clean boundary for M3-M5 implementations.
- Two athletes can each own cursor `1`, distinct jobs, snapshots, and raw-object namespaces without cross-tenant access.
- Unknown Second Brain prose, note fields, paths, plan commands, and unsupported structures fail validation before persistence; the accepted snapshot is selected, structured, hashed, monotonic, and immutable.
- Provider credential ciphertext cannot be opened after ciphertext, key, athlete, or provider tampering.
- Existing local Today, Plan, Calendar, Activities/import, Settings, error-recovery, and mobile-baseline journeys remain functional with cloud mode disabled.

## Regression / Risk Review

### Regressions checked

- Existing manual CSV/GPX import and normalized local activity paths.
- Existing dashboard snapshot and activity list/detail behavior.
- Approved-plan immutability, version history, proposal validation, and activation boundaries.
- Calendar edits, audit semantics, Today states, reminders/handoff preparation, and local Obsidian publication.
- Desktop and 390 px browser journeys.
- Migration compatibility with accepted Phase 1 records.

### Known external limitations

- Real owner authentication is intentionally absent. Production/cloud sensitive surfaces remain unavailable rather than falling back to local unauthenticated data. The real identity adapter and account authentication remain M8 work.
- No external Neon database, Cloudflare R2 bucket, Vercel deployment/queue, or Strava application is provisioned. M2 proves contracts and deterministic behavior; managed-service compatibility, quotas, credentials, and live smoke tests remain M8 gates.
- R2, Strava, Vercel, Neon, and queue free-tier limits are planning assumptions until they are revalidated during authenticated provisioning.
- Real Strava/R2 ingestion and reconciliation are M3 scope; cloud dashboard data sources are M4 scope; the paired local sync agent is M5 scope.
- The schema permits controlled persistence through future repositories; immutability and allow-list guarantees must remain enforced at every production adapter entry point, as they are in the M2 contracts and deterministic repositories.

## Recommendation

**Proceed to Milestone 3.**

Keep cloud mode disabled outside isolated tests. Do not deploy sensitive dashboard functionality or configure real credentials yet. M3 must preserve the M2 actor/athlete boundary, route inventory, immutable raw-object rules, credential envelope, athlete-local idempotency, and selected Second Brain allow-list. External provisioning remains blocked until the owner-authenticated M8 gate.

