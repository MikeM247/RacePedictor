# Full-screen activity details QA — 7 October 2026

## Result

PASS for the activity-detail change. Calendar and Training use the shared full-viewport dialog, split comparisons use aligned solid target outlines, and the production build succeeds. No deployment was performed.

## Validation

| Check | Result | Evidence |
|---|---|---|
| Web unit suite | PASS, 154/154 | `npm test --workspace @racepredictor/web` |
| TypeScript | PASS | `npm run typecheck --workspace @racepredictor/web` |
| Production build | PASS | `RACEPREDICTOR_NEXT_DIST_DIR=.next-activity-detail-build npm run build --workspace @racepredictor/web`; Prisma generation, optimized compilation, route collection, and static pages completed. |
| Local Calendar, Training, and split comparison browser coverage | PASS, 22/22 | `activity-split-comparison.spec.ts`, `home-calendar-companion.spec.ts` (feature cases), and `redesign-training-detail.spec.ts` in Chromium. |
| Local Calendar launch and saved-review consistency | PASS, 3/3 | Calendar activity launcher and both `redesign-review-consistency.spec.ts` cases. |
| Online-fixture browser coverage | PASS, 4/4 | Compact Day flow, responsive dialog at required widths, Training pagination/context, and direct-entry error states. |
| Owner-auth browser suite | PASS, 3/3 | `owner-auth.spec.ts`. |
| Accessibility, forced colors, and overflow checks | PASS, 4/4 | Full-route axe scans, expanded disclosures, reduced-motion/forced-colors screens, and compact-width overflow. Axe checks also pass on the mobile Day dialog, split-comparison regions, and expanded Training details. |
| Responsive screenshots | Reviewed | `.local/e2e/activity-detail-final/activity-dialog-320.png`, `activity-dialog-390.png`, `activity-dialog-768.png`, `activity-dialog-1024.png`, `activity-dialog-1440.png`, and `activity-dialog-720.png` (200% viewport equivalent). Split screenshots are in the same run folder. |

The local feature set includes the 22-split half-marathon fixture, exact width/baseline alignment between target outlines and actual bars, 1.75px desktop and 1.5px narrow strokes, global y-axis stability, paging overlap, keyboard selection, 390px Detail capacity, resize behavior, partial final split, and none/stale/error comparisons. Calendar and Training tests confirm activity reads do not issue application writes. Focus trapping, Escape, background inertness, scroll locking, and return focus are covered.

## Separate regression follow-up

The broader Calendar companion file also contains a Home-layout test that is not part of this feature. Its assertion that all concise Home summaries fit above the fold at 1440×900 fails when run by itself: the rendered activity summary continues below the viewport. The test and the Home page layout are outside the changed feature surface. This failure is not counted as a pass or as a feature regression; track it separately.

## Scope

This work changes frontend presentation and browser coverage only. It does not change API contracts, database schema, authentication, activity data, reviewed comparisons, or deployment state.
