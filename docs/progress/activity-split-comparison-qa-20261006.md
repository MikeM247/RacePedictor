# Activity split comparison QA — 6 October 2026

## QA Result

PASS for the local implementation. Live migration, deployment and owner-reviewed publication of the Sunday race comparison remain release steps; none is claimed to have happened.

## Acceptance Criteria Check

| Criterion | Evidence | Result |
|---|---|---|
| Actual bars with exact, approximate and range targets; effort guidance without invented pace | Core tests, desktop/mobile screenshot inspection, shared SVG renderer | PASS |
| Shared Calendar and Training experience | Desktop Calendar and Training plus mobile day-dialog E2E | PASS |
| Five/ten split windows with overlap, clamped endpoints and stable whole-run scale | Desktop paging assertions, real Chromium touch input, keyboard selection | PASS |
| Exact differences and partial final split | Range arithmetic tests and selected 193m final split in E2E | PASS |
| Chart/Table, disclosure and selection restoration per activity | Reload/disclosure E2E, state shared when opening the same activity in Calendar | PASS |
| Missing, stale or failed comparison keeps actual data available | Three failure-state browser tests and core fingerprint tests | PASS |
| Reviewed historical source, immutable revision, approval integrity | Artifact tamper, explicit CLI approval, original/amended/retired source and revision conflict tests | PASS |
| Tenant and device boundaries | Scoped handler/repository tests, revoked-device test, route-wrapper inventory, PostgreSQL compound-FK enforcement | PASS |
| Idempotency and concurrency | Identical artifact replay, reused-ID rejection, expected revisions and serializable-conflict tests | PASS |
| Cloud and local storage | PostgreSQL migration test, SQLite migration/receipt test, synced local detail and provider-correction test | PASS |
| Keyboard, responsive layout and accessible labels | Axe checks on desktop/mobile comparison; selected-split focus; 320/390/768/1024/1440px browser checks | PASS |
| Viewing does not write activity/plan data | Browser request recorder on desktop shared-view journey and Training regression | PASS |

## Issues Found

All feature defects found during validation were corrected. A final local-read test found that getLocalActivity always returned an empty split list despite cloud sync retaining canonical detail. The reader now validates that stored detail and exposes athlete-scoped recorded splits, preserving local activity identity. Legacy import payloads continue to return no splits.

Three pre-existing blockers in the concurrent journal work needed minimal repairs to validate the shared checkout: a missing ternary fallback in the wellbeing component, an extra parent segment in reflection route imports, and a wellbeing relation incorrectly attached to Activity. Existing journal behavior and other concurrent work were preserved. The route-security inventory was updated for both the pace endpoints and the concurrently added authenticated journal endpoints.

## Validation Summary

- Build: PASS, `RACEPREDICTOR_NEXT_DIST_DIR=.next-pace-comparison-build npm run build --workspace @racepredictor/web` (environment variable set using PowerShell). Prisma generation and optimized Next.js compilation completed.
- Lint / Types: PASS, `npm run typecheck --workspace @racepredictor/web`.
- Core: 99 passed through `npm run test:cloud`.
- Cloud DB/CLI/migrations: 77 passed through `npm run test:cloud`. Includes all migrations on PGlite/PostgreSQL, tenant foreign keys and duplicate comparison revisions.
- Web/API: final standalone `npm test --workspace @racepredictor/web`, 154 passed. The aggregate run first caught the concurrent route-inventory addition; the final standalone rerun passed after explicit classification.
- Local activity/comparison: 7 passed, `node --experimental-strip-types --test packages/db/test/activity-pace-comparison.test.js packages/db/test/local-activities.test.js`.
- Local sync: 19 passed, `npm run db:test:local-sync`.
- Playwright / E2E: 8 passed, `activity-split-comparison.spec.ts` and `redesign-training-detail.spec.ts`, Chromium, final run `pace-comparison-final-20261006`.
- Accessibility: no axe violations in the comparison region on desktop or mobile; existing expanded Training-detail axe regression also passed.
- Visuals: inspected actual rendered desktop and mobile screenshots. Build uses the app's existing colors and type styles with no chart dependency.

Local evidence (ignored runtime artifacts):

- `.local/e2e/pace-comparison-final-20261006/results/local.json`
- `.local/e2e/pace-comparison-final-20261006/split-comparison-calendar-desktop.png`
- `.local/e2e/pace-comparison-final-20261006/split-comparison-mobile.png`
- `.local/pace-comparison-build.log`, `.local/pace-comparison-validation.log`, `.local/pace-web-validation.log`

## Regression / Risk Review

Regressions checked: Training history filters, pagination, Back/Forward and focus restoration; Calendar modal use; legacy CSV local detail reads; local cloud sync, amended plan source reconstruction, stale data and provider correction; all current route security wrappers.

Residual risk: browser verification used Chromium, including touch emulation, rather than physical Safari/iOS/Android hardware. Native browser 200% zoom was not separately verified; narrow reflow was checked down to 320 CSS pixels. Production authentication/publication and the real Sunday source have not been exercised against newly deployed endpoints. Automatic comparison cache fan-out to other local devices is not included; the publishing workstation caches accepted receipts when configured.

## Documentation Sync

Updated API_CONTRACT, DB_SCHEMA, ARCHITECTURE, CONTEXT, ROADMAP, UI_UX_SPEC and DESIGN_INTENT_CONTRACT. Added ADR 0009 and the preparation/approval/publication/release guide. Product value and existing milestones are unchanged; roadmap explicitly separates implementation from live release.

## Recommendation

Proceed to the documented release steps. Apply the additive migration with the deployment, verify the actual Sunday source using the new context endpoint, and obtain explicit approval of those concrete blocks before publishing them. The synthetic regression fixture is not a production approval artifact.
