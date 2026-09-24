# Race Predictor design intent re-review — 12 September 2026

> Superseded by the [post-fix design-intent review](race-predictor-design-intent-postfix-review-2026-09-12.md). Its controlled browser checks found remaining product defects; the implementation-only completion claims below are historical and are not the current release verdict.

## Implementation re-review — 12 September 2026

### Overall verdict: CONCERN

The F01–F10 implementation pass now addresses the previously reproduced product drift in source and targeted browser specifications. Home identifies its forecast as a current-fitness estimate with adjacent limits and supported target context; Training has disclosed filters, a below-1200 replacement detail with Back and browser-history restoration; review, plan and import states use truthful distinct wording; Plan, Calendar and Settings have one owning flow; and modal/compact controls have the required focus, inert and target-size behavior.

This is a **Concern** rather than a release Pass because the shared Next fixture server did not become reachable before its 120-second Playwright timeout while another Next process was occupying the shared process pool. Source-level typechecking, the complete 96-test unit suite and the optimized production build passed; the amended Playwright cases have not yet run. Human comprehension, assistive-technology, viewport-boundary and deployment evidence remain required release checks.

| Finding | Current implementation assessment | Evidence still needed |
|---|---|---|
| F01–F02 — Race understanding and Home hierarchy | Addressed in source. Current-fitness, interval limits, data freshness, target context and recent training are local to the three Home groups. | Browser fixture check and the unprompted comprehension observation. |
| F03 — Review truthfulness | Addressed in source. Unavailable, checking, reviewed and no-request states are distinct; consequential comparison and evidence limits are visible before optional detail. | Controlled latest-review failure and queued-state browser checks. |
| F04–F05 — Training and responsive navigation | Addressed in source and targeted Playwright assertions. Filters disclose, 320px form columns stack, sub-1200 detail provides Back, and selection uses URL/browser history with return focus. | Run the 320/768/1024 browser cases. |
| F06–F07 — Plan, Calendar and accessibility | Addressed in source. Plan retains loaded data through recoverable failures, stages reflect workflow, decisions remain guarded, and dialogs inert their backgrounds and return focus. Calendar is chronological below 1200px with activity detail/review links and 44px controls. | Keyboard, Escape and screen-reader verification in a running browser. |
| F08–F09 — Recovery and Settings | Addressed in source. Import has source ownership, size/rule copy, contextual Settings return and a single primary result action. Both Settings variants disclose one group at a time. | File/provider recovery and Settings return browser journeys. |
| F10 — Release evidence | Partially addressed. The reviewed claims are now marked in progress, obsolete behavior assertions were replaced, and 96 unit tests pass. | Complete the blocked build/Playwright run, then complete human and deployed release evidence. |

### Validation recorded for this pass

- `apps/web`: `npm run typecheck` passed before the final browser-spec assertion edits; the same source changes compile through the test harness.
- `apps/web`: `npm test` passed **96/96** in 11.98 seconds (captured in `.local/redesign-unit-20260912.log`).
- `apps/web`: `npm run build` passed, including TypeScript, static-page generation and route tracing.
- `apps/web`: the first `npx playwright test --config playwright.online.config.ts redesign-coverage.spec.ts` attempt could not start its fixture server within 120 seconds; the focused rerun is the remaining automated check.

The remaining requirements are verification evidence, not known product drift. Do not call this release-ready until the outstanding checks have passed.

## Historical pre-fix review

### 1. Overall verdict: FAIL

The latest implementation improves the redesign, but does not complete F01–F10. Core navigation, mobile reflow, focus restoration, truthful states, and the race-understanding journey still violate binding requirements. This review supersedes the earlier report's description of the current implementation; it does not erase its historical findings.

Authority: `docs/design/DESIGN_INTENT_CONTRACT.md`, with `docs/design/REDESIGN_IMPLEMENTATION_BACKLOG.md` and `docs/progress/race-predictor-redesign-qa-matrix.md` as acceptance tracking. Reviewed the existing working tree, including uncommitted changes. No product code was changed for this review.

Evidence: current source inspection; Chromium checks at 320, 390, 768, 1024 and 1440 CSS px for selected journeys; screenshots; keyboard checks; controlled failed reads and delayed activity-list response. The focused command `npx playwright test --config playwright.online.config.ts redesign-coverage.spec.ts` was rerun and passed **4/4 in 27.4 seconds**. Its import submission was intercepted by a fixture; no real import, approval, provider connection, or schedule change was submitted.

These are focused checks, not a complete viewport/state matrix, screen-reader audit, 30-second usability observation, or deployed smoke. Build, typecheck and unit tests were not rerun for this review; previously reported results remain historical.

Evidence files: `.local/design-intent-review/current-results.json`, `review-current.cjs`, `focus-return-current.cjs`, and `current-*.png`. The initial dialog observation was checked again after two animation frames: focus still returned to BODY, with the launcher visible. The observed history-loading text check did not establish a separate history spinner defect and is not treated as one here.

| Requested dimension | Verdict | Current assessment |
|---|---|---|
| Product purpose | Concern | Recent training and the next session are available; target-oriented interpretation and readiness remain incomplete. |
| User journey clarity | Fail | Delayed Home-to-activity links now retain selection, but tablet detail has no visible Back control and contextual return is incomplete. |
| Navigation clarity | Concern | Home / Training / Plan is preserved; Plan now has two identical Overview / Calendar switches. |
| Visual hierarchy | Concern | Home retains the three-group order; operations remain in the header and outlook still dominates recent interpretation in the inspected state. |
| Screen purpose | Concern | Plan history is calmer; Data Quality remains primarily an importer, and Settings exposes several workflows simultaneously. |
| Primary actions | Fail | Home outlook retry and Training Apply filters are now secondary; import results, Settings and expanded Plan workflows still permit competing primary actions. |
| Secondary actions | Fail | Filters lack the required disclosure/applied summary; routine telemetry and operational controls remain overly exposed. |
| Empty/loading/error/success states | Fail | Review read failure says pending; active-plan read failure still says no active plan in the header; import result ownership and proposal pending/conflict recovery are incomplete. |
| Prediction confidence communication | Concern | No unsupported probability is invented, but current-fitness qualification is hidden, target context is omitted, and interval meaning/evidence are insufficient. |
| Mobile experience | Fail | Date controls overlap at 320px; Training detail has no Back at 1024px; Agenda lacks recorded-activity detail access. |
| Accessibility | Fail | Training detail focus and Plan dialog focus return fail; Calendar background is not inert; several targets remain smaller than 44×44. |
| Copy clarity | Concern | Home naming is corrected; Activities, persisted review, immutable version and operational language remain in routine runner flows. |
| Design consistency | Concern | Navy surfaces and semantic accents are consistent; control dimensions, disclosure behavior and navigation placement are not. |
| Contract adherence | Fail | Binding N4, C6, A2, A5, R4 and release-evidence requirements remain unmet, alongside unfinished interpretation/workflow requirements. |

## 2. Design intent preserved

- Exactly three primary destinations remain in the required order. Calendar belongs to Plan; utility destinations retain secondary placement.
- Home reads Race outlook → Recent training → Next action, and its heading now correctly says Home.
- The duplicate Home distance selector/ID is removed. Prediction selection is a disclosed display control.
- Latest training is selected by activity date and matched to that activity's saved review, without substituting an older reviewed session.
- A delayed activity-list response no longer clears the checked direct activity link.
- Measured activity facts precede commentary; commentary is advisory and does not activate or rewrite the approved plan.
- Today's session remains separate from prediction loading. Unsupported probability or on-track scores are not invented.
- Plan history starts collapsed. The checked Plan activation dialog now contains Tab navigation, makes its background inert, and closes on Escape before submission.
- Compact Calendar uses Agenda and hides the unusable Weeks toggle. Import partial-result wording passes the existing fixture test.

## 3. Design drift found

Retain the original F identifiers so implementation and acceptance remain traceable. None of F01–F10 is fully closed by this review.

| Finding | Status | Remaining drift and evidence |
|---|---|---|
| F01 — Race understanding | Partial | `dashboard-shell.tsx:108–109` places the current-fitness qualification inside collapsed readiness content, hard-codes unavailable target/date, and supplies only a brief model/signal/weekly-volume explanation. The Today contract can supply goal title/date; use it when supported, without claiming a compatible race forecast. The disclosure itself is acceptable: its incomplete content, not the absence of a new route, is the issue. |
| F02 — Home hierarchy/actions | Partial | Home naming, selector duplication and outlook retry emphasis are fixed. Operational status remains above the three groups; stale messaging sits outside the affected outlook group. Recent-training interpretation still lacks the intended explanatory emphasis. See `dashboard-shell.tsx:99` and the current Home screenshot. |
| F03 — Review truthfulness | Open | A controlled 503 from the latest-review read shows a **Review pending** badge while body copy says unavailable (`home-recent-training.tsx:46–47`). Missing summaries do not establish that a review was queued. Comparison and consequential limitations remain hidden behind detail disclosures (`activity-coach-review.tsx:93–101`). |
| F04 — Training journey | Partial | The delayed direct link passes. At 390px, keyboard activation leaves focus on BODY: the actual loaded heading is not focusable, although an effect calls focus. Filters remain expanded and lack an applied summary. Return selection/filter/list/scroll/focus context is not fully implemented. See `activities-shell.tsx:70`, `:173`, `:390`. |
| F05 — Responsive/navigation | Partial | At 1024px, selected detail hides the list while Back remains hidden: the new 900–1199 rule did not extend the Back control's old breakpoint (`activities.css:170`, `:259`, `:285`). At 320px, date fields overlap by about 21px and the second field reaches x=321.7; clipping masks page overflow. Plan renders two Plan views navigations (`coaching-pages.tsx:105`, `:526`). Compact Agenda renders recorded activities before sessions rather than one date sequence and supplies no recorded-activity review/detail action (`:1076`). |
| F06 — Plan states/workflow | Partial | Main-panel loading/error handling and collapsed history improve matters. A failed active-plan read still produces **No active plan** in the header; the failure path sets the prior plan to null (`coaching-pages.tsx:342–355`, `:523`). The stage indicator always marks Goal & context; publication yields an artifact ID/message without a concrete resumable context handoff. Saved proposal loading is present and should be retained. |
| F07 — Accessibility/consequential actions | Partial | Plan dialog containment/Escape/inert background pass. After Escape, focus returns to BODY instead of the visible launcher, even after waiting for animation frames. Calendar has no inert background; its information target measures 30×44px. Training controls measure roughly 39–41px high. Proposal Confirm/Cancel lack pending guards, and error handling closes confirmation without authoritative conflict rereview (`coaching-pages.tsx:484–506`, `:593`). Escape callbacks also ignore pending Plan writes. |
| F08 — Add training/data recovery | Open | Data Quality lacks affected-item, consequence and return context. Upload help still omits the actual applicable size limit. File/source can change while importing; selecting a file resets request state without clearing the previous result. Import and View Training remain primary together after success. Strava setup bypasses the specified Settings context/return flow (`coaching-pages.tsx:265–290`). |
| F09 — Settings/copy/consistency | Partial | Home copy is improved, but the Training page still says Activities. Both `SettingsPage` and `components/sync/online-sync-settings.tsx` expose multiple workflows/operations and primary actions. Shared target sizing and plain runner language remain inconsistent. |
| F10 — Release evidence | Open | QA rows DB-F04, DB-S01, GS-S01, AI-F02 and AI-F06 still claim PASS beyond their evidence or despite defects. The 30-second check is inferred from composition, not observed. Backlog DONE claims need reconciliation. The current 4/4 suite does not cover these defects: its mobile assertion only checks document width, which clipping allows to pass. |

## 4. Missing or incomplete states

Confirmed gaps: review loading/queued/not-requested/attention/failure distinctions; active-plan unknown/loading/error versus confirmed empty, including prior-data refresh preservation; target available but race comparison unavailable; proposal submitting/conflict/rereview; selected file versus previous import result; pending source/file ownership; contextual recovery and return.

Not fully evidenced in this review: every independent stale/refresh combination, complete success/partial/duplicate/rejected/queued import outcomes, external planning resume, authentication expiry/return, all keyboard/screen-reader/zoom/contrast cases, the unprompted 30-second comprehension target, and deployed smoke. Unevidenced does not mean absent, but cannot satisfy the release gate.

## 5. UX risks

- Runners can be stranded in tablet activity detail or lose their keyboard position after opening/closing content.
- Pending implies future work when the app only knows a read failed; no-plan implies deletion/absence when the app cannot read the plan.
- A prominent finish estimate without an adjacent current-fitness qualifier, target context and meaningful evidence can invite overconfidence.
- Duplicate navigation, exposed filters and operational workflows obscure the simple daily journey.
- A previous import result can appear to describe a newly selected file; pending proposal controls permit ambiguous repeat submission.
- Passing superficial checks and overstated completion labels can lead to premature release.

## 6. Required fixes before release

1. **F04/F05:** Make detail and Back share the below-1200 breakpoint. Restore keyboard focus and launching context; preserve the verified delayed-link fix. Make date fields truly fit at 320px without overlap or clipping. Add collapsed Filters, applied summary and Clear; disclose secondary telemetry.
2. **F03/F06:** Use authoritative, distinct review and plan states. Reserve pending for known queued/waiting/processing work and empty for a successful empty read. Keep prior plan data during recoverable refresh failure.
3. **F07:** Capture the launcher before dialog autofocus, restore it after close, inert Calendar backgrounds, enforce pending/cancellation rules, require authoritative rereview after conflicts, and meet 44×44 targets. Verify keyboard and assistive-technology behavior.
4. **F01/F02:** Place current-fitness qualification and consequential caveats beside the estimate; resolve available target/date; explain supplied interval semantics or their documented limits; provide useful existing evidence/trends through readiness. Keep operational warnings local and recent training the main explanatory area.
5. **F05/F06:** Render one local Plan switch, give Agenda chronological date grouping and activity/review access, and drive Plan stages and saved-context continuation from actual workflow state. Retain collapsed history and existing approval authority.
6. **F08/F09:** Implement contextual Data Quality recovery and Settings return, applicable import rules and result ownership, disclosure of Settings groups, one primary action per active task, and consistent runner copy across both Settings variants.
7. **F10:** Reconcile backlog/QA statuses; add behavior assertions for the reproduced defects; execute the required journeys/states/viewport boundaries, actual 200% zoom, accessibility checks and unprompted comprehension observations. Record unavailable human/deployment evidence as outstanding, never fabricate it.

## 7. Optional improvements for later

- Refine wording and wide-screen spacing using feedback after required comprehension checks pass.
- Add additional supported trend comparisons if they answer a distinct runner question and retain a text equivalent.
- Refine icon alignment and transition polish after navigation, states and accessibility meet the contract.

Missing readiness content, return context, responsive fixes, disclosure and accessibility are required work, not optional polish.

## 8. Copy-ready Luna handoff

Implement the remaining F01–F10 issues in `docs/progress/race-predictor-design-intent-rereview-2026-09-12.md`, using `docs/design/DESIGN_INTENT_CONTRACT.md` as authority and the redesign backlog/QA matrix for acceptance tracking. Preserve unrelated working-tree changes and the fixes verified in section 2. Preserve URLs, APIs, prediction calculations, authentication/privacy, approval authority, timezone semantics and schedule permissions. Do not invent analytical evidence or treat an unavailable comparison as proof the target itself is unavailable.

Follow the required fixes in section 6. First reproduce and repair 320px overlapping date inputs; 1024px selected detail without Back; 390px Training focus loss; Plan Escape focus loss; duplicate Plan switches; review 503 labeled pending; active-plan 503 labeled no-plan; and Calendar background/target defects. Then finish readiness/target/caveat content, disclosed filters and context restoration, Agenda chronology/review access, real Plan stages/resume and pending/conflict handling, contextual import/recovery and grouped Settings. An inline readiness disclosure is acceptable if it delivers the required detail and context.

Extend the existing tests to check visible control bounds, overlap, Back availability, focus and state semantics rather than document width alone. Verify both local and online capability paths with isolated fixtures for writes. Rerun relevant tests and the full design-intent review. Update each F finding, backlog ticket and QA assertion with current evidence; do not mark the whole redesign complete because the four focused tests pass. Report remaining human/deployment checks explicitly. Return the eight requested review outputs, including a clear release verdict.
