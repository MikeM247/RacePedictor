# Race Predictor — review after F01–F10 implementation

## 1. Overall verdict: Fail

The redesign preserves its broad structure and fixes several reproduced defects, but it still fails binding experience requirements. This supersedes the previous implementation summary's claim that only verification evidence remains. There are confirmed product defects as well as unverified release checks.

Authority: [Design Intent Contract](../design/DESIGN_INTENT_CONTRACT.md), [implementation backlog](../design/REDESIGN_IMPLEMENTATION_BACKLOG.md), and [QA matrix](race-predictor-redesign-qa-matrix.md). This review inspected the current dirty working tree without modifying product code.

### Assessment of the 14 requested dimensions

| Dimension | Verdict | Assessment |
|---|---|---|
| Product purpose | Concern | Training, estimate and next session remain accessible, but supported race interpretation and review limitations are incomplete. |
| User journey clarity | Fail | First-plan absence prevents saved-draft loading; source/result and recovery flows remain ambiguous. |
| Navigation clarity | Concern | Three primary destinations and one local Plan switch are preserved. Contextual return remains incomplete. |
| Visual hierarchy | Concern | Home retains its three groups, but the outlook dominates the inspected screen and the latest-session meaning remains thin. |
| Screen purpose | Fail | Data Quality still behaves primarily as an importer; online operational controls are mislabeled as Reminder handoff. |
| Primary actions | Fail | Browser checks found three filled actions in expanded Plan and two following file success. Settings also exposes competing workflow actions. |
| Secondary actions | Concern | Filters and Settings groups now disclose. Telemetry remains expanded; Plan stages still expose competing content. |
| Empty/loading/error/success states | Fail | No-plan becomes an error, absent review summaries imply no request, and approval failure appears outside its modal. |
| Prediction confidence communication | Concern | Current-fitness and non-probability qualifications are visible. Meaningful supported reasoning, complete evidence and review caveats remain incomplete. |
| Mobile experience | Concern | 320px filter bounds and 1024px Back/focus pass. Full boundary, zoom, dialogue and recovery journeys remain unverified. |
| Accessibility | Fail | Several focus/target repairs work; a consequential error is outside the active modal and its inert background makes that feedback inaccessible. |
| Copy clarity | Concern | Training and current-fitness labels improve clarity; no-request, no-plan, operational group and immutable-version copy remain misleading or technical. |
| Design consistency | Concern | Matte navy/cyan styling and shared navigation remain recognizable; action/disclosure behavior is inconsistent. |
| Contract adherence | Fail | UX5, UX6, C3, L2, N4, I5, state rules and the release evidence gate remain unmet. |

## 2. Design intent preserved

- Home / Training / Plan remain the three primary destinations; Calendar stays under Plan. The inspected Plan has one local Overview / Calendar switch.
- Home retains exactly Race outlook → Recent training → Next action. Current-fitness qualification, range limits and supported target/date are visible beside the estimate; no target probability is invented.
- Latest activity is selected by activity date. Activity facts remain separate from advisory review, and approval still requires an explicit confirmation.
- Filters start disclosed behind a control. At 320px, all four measured filter controls were 44px high and within x=29–291, with date fields on separate rows.
- At 1024px, keyboard activity activation focused the loaded heading, exposed Back to Training, and restored row focus after Back.
- Calendar uses Agenda below 1200px; source now orders records/sessions by date and supplies activity review links. The checked dialog made four background elements inert; its information button measured 44×44px.
- Settings limits expansion to one group, and file inputs/source controls are guarded during import.

## 3. Design drift found

Keep the original F identifiers. “Partial” means useful repairs exist but the finding cannot be closed.

| ID | Status / priority | Remaining drift and source evidence |
|---|---|---|
| F01 — Race understanding | Partial / P1 | The visible explanation is still generic: recent imported training supports the estimate. Readiness exposes only the first driver label and renders all feature points under “Recent weekly distance” without checking feature identity. It does not expose the available driver values/directions or a meaningful explanation of the trend. Target-read failure shares the no-target copy. See `apps/web/components/dashboard/dashboard-shell.tsx:98`, `:99`, `:139`. |
| F02 — Home hierarchy and interpretation | Partial / P1 | Group placement is repaired, but the inspected outlook takes most of the initial explanatory area. Home uses headline + next step + comparison rather than a clear supported goal implication or explicit inability to assess it. Essential review limitations are absent. See `home-recent-training.tsx:48`; `postfix-home.png`. |
| F03 — Review truthfulness | Open / P1 | Home reads completed summaries, then treats a missing match as “No review requested.” A queued activity with an empty completed-review list reproduced exactly that false claim. Home's summary response carries no material limitations, and full review does not display `matchState`, plan version or evidence references. Suggested/ambiguous matching can therefore read as an established comparison. See `home-recent-training.tsx:29`, `:45`; `activity-coach-review.tsx:84`; `packages/core/src/contracts/activity-review.ts:65`. |
| F04 — Training context and optional detail | Partial / P1 | Basic Back/focus works, but the outer list empty/error branches also remove independently loaded activity detail. Applying an empty-result filter left `activityId=audit-run` in the URL while removing the detail and Back control. The same render gating threatens direct records when list reads are empty/unavailable. No complete restoration of filters/loaded pages/scroll across route departures is implemented. Telemetry, splits and route sections remain expanded. See `activities-shell.tsx:247`, `:434`. |
| F05 — Responsive/navigation consistency | Partial / P1 | The reproduced 320px overlap, 1024px missing Back, duplicate Plan switch and Calendar information target are repaired. Full compact workflows still inherit F04/F07/F08 failures. Complete state-dependent boundary, 200% zoom and date/session return checks are not recorded. This finding is not evidence of a new overlap. |
| F06 — Plan states and continuation | Open / P1 | The active-plan API uses 404 `NOT_FOUND` for normal absence. `loadPlanPage` treats it as failure and returns before saved-draft/history reads. Prior plan data is retained in state but rendered only when load state is success, contradicting the promise that it remains visible during error. The current-stage expression can never select Import proposal; creation, import and review content remain simultaneous. Publication still returns a generic artifact-ID instruction, with no Plan rehydration of published context for resume. See `app/api/v1/coaching/plans/active/route.ts:11`; `coaching-pages.tsx:352`, `:478`, `:542`, `:551`. |
| F07 — Consequential actions/accessibility | Open / P1 | A controlled approval 503 kept the modal open but placed its error in the background `StatusLine`. The modal only showed Confirm/Cancel, with no failure message. Inert background makes the explanation unavailable to the modal user. Expanded Plan also presented Review saved draft, Publish context for Codex and Review and approve together. Conflict explanation is overwritten by the subsequent latest-draft loading/result message. See `coaching-pages.tsx:514`, `:578`, `:615`. |
| F08 — Import and contextual recovery | Open / P1 | The `source === "file" && !result ? fileForm : stravaForm` branch renders Strava as soon as a file result exists. Browser check: Upload a file remained selected while Import last 90 days and Return to Home were both primary. Data Quality still lacks affected-claim/consequence recovery composition. Its Settings handoff hard-codes a new import return URL, dropping the original `returnTo`; result navigation does not restore the originating assessment. See `coaching-pages.tsx:279–303`. |
| F09 — Settings and copy | Partial / P1 | Grouping does not guarantee one active task. Local Reminder handoff renders Generate handoff and Confirm scheduled externally together; online Connections can expose Connect Strava and Pair this computer together. Online “Reminder handoff” opens Operations guardrails, which is a different purpose. Local preference-read failure substitutes defaults instead of a clear failed-read/retry state. See `coaching-pages.tsx:1177`, `:1223`; `online-sync-settings.tsx:234`, `:303`. |
| F10 — Release evidence | Open / P1 | The prior re-review says all drift is addressed and only evidence remains; browser/source findings contradict that. Ticket 04 remains DONE and related QA PASS rows exceed demonstrated behavior. Existing E2E assertions still reference removed confidence copy, click the hidden mobile Weeks control, or open the removed single-limit Evidence limits disclosure. Build/unit success does not validate these journeys. |

## 4. Missing or incorrect states

- Actual queued/processing/retry/attention review state on Home; absent completed summary is not proof of no request.
- Material review limitations and suggested/ambiguous plan-match context beside Home interpretation.
- Successful no-active-plan response handling, independent draft/history loading, and visible prior-plan refresh/error state.
- Approval failure feedback within the active dialog and a durable conflict explanation before rereview.
- File-completion state with file-specific actions only; contextual data-recovery return across Settings.
- Failed target/preference reads distinct from an actual missing target/default preference.
- Selected record that remains usable when its surrounding list is empty or cannot refresh.

Not fully verified: complete stale/partial/duplicate/reused/provider-cancel/auth-expiry combinations, actual 200% zoom, screen-reader announcements/contrast, the unprompted 30-second comprehension test, and deployment smoke. These are evidence gaps, not all confirmed missing implementations.

## 5. UX risks

- A runner may believe feedback was never requested when it is already queued, or believe first-plan setup is broken because normal absence is shown as a service error.
- A failed approval appears to do nothing, encouraging repeated confirmation without understanding the failure.
- A completed file import unexpectedly offers a provider import, obscuring what was imported and what the next step does.
- Advisory comparisons without match uncertainty and evidence limits invite more trust than the underlying data supports.
- Labels and stage lists promise a simpler journey than the simultaneous actions actually provide.
- Overstated completion documents can lead to release before these behaviors are corrected.

## 6. Required fixes before release

1. **F03:** Resolve the latest activity's actual review status with the existing detail API; preserve review limitations and match/reference context across Home, detail and Calendar. Unknown must stay unknown.
2. **F06:** Handle documented no-plan absence separately from failed reads. Load drafts/history independently and continue displaying prior plan content during refresh/error. Make every stage reachable and restore published context/saved draft on return.
3. **F07:** Put pending/error/conflict feedback inside the active decision surface. Preserve draft and focus; require review of changed authoritative data before another decision. Keep one primary action per active stage.
4. **F08:** Correct file/Strava result rendering. Carry affected task, consequence and the full safe return context through Data Quality → Settings → recovery → assessment. Preserve all accepted/reused/partial/queued distinctions.
5. **F04/F05:** Decouple detail from list failure/emptiness, preserve full return context, and disclose optional record detail. Retain the 320px/1024px repairs and verify remaining boundaries and zoom.
6. **F01/F02:** Use supplied evidence for a concise outlook reason and optional fuller drivers/trends; label feature identity/units/timeframe accurately. Keep Home compact and expose the material caveat and supported goal implication or explicit limitation.
7. **F09:** Give Settings groups truthful names and one active workflow/action; distinguish failed reads from defaults and provide recovery. Keep operational diagnostics secondary.
8. **F10:** Correct completion claims and obsolete E2E assertions, then rerun the affected journeys with controlled fixtures. Record actual human/accessibility/deployment evidence separately; do not mark all F findings closed from build or composition checks.

## 7. Optional improvements for later

- Refine panel spacing and wording using feedback after the required comprehension check.
- Add further supported trend comparisons only when they answer a distinct runner question and retain text equivalents.
- Polish icon alignment and disclosure transitions after the state, action and return requirements pass.

## 8. Copy-ready handoff for Luna

Review `docs/progress/race-predictor-design-intent-postfix-review-2026-09-12.md` and implement its remaining F01–F10 requirements using `docs/design/DESIGN_INTENT_CONTRACT.md` as authority. Preserve unrelated working-tree changes, URLs, API contracts, prediction calculations, approval authority, privacy, timezone semantics and session permissions. Preserve the verified 320px filter, 1024px Back/focus, single Plan switch and Calendar inert/44px fixes.

First fix queued reviews labeled no-request, normal no-plan 404 blocking draft/history, prior-plan content hidden during refresh/error, approval errors behind the modal, and file success exposing Strava controls. Then complete actual Plan stages/resumable context, contextual Data Quality/Settings return, independent Training detail with full return context, material review limitations/match references, evidence-led readiness, and truthful Settings groups with one primary task. Use existing endpoints rather than inventing analytical evidence or changing backend authority.

Add behavior assertions for those exact triggers, including pointer/keyboard focus, pending/503/conflict states, selected file/result ownership and true control bounds. Update obsolete copy and hidden-control expectations. Run relevant local/online Playwright journeys at the contract widths and actual 200% zoom, plus applicable build/unit checks. Reconcile the backlog and QA matrix from actual evidence and return the eight review outputs with a clear release verdict. Keep unperformed human comprehension, assistive-technology and deployment checks explicitly outstanding.

### Validation evidence and limits

- Current source review and controlled Chromium probes against the running local development app at `127.0.0.1:3312`. Mocked requests intercepted file upload and proposal decision; no real import, plan approval, provider connection or schedule edit was submitted.
- Evidence: `.local/design-intent-review/postfix-results.json`, `postfix-followup-results.json`, `postfix-no-plan-results.json`, the corresponding `.cjs` scripts and `postfix-*.png` screenshots. The no-plan probe confirmed “Plan unavailable” and zero saved-draft reads after the documented 404. The first detail probe used an incomplete fixture (missing required elevation loss); its timeout is excluded as an app defect. The corrected follow-up verified heading and return focus.
- Screenshots were inspected for Home at 1440px, file success at 768px and approval failure at 1440px. Control measurements covered Training at 320px and Calendar at 1440px; Training Back/focus was checked at 1024px and Agenda at 768px. This is not the full responsive matrix.
- Existing saved validation logs confirm the earlier 96/96 unit run and production build. They were reviewed, not rerun for this review. The full current E2E suite has not been certified; targeted browser probes establish the defects above independently of that suite.
- QA result: **FAIL — Rework required.** No release approval is implied.
