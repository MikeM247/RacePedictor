# Option 09 architecture review

31 October 2026. Review of the current local working tree against the supplied implementation plan and the [BRD](../product/milestone-homepage/BRD.md). This is an assessment, not release approval. No application fixes, live-data changes or deployment were performed during this review.

## Verdict and delivery state

The local implementation now covers the main architecture: option 09 Home, milestone selection, training summaries, Settings image management, owned image persistence, uploads and paired-device synchronization. It is substantially more complete than the initial preview commit, but it is **not ready for release sign-off**.

The latest commit is `a7a20f7` (`Add option 09 milestone home preview`), a seven-file preview change. The subsequent implementation is still modified/untracked local work, including contracts, API routes, migration, synchronization, Settings editor, reference assets and tests. A deployment of that commit alone would not include those additions. The feature switch `RACEPREDICTOR_MILESTONE_HOME_ENABLED` defaults to false, retaining the previous Home and hiding image controls.

This session has not published the working tree, migrated a live database or activated staging. The live staging deployment was not inspected during this review. These distinctions explain why a hosted page may show little or none of the local implementation.

## What changed against the plan

| Planned area | Current implementation | Assessment |
| --- | --- | --- |
| Faithful option 09 Home | Prototype CSS is scoped into React; desktop top navigation, phone header/bottom navigation, photograph spotlight, countdown, ORBIT, journey and paired date-tile cards are present. Home has no application logo. | Implemented locally; final visual acceptance remains qualified below. |
| Next-goal selection | Uses the existing shared milestone projection; selects a current/future intermediate target, then the primary goal. Preserves result-pending and truthful completion/performance distinctions. Midnight, visibility and periodic refresh hooks exist. | Implemented, with an ordering deviation below. |
| Journey density | Up to four visible entries; larger journeys retain highlights and expose a read-only vertical all-milestones dialog. Phone timeline is vertical. | Implemented and browser-tested with seven entries. |
| Training summaries | Dedicated authenticated endpoint queries the latest eligible owned run directly and selects an effective, non-skipped running session. The two sections retain independent availability and stale-data handling. | Implemented; online timezone fallback needs correction. |
| Details and navigation | Native milestone dialogs; existing activity route; exact session/date Calendar deep link; Coach route; Settings milestone link; recovery context for training links. | Main paths present. Calendar close-and-return verified; full action matrix remains outstanding. |
| Settings image management | Thumbnails, image editor, catalogue, upload/replace/reset, preview, label, explicit Save/Cancel, progress/errors and sync-conflict choices. Includes primary and removed entries where verified. | Implemented; local browser save/upload/cancel/revision checks pass. |
| Three initial marks | Oldies, Best of the Best and Comrades files are bundled unchanged. SHA-256 matches the BRD copies. Selection binds to verified source IDs/aliases rather than title matching. | Delivered as choices. Production assignments still require explicit setup or reviewed identity mapping. |
| Image storage and processing | Additive PostgreSQL migration and SQLite support; immutable owned derivatives; revision checks; PNG/JPEG/WebP validation; bounded WebP normalization; private asset delivery. | Implemented and tested using local SQLite, PGlite and Sharp. No live migration applied. |
| Reconciliation | Image choice resolution integrated with link/unlink transactions; hidden entries retain associations. Stale editors include timeline membership revision in their source digest. | Implemented with unit/integration coverage; deployment regression still required. |
| Cloud uploads and cleanup | R2 temporary staging, ownership/checksum verification and finalize; expiry/asset maintenance integrated with the existing cron plus a local cleanup command. | Implemented; storage tests use an adapter, not live staging R2. |
| Device synchronization | Manifest/asset transfer, pending offline changes, revision conflicts and explicit Settings resolution. | Implemented with simulated-client coverage; real paired-device end-to-end acceptance is outstanding. |
| Rollout and authority | One default-off switch, previous Home retained, additive migration guard and updated product/UI/architecture documents. | Prepared locally; not deployed or owner accepted. |

## Findings to address

1. **Online timezone is not independently resolved from the saved athlete profile.** [home-training.ts](../../apps/web/lib/server/home-training.ts:122) uses the plan timezone, otherwise hard-codes `Africa/Johannesburg`. If the plan is absent or unavailable, an athlete in another timezone can receive a ready Last run with the wrong date tile. Resolve the saved athlete timezone independently and define an honest unavailable state when it cannot be verified. This affects the plan's timezone and independent-source guarantees.

2. **Undated achievement order differs from the plan.** [home-milestones.ts](../../packages/core/src/services/home-milestones.ts:3) uses an ID tie-breaker for every entry. Two undated achievements therefore reorder lexically rather than retaining saved order. A review reproduction supplied `z-first-saved` followed by `a-second-saved`; the returned order was reversed. Preserve incoming saved order for undated achievements and cover that case explicitly.

3. **The repository Calendar browser test is currently incorrect.** [milestone-home.spec.ts](../../apps/web/e2e/milestone-home.spec.ts:346) tries to click the background Return to Home link while the session-details modal is open. The saved failure shows the modal intercepting the click. A temporary audit copy added a normal Close details click before returning; all six browser checks then passed, including restored Home focus. This is evidence that the tested close-and-return path works, not justification for bypassing modal interaction. Correct the repository test before declaring its suite green. No repository test was edited during this review.

4. **Exact visual acceptance is incomplete.** The comparison checks primary boxes within 1 px and a 0.5% pixel threshold, but it rewrites the reference sponsor subtitle and final-goal secondary text before comparison. It also ignores per-channel differences up to 16/255 and captures full pages. Passing this check establishes close layout agreement for equivalent data; it does not establish literal identity with the unmodified option 09 reference or satisfy the required normal-viewport phone-navigation check. Record the allowed content differences, tighten/document the pixel allowance, add viewport captures and complete 200% zoom acceptance.

5. **Release and live integration evidence is missing.** Publish a reviewed, reproducible source revision; apply the isolated staging migration; configure the feature switch and R2 CORS; exercise real authenticated upload/read/sync/conflict flows; and obtain owner visual acceptance. The implementation handoff documents these steps, but documentation is not proof they ran.

## Acceptance-criteria position

“Local evidence” means synthetic fixtures/local integration, not live production acceptance.

| BRD criteria | Position |
| --- | --- |
| AC-01–02, desktop/phone composition | Local responsive and geometry/pixel checks pass; visual qualifications above remain. Widths 320, 390, 760, 768, 1024 and 1440 checked. |
| AC-03, truthful PB and target facts | Implemented; fixture/unit coverage. Actual owner records and initial catalogue assignments not verified here. |
| AC-04–05, dates/advancement | Selector and midnight/DST coverage exists. Fix undated ordering and online timezone handling; expand race-day/timezone browser coverage. |
| AC-06–07, run/session selection | Server integration tests cover filtering, effective dates, skipped sessions and stable session ordering. Live online source smoke test remains. |
| AC-08, actions/return | Modal focus and Calendar session close-and-return pass locally. Full activity/Coach/back/scroll/no-write matrix remains. |
| AC-09–10, manager/catalogue | Canonical manager and three exact files present; local editor tested. Complete explicit three-event setup and all three selection checks. |
| AC-11–14, image lifecycle/failures | Local save/upload/cancel, invalid processing, revisions, ownership and simulated staging/sync tests pass. Real cross-device persistence, interruptions and live R2 acceptance remain. |
| AC-15–16, existing milestone authority | Existing workflows retained; regression and reconciliation tests present. Full local/online milestone browser suites and approval/publication acceptance still required. |
| AC-17, authorization | Owned persistence and security-inventory checks pass; live cross-account endpoint acceptance remains. |
| AC-18, independent failures | Per-card unavailable/stale handling implemented and partially browser-tested. Timezone dependency is a remaining deviation. |
| AC-19, accessibility | Local axe, keyboard/modal focus, long title and narrow-width checks pass. Manual screen-reader and 200% zoom acceptance remain. |
| AC-20, many milestones | Seven-entry expanded journey and return focus pass locally. Undated stable-order deviation remains. |

## Verification performed for this review

- Web regression runner: **53/53 test files passed**, with local/cloud-disabled test configuration.
- TypeScript web check: **passed**.
- Production Next.js build of the reviewed source: **passed**, including compilation, type validation and route generation. No live migration or deployment was run by this build.
- New Home selector and midnight test files: **passed**; image integration file is included in the web regression run.
- Direct image integration run: **8/8 tests passed**.
- Core regression runner: **24/25 test files passed**. The failure is the existing `coach-voice-audio.test.ts` suite; no voice implementation files are changed by this milestone work. Do not represent the full core suite as green.
- Browser audit: **6/6 passed** in a temporary copy with the Calendar close step described above. Application source was unchanged. The repository's latest recorded browser run still has that test failure.
- All three delivered race marks match the BRD asset hashes.
- `git diff --check`: **passed** for tracked changes.

Test logs and synthetic browser attachments are under `/tmp/milestone-architecture-*`; these are local review evidence, not permanent CI artifacts.

## What remains unchanged by design

Approved plans, historical confirmation, target approval/publication and timeline membership remain authoritative. Image changes are presentation state, not plan edits. Other screens retain their layouts/routes, with the narrow addition of Home recovery support to the existing return banner. No PB facts, example workouts, race dates or image assignments are installed by a page read. The supplied marks' provenance and provisional event dates still need owner resolution before production setup. AI image generation remains outside this release.

Recommended next step: address the two functional deviations and the repository test, finish the acceptance evidence, then deploy the reviewed source to isolated staging for owner comparison. The earlier automatic approval review rejected the private-source GitHub push for insufficient destination/payload authorization; it was not retried or bypassed for this assessment.
