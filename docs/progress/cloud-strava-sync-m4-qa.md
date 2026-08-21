# Milestone 4 Formal QA Gate

**Date:** 2026-08-10  
**Decision:** PASS  
**Scope:** credential-free online dashboard, cloud read APIs, change feed, and status projections  
**Production decision:** not approved; external identity and managed-service verification remain M8

## Acceptance trace

| Required outcome | Evidence | Result |
|---|---|---|
| Bounded deterministic change feed | Athlete-scoped Prisma repository and API tests cover pagination, empty feed, replay, invalid/stale/foreign cursor, and bounded limits | PASS |
| Correction and deletion visibility | Append-only sync records retain entity version and delete tombstones with null payload | PASS |
| Separately bounded backfill | Existing M3 actor-scoped route enforces 366-day, 10-page, and 300-activity maxima | PASS |
| Independent status signals | Core projection and view-model tests cover provider, ingestion, activity, device, and Second Brain transitions separately | PASS |
| Safe response boundary | Contract, repository, handler, and browser assertions scan for credentials, raw bodies, object keys, vault paths, and misleading AI/adaptation wording | PASS |
| Cloud-authoritative activity/performance | Cloud repositories and dashboard service read only actor-scoped PostgreSQL activities; no local data source is composed | PASS |
| Cloud-authoritative Plan/Calendar/Today | Strict plan projection repository plus actor-scoped handlers; direct tests run without local coaching service | PASS |
| Local computer unavailable | Online browser fixture shows current cloud workouts while local device and Second Brain are stale | PASS |
| Distinct product states | Loading/ready/stale/error/retry plus no-plan/no-session behavior covered across unit, route, and browser tests | PASS |
| Plan safety | Online views are read-only; local approval/calendar/Today/manual-import regressions and 11 existing browser journeys pass | PASS |
| Responsive baseline | Online Plan/Calendar journey passes at 390x844 | PASS |
| Production security | Proxy and every sensitive route require an actor; fixture mode is non-production UI selection only and cannot synthesize identity | PASS |

## Final command evidence

- `npm run test:cloud`: core 65/65, database 39/39, web 59/59, TypeScript PASS.
- `npm run build`: PASS after the cumulative cloud test sequence.
- Local compatibility: 1 analytics + 2 activity + 5 import + 6 coaching + 3 pipeline + 1 Obsidian = 18/18 PASS.
- `npm run test:e2e --workspace @racepredictor/web`: Chromium 11/11 PASS.
- `npm run test:e2e:online --workspace @racepredictor/web`: Chromium 3/3 PASS.
- Prisma format/validate/generate and migration replay: PASS.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: no whitespace error; repository line-ending notices only.

## Defects found and remediated during M4

| Finding | Resolution | Final evidence |
|---|---|---|
| The first status-view fixture omitted required canonical signal fields. | Constructed the UI fixture through the production status projector so tests use the exact contract. | Focused view test and full web suite pass. |
| Cloud Plan and Calendar initially exposed controls backed only by local mutation routes. | Added explicit online read-only mode and removed creation/move/skip/restore controls from the cloud presentation. | Desktop/mobile online Playwright journey passes. |
| The Plan page could be statically rendered using build-time environment state. | Marked the page dynamic and centralized online UI selection. | Production build lists `/dashboard/plan` as dynamic. |
| Online product components could not be browser-tested before external authentication without weakening security. | Added a non-production UI-only fixture selector; route auth composition remains unchanged and fail-closed. | Production-disable unit test, security suite, and online Playwright suite pass. |

## Security and privacy audit

- Every cloud read begins with `ActorContext` and an `AthleteScope`; no global `athlete_001` cloud repository path exists.
- Training plan projection detects multiple active rows and metadata/JSON inconsistencies rather than selecting arbitrary data.
- Sync and activity cursors are athlete-scoped and non-disclosing.
- Online responses contain selected canonical fields only, never raw provider objects or storage paths.
- The UI fixture is ignored in production and does not alter authentication, proxy, route, or repository behavior.
- No Garmin integration or arbitrary Second Brain data path was added.

## QA conclusion

M4 satisfies its credential-free exit gate. The real owner-authenticated browser journey and managed Neon/R2/Vercel behavior are correctly retained as M8 production verification, not falsely reported as completed evidence. No release blocker prevents M5.

