# Milestone 6 Formal QA Gate

**Date:** 2026-08-10  
**Decision:** PASS  
**Scope:** cumulative credential-free release candidate, recovery, operations, shadow reconciliation, rollback, privacy, and product journeys  
**Production decision:** not approved; managed-service and real-account checks remain M8

## Acceptance trace

| Required outcome | Evidence | Result |
|---|---|---|
| Missed/interrupted/retry work recovers safely | Daily scheduled reconciliation plus durable due/stale claim recovery, lease fencing, attempt ceiling, terminal/dead-letter tests | PASS |
| Reconciliation is bounded and idempotent | Stable 48-hour request identity, max 25 athletes/jobs, three pages/90 activities, canonical/raw/sync replay tests | PASS |
| Free-tier safety is measurable | Durable counters and measured raw/database sizes; 70% warning and 85% stop across six signals | PASS |
| Hard stop preserves accepted data | Pure/service/route/UI tests schedule no new work and show preserve/review action | PASS |
| Shadow parity and discrepancy blocks | Representative clean comparison plus all eight mismatch codes, every one `releaseBlock: true` | PASS |
| Migration/rollback preserves product state | Feature-off gates, local backup restore, full synthetic offline journey, existing coaching compatibility | PASS |
| Browser product requirements | Strava connect/status/disconnect, freshness/offline, service recovery, plan/calendar immutability, device lifecycle, operations, desktop/mobile | PASS |
| Privacy and security | Route audit, athlete isolation, device/internal/session boundaries, immutable private storage, selected-field scan, dependency and secret-pattern review | PASS |
| Documentation and evidence pack | Architecture/API/schema/operations/roadmap/tracker plus release-candidate pack updated | PASS |

## Final command evidence

- `npm run test:cloud`: core 77/77, cloud DB 47/47, web 68/68, TypeScript PASS.
- `npm run build`: PASS after the exact test-before-build order; reconciliation route appears in the production manifest.
- Credential-free local compatibility: 24/24 PASS.
- Local Playwright: 11/11 PASS after deterministic request-wait remediation.
- Online Playwright: 4/4 PASS, including Strava connect/disconnect and mobile Settings.
- Prisma format/validate/generate and embedded PostgreSQL all-migration replay: PASS.
- `npm audit --omit=dev`: zero production vulnerabilities.
- Secret-pattern review: one known synthetic `private:private@private.example` redaction fixture only; no real application secret in reviewed source/evidence.
- `git diff --check`: no whitespace error; existing line-ending notices only.

## Fault and recovery evidence

- Missing webhook work is rediscovered by a stable reconciliation window.
- Immediate scheduler registration failure leaves the durable queued job recoverable.
- Raw storage failure prevents canonical mutation and retries safely.
- Provider 429 honors retry time; 5xx/network retries; repeated 401 requires reconnect.
- Downstream canonical/analytics failure rolls back activity, provenance, revision, sync, and analytics together.
- Stale worker claims are fenced; exhausted work dead-letters with a safe diagnostic code.
- Local note failure holds its cursor; replay is idempotent. Post-commit acknowledgement failure resumes and repairs acknowledgement.
- Cloud outage after successful sync leaves workout, approved plan, Today brief, reminder, and selected-publication evidence usable locally.
- A hard-stop usage signal enqueues and processes zero work.

## External limitation classification

The live normalization integration script could not reach the configured external database. This is not a credential-free product regression and no bypass was introduced. Schema validation, generated client, all migrations in embedded PostgreSQL, repository integration, transaction rollback, tenant fencing, and the full synthetic release journey pass. Actual Neon connectivity, concurrency, backup/restore, and production data checks are explicit M8 smoke steps.

## QA conclusion

M6 has no open credential-free release blocker. The release candidate is suitable for formal Product Owner requirements review in M7. It is not suitable for production activation until M8 completes real identity, Vercel, Neon, R2, Strava, and local-device checks.
