# Race Predictor design intent review — 12 September 2026

## 1. Overall verdict: FAIL

The redesign preserves useful structural improvements, but the complete intended runner experience is not ready for release. Binding requirements are unimplemented, several core journeys fail, and some backlog/QA completion claims exceed their evidence. This verdict concerns the current working tree, including uncommitted work, against DESIGN_INTENT_CONTRACT.md, REDESIGN_IMPLEMENTATION_BACKLOG.md, and race-predictor-redesign-qa-matrix.md.

Evidence: source inspection; browser inspection of all six dashboard destinations; screenshots at representative 320, 390, 768, 1024 and 1440px widths; controlled failed requests and delayed-list experiments; keyboard checks. The existing focused command `npx playwright test --config playwright.online.config.ts redesign-coverage.spec.ts` returned **3 passed, 1 failed**. Training overflowed to **348px at a 320px viewport**. This is not a full viewport matrix, usability study, screen-reader audit, deployed smoke, or authentication certification. Build, typecheck and broad unit tests were not rerun for this review; earlier recorded passes are historical evidence only. No real import, approval, schedule change, or provider connection was submitted by this review.

Browser evidence and reproduction scripts are under `.local/design-intent-review/`: `observations.json`, `focused-observations.json`, `dialog-observations.json`, and PNG screenshots. Initial exploratory scripts needed fixture-envelope/locator corrections; the completed observations and focused suite result are the evidence cited here.

| Requested dimension | Assessment | Reason |
|---|---|---|
| Product purpose | Concern | Recorded training and today's session are accessible, but target-oriented interpretation and readiness detail remain incomplete. |
| User journey clarity | Fail | Home session deep link can be cleared by the initial list request; no readiness journey exists. |
| Navigation clarity | Concern | Home / Training / Plan are correct; local Overview / Calendar navigation and contextual recovery/return are absent. |
| Visual hierarchy | Concern | Three Home groups exist, but outlook and next-session content outweigh recent commentary; operational content remains above them. |
| Screen purpose | Fail | Data Quality chiefly serves as import, Plan exposes a large history, and Settings exposes multiple workflows. |
| Primary actions | Fail | Training and simultaneous Home errors display competing filled buttons; Plan/import/Settings also lack consistent action arbitration. |
| Secondary actions | Fail | Filters, telemetry, history and operations are insufficiently disclosed; readiness/trend access is missing. |
| Empty/loading/error/success states | Fail | Active-plan failures become no-plan; Home conflates absent review with pending; key refresh/recovery states are incomplete. |
| Prediction confidence | Concern | Unsupported probabilities are refused, but spread meaning, assessment timeframe, actual target and usable evidence are incomplete. |
| Mobile experience | Fail | 320px overflow, wrong Training detail breakpoint, small targets, and Calendar detail/access issues. |
| Accessibility | Fail | Plan dialog focus escapes and Escape fails; backgrounds are not inert; opening compact Training detail loses focus. |
| Copy clarity | Concern | “Today,” “Activities,” “persisted review,” “immutable record,” and infrastructure wording conflict with prescribed runner language. |
| Design consistency | Concern | Shared matte theme exists, but control dimensions, type sizes, spacing and interaction patterns diverge. |
| Contract adherence | Fail | Several MUST requirements and the release evidence gate are unmet. |

## 2. Design intent preserved

- Exactly three primary links in the prescribed order; existing routes retained; Calendar selects Plan; Settings/Data Quality have secondary current-state cues.
- Home has Race outlook → Recent training → Next action in source/reading order. The former KPI/chart composition is removed.
- Latest activity selection uses activity date and matches review to that activity. It does not deliberately substitute an older reviewed session.
- Activity detail puts distance, elapsed time, pace and elevation first, reuses Coach's review, and distinguishes AI commentary from activity facts.
- Home avoids inventing target probabilities or on-track verdicts. It retains the supplied prediction spread and states important evidence is unavailable.
- Today's prescription remains available independently of outlook loading. Review advice is described as advisory.
- Plan creation is initially collapsed and persisted proposals can be loaded. Explicit approval/rejection and historical activation remain.
- Import offers file/Strava choice and actual partial-result counts/correction. Strava backfill is described as queued, not completed ingestion.
- Dark navy surfaces, off-white text and semantic accent tokens preserve the brand. Native controls and reduced-motion support exist.
- Calendar defaults to Agenda below 1200px. Its detail dialog handles Escape and returns focus to the launcher in the checked flow.

## 3. Design drift found

### F01 — Finish the race-understanding journey

**Contract:** P1–P3, N3–N4, UX1–UX2/UX6, L3, C5. **Backlog:** 04–05, 13.

`apps/web/components/dashboard/dashboard-shell.tsx:123` hard-codes target date/comparison unavailability and offers only a brief supporting-signals disclosure. There is no View readiness surface, trend journey or contextual return. `featureTrendPoints` is supplied but not rendered, and the existing trend/driver components have no screen consumers. A current-fitness estimate is not explicitly labeled as such. “Supported prediction spread” does not explain what the interval means or whether it is calibrated.

The local Today contract already supplies goal title, targetDate and countdown (`apps/web/lib/local-coaching-service.ts:117`); compact Today hides the active goal. Missing race comparison is a valid limitation, but should not erase available target identity/date. Resolve target context using existing supported reads; retain unavailable wording for genuinely missing/incompatible evidence. Show the actual assessment timestamp/period and documented model limitations without deriving new forecast claims.

### F02 — Restore Home hierarchy and clear action priority

**Contract:** UX5–UX6, V1–V4, C6, T1, S1. **Backlog:** 01, 03–04.

The header still says Today and “Your approved session first,” contrary to Home's new order. It retains operational freshness UI; stale outlook messaging renders outside its affected group. Two race-distance selectors use the same `id="race-distance"` when options exist (`dashboard-shell.tsx:64,122`). Recent commentary receives less explanatory space than outlook and the verbose prescription block in inspected content.

Controlled concurrent overview/Today failures displayed **Try again** and **Retry today** as two filled primary buttons (`observations.json`, home-two-errors). Coordinate primary-action priority at Home level, retain today’s prescription, demote other recovery actions, and move operational details to contextual secondary access. Remove the duplicate selector/ID.

### F03 — Make review state and material caveats truthful

**Contract:** C3, UX2/UX6, L1, section 10, T3–T4. **Backlog:** 04, 07.

`home-recent-training.tsx:44–47` treats a missing summary as Review pending, even if the review request has never been made, failed, or requires attention. A review-fetch failure changes body copy to unavailable while the badge remains pending. Summary content uses headline/nextStep and ignores the available comparison; the generic advisory caveat cannot replace material evidence limitations. The summary contract does not carry limitations, so use the existing full-review read where needed, or state what cannot be established.

`activity-coach-review.tsx:90` hides comparison and all evidence limits behind disclosures. Keep known comparison status and consequential caveats beside the interpretation; disclose only supporting detail. Preserve the same persisted review/evidence reference across Home, Training and Calendar. Keep Home commentary concise without rewriting training conclusions.

### F04 — Repair Training selection, return and secondary controls

**Contract:** N3–N4, UX3–UX4, C6, A2, R4. **Backlog:** 06–07.

`activities-shell.tsx:70–97` launches list and deep-link reads independently; completing the list resets selection and closes detail. With a 1-second list delay, opening `?activityId=…` ended at Select an activity, with zero selected rows. This breaks the direct Home-to-session promise.

Selection/filter state is component state and the URL is read only once. Contextual Home return is absent; direct-loaded detail falls back to the list. Compact keyboard activation left focus on BODY rather than detail. Preserve the selected ID through initial load, move focus into newly opened detail, and restore launcher/filter/cursor/scroll context on return. Verify browser Back.

The entire filter form is visible by default, no applied summary exists, and Add training competes with Apply filters. Use a labeled disclosure and quiet filter actions. Put telemetry/splits/route information behind appropriate detail disclosure rather than displaying all telemetry by default.

### F05 — Complete responsive Calendar and Training behavior

**Contract:** N1, A5, R1–R6; section 8 layouts. **Backlog:** 01–02, 06–07, 10.

Training has **348px page width at 320px**. Its detail replacement breakpoint is 899px, leaving list/detail columns at 1024px; the contract requires replacement below 1200px. Compact Training uses 12px gutters in one rule instead of 16px.

Plan and Calendar lack the local Overview / Calendar switch. Calendar correctly defaults to Agenda below 1200px, but selecting Weeks at 768px produced **1037px of content inside 720px**. Its Agenda displays all recorded activities followed by all sessions instead of one date-ordered context. Recorded activity cards have no detail/review action (`coaching-pages.tsx:979`); sessions expose long prescriptions and edit controls directly. Provide concise, chronologically grouped date summaries and accessible detail. Only retain an alternate view where it is usable at that width.

### F06 — Repair plan states and implement a genuine staged workflow

**Contract:** L2, I2–I3/I5, sections 8/10. **Backlog:** 09.

`coaching-pages.tsx:328` catches the active-plan request and substitutes null. A controlled 503 rendered No active plan / No approved plan has been synced yet while history showed an active plan. Initial null state can also render false emptiness before the request resolves. Implement distinct loading, error, confirmed-empty and ready states, with a local retry and prior-data preservation.

The step indicator is permanently Goal & context; stages 2–5 are lumped together. Successful publishing returns an artifact ID and generic continuation text, not a concrete resumable external handoff. Inputs are local component state; ensure a saved context/draft resumes through existing capabilities or warn only where unsaved inputs would be lost. Active history is expanded by default and renders every workout, overwhelming the Plan purpose (`coaching-pages.tsx:551`). Collapse history and show the settled goal and current plan first.

### F07 — Finish dialog, form and target accessibility

**Contract:** A1–A5, I2/I5–I6, V3, C1. **Backlog:** 01, 03, 09–10, 13.

Browser reproduction: open an inactive approved plan's activation confirmation; Tab twice leaves the dialog; Escape leaves it open. No inert background exists. Calendar handles Escape/focus return but also has no inert background. The Plan dialogs do not use the available modal keyboard helper (`coaching-pages.tsx:561–562`).

Proposal confirmation does not disable Confirm/Cancel based on the pending proposal request. Its failure path closes confirmation but does not establish a forced reload/review path after revision conflicts. Ensure one consequential write, clear pending feedback, explicit plan identity/effect, and authoritative review before conflict resubmission.

Measured visible examples: Home View session **40px** high; Home View latest session/disclosures **23px**; Calendar mode buttons **37px**; common Settings controls **40–41px**. Calendar information buttons are styled 30×30. Enforce 44×44 targets, labels/error associations and first-invalid focus; fix duplicate IDs and verify logical headings/skip navigation. Contrast, screen-reader announcements, software-keyboard behavior and 200% zoom need fresh verification, not an assumed pass.

### F08 — Separate adding training from contextual data recovery

**Contract:** sections 8/10, C6, N4, I2/I5–I6, T5. **Backlog:** 08, 11.

Data Quality opens an import form and No import result yet, rather than explaining the affected data and consequence. Home recovery links do not carry the affected item and return context. The Home empty-state Add training link first opens Training, requiring a second Add training activation to reach source choice.

Upload help says “CSV exports use the supported import size,” without an actual limit; the service has a configurable limit (default 15 MiB). Present the applicable limit and supported format rules before file selection. After results, Import selected file and View Training can both remain primary; choosing a new file leaves the previous result visible. Source/file controls remain available during an in-flight import. Define the active step and truthful result ownership, preserve inputs on recoverable failures, and make supported correction/queue checks discoverable.

The Strava setup path currently starts authorization directly from Data Quality, whereas the contract specifies the relevant Settings section with return context. Preserve existing provider/auth behavior while implementing that navigation. Do not introduce backend expansion for unavailable diagnostics; identify the missing check honestly.

### F09 — Finish Settings disclosure and runner-facing copy

**Contract:** C1, UX5, sections 8/13, V4/V6. **Backlog:** 01, 12.

Both Settings variants expose multiple workflows and technical operations by default. The online route renders OnlineSyncSettings, so changing only SettingsPage will miss it. Group supported preferences/connections/reminders/context controls, expand the selected group, and use one primary action for its active task. Keep capability boundaries actionable.

Rename page-level Today/Activities to Home/Training, and replace routine infrastructure wording such as persisted review, immutable record, mission readout and sensor array. Keep actual privacy/approval consequences and training caveats. Consolidate styles: legacy 38px/7px controls and small explanatory type still override intended tokens.

### F10 — Correct release evidence and completion claims

**Contract:** section 16. **Backlog:** 02, 04, 08–09, 13; QA release gate.

Ticket 04 is DONE despite its required readiness entry remaining separate unfinished work. Ticket 09 and GS-S01 claim state preservation despite the reproduced no-plan error. DB-S01 is PASS while its notes defer browser fixtures. DB-F04 uses composition as evidence for a 30-second comprehension target without recorded tester observations. AI-F01/F02/F06 overstate return context, preselection rules and primary-action consistency. Reopen affected claims and link executable/manual evidence to each assertion. Do not call the remaining failures fixture-only without reproducing and resolving them.

## 4. Missing or incomplete states

Confirmed in code/browser: active-plan loading/failure; Home review not-requested/attention/failure distinctions; active goal present but comparison unavailable; contextual recovery/return; proposal pending/conflict treatment; new-file versus previous-import-result state; consistent one-primary-action treatment across simultaneous errors.

Not yet evidenced end to end: independent stale/refresh variants across prediction/activity/review/context; all partial/duplicate/rejected/queued import outcomes; saved-context handoff resume; auth expiry and safe destination recovery; full keyboard/screen-reader/zoom/contrast matrix; deployed smoke. Lack of evidence is not proof each behavior is absent, but blocks the contract's release gate.

## 5. UX risks

- Runners cannot reliably get from the latest session to its review, or distinguish prediction uncertainty from missing target/context.
- “Pending” can imply work will arrive when no review is queued. “No active plan” can imply a real approved plan has disappeared.
- Reading an interpretation without its material caveat can encourage unsupported confidence.
- Dense plan/history/agenda content and competing actions undermine the intended quick daily interpretation.
- Clipped mobile controls and escaped dialog focus make critical workflows unreliable for keyboard and touch users.
- Completion labels can produce a premature release decision despite observable contract failures.

## 6. Required fixes before release

Resolve F01–F10. Suggested order: shared state/dialog/action/target primitives; Training selection and mobile reflow; truthful Plan/review states; readiness and target context; Calendar/Plan/Settings/import composition; then complete evidence and release checks. These are binding-contract fixes, not optional polish. Preserve existing API, prediction, authentication, approval, schedule, timezone and privacy semantics throughout.

## 7. Optional improvements for later

- Refine repeated explanatory copy using feedback from the required 30-second comprehension check.
- Add further supported trend comparisons only if they answer a distinct runner question and retain text equivalents.
- Refine wide-screen density and icon alignment after required content, accessibility and action hierarchy pass.

Do not defer the missing readiness journey, contextual recovery, responsive behavior, disclosure rules, or accessibility under “polish.”

## 8. Copy-ready Luna handoff

Review and fix the required Race Predictor design-intent issues F01–F10 in `docs/progress/race-predictor-design-intent-review-2026-09-12.md`. Treat `docs/design/DESIGN_INTENT_CONTRACT.md` as the UX authority, with `docs/design/REDESIGN_IMPLEMENTATION_BACKLOG.md` and `docs/progress/race-predictor-redesign-qa-matrix.md` as acceptance tracking. Preserve unrelated working-tree changes. Preserve URLs/deep links, APIs, prediction calculations, authentication/privacy, approval authority, timezone semantics and schedule permissions. Do not invent missing analytical evidence.

Implement: (1) direct contextual readiness detail using existing estimates, target/date, uncertainty meaning, limitations and available trend evidence; (2) exactly three Home groups and coordinated single-primary-action priority, without duplicate distance controls; (3) truthful activity-review request/failure states and visible consequential caveats; (4) stable Home-to-Training deep links, applied-filter/list/scroll/focus return, disclosed filters/telemetry and detail replacement below 1200px; (5) 320px reflow, 44px targets, Plan Overview/Calendar navigation and a chronological compact Agenda with session-review access; (6) truthful active-plan loading/error/empty states, real resumable setup stages and collapsed history; (7) named keyboard-safe dialogs with inert backgrounds, Escape/focus return, pending-submit protection, field errors and conflict rereview; (8) clear Add training entry, exact supported file rules, distinct result/pending steps, Settings-based Strava setup with return context and contextual Data Quality recovery; (9) grouped Settings in both local/online variants and consistent runner-facing copy/styles; (10) corrected ticket/matrix statuses backed by evidence.

Reproduce the existing focused suite's Training failure (348px at 320px), delayed initial list clearing `?activityId=`, active-plan 503 becoming no-plan, concurrent Home errors yielding two primary buttons, Plan-dialog Tab/Escape failures, and Calendar Weeks panning at 768px. Add focused behavior assertions and run them with controlled fixtures, not production writes. Verify required viewport boundaries, 200% zoom, keyboard/focus/contrast/status behavior, all relevant loading/empty/error/stale/queued/partial/success states, and the 30-second comprehension check. Run applicable type/build/regression checks. Record deployed smoke separately; do not imply it ran locally. Return fixes by F-ID, requirement coverage, screenshots, executed results, genuine data gaps and any unresolved release blockers. Do not mark any ticket DONE with unmet binding acceptance criteria.

## 9. Follow-up implementation review — 12 September 2026

Implemented in the working tree:

- Home now uses Home copy, removes the duplicate distance control, adds a View readiness disclosure with current-fitness labeling and supported trend text, and demotes the outlook retry action.
- Training preserves a deep-linked activity while its list loads, moves focus into loaded detail, uses the required below-1200px detail replacement, and applies 16px compact gutters/min-width constraints.
- Plan active-plan loading and failure are distinct from confirmed empty state; plan history is collapsed by default; proposal and activation dialogs use the modal keyboard helper and inert their background while open.
- Calendar and Plan expose local Overview/Calendar navigation, compact Calendar hides the unusable Weeks toggle, and coaching controls/info targets are raised toward the 44px requirement.
- Existing focused redesign browser coverage now passes **4/4**. Web typecheck passes, the web unit suite passes **96/96**, and `git diff --check` passes.

The release verdict remains **FAIL**. The new readiness access is an inline disclosure rather than a full contextual detail surface; target/date resolution is still unavailable in dashboard data. Review-status semantics, filter disclosure/applied summaries, contextual Data Quality recovery, grouped Settings, Agenda chronology/review links, full keyboard/assistive-technology/contrast coverage, and deployment smoke remain incomplete. The delayed deep-link and dialog scripts require fixture-specific reruns after their initial exploratory harnesses; passing focused coverage does not certify those paths. No claim in the original sections above should be read as fully resolved unless the corresponding requirement has executable or recorded manual evidence.
