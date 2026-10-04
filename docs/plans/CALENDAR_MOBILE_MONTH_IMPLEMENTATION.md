# Calendar mobile month and logo-only navigation

4 October 2026 · `codex/home-calendar-redesign` · local implementation handoff

## Story Implemented

The approved story removes duplicate app-name text from shared navigation and replaces compact week/date selection and agenda with the existing Monday-first month grid. At widths below 1200px, a date opens the full date-specific Day details dialog. Desktop keeps month selection, the selected-day sidebar and record detail links.

## Components Built / Changes Made

- Navigation retains the existing logo asset and accessible Home link name. Home, Calendar and secondary Settings remain available.
- Calendar uses one month grid at all widths. Narrow cells show day number, violet P and lime R summaries, supplied distance or duration fallback, Rest or N/A where appropriate, skipped status, and accurate +N for records beyond the first of each category. The Planned/Recorded legend remains visible.
- Day dialogs use the supported `kind: day` state and contain every activity and planned session for the selected date. Original prescriptions, effective values, amendment history, coach/athlete feedback, telemetry, splits, disclosures, individual retry and permitted actions remain in the existing renderers. Empty days and unavailable activity reads have distinct text; the latter supports retry.
- Month controls, picker, Today, adjacent-month dates, saved-timezone today, optional separate training totals and deep-linked session focus remain. A reactive `(max-width: 1199px)` listener matches CSS. Crossing into desktop closes a day dialog into the selected-day sidebar; a record dialog remains open across resize.
- Close/Escape returns focus to the tapped date with `preventScroll`. If a desktop launcher becomes hidden after resize, the selected date is the fallback. Escape also works after a successful retry removes its focused control.
- Calendar embeds supply record-specific landmark context to full activity detail, coach feedback and athlete feedback. Record ordinals distinguish even two identically titled activities. Standalone Training retains its default heading IDs and landmark names; no axe rule is suppressed.

## UI Structure and Styling

Existing `--rp-*` tokens, brand assets and shared shells are reused. At 1200px and above, desktop grid/sidebar geometry and summary content remain. Below that boundary the sidebar is hidden, full cell text gives way to compact metrics, and day taps open complete detail. Month cells remain seven columns at 320px; dense summaries use 12px figures with 11px category/status labels. Full detail prose remains readable and vertically scrollable. Month and dialog content have no horizontal overflow in required-width and 200% reflow checks; fitting the entire month or long detail into one screen is not required.

## Files Changed

Production presentation:

- `apps/web/components/dashboard/dashboard-navigation.tsx`
- `apps/web/components/coaching/coaching-pages.tsx`
- `apps/web/components/coaching/coaching-ui.css`
- `apps/web/components/activities/activities-shell.tsx`
- `apps/web/components/activities/activity-coach-review.tsx`
- `apps/web/components/activities/activity-athlete-feedback.tsx`
- `apps/web/lib/calendar-display.ts`

Verification:

- `apps/web/test/calendar-display.test.ts`
- `apps/web/e2e/home-calendar-companion.spec.ts`
- `apps/web/e2e/redesign-responsive.spec.ts`
- `apps/web/e2e/digital-coach.spec.ts`
- `apps/web/e2e/online-dashboard.spec.ts`

Design and handoff:

- `docs/UI_UX_SPEC.md`
- `docs/UI_GUIDELINES.md`
- `docs/design/DESIGN_INTENT_CONTRACT.md`
- `docs/design/screens.md`
- `docs/plans/HOME_CALENDAR_REDESIGN_EXECUTION_PLAN.md`
- `docs/plans/HOME_CALENDAR_REDESIGN_IMPLEMENTATION.md`
- `docs/plans/CALENDAR_MOBILE_MONTH_IMPLEMENTATION.md`

## Enforcement Compliance / Scope Boundary

Read the implement-story, ui-developer, playwright-e2e, QA and React review skills, `apps/web/AGENTS.md`, Next.js local client-component guidance and the existing design authority. No root/docs AGENTS or `.codex/enforcement/{implement-story,definition-of-done}.md` files were present. The architecture/data authority from `docs/CONTEXT.md` and the prior approved implementation is preserved.

No API, database, auth, matching, completion scoring or training-policy behavior is introduced. No deployment, commit, reset, migration, production mutation or existing local test-data removal occurred. Shared dirty files were copied before editing to `.local/review/mobile-month-20261004/baseline/`. The review patch is relative to that execution baseline, preserving the earlier redesign and unrelated feedback/import work.

## QA Result

**PASS — local automated QA gate.** All required checks passed on the final implementation. Owner acceptance on a physical device remains a separate release activity.

| Acceptance criterion | Evidence | Status |
|---|---|---|
| Logo alone; accessible Home/navigation retained | Companion Home and required-width logo checks | Passed |
| Monday-first month at 320/390/768/1024/1440 and 200% reflow | Companion screenshots/overflow checks; responsive route suite | Passed |
| Mixed, one-category, multiple, empty, rest, skipped, moved, duration-only and unavailable metrics | Pure helper tests; mobile variant loop; accurate +N assertions | Passed |
| Every full record, original/history and feedback; unique landmarks even for same-title activities | Mixed-day dialog and same-title axe checks | Passed |
| Month transitions, adjacent dates, year boundary, Today, saved-zone midnight and totals | Navigation and timezone checks | Passed |
| Close/Escape restores day, month and scroll; resize and session deep links | Focus/scroll/breakpoint checks | Passed |
| Unavailable category and independent record retry recover without losing other records | Day-dialog recovery checks | Passed |
| Current/past/future action guards, conflicts, history and reasoned amendment preserved | Companion action checks, local four Calendar journeys, online management regression | Passed |

## Validation Summary / Commands

Run package commands from the repository root:

```powershell
node --experimental-strip-types --test apps/web/test/calendar-display.test.ts
npm test --workspace @racepredictor/web
npm run typecheck --workspace @racepredictor/web
npm run lint --workspace @racepredictor/web
```

- Display helper tests: **3 passed**, including distance preference, duration fallback, missing/zero/invalid values and sub-kilometre distances.
- Web unit/integration suite: **149 passed**, zero failed/skipped.
- Web typecheck and lint: **passed**. Both scripts use TypeScript, not an additional linter engine.

Run Playwright commands from `apps/web`:

```powershell
$env:RACEPREDICTOR_E2E_RUN_ID = 'mobile-month-20261004-stable'
$env:RACEPREDICTOR_E2E_REUSE_SERVER = '1'
npx playwright test --config playwright.online.config.ts home-calendar-companion.spec.ts redesign-responsive.spec.ts redesign-accessibility.spec.ts redesign-training-detail.spec.ts redesign-review-consistency.spec.ts online-dashboard.spec.ts
```

Final corrected full browser set: **35 passed**, exit 0; zero failed, skipped, flaky or unexpected results and zero runner errors. JSON: `.local/e2e/mobile-month-20261004-stable/results/online.json`. Includes all 14 companion checks, four responsive checks, two accessibility checks, full Training detail/review consistency, and all 10 online management/Home checks.

```powershell
$env:RACEPREDICTOR_E2E_RUN_ID = 'mobile-month-20261004-local'
npx playwright test --config playwright.config.ts digital-coach.spec.ts --grep 'Calendar'
```

Local Calendar regression: **4 passed**, exit 0. JSON: `.local/e2e/mobile-month-20261004-local/results/local.json`. The disposable run directory is separate from existing local test data. Windows test-server teardown was released by stopping only its verified port-3311 process after all assertions passed.

Production build: **passed**, exit 0. Command from root:

```powershell
$env:RACEPREDICTOR_NEXT_DIST_DIR = '.next-mobile-month-build'
npm run build --workspace @racepredictor/web
```

This ran Prisma client generation and the complete Next production build, without migrations. A separate build directory avoided the user's active `.next` dev output. The user server stayed running throughout, with no restart. Final cleanup removed exactly four task-specific test type includes from `tsconfig.json`, which is clean against HEAD. `next-env.d.ts` points to the active user's `.next/dev/types`, preserving the dev-startup delta already present at this story's initial status capture. Test/build output references are gone. A mistakenly late post-test baseline capture is retained under `generated-baseline/post-test-*` for audit; it was not used to keep task-generated paths. Post-cleanup typecheck passed. No unrelated file was reset.

Earlier diagnostic runs are retained. The first mobile locator expected an unpadded day but the existing formatter renders `03 Oct 2026`; the corrected test still requires both planned and both recorded records. Axe then exposed duplicate landmark names, repaired with Calendar-specific record context. Two older Home tests expected freshness/error panels on the Home summary; they now open the existing Readiness detail and retain all freshness, prediction, error and recovery assertions. Corrected focused rerun: **5 passed** (`mobile-month-20261004-final-repair`). No substantive assertion or axe rule was weakened.

## Screenshots

Controlled Chromium fixtures use fixed 3 October 2026 and the saved Africa/Johannesburg timezone. These are presentation evidence, not production owner data.

- [320px month](../../.local/e2e/mobile-month-20261004-stable/month-calendar-320.png)
- [390px month](../../.local/e2e/mobile-month-20261004-stable/month-calendar-390.png)
- [768px month](../../.local/e2e/mobile-month-20261004-stable/month-calendar-768.png)
- [1024px month](../../.local/e2e/mobile-month-20261004-stable/month-calendar-1024.png)
- [1440px desktop month/sidebar](../../.local/e2e/mobile-month-20261004-stable/month-calendar-1440.png)
- [200% equivalent reflow, 720×450 CSS viewport](../../.local/e2e/mobile-month-20261004-stable/month-calendar-720.png)
- [390px full day dialog](../../.local/e2e/mobile-month-20261004-stable/month-day-dialog-390.png)

The zoom check uses a halved 1440×900 CSS viewport to verify browser-zoom-equivalent reflow. It does not claim a native browser toolbar zoom interaction. Full-page month screenshots include fixed navigation; it remains fixed while the calendar scrolls.

## Regression / Risk Review

Reviewed all seven production presentation deltas against the saved baseline. No added fetch waterfall or backend write path is introduced. Activity reads remain per-record and existing approved-policy guards remain authoritative. Standalone Training default landmark names are preserved; Calendar embeds are scoped through optional context IDs.

Residual risks: compact month cells intentionally show only the first record of each category, with +N; complete details require a tap. Long days, missing-data messages and full evidence scroll vertically. Automated Chromium/axe and CSS reflow evidence do not replace owner review on a physical touch device. Existing unsupported assessments and optional analytical capabilities remain gated. No blocking defect remains in the scoped checks.

## Local Server / Delivery / Next Steps

The user's local server remains at `http://127.0.0.1:3000/dashboard` (Calendar: `http://127.0.0.1:3000/dashboard/calendar`) in cloud-disabled local mode, using existing local data without sign-in. It returned HTTP 200 after the build; port 3000 is owned by the original Next server PID 44204. Task-owned fixture servers on 3311 and 3312 were stopped after verification. No server restart or local-data deletion was needed.

Final 390px check against the running user app: **passed**, exit 0 (`node .local/server/mobile-month-user-app-check.mjs` from the root). The logo link has no duplicate text, the month grid opens `Day details — 04 Oct 2026`, Escape focuses `calendar-day-2026-10-04`, no horizontal overflow or browser errors occur, and the check issued zero write requests.

No commit or deployment is performed. The scoped review patch and SHA-256 manifest are under `.local/review/mobile-month-20261004/{implementation.patch,manifest.json}`: **19 story-owned file deltas**. Its reverse-application dry check passed without applying it or resetting files. The earlier redesign patch is historical; this story has its own baseline.

**Recommendation: proceed to owner acceptance in the running app.**
