# Milestone 8 QA Gate — Strava History-Import Pacing

**Date:** 2026-08-12
**Result:** PASS (scoped pacing story)
**Milestone 8:** Needs Review — production smoke, automatic webhook, raw-integrity read, and local selected-context evidence remain

## Acceptance criteria check

| Criterion | Evidence | Result |
|---|---|---|
| No Strava activity/list provider call occurs without reserved shared capacity | Core tests prove unavailable capacity returns a deferred outcome before a token is loaded or a provider client is called. | Pass |
| Capacity stays below a conservative shared quarter-hour ceiling | Database integration covers atomic reservations, the 80-request cap, and release at the next quarter-hour boundary. | Pass |
| A planned capacity pause preserves useful batch progress | Core and database tests retain listed, pending, and completed IDs in a strict durable checkpoint without consuming an attempt. | Pass |
| A recoverable provider retry preserves useful batch progress | Worker and database tests retain the checkpoint while consuming the retry attempt. | Pass |
| Scheduled recovery does not repeatedly reclaim work in one provider window | Core test proves the reconciliation runner yields after the first deferred job and records one processed outcome. | Pass |
| Existing cloud and dashboard behaviour remains safe | Full cloud regression and production build pass. No route or UI contract changed. | Pass |

## Validation summary

- Tests: Pass — `npm run test:cloud`: 82 core, 54 database, 77 web tests and strict web TypeScript validation.
- Build: Pass — `npm run build --workspace @racepredictor/web`, run immediately after the full cloud gate.
- Prisma: Pass — production build generated the Prisma client from the current schema; no schema or migration change is required.
- Repository hygiene: Pass — `git diff --check` reports no whitespace errors.
- Playwright/E2E: Not rerun for this server-worker-only story; the existing owner/history-import online journey remains covered and no browser-facing behaviour changed.

## Regression and risk review

- The reservation is deliberately global to the Strava application, preserving the future multi-athlete boundary.
- The 80-request threshold leaves headroom under the selected conservative application window.
- A free-tier daily scheduled recovery may continue a very large history import on a later pass; that is intentional and preferable to exceeding the provider allowance.
- Production smoke remains required after deployment; this report is not final M8 acceptance.

## Recommendation

Proceed with the guarded production deployment, then verify the authenticated Settings operational status and an existing workout view. Do not mark M8 complete until the remaining live acceptance evidence is recorded.
