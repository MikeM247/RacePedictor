# Responsive redesign validation

27 October 2026 · Branch `codex/responsive-redesign` · Baseline `origin/main` at `7e26aa7`

## QA Result

**Needs Review for production promotion.** Implementation is ready for branch review; hosted-preview and physical-device checks remain below. No production deployment or database migration has been performed.

## Acceptance Criteria Check

| Criterion | Evidence | Result |
|---|---|---|
| Shared shell across eight dashboard routes | One layout-owned header/main/navigation; responsive route matrix at 320–1440px, including 768/1199/1200 boundaries | Pass |
| Mobile hamburger and no bottom menu | Drawer/width/dismissal/focus tests; 56px header, 280px drawer, brand Home shortcut | Pass |
| Desktop icon default and remembered expansion | 64px/180px checks across reload, route changes and mobile/desktop resizing | Pass |
| Conversation-first Coach | Current focus and repeated banners removed; context/history/check-in sheets; transcript/composer layout | Pass |
| Existing conversation semantics | Archive confirmation/cancellation, readonly history, draft preservation, retry identity, cross-tab and late-response tests | Pass |
| Home content and scenery | Goal/milestones/Orbit, custom-background retention/fallback, required widths and actual Chromium 200% zoom | Pass |
| Readiness and recovery | Online/local suites cover evidence, charts, selected distance, deep links and originating focus | Pass |
| Training and activity context | Existing detail/history regressions; added long-list document-scroll restoration check | Pass |
| Calendar navigation and permitted actions | Day/activity return focus, month/year/Today navigation, skip/amend actions and mobile month checks | Pass |
| Consistent light surfaces | Shared semantic tokens, expanded-field and activity-header contrast corrections; initial/expanded axe scans | Pass |
| Login compatibility | All five owner-auth tests, including canonical OAuth/PKCE-origin behavior | Pass |
| Native iOS/Android keyboard and safe areas | Desktop visual-viewport simulations and Chromium zoom are available; physical mobile browsers are not attached | Needs review |
| Hosted authenticated preview | Branch build/browser fixtures verified locally; hosted preview has not been deployed | Needs review |

## Executed validation

- Final web unit/integration run: **195 passed** (`npm test --workspace @racepredictor/web`). Includes destination matching and invalid/missing menu preference regressions.
- Final TypeScript run: passed (`npm run typecheck --workspace @racepredictor/web`). The repository's lint script is the same TypeScript command.
- Final production build: passed (`npm run build --workspace @racepredictor/web`), including TypeScript, page data collection and route generation.
- Coach browser suite: **14 passed** on the final compact layout, covering archiving, retries, cross-tab state, saved history, actual Chromium 200% zoom, keyboard-sized viewports and the additional 390×220 composer fallback.
- Online initial/expanded accessibility plus Home/Readiness: **21 passed, 1 runtime-specific skip**. The skipped local-overview API scenario is covered by the local run.
- Local Readiness: **10 passed, 2 online-only skips**, including the fixture-backed overview endpoint and all shared chart/recovery scenarios.
- Owner authentication: **5 passed** using dummy credentials/intercepted OAuth.
- Responsive/navigation and Training detail: route matrix and existing three Training detail scenarios passed. Additional targeted run passed drawer route focus, Calendar mobile branding and long-history document-scroll restoration (**3 passed**).
- Online coach provider/model and regeneration: **2 passed**.
- Calendar targeted run passed compact activity nesting/return, month navigation and permitted mobile session edits. The obsolete mobile-brand assertion was updated and its corrected scenario passed in the later targeted run.
- Local Plan and Settings regressions: **3 passed**, covering proposal field repair, the saved-draft entry point and prepared-handoff rehydration.
- Milestone regressions: management fit, confirmed creation/persistence and failed-save input retention passed. The mobile keyboard/cancel/accessibility scenario passed after correcting the remaining modal label contrast (**4 scenarios passed** across the initial run and focused retry).
- Final Home sizing regression passed across the required viewport widths, including mobile Orbit sizing and desktop hero reflow.
- Supporting online workflows: **4 passed**, covering queued Strava diagnostics, approved-plan activation and prescription-safe Calendar details, Settings connection/pair/revoke actions, and partial-import validation/recovery. Settings coverage explicitly exercises the desktop section index and mobile disclosure.

Browser runs use installed Microsoft Edge through Playwright's Chromium engine. Test data is synthetic or stored in isolated `.local/e2e` SQLite fixtures; production athlete data and provider credentials are not used. Reports/traces/screenshots remain under `.local/e2e` in this worktree.

## Issues found and resolved

- A screen-reader utility previously existed only in some page styles. Moving it to global styles prevents hidden Coach labels from becoming grid cells and restores the transcript budget.
- Old mobile navigation selectors overrode drawer geometry and hid Settings' text. Shared-shell specificity now owns navigation dimensions, placement and labels.
- Training filters, the estimate selector and activity headers still referenced the dark navigation surface. These now use light content tokens, including feedback inside portaled details.
- Central modal isolation now covers header/rail/content, counts nested locks and restores explicit visible focus targets. Calendar's redundant body-overflow effect was removed.
- Training history now captures/restores `window.scrollY` after retiring its nested list scroller.
- Exceptionally short Coach viewports fall back to document scrolling so the growing composer and controls remain reachable; normal viewports retain the anchored composer and transcript scroller.
- Milestone editor labels and activity-picker controls now use the light dialog palette; the mobile editor's accessibility scan passes.
- Legacy Readiness IDs and Coach recovery focus are retained; controls moved into closed sheets return focus to the visible context launcher.
- The floating development badge covered the bottom Settings icon during browser tests. E2E builds disable that badge through the documented Next.js setting; production behavior is unaffected.
- Broad accessibility loops exceeded their original one-minute timeout during concurrent compilation. Their budget now reflects the multi-route scan; the subsequent complete scan passed.
- Settings' new section index made legacy text-only disclosure locators ambiguous. Browser coverage now targets the index links on desktop and the disclosure summary on mobile, retaining all save/connection assertions.

## Regression / Risk Review

No API contracts, schema, migrations, authentication policy or training approval behavior changed. Existing Coach feature/send gates, archive generations and athlete-scoped browser keys remain in use. Local mode does not gain a dead Coach link. Calendar retains its separate 1200px interaction threshold.

Before production promotion, review an authenticated hosted preview and perform native iOS Safari/Android Chrome typing, safe-area, orientation and browser-chrome checks. Verify the minimum-height fallback on exceptionally short visual viewports. Do not equate the desktop keyboard simulation with physical-device evidence.

Rollback restores the previous frontend release. Navigation preferences are optional browser presentation state; stored training plans, activities and conversations require no rollback or backfill.

## Recommendation

Proceed with branch review and preview validation. Keep production promotion pending the remaining environment/device evidence.
