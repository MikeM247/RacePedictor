# Cloud Strava Sync Release-Candidate Evidence Pack

**Candidate date:** 2026-08-10  
**Candidate state:** credential-free implementation complete through M6; ready for M7 formal requirements review  
**Not production evidence:** no managed resource, real athlete activity, provider consent, production session, or local-device enrolment was used

## Evidence map

| Area | Implementation/evidence | Decision |
|---|---|---|
| Authority and clean boundaries | ADR 0003, architecture plan, core ports/use cases, athlete-scoped adapters | PASS |
| Future athletes, one-athlete UI | User/Athlete/Access model and scope tests; no athlete switcher | PASS |
| Strava lifecycle | OAuth state/grant/rotation/revoke, Settings handoff, status, disconnect | PASS with real consent deferred to M8 |
| Automatic ingestion | Public webhook receipt, immutable raw-first persistence, durable worker, reconciliation | PASS with live callback deferred to M8 |
| Canonical history | Strict projection, dedupe/manual merge, ambiguity block, updates/deletes/revisions | PASS |
| Private raw retention | Content/checksum/athlete-key R2 adapter, no public/list access, exact replay tests | PASS with live bucket deferred to M8 |
| Online dashboard | Cloud activity/dashboard/status/approved coaching reads; offline-local product state | PASS |
| Local projection | Paired device, DPAPI, scheduler, cursor/replay/tombstone/ack recovery | PASS with real pairing/install deferred to M8 |
| Second Brain privacy | Exact five-section v1 allow-list, immutable snapshots, no scan/path/free text | PASS |
| Plan safety | Context cannot mutate a plan; only already-approved projections publish; online plan/calendar read-only | PASS |
| Reliability and cost | Durable retries/dead-letter, daily recovery, six measured signals, 70/85 guardrails | PASS; current plan limits revalidated at M8 |
| Rollback/recovery | Feature-off path, additive migrations, local backup restore, no destructive recovery | PASS; managed restore smoke deferred to M8 |
| Automated QA | Core 77, DB 47, web 68, local 24, browser 15, build/types/Prisma/audit/diff | PASS |
| Product Owner history | M1, M2, M3, M4, M5, and M6 acceptance records | PASS |

## Full synthetic journey

1. A strict Strava create event resolves exactly one connected athlete.
2. Exact webhook bytes are stored immutably before the durable event/job transaction is acknowledged.
3. Strict activity detail, lap, and stream projections retain exact provider bytes privately and produce one canonical activity plus sync and analytics work.
4. The online dashboard derives data from athlete-scoped cloud activities, not a local snapshot.
5. A paired-device change page projects the canonical workout locally, updates only an owned Obsidian span, commits the cursor, and acknowledges it.
6. The local publisher sends only selected availability and wellbeing structures; logical source references remain local.
7. A simulated cloud outage occurs after sync. The local workout, approved plan, Today brief, and reminder preference remain readable.
8. A copied SQLite backup restores the same approved plan/brief/reminder state.

## Release-blocking discrepancy policy

Shadow comparison accounts for requested, fetched, retained, normalized, duplicate, ambiguous, rejected, and failed items. Missing local match, ambiguous match, duplicate provider match, timing, distance, duration, split-count, and weekly-total mismatches all block release. M8 must stop rather than merge or discard if any real-history discrepancy appears.

## M8-only production dependencies

- Authenticate the owner and implement/verify the real session adapter.
- Provision Vercel Hobby, Neon Free, private Cloudflare R2, and the Strava developer application/webhook.
- Supply encrypted server secrets, deploy cloud-disabled, migrate additively, and enable one feature at a time.
- Complete bounded real OAuth/webhook/raw/canonical/dashboard smoke and managed concurrency/recovery checks.
- Run bounded shadow comparison against the owner's history; any unexplained discrepancy blocks cutover.
- Pair the real Windows computer, install its local sync task, and verify offline/online behavior.
- Revalidate current free-tier and Strava limits before enabling automatic work.

These are verification/provisioning dependencies, not permission to weaken privacy, authentication, tenant isolation, immutable history, or explicit plan approval.
