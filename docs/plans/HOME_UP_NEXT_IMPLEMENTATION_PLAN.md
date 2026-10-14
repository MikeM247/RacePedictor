# Home: advance Up next after a recorded run

Date: 13 October 2026, Africa/Johannesburg.
Status: implemented and verified with mocked browser regressions; production deployment authorized on 14 October 2026.

## Outcome

After the runner records Tuesday morning's run, Home should show the next scheduled run: **Up next · Thursday, 15 October**. Use the actual approved Thursday session's title, prescription, cautions and optional start time. **View workout** must open that same session in Calendar. The morning run remains in **Your last run**. Preserve the current layout, goal/milestone banner, buttons and today's recovery check-in.

Thursday is the owner's stated expected result, not a hardcoded schedule or a live record verified during this planning task. Confirm the active plan's effective dates during implementation and the signed-in release smoke test.

## Cause established in the code

- `TodayCoachingCard` renders `payload.session` and labels any prescribed session that is neither missed nor skipped as `Up next · Today`.
- `handleCloudToday` reads the effective plan but does not read recorded activities. It already computes a later `nextWorkout`, which the Home card suppresses while today's prescribed session exists.
- `buildTodayOverview` in the local service has the same schedule-only selection.
- `HomeRecentTraining` independently fetches the latest recorded activity. Its result does not refresh or inform the workout selection.
- Calendar session status supports `upcoming` and `skipped`; it is not a completion ledger. Existing activity-review matching produces a suggested association from a shared date, not authoritative completion.

## Selection policy

Make a shared, deterministic Home selection from the active effective schedule and the athlete's recorded runs. Keep recorded activity and plan completion as separate facts.

| Situation | Home result |
| --- | --- |
| One run planned today; no run recorded today | Today's approved run remains Up next. |
| One eligible run planned today; one eligible run recorded today | Advance the Home recommendation to the next non-rest, non-skipped session. This is a presentation rule based on a recorded run, not a saved completion or adherence assessment. |
| More than one plausible session or activity today | Do not silently remove a potentially outstanding run. Show `Today's sessions` and a concise Calendar action to resolve what remains; avoid asserting that the morning session is still upcoming. |
| Today is prescribed rest or has no planned run | Show the next scheduled workout, with a short recovery note only for explicitly prescribed rest. |
| Today's session is skipped | Exclude it from Up next; retain the skip in Calendar. |
| No remaining workout in the active plan | Show `No upcoming workout scheduled` and `View calendar`. |
| Recorded activities cannot be loaded | Keep schedule facts visible, label selection as uncertain, and offer Retry. Do not interpret an unavailable read as no run recorded. |

Eligibility uses canonical recorded run/trail-run/treadmill-run records and the plan timezone. Ignore deleted, invalid or future-dated records and other sports. Do not require an AI review, a distance match or a pace target to acknowledge that a run occurred; approved shortened runs must also advance the simple one-run case. Do not hide a session with an explicit start time later than the recorded run. Multiple sessions without an authoritative association remain ambiguous. Do not invent a new confirmation workflow as part of this fix.

Future selection uses effective dates and amendments, excludes rest/skips, and sorts by date, known start time and stable ID. Surface schedule ambiguity when missing times prevent a meaningful same-day order. Never advance merely because today's prescribed start time has passed.

## Implementation delivered

1. **Read effective plan and activity evidence.** Home now reuses its existing current-week Calendar read, which returns all effective sessions and recorded activities in the plan timezone. No API/schema migration or activity review request is needed. Activity unreadability keeps the original schedule and displays an inline retry or uncertainty message.
2. **Select the actionable session.** One recorded run plus one sole run session advances to the next effective non-rest, non-skipped session, including an approved session outside the current week. A specified later same-day session stays next. Multiple plausible sessions show a Calendar resolution link. Other kinds of recorded sport do not satisfy a planned run, and a run does not satisfy a planned strength/cross-training session.
3. **Render one coherent selection.** The Home card uses the selected session's date, title, prescription, cautions, and session-specific Calendar link together. Prescribed rest remains visible while previewing the next workout. The full Today view keeps its existing selection behavior; the daily check-in remains keyed to today's date.
4. **Refresh current data.** Home refreshes its Today, Calendar and recent-activity reads on focus, when the tab becomes visible, on local-date changes, and once a minute while visible. It ignores obsolete effect responses and retains valid content while refreshing.
5. **Document the Home behavior amendment.** This implementation record documents the result; the 25 September design contract remains the product layout authority. The one-run display rule does not save completion state, create a confirmed activity-to-plan link, alter Calendar history or approved prescriptions, or assess adherence.

## Verification and remaining coverage

- Primary regression: Tuesday 13 October before a recorded run shows Tuesday; after the morning run is available, it shows Thursday 15 October, Thursday's complete prescription and the exact Thursday Calendar link. The recent run and today's check-in remain correct.
- Run the same scenario through both cloud and local response paths, with tests that assert no writes occur.
- Cover a cycle ride, a shortened run, duplicate imports, multiple sessions, an explicitly later same-day session, a skipped or rescheduled Thursday, a rest day, no remaining session, failed activity reads, delayed ingestion and the Johannesburg/UTC midnight boundary.
- Test live refresh with the page already open and with out-of-order responses; no reload should be required after a new recorded run is observed.
- Browser checks at desktop and mobile sizes: selected date/title/prescription/link agree; full cautions remain readable; keyboard focus and the existing viewport fit are preserved.
- `npm run typecheck --workspace @racepredictor/web` passes.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium RACEPREDICTOR_E2E_RUN_ID=upnext-home-full npx playwright test --config playwright.home.local.config.ts` passes all 28 Home tests, including the Tuesday recorded-run to Thursday selection, no-reload refresh, same-day ambiguity handling, and the existing phone/desktop viewport and accessibility checks.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium RACEPREDICTOR_E2E_RUN_ID=upnext-readiness-full npx playwright test --config playwright.readiness.local.config.ts` passes all 6 Readiness tests.
- Release verification on 14 October: all 3 focused Home regressions pass, covering advancement with and without a scheduled start time and ambiguous same-day sessions. The untimed-session case exposed and fixed a fallback that could reselect the recorded session.
- The browser tests use mocked calendar and activity responses. The owner's live plan dates, live API behavior, and production deployment have not been verified. Additional edge cases such as cross-training, explicit later same-day sessions, unavailable activity reads, and stale/out-of-order responses remain candidates for more coverage.

Up next advances when the Calendar activity read observes the ordinary recorded-run case, retains honest handling of ambiguous or unavailable information, and leaves the approved plan and stored journal untouched. The owner authorized deployment to the existing production site on 14 October 2026.
