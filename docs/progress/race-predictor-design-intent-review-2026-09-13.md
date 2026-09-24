# Race Predictor design-intent review — 13 September 2026

## 1. Overall verdict: FAIL — rework required

Reviewed the current working tree against `docs/design/DESIGN_INTENT_CONTRACT.md`, `docs/design/REDESIGN_IMPLEMENTATION_BACKLOG.md`, and `docs/progress/race-predictor-redesign-qa-matrix.md`. This is a product-experience verdict, not a compilation verdict. Outstanding implementation work is not complete.

| Assessment | Verdict | Evidence / implication |
|---|---|---|
| Product purpose | Concern | The three runner questions remain visible, but the outlook offers a generic explanation rather than a useful supported reason. |
| User journey clarity | Fail | Normal no-plan absence blocks saved-draft loading; Plan stages remain simultaneous. |
| Navigation clarity | Concern | Home / Training / Plan and local Plan views work; recovery and full return context remain incomplete. |
| Visual hierarchy | Concern | Three Home groups are preserved, but the inspected outlook dominates the initial explanatory space. |
| Screen purpose | Fail | Data Quality primarily presents an importer; online operations are labeled Reminder handoff. |
| Primary actions | Fail | Expanded Plan has three filled actions; file success has two; local reminder group exposes two. |
| Secondary actions | Concern | Filters and readiness disclose, but optional activity telemetry, splits and route remain expanded. |
| Empty/loading/error/success | Fail | No-plan becomes an error; selected detail disappears with an empty list; approval failure is outside its modal. |
| Prediction confidence | Concern | Current-fitness and non-probability wording is sound; evidence attribution and unavailable-target handling remain incomplete. |
| Mobile experience | Concern | Fresh 320px filters and 1024px detail/Back checks pass; complete boundary, zoom and state journeys remain unverified. |
| Accessibility | Fail | Focus return and Calendar target/inert checks pass, but approval errors are inaccessible behind the active modal. |
| Copy clarity | Concern | Queued review copy now reflects actual state; no-plan, preference fallback, workflow and operations wording still misleads. |
| Design consistency | Concern | Brand, palette and shell remain coherent; action priority and disclosure differ between surfaces. |
| Contract adherence | Fail | UX5, N4, L2, I5 and section 10 remain violated; release evidence is incomplete. |

## 2. Design intent preserved

- Exactly three primary destinations and one Overview / Calendar switch in inspected Plan.
- Home retains Race outlook → Recent training → Next action. Training facts remain accessible without a plan.
- Current-fitness estimate and low-to-high range are explicitly distinguished from race-date forecasts and probabilities.
- Latest-session review now uses the activity-specific review endpoint. A fresh queued fixture displays **Review queued**, with recorded facts and an explicit goal-impact limitation. This corrects the prior false no-request finding.
- Source now includes full-review match status, plan version, evidence references, and visible material limitations on Home/detail. Ready-review variants still need browser validation before F03 closes.
- Fresh browser checks: 320px filter controls remain within the viewport and measure 44px high; 1024px keyboard selection focuses detail and Back returns focus to the row; Calendar information target is 44×44px, dialog background is inert, and Agenda appears at 768px.
- Plan decisions remain explicit. Review advice does not automatically change prescriptions.

## 3. Design drift found

Retain F01–F10 rather than renumbering the existing work.

| ID | Current status | Required correction |
|---|---|---|
| F01 | Open | Replace generic outlook reasoning with supported evidence; expose available driver contributions and label each trend by actual feature, units and period. A failed target read must not imply no target. Source: `dashboard-shell.tsx:95–132`. |
| F02 | Partial | Keep outlook compact and recent training the main explanatory area. Validate ready-review excerpts, material caveats and explicit supported goal implication/unavailability within the contract's concise summary rule. |
| F03 | Partial; queued case verified fixed | Exercise ready, processing, retry, attention, unavailable, suggested and ambiguous comparison cases across Home, Training and Calendar. Do not regress the new status/limitation/reference rendering. |
| F04 | Open | Render selected detail independently of list state. Fresh empty-filter probe leaves activityId in the URL but removes detail and Back. Preserve filters, loaded pages, position and focus across departures; add optional-detail disclosures. Source: `activities-shell.tsx:247`, `:435`. |
| F05 | Partial | Preserve verified narrow filters, medium Back, single Plan switch and Calendar target fixes. Complete contract boundary/resize/200% zoom journeys, including failed reads and pending dialogs. |
| F06 | Open | Normal active-plan 404 NOT_FOUND must mean no plan, not service failure. Fresh probe reports Plan unavailable and zero draft reads. Load draft/history independently; keep prior plan visible during refresh/error; make all five stages reachable and published context resumable. Source: `coaching-pages.tsx:352`, `:542`, `:551`. |
| F07 | Open | Show approval failure inside its active dialog. Fresh 503 probe finds no dialog error and one background error. Preserve conflict explanation across authoritative reload and require rereview; reduce expanded Plan's three filled actions to one per stage. Source: `coaching-pages.tsx:514`, `:615`. |
| F08 | Open | Fix file/result branch: fresh file success leaves File selected while exposing Import last 90 days and Return to Home. Carry affected task, consequence and full safe return context through Data Quality and Settings. Source: `coaching-pages.tsx:279`, `:288`. |
| F09 | Open | Separate connection and pairing workflows; rename Operations accurately. Local preference-read errors need a truthful error/retry state. Stage reminder preparation/confirmation and guard pending submissions. Source: `coaching-pages.tsx:1171`, `:1223`; `online-sync-settings.tsx:234`, `:303`. |
| F10 | Open | Reconcile backlog/QA completion claims with actual results, update obsolete E2E assertions, and record complete release evidence. Compilation success cannot close UX failures. |

## 4. Missing or incorrect states

- Normal no-active-plan with independently available saved draft/history.
- Prior active plan retained visibly during refresh or read failure.
- Approval error within the modal; durable conflict explanation before rereview.
- Selected activity that survives empty/failed surrounding list reads.
- File-owned completion and contextual recovery return through Settings.
- Failed target/preference reads distinct from genuine absence/default configuration.

Review pending is no longer wholly missing: the queued Home case passes. Other review-state and material-caveat variants remain verification work, not proven missing code.

## 5. UX risks

First-time users can perceive Plan setup as broken. An approval failure appears unresponsive and invites repeat confirmation. File completion suggests an unrelated import action. Filtering can strand a selected activity. Generic reasoning and misnamed trends can undermine the runner's understanding of evidence. Incomplete test records risk premature release approval.

## 6. Required fixes before release

Fix F06/F07/F08 first, then F04 and F09. Complete F01/F02 and verify the new F03 behavior. Close F05/F10 only with actual journey evidence. All applicable P0 QA criteria must pass or have an explicit accepted disposition; no release approval is implied by this review.

## 7. Optional improvements for later

- Refine spacing and wording using observed comprehension feedback after the required check.
- Add further supported trend comparisons only where they answer a distinct runner question.
- Polish icon alignment and disclosure transitions after state, navigation and action failures are resolved.

## 8. Handoff prompt for Luna

Implement outstanding F01–F10 in `docs/progress/race-predictor-design-intent-review-2026-09-13.md`, using `docs/design/DESIGN_INTENT_CONTRACT.md` as authority and the backlog/QA matrix as acceptance criteria. Preserve unrelated working-tree changes, routes, API contracts, prediction calculations, privacy, explicit approval authority and date/session permissions.

First repair normal no-plan 404 handling and independent draft/history reads; retain prior plan content during refresh/error; move approval failures into the modal and preserve conflict explanation before authoritative rereview; correct file-success ownership; and decouple selected Training detail from list emptiness/failure. Then finish resumable Plan stages with one primary action, complete return context through Data Quality/Settings, truthful Settings grouping/error recovery, optional activity disclosures and evidence-led Home/readiness summaries. Preserve the newly fixed queued-review status and material limitation/match/reference rendering.

Add regression assertions for each exact trigger, including no unintended writes, pending/503/conflict states, keyboard focus, direct links and return restoration. Verify ready/pending/ambiguous reviews across Home/Training/Calendar, all contract breakpoints and actual 200% zoom. Run relevant local/online E2E and compile/unit checks; reconcile every completion claim with evidence. Return the eight review outputs and keep unperformed comprehension, assistive-technology and deployment checks explicitly outstanding.

## Validation evidence and limits

- Types: PASS, `npm run typecheck` on the current working tree.
- Browser: fresh controlled Chromium probes against local Next development app at 127.0.0.1:3312, using webpack. Screenshot inspection covered Home, file completion and approval failure. API writes were intercepted; no real import or approval was submitted.
- Fresh results: `.local/design-intent-review/review-20260913-results.json`; rerun `postfix-followup-results.json` and `postfix-no-plan-results.json`. These establish the reproduced defects and narrow passes above; they are not a complete E2E certification.
- Initial preview attempt used default Turbopack and failed because this repository configures webpack. Restarting with `--webpack` resolved that environment setup issue; it is not counted as a product defect.
- Build/unit/lint/full E2E: not rerun for this review. Earlier 96-test/build results are historical only.
- Human comprehension, full screen-reader/contrast validation, complete boundary/zoom coverage and deployment smoke remain outstanding.
- Recommendation: **Rework required.**
