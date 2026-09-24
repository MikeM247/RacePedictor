# Race Predictor Redesign — QA Matrix

**Status:** In progress  
**Created:** 2026-09-12  
**Owner:** QA / product team  
**Source of truth:** [`DESIGN_INTENT_CONTRACT.md`](../design/DESIGN_INTENT_CONTRACT.md) and [`REDESIGN_IMPLEMENTATION_BACKLOG.md`](../design/REDESIGN_IMPLEMENTATION_BACKLOG.md)

## How to update this file

Update the `Status` and `Evidence / notes` cells for each task as it is tested.

- `TODO` — not tested
- `IN PROGRESS` — currently being tested
- `PASS` — verified with evidence
- `FAIL` — defect or unmet acceptance criterion
- `N/A` — not applicable, with a reason recorded

Record the environment, route, viewport, fixture, test run, and defect link where relevant. A missing capability must be recorded as a truthful unavailable state, not treated as a pass.

## Coverage legend

| Priority | Meaning |
|---|---|
| P0 | Core journey, trust, data integrity, authentication, or release blocker |
| P1 | Required redesign behavior or significant usability/accessibility risk |
| P2 | Supporting consistency or lower-risk polish |

## Progress summary

| Flow | TODO | In progress | Pass | Fail | N/A |
|---|---:|---:|---:|---:|---:|
| Dashboard | 0 | 5 | 7 | 0 | 0 |
| Activity upload/import | 2 | 10 | 0 | 0 | 0 |
| Race goal setup | 1 | 10 | 0 | 0 | 0 |
| Prediction review | 1 | 4 | 6 | 0 | 0 |
| Training trends | 7 | 1 | 2 | 0 | 0 |
| Data confidence | 2 | 8 | 0 | 0 | 0 |
| Mobile navigation | 2 | 5 | 3 | 0 | 0 |
| Deployment smoke test | 11 | 0 | 0 | 0 | 0 |

---

## 1. Dashboard

Contract focus: P1–P3, U3, UX1–UX6, V1–V4, C2–C3, L1–L3, I1–I2, section 10, A1–A6, R3. Backlog focus: Tickets 01–05.

| ID | QA dimension | Test / acceptance check | Expected result | Pri | Status | Evidence / notes |
|---|---|---|---|---:|---|---|
| DB-F01 | Functional | Load `/dashboard` with complete goal, latest activity, outlook, and schedule fixtures | Home renders exactly Race outlook → Recent training → Next action in DOM and visual reading order | P0 | PASS | 2026-09-15 `redesign-home.spec.ts`: 15/15 local isolated-snapshot cases and 15/15 online-fixture cases assert exactly three ordered `.home-group` regions; `npm test` 129/129, typecheck and build pass. |
| DB-F02 | Functional | Open readiness, latest session, and today’s schedule from Home | Each opens in one activation and retains the correct launching context | P0 | IN PROGRESS | 2026-09-15 local/online Home fixtures prove readiness open/Back launcher focus and Home → activity-specific full review → Home return/focus with zero writes. Today’s direct Calendar destination is asserted from the Home rest fixture; an activated approved-session Calendar return from Home remains open. |
| DB-F03 | Functional | Load newer activity with review pending and older activity reviewed | Latest activity is selected by activity date; pending state is shown rather than older review | P0 | PASS | 2026-09-15 local/online Home fixtures sort two records by activity date and show `Latest pending run` with `Review queued`, never the older reviewed fixture. 2026-09-16 F03 runs also preserve response identity and current status during shared review loading. |
| DB-F04 | UX acceptance | Review Home within 30 seconds without opening detail | Target/timeframe, supported outlook, one reason, caveat/confidence meaning, latest-session takeaway, and next action are identifiable | P0 | IN PROGRESS | Source composition now puts current-fitness, limits and target context beside the outlook. An unprompted 30-second human observation is still required. |
| DB-F05 | UX acceptance | Verify no-goal, no-plan, and no-activity onboarding states | One useful primary action is offered; recorded training and today’s prescription remain accessible | P0 | PASS | Existing Today states retained; Home empty training state uses secondary Add training so Home keeps one filled action maximum. |
| DB-F06 | Visual consistency | Compare Home panels, headings, metadata, buttons, status text, spacing, and surface tokens with shared design rules | Matte dark palette, type scale, spacing, semantic colors, and one filled primary action are consistent | P1 | PASS | Focused polish pass aligned page/section heading sizes, compact 16px gutters, 44px state controls, narrow session spacing, and outcome-specific retry/session labels; no data or business behavior changed. |
| DB-A01 | Accessibility | Keyboard and screen-reader pass through shell, three groups, links, and status content | Skip link, one H1, logical headings, labeled regions, visible focus, text status, and no color-only meaning | P0 | IN PROGRESS | 2026-09-23 F05 axe scans and browser skip-link/focus checks pass in local and online fixture runs; screen-reader and switch-control execution remain outstanding. |
| DB-R01 | Responsive | Check 320, 768, 1199, 1200, and 1440 CSS px | One vertical Home sequence remains; no dense three-column dashboard or page-level horizontal scroll | P0 | PASS | 2026-09-15 local/online long-caveat fixture checked 320, 767, 768, 1199, 1200 and 1440 CSS px; all kept caveats visible and `scrollWidth <= viewport`. Actual browser-level 200% zoom is tracked separately and remains unperformed. |
| DB-S01 | State coverage | Exercise loading, refresh, no goal, no plan, no activities, pending review, stale analytics, failed outlook, failed history, and success | Affected group has an accurate independent state; prior usable data remains during refresh; errors never become empty data | P0 | IN PROGRESS | Truthful independent states are implemented and `npm test` passed 129/129. F02 local/online fixtures cover pending review and independent review failure; controlled browser fixtures for every listed state remain required. |
| DB-D01 | Data quality/confidence | Verify missing goal, missing evidence, stale prediction, and unsupported confidence | Unknown remains unknown; current-fitness estimate is labeled; no fabricated score, range, probability, or verdict | P0 | PASS | Home labels target race date/on-track comparison and probability/score as unavailable; existing supported prediction spread is retained. |
| DB-X01 | Regression risk | Verify existing dashboard route, authentication, API contracts, persistence, schedule, and coaching behavior | Redesign presentation does not alter existing domain semantics or protected data behavior | P0 | PASS | No API/domain/persistence changes; existing web unit suite and production build passed. |
| DB-PW01 | Playwright candidate | Authenticated launch-to-next-action smoke with fixtures for complete and no-setup users | Core dashboard journey completes by pointer and keyboard at compact, medium, and wide viewports | P0 | IN PROGRESS | 2026-09-15 focused `redesign-home.spec.ts` passes 15/15 in isolated local and online modes, including pointer navigation and Home return focus. It is synthetic fixture coverage, not an authenticated deployed smoke; keyboard and human/AT checks remain open. |

## 2. Activity upload/import

Contract focus: C3–C4, C6, I2, I5, section 10, N3–N4, R6. Backlog focus: Tickets 03, 06–08.

| ID | QA dimension | Test / acceptance check | Expected result | Pri | Status | Evidence / notes |
|---|---|---|---|---:|---|---|
| AI-F01 | Functional | Open Add training from Training, Home empty state, and Data Quality | Source choice is one visible File or Strava path and return context is preserved | P0 | IN PROGRESS | 2026-09-14: local/online F08 browser recovery verifies Training → Data Quality → selected-session return. Home empty/readiness launchers are implemented but their full browser matrix remains open. |
| AI-F02 | Functional | Upload valid CSV and one-activity GPX; submit twice rapidly | Rules are shown before selection; explicit import is required; submit disables and duplicate request is prevented | P0 | IN PROGRESS | 2026-09-14: schema-valid synthetic GPX rapid-double-click path issued exactly one upload in local and online F08 browser runs. Real CSV and retained-failure cases remain open. |
| AI-F03 | Functional | Exercise accepted, duplicate, rejected, warning, partial, duplicate-only, and queued server results | Actual counts and next action are shown; accepted records can be viewed; queue is not called ingestion complete | P0 | IN PROGRESS | 2026-09-14 unit presentation matrix covers accepted, duplicate-only, rejected, warning, reuse and processing; schema-valid partial browser fixture passes. Full queued browser matrix remains open. |
| AI-F04 | Functional | Exercise unsupported, malformed, oversized, missing, network-failed file, and Strava cancellation/disconnection | Specific recovery is offered and safe choices/input are retained where possible | P0 | IN PROGRESS | Unsupported file retains the prior File result in local/online F08 browser evidence; unit coverage includes failures. Actual provider cancellation is deliberately an API error, not a mocked recovery redirect, and its presentation gap remains open. |
| AI-F05 | UX acceptance | Complete File and Strava paths as a runner unfamiliar with infrastructure | Flow explains source, limits, authorization versus import, and where to find results in plain language | P1 | IN PROGRESS | Copy provides these distinctions, but the required unfamiliar-runner comprehension test has not been performed. |
| AI-F06 | Visual consistency | Compare import controls, result summaries, status treatments, and actions with shared primitives | Persistent labels, adjacent help/errors, semantic statuses, and one visually primary next action | P1 | IN PROGRESS | 2026-09-14 browser check confirms a single primary File return/check action and no horizontal overflow at a 720px 200%-zoom proxy. Compact visual review remains required. |
| AI-A01 | Accessibility | Keyboard file selection path, validation, result review, and Strava return path | Labels/errors are associated; first invalid field receives focus; status changes are announced once and meaningfully | P0 | TODO | Native radio/file/button/link controls, persistent labels, and live status/error regions are implemented; browser/assistive-technology execution remains. |
| AI-R01 | Responsive | Test import and result views at 320px and 768px | File rules and actions remain visible; result summaries stack; no horizontal scroll or keyboard obstruction | P1 | TODO | Existing coaching panel/form responsive rules are reused; browser viewport execution remains. |
| AI-S01 | State coverage | Verify initial loading, validating, importing, queued, partial, success, error, and authorization-cancelled states | No invented progress or completion; durable result and supported recovery are visible | P0 | IN PROGRESS | 2026-09-14 unit and browser fixtures prove source ownership, processing/unavailable normalized state and schema-valid partial/success. Actual provider cancellation remains the documented API-error gap. |
| AI-D01 | Data quality/confidence | Compare imported activity facts before and after review/prediction generation | Import success does not imply review or prediction readiness; missing values are unavailable, never zero | P0 | IN PROGRESS | 2026-09-14 presentation tests and local/online browser fixtures retain unknown normalized and assessment/review status; acceptance is not treated as recomputation. A real assessment-age/read-failure comparison remains open. |
| AI-X01 | Regression risk | Verify existing upload API, deduplication, file constraints, Strava OAuth, import persistence, and Training visibility | Existing import semantics and provider boundaries remain intact | P0 | IN PROGRESS | Unit suite (111), typecheck and build pass; F08 tests keep the upload contract schema-valid and direct cancellation an API error. Full real-provider/import-persistence regression remains open. |
| AI-PW01 | Playwright candidate | Valid file, partial import, duplicate-only, failed upload, queued response, and Strava-cancel journeys | Result states, button pending behavior, navigation, and return paths are asserted from realistic fixtures | P0 | IN PROGRESS | 2026-09-14 `f08-recovery.spec.ts` passes locally and online (valid GPX rapid-submit/source ownership; Training return). `redesign-coverage.spec.ts` schema-valid partial fixture passes online. Duplicate-only, failed, queued and real cancellation browser cases remain open. |

## 3. Race goal setup

Contract focus: U2–U3, UX3, UX5–UX6, L2, I2–I6, A2–A3, N2/N4. Backlog focus: Tickets 02–03, 09–10.

| ID | QA dimension | Test / acceptance check | Expected result | Pri | Status | Evidence / notes |
|---|---|---|---|---:|---|---|
| GS-F01 | Functional | Exercise no goal, no approved plan, active plan, saved draft, and proposed replacement | States are distinct and the current stage is explicit | P0 | IN PROGRESS | F06 now has independent validated reads, exact active-plan absence and visible stages. Unit evidence passes 106/106; full rendered-state/browser evidence remains incomplete. |
| GS-F02 | Functional | Create context, publish, import proposal, resume draft, approve, reject, and abandon replacement | Only confirmed approval changes authoritative Home/Calendar state; abandon preserves current plan | P0 | IN PROGRESS | Publish/import/return are explicit non-decision actions and existing F07 confirmation boundaries remain. Clean end-to-end decision and Home/Calendar timing evidence is still required. |
| GS-F03 | Functional | Submit invalid fields, missing returned proposal, stale history, approval failure, and revision conflict | Server validation is authoritative; values/draft are retained; conflict requires reload/review, never silent overwrite | P0 | IN PROGRESS | F06 validates success envelopes, retains prior content on recoverable reads/import failure, and preserves stale acknowledgement boundaries. Browser conflict/failure coverage is a shared F07 gap. |
| GS-F04 | UX acceptance | Follow goal/context → Codex → proposal → review → confirm sequence | Runner knows what to continue externally, what to bring back, and how to resume | P1 | IN PROGRESS | Current stage, Codex JSON download/instructions and explicit import are implemented. Reload/continuation and responsive comprehension journeys lack completed Playwright/human evidence. |
| GS-F05 | Visual consistency | Inspect staged forms, proposal review, confirmation, and plan history | Default view is settled goal/plan plus one creation/resume entry; secondary detail is progressively disclosed | P1 | IN PROGRESS | One-primary-action and current-stage composition are implemented, but visual/responsive review remains unexecuted and shared confirmation behavior belongs to F07. |
| GS-A01 | Accessibility | Keyboard form validation and approval/rejection dialogs | Persistent labels, adjacent errors, first-invalid focus, named dialog, focus containment/return, Escape, inert background | P0 | IN PROGRESS | 2026-09-23 online Plan conflict/duplicate-protection and all-route axe checks pass; complete approval/rejection keyboard and assistive-technology acceptance remains outstanding. |
| GS-R01 | Responsive | Test plan overview, forms, proposal comparison, and dialogs at 320/768/1199/1200px | Forms/comparisons stack; dialogs fit available width and remain scrollable without nested traps | P0 | TODO | Existing responsive coaching styles provide the stack; viewport boundary verification remains to run. |
| GS-S01 | State coverage | Verify loading, empty, draft, proposal, pending write, success, failure, stale, and unavailable online/local capability states | No false activation/success; current usable plan remains visible during recoverable failures | P0 | IN PROGRESS | F06 independent state/read retention and generation guards are unit-covered. Proposal conflict/pending-dialog coverage remains F07, while full browser failure/retry fixtures remain required. |
| GS-D01 | Data quality/confidence | Verify stale history acknowledgement and evidence limitations in proposal review | Freshness limitations are visible before confirmation; no unsupported target-time or plan claim | P1 | IN PROGRESS | Existing acknowledgement remains adjacent to confirmation; F06 now explicitly surfaces unsupported restoration goals. Decision-dialog execution is shared F07 work. |
| GS-X01 | Regression risk | Verify plan persistence, approval/rejection, history activation, auth, and Home/Calendar update timing | Existing approval, history, and persistence semantics remain unchanged | P0 | IN PROGRESS | Unit/type/build checks pass, but online/local Plan regressions do not have a clean completed Playwright result and Home/Calendar timing must still be observed. |
| GS-PW01 | Playwright candidate | First-plan, saved-draft resume, approval failure, conflict, and confirmed approval journeys | Stage transitions and authoritative post-approval state are asserted end to end | P0 | IN PROGRESS | Focused local fixture cases were updated; the online Plan runner stalled before final result. Complete isolated request-count, reload, failure and confirmation coverage is required. |

## 4. Prediction review

Contract focus: primary question table, UX1–UX3, UX6, C5, L3, I1, N3–N5. Backlog focus: Tickets 03–05, 13.

| ID | QA dimension | Test / acceptance check | Expected result | Pri | Status | Evidence / notes |
|---|---|---|---|---:|---|---|
| PR-F01 | Functional | Open readiness from Home and direct-load readiness URL | Same target and assessment timeframe appear; direct entry has explicit Back to Home | P0 | PASS | 2026-09-15 local and online `redesign-readiness.spec.ts` direct-anchor and safe-recovery fixtures pass; explicit Back, browser Back/Forward and restored launcher focus pass. |
| PR-F02 | Functional | Inspect supported estimate, evidence, assumptions, trend, and return actions | Detail disclosure is optional, one level deep, and reading it does not mutate goal/plan/prediction | P0 | PASS | 2026-09-15 local/online synthetic fixture asserts optional one-level detail, all supplied drivers, labeled text trends, distance selection and zero POST/PUT/PATCH/DELETE requests. |
| PR-F03 | Functional | Test compatible, incompatible, missing-target, insufficient-history, partial-evidence, stale, and failed estimate fixtures | Only supported comparisons appear; unsupported on-track verdicts and confidence visuals are absent | P0 | IN PROGRESS | F01 unit/browser fixtures cover confirmed target, failed target read, stale outlook, no explanatory evidence and no on-track claim. Compatible/incompatible/insufficient-history and failed-overview browser fixtures remain open. |
| PR-F04 | UX acceptance | Ask tester to explain estimate after reading summary | Tester can state estimate, target/timeframe, evidence basis, and principal uncertainty | P0 | TODO | |
| PR-F05 | Visual consistency | Inspect conclusion-first hierarchy, caveats, charts, units, and text equivalents | No KPI wall/gauge; caveat is beside claim; chart has period/units/basis and equivalent text | P1 | PASS | Local/online Home and readiness fixtures verify adjacent caveats, units and period with no chart/gauge. The earlier actual-200%-zoom claim is superseded; browser zoom remains unverified. |
| PR-A01 | Accessibility | Keyboard/screen-reader detail, disclosure, chart alternative, and Back behavior | Heading structure, labeled controls, visible focus, semantic text alternative, and restored launcher focus | P0 | IN PROGRESS | Automated keyboard Back/focus restoration and semantic text-list checks pass in local/online Playwright. Manual screen-reader/assistive-technology review remains open. |
| PR-R01 | Responsive | Test detail and comparison at 320/768/1199/1200px | Content remains readable, comparison stacks, and no inner/page horizontal scroll exists | P0 | PASS | Local/online Playwright pass at 320, 767, 768, 1199, 1200 and 1440 CSS px with no page overflow. The earlier actual-200%-zoom claim is superseded; browser zoom remains unverified. |
| PR-S01 | State coverage | Verify loading, refreshing, stale, unavailable confidence, failed fetch, and partial evidence | Valid stale estimate remains labeled; errors are local and actionable; no fabricated values | P0 | IN PROGRESS | Target loading/503/malformed/network/authorization state units plus stale outlook and target-only retry browser path pass. Failed overview and full partial-evidence fixture browser coverage remains open. |
| PR-D01 | Data quality/confidence | Verify confidence unavailable versus data freshness limitation | Prediction uncertainty and input freshness/completeness remain separate concepts and messages | P0 | PASS | F01 detail/browser assertions retain the estimate low-to-high range as non-probability uncertainty while freshness has separate stale/unavailable wording. |
| PR-X01 | Regression risk | Verify prediction calculation/display options, existing query routes, and read-only behavior | Presentation filters do not edit prediction inputs or active goal; existing prediction behavior persists | P0 | PASS | View-model unit coverage preserves options/canonical fields; local/online browser fixtures assert distance display changes and zero consequential mutation requests. |
| PR-PW01 | Playwright candidate | Home → readiness → evidence/trend → Back journey with compatible and unavailable fixtures | URL state, content, caveat, no-mutation assertion, and focus/context restoration pass | P0 | IN PROGRESS | Home → readiness → Back/Forward/direct/retry/confirmed-absence/recovery/no-mutation matrix passes local and online. Compatible/incompatible comparison fixtures are intentionally unsupported and remain coverage work. |

## 5. Training trends

Contract focus: UX1–UX4, C5–C6, N3–N5, R3–R5. Backlog focus: Tickets 05–07, 10, 13.

| ID | QA dimension | Test / acceptance check | Expected result | Pri | Status | Evidence / notes |
|---|---|---|---|---:|---|---|
| TT-F01 | Functional | Open the supported recent weekly-distance series and inspect period/source controls | Current supported period (last 12 weeks where applicable) is labeled; unsupported controls are absent | P1 | PASS | F01 groups supplied feature/unit series and labels the factual observation count and first/last week start; no unsupported period control is rendered. |
| TT-F02 | Functional | Apply and clear supported filters; open linked activities; return to originating view | Applied summary and Clear action remain visible; list context is preserved or link is honestly generic | P1 | IN PROGRESS | 2026-09-14 online `redesign-training-detail.spec.ts` proves an applied no-match/error list cannot hide the selected detail or its parent control. Trend-specific coverage remains open. |
| TT-F03 | UX acceptance | Ask tester what the trend demonstrates and what it cannot demonstrate | Tester identifies observed pattern, coverage gaps, and limitation without inferring readiness/adherence | P0 | TODO | |
| TT-F04 | Visual consistency | Inspect chart labels, period, units, comparison basis, and text summary | Trend is evidence for a question, not a new dashboard; no unlabeled bands or decorative analytics | P1 | PASS | Local/online fixtures show text-only labeled evidence with weekly start dates, values, units and coverage limitation. The earlier actual-200%-zoom claim is superseded; browser zoom remains unverified. |
| TT-A01 | Accessibility | Read chart via text equivalent and navigate controls with keyboard | Equivalent summary conveys all essential chart information; controls and selected filters are labeled | P0 | TODO | |
| TT-R01 | Responsive | Test trend and supporting activity view at compact, medium, and wide widths | Trend remains readable without panning; activity detail/list behavior follows shared breakpoints | P1 | TODO | |
| TT-S01 | State coverage | Verify no history, too few periods, incomplete week, missing series, stale, and fetch failure | Available points remain visible with coverage context; missing points are not interpolated | P0 | TODO | |
| TT-D01 | Data quality/confidence | Compare periods with missing/partial data and current-week incompleteness | Data coverage is explicit; distance change is not labeled as improved readiness or successful adherence | P0 | TODO | |
| TT-X01 | Regression risk | Verify trend source data, activity list filtering, date semantics, and existing detail links | Redesign does not change supported series, route behavior, or activity records | P1 | TODO | |
| TT-PW01 | Playwright candidate | Read trend, expand evidence, filter, clear, and return journey with partial-data fixture | Chart text parity, applied-filter state, and no-mutation behavior are asserted | P1 | TODO | |

## 6. Data confidence

Contract focus: primary question table, UX2/UX6, C5, section 10, A3–A4, I5. Backlog focus: Tickets 03, 05, 08, 11, 13.

| ID | QA dimension | Test / acceptance check | Expected result | Pri | Status | Evidence / notes |
|---|---|---|---|---:|---|---|
| DC-F01 | Functional | Open Data Quality from Home, readiness, import, and Training | Affected item/task and return context are carried into the recovery surface | P0 | IN PROGRESS | 2026-09-14 Training contextual launch/return is browser-tested. Home/readiness/import launcher matrix remains open. |
| DC-F02 | Functional | Exercise correct/re-upload, reconnect, inspect queue, refresh, and no-action paths | Only executable remedies appear; confirmed correction returns to original assessment with current state | P0 | IN PROGRESS | 2026-09-14 File correction/check and truthful queued acknowledgement are implemented; selected Training return is browser-tested. Settings/OAuth/reconnect and assessment-read failure paths remain open. |
| DC-F03 | UX acceptance | Ask tester what the limitation means and whether action is needed | Consequence is explained first; operational details are secondary; uncertainty is not equated with bad performance | P0 | TODO | |
| DC-F04 | Visual consistency | Inspect warning/caveat, counts, diagnostics, and recovery action hierarchy | Material caveat is adjacent to claim; status uses semantic text and one primary recovery action | P1 | IN PROGRESS | 2026-09-14 source-owned result browser check verifies adjacent consequence and one primary action; visual/human review remains open. |
| DC-A01 | Accessibility | Navigate data issue, status, recovery, and return flow with keyboard and screen reader | Status is textual, contrast meets 4.5:1/3:1 rules, focus and announcements are meaningful and non-repeating | P0 | TODO | |
| DC-R01 | Responsive | Test recovery detail and forms at 320px and 200% zoom | Content reflows at 320 CSS px; actions stay reachable; no sensitive diagnostics are clipped | P1 | IN PROGRESS | 2026-09-14 720px 200%-zoom proxy has no page overflow; required 320px and actual browser zoom checks remain open. |
| DC-S01 | State coverage | Verify no issue after successful check, failed check, unavailable evidence, stale, queued, provider failure, failed correction | “No known issues” appears only after successful check; queue is not completion; errors stay local | P0 | IN PROGRESS | 2026-09-14 unit/browser evidence covers processing, partial, warning, success and queue wording. Successful no-issue and provider-failure browser matrices remain open. |
| DC-D01 | Data quality/confidence | Verify evidence source period, drivers, assumptions, missing inputs, and recomputation timing | Claims are bounded by actual evidence; prior result remains labeled until recomputation occurs | P0 | IN PROGRESS | 2026-09-14 results explicitly distinguish imported history from assessment recomputation; live assessment age/read failure confirmation remains open. |
| DC-X01 | Regression risk | Verify private data boundaries, token/path/raw-error redaction, import/sync status, and polling | No private source content or credentials leak; unchanged polling does not repeatedly announce | P0 | IN PROGRESS | 2026-09-14 unit tests validate allowlisted returns and sanitized warning copy; full identity/session/storage and polling matrix remains open. |
| DC-PW01 | Playwright candidate | Contextual Home → Data Quality → correction/status → return journey | Context, affected task, truthful state, and post-recovery assessment age/state are asserted | P0 | IN PROGRESS | 2026-09-14 local/online Training → Data Quality → file → selected-session return passes with filter/focus and exact write-count assertions. Home → Settings → OAuth and assessment-age variants remain open. |

## 7. Mobile navigation

Contract focus: N1–N5, A1–A6, R1–R6. Backlog focus: Tickets 01–03, 06, 09–10, 13.

| ID | QA dimension | Test / acceptance check | Expected result | Pri | Status | Evidence / notes |
|---|---|---|---|---:|---|---|
| MN-F01 | Functional | Navigate Home, Training, Plan, Calendar, detail, Settings, and direct deep links below 768px | Exactly one labeled Home/Training/Plan row plus secondary Settings; routes and deep links resolve | P0 | PASS | `apps/web/test/dashboard-navigation.test.ts`; `digital-coach.spec.ts` route matrix passed at 1440px and 1024px; legacy URLs unchanged. Compact deep-link browser journey remains covered by the broader mobile candidate. |
| MN-F02 | Functional | Open Training detail and Plan Calendar, then use contextual Back/browser Back | Selection, filters, list position, date/session context, and focus are restored | P0 | IN PROGRESS | 2026-09-14 online Training fixture proves three-page Back/Forward restoration with real row focus, disclosure state and no writes; direct Home/Calendar parents are covered. A live Calendar launcher/return and local-profile matrix remain open. |
| MN-F03 | UX acceptance | Complete daily interpretation, activity import, goal setup, and plan/calendar inspection on mobile | Core tasks are discoverable without hover, icon recognition, hamburger, or horizontal menu scrolling | P0 | TODO | |
| MN-F04 | Visual consistency | Compare compact shell, selected states, gutters, controls, dialogs, and status treatments | Shared compact breakpoint and 16px gutters; no duplicated menus or page-specific navigation pattern | P1 | PASS | Focused polish pass aligned compact dashboard/coaching content to 16px gutters and shared 44px buttons; existing 1024px reduced-motion/forced-colors shell checks and labeled rows remain passing. |
| MN-A01 | Accessibility | Keyboard, switch-control, screen-reader, 44px target, 200% zoom, reduced-motion, and forced-colors checks | All workflows operate by keyboard; focus visible; targets meet 44×44; essential meaning is not color-only | P0 | IN PROGRESS | 2026-09-23 initial-state axe scans on all six routes pass after F05 heading repairs; reduced-motion and forced-colors browser checks pass. Expanded dialogs/disclosures, actual browser-level 200% zoom, screen reader, switch control and software keyboard remain unverified. The 2026-09-16 axe failure is superseded, not erased. |
| MN-R01 | Responsive | Test 320, 375, 414, 767, 768, 1199, and resize while task is active | Layout changes at shared breakpoints; no page-level horizontal scroll; forms and comparisons stack; Agenda below 1200px | P0 | IN PROGRESS | 2026-09-16 local/online Chromium suites pass all six routes at 320, 375, 390, 414, 767, 768, 1024, 1199, 1200 and 1440 CSS px with no document overflow. Calendar restores its wide preference after a 1199/1200 transition. Remaining active-workflow resize coverage is open. |
| MN-S01 | State coverage | Resize during loading, error, pending write, open dialog, and unsaved form | State and input survive safe resize; dialog remains dismissible and no focus trap is lost | P1 | IN PROGRESS | Dialogs use dynamic viewport height and filtered focusable controls; Calendar view state is preserved through the exercised compact/wide transition. Pending-write, failed-read, open-dialog and unsaved-form resize matrices remain open. |
| MN-D01 | Data quality/confidence | Inspect caveats, status, unavailable evidence, and confidence wording on narrow screens | Material caveats remain visible; no claim is hidden or truncated to fit mobile | P0 | TODO | |
| MN-X01 | Regression risk | Verify navigation labels preserve legacy URLs and route/auth behavior | Relabeling does not rename routes, break deep links, or create misleading current selection | P0 | PASS | Route mapping unit tests and Playwright route matrix passed; Plan owns both `/dashboard/plan` and `/dashboard/calendar`, while Data Quality/Settings remain secondary. |
| MN-PW01 | Playwright candidate | Run core journey at 320px and 768px with keyboard and pointer | Shell, detail replacement, Back restoration, dialogs, and no-horizontal-overflow assertions pass | P0 | IN PROGRESS | Existing Playwright run passed the 390px baseline, reduced-motion/forced-colors baselines, and 200% zoom overflow checks; 320px/768px boundary and full context-restoration journey remain open. |

## 8. Deployment smoke test

Contract focus: source-of-truth authority, N2, I2–I5, section 10, A1, and existing auth/API/persistence/privacy boundaries. Backlog focus: Tickets 01–03, 08–13.

| ID | QA dimension | Test / acceptance check | Expected result | Pri | Status | Evidence / notes |
|---|---|---|---|---:|---|---|
| DS-F01 | Functional | Open deployed `/dashboard`, `/dashboard/activities`, `/dashboard/plan`, `/dashboard/calendar`, `/dashboard/data-quality`, and `/dashboard/settings` | Correct route, shell, current destination, and protected behavior are present | P0 | TODO | |
| DS-F02 | Functional | Exercise one authenticated core journey: Home → Training → activity → readiness/evidence → Plan/Calendar | Data, navigation, and return contexts work against the deployed environment | P0 | TODO | |
| DS-F03 | Functional | Exercise unauthenticated protected route and expired-session deep link | Existing sign-in/recovery flow is used; intended destination is safe; no private data becomes empty-history substitute | P0 | TODO | |
| DS-U01 | UX acceptance | Perform 30-second Home comprehension smoke after deployment | Outlook, latest-session meaning, caveat, and next action are understandable without infrastructure knowledge | P0 | TODO | |
| DS-V01 | Visual consistency | Capture deployed screenshots at 320, 768, 1199, 1200, and 1440px | No release-only token, font, asset, layout, or breakpoint drift; no glow/gauge/KPI wall | P1 | TODO | |
| DS-A01 | Accessibility | Run route smoke with keyboard and axe/equivalent if present | Skip link, one H1, labeled nav, current destination, visible focus, contrast, and semantic statuses pass | P0 | TODO | |
| DS-R01 | Responsive | Check deployed compact/medium/wide shell and key flows | Shared breakpoints and content cap/gutters match contract; no horizontal overflow | P0 | TODO | |
| DS-S01 | State coverage | Verify at least one deployed loading, empty, error, stale, queued, partial, unavailable, and success fixture/path where supported | State wording remains truthful in production configuration and does not regress to false success | P0 | TODO | |
| DS-D01 | Data quality/confidence | Verify deployed prediction/trend/import data boundaries and freshness | No fabricated confidence, unsupported forecast, missing-as-zero metric, or queue-as-complete claim | P0 | TODO | |
| DS-X01 | Regression risk | Run existing auth, API, persistence, permissions, coaching, import, and schedule smoke/tests | Existing behavior remains green; any environment-only gap is recorded with owner and next action | P0 | TODO | |
| DS-PW01 | Playwright candidate | Production-like authenticated smoke plus protected-route and deep-link tests | Deployment is reachable, private, navigable, and core journey completes at representative widths | P0 | TODO | |

---

## Cross-flow regression risks

Track these risks independently of individual flow results.

| ID | Risk | Detection / mitigation | Status | Evidence / notes |
|---|---|---|---|---|
| RR-01 | Navigation relabeling breaks legacy URLs or deep links | Route matrix plus direct URL and browser Back tests | IN PROGRESS | 2026-09-14 F04 online fixture covers direct missing/503/malformed activity links and safe Training/Home/Calendar parent labels. F09 preserves `section=connections|devices|privacy|operations` while relabeling Devices to Paired computer; browser direct-link execution remains open. |
| RR-02 | Home redesign hides useful activity/schedule access behind setup | No-goal/no-plan/no-history/pending-review fixtures and manual launch test | TODO | |
| RR-03 | Latest activity is incorrectly replaced by latest reviewed activity | Activity-date ordering fixture with pending newer record | TODO | |
| RR-04 | Independent async sections overwrite each other or show false empty states | Delayed/failing outlook, history, review, and schedule fixtures | IN PROGRESS | F04 fixture covers filtered-empty and 503 history with retained selected detail, plus 404/503/malformed detail states. F09 pure-state coverage verifies no preference defaults after an initial failure and retention on refresh failure; Settings delayed/malformed browser matrix remains open. |
| RR-05 | Uncertainty, freshness, adherence, and plan execution collapse into one score/status | Content review against UX2, data fixtures, and copy assertions | TODO | |
| RR-06 | Import/queue acknowledgement is reported as ingestion/review/prediction completion | Partial, duplicate, queued, and delayed-review tests | IN PROGRESS | 2026-09-14 presentation tests plus local/online F08 browser fixtures assert accepted/processing/reuse wording and no assessment-recompute claim; schema-valid partial fixture passes. Queued/delayed-review browser matrix remains open. |
| RR-07 | Proposal import/publish/leave accidentally activates a plan | Persistence assertion before and after each staged action | TODO | |
| RR-08 | Revision conflict or lost write response causes duplicate/unsafe mutation | `plan-confirmation-state.test.ts` covers classification and snapshot-bound request bodies; `online-dashboard.spec.ts` adds a conflict/reload/rereview fixture. F09 adds a synchronous Settings mutation guard but lost-response reread-before-retry browser evidence remains TODO. | IN PROGRESS | 2026-09-14 |
| RR-09 | Responsive redesign introduces hidden mobile navigation, overflow, or lost context | Boundary viewport, resize, Back, focus, and overflow checks | IN PROGRESS | F04 restores Back/Forward focus and state in the online fixture and keeps the detail parent visible at all CSS widths by design. 2026-09-15 F09 browser inspection at 320px reports `scrollWidth === clientWidth` (305px) for local Settings; boundary/resize and actual 200% zoom evidence remain open. |
| RR-10 | Shared styling changes regress legacy screens or auth recovery | Existing route screenshot/smoke plus unit/typecheck/build | IN PROGRESS | 2026-09-14 F09 typecheck and 115-test web suite pass; build compiled and reached static-page generation but managed command completion and auth/browser evidence are not recorded as pass. |
| RR-11 | Missing evidence is rendered as zero, fabricated chart data, or “no issues” | Data fixtures and semantic content assertions | IN PROGRESS | 2026-09-14 F09 states label failed preference/provider/device/operations reads as unknown/unavailable, never default/disconnected/not-paired. Browser semantic fixture execution remains open. |
| RR-12 | Dialogs, live regions, and polling create accessibility regressions | Keyboard/focus tests, axe, and unchanged-polling announcement check | IN PROGRESS | 2026-09-14 F09 uses adjacent status/alert messages and focus on explicit reminder continuation; keyboard/AT/browser verification remains open. |

## Playwright suite candidates

These are candidate specs to implement or extend in `apps/web/e2e/`; they are not test evidence until executed.

| Candidate | Coverage | Suggested fixture/data setup | Status | Evidence / notes |
|---|---|---|---|---|
| `redesign-dashboard.spec.ts` | Home composition, comprehension, one-primary-action, independent states | Complete, no-goal, no-plan, no-activity, pending-review, stale, failed-read users | TODO | |
| `redesign-import.spec.ts` | File validation, partial/duplicate/queued outcomes, pending submit, Strava cancellation | Upload API response fixtures and provider connection states | TODO | |
| `redesign-plan.spec.ts` | Staged setup, draft resume, proposal review, approval, rejection, conflict | Plan state fixtures and server-authoritative mutation mocks | TODO | |
| `redesign-readiness.spec.ts` | Prediction detail, caveat/evidence, trend link, no-mutation, Back/focus | Compatible/incompatible/insufficient/stale/partial prediction fixtures | TODO | |
| `redesign-training.spec.ts` | Recent-first list, filters, empty-match, detail context restoration | Activities with date ties, pending review, missing optional metrics | TODO | |
| `redesign-data-quality.spec.ts` | Contextual recovery, no-issues-after-success, queue/stale/provider failure | Affected-item and recovery response fixtures | TODO | |
| `redesign-responsive.spec.ts` | 320/768/1199/1200/1440 layout, overflow, resize context | Shared authenticated fixture with active detail/dialog/form | TODO | |
| `redesign-accessibility.spec.ts` | Keyboard, focus, headings, landmarks, dialog, status, axe/equivalent | All redesigned routes and major state variants | TODO | |
| `redesign-deployment-smoke.spec.ts` | Deployed route/auth/core journey smoke | Production-like base URL and owner/anonymous sessions | TODO | |

## Manual product testing checklist

Run with a fresh authenticated runner, a runner with established history, and a runner with incomplete data. Record device/browser, viewport, fixture, tester, date, and defects.

- [ ] Dashboard: In 30 seconds, identify target outlook, latest-session takeaway, material caveat, and next action.
- [ ] Dashboard: Confirm Home has exactly three persistent groups in the required order and no KPI wall/pipeline panel.
- [ ] Dashboard: Confirm no goal, no plan, no activities, and pending review each preserve useful available content.
- [ ] Activity upload/import: Understand file limits before choosing a file; verify accepted/duplicate/rejected/warning counts match the result.
- [ ] Activity upload/import: Confirm queued work is labeled queued and review/prediction readiness is separate.
- [ ] Race goal setup: Follow each visible stage; confirm publishing/importing/leaving does not activate a plan.
- [ ] Race goal setup: Confirm approval names the affected plan and its Home/Calendar consequence, then verify state only changes after confirmation.
- [ ] Prediction review: Explain the estimate, target, timeframe, evidence basis, and principal uncertainty without relying on color or a score.
- [ ] Training trends: Describe the observed trend and its coverage limitations without inferring readiness or adherence.
- [ ] Data confidence: Explain what the limitation means, what action is supported, and whether recomputation has occurred.
- [ ] Mobile navigation: At 320px, use labeled Home/Training/Plan and secondary Settings without a hamburger or horizontal menu.
- [ ] Mobile navigation: Open detail/dialog, use keyboard or assistive technology, dismiss it, and verify focus/context return.
- [ ] Responsive: At 320px and 200% zoom, read all caveats and complete core actions without page-level horizontal scroll.
- [ ] Accessibility: Verify skip link, one H1, logical headings, landmarks, visible focus, 44×44px targets, text statuses, contrast, reduced motion, and forced-colors behavior.
- [ ] Error recovery: Trigger a read failure, validation failure, provider failure, queued delay, and revision conflict; confirm each remains local and actionable.
- [ ] Deployment smoke: Repeat the core launch-to-training-to-outlook-to-next-action journey on the deployed environment, authenticated and unauthenticated.

## Evidence log

| Date | Tester | Environment / commit | Scope | Result | Defects / links |
|---|---|---|---|---|---|
| 2026-09-12 | Codex | Local workspace; focused polish pass | Home spacing/typography/button hierarchy/state copy, web typecheck, 96-test unit suite, production build, and Playwright smoke | PASS with browser follow-up | Code polish and compile/unit/build checks passed. Full Playwright journey: 14 passed, 5 failed; focused rerun: 3 passed, including overflow/reduced-motion/forced-colors/200% checks. The Home locale hydration mismatch was fixed; remaining failures are fixture/state coverage issues. Readiness detail, 320/768 boundary coverage, broader accessibility, and deployed smoke remain open. |

## Release gate

The redesign is ready to proceed only when all P0 tasks pass, the core journey passes at compact/medium/wide widths, required state variants are evidenced, existing auth/API/persistence/permission/coaching checks remain green, and residual risks have an explicit owner or accepted disposition.

**F10 decision (2026-09-16): BLOCKED.** The complete online-fixture suite reproduced a focus-return defect after Plan conflict recovery and heading-order violations on four redesigned routes. Browser-level 200% zoom, assistive technology, human comprehension, live-provider, authenticated deployed and deployment checks are still outstanding.

## F10 follow-up evidence — 2026-09-17

- PASS: F07 conflict-recovery focus regression, 1/1 isolated online Chromium.
- PASS: F05 initial-route axe regression, 1/1 isolated local Chromium; no violations on Home, Training, Plan, Calendar, Data Quality or Settings.
- IN PROGRESS: the aggregate local runner is implemented, but its complete final execution and the online/auth suites remain required evidence.
- TODO: browser-level 200% zoom, assistive technology, software keyboard, comprehension, live provider and deployed checks.

## F10 execution evidence — 2026-09-16

| Date | Tester | Environment / commit | Scope | Result | Defects / links |
|---|---|---|---|---|---|
| 2026-09-16 | Codex | Local workspace at `000b38f`; dirty working tree (163 entries at capture); isolated Playwright local/online/auth/home/readiness directories | Web/core/unit/database/build plus targeted local, owner-auth, Home and readiness Chromium configurations | PASS where listed in the F10 handoff; artifacts under `.local/e2e/<run-id>/results/` | Synthetic fixture evidence only. Browser-level 200% zoom, AT, human comprehension, live provider, deployed and deployed-auth checks were not run. |
| 2026-09-16 | Codex | Online fixture, Chromium, one worker, isolated run `digital-coach-1789590887700-47376` | `npx playwright test --config playwright.online.config.ts` | FAIL: 40 passed, 3 failed, exit 1. The obsolete Home assertion was corrected and its focused rerun passed 4/4; this full result is superseded by the required final rerun. | F07 focus return; F05 heading order; stale F01 assertion (fixed in test only). |
| 2026-09-16 | Codex | Online fixture, Chromium, one worker, isolated run `digital-coach-1789591347087-37984` | Final `npx playwright test --config playwright.online.config.ts` | FAIL: 41 passed, 2 failed, exit 1; JSON, trace and screenshots retained. | Product: F07 focus return; F05 heading order on four routes. |
| 2026-09-16 | Codex | Local isolated snapshot, Chromium, one worker, run `digital-coach-1789591617160-37732` | Final `npx playwright test --config playwright.config.ts` | FAIL: 35 passed, 15 failed, exit 1; JSON, trace and screenshots retained. | Legacy local fixture/assertion failures require test maintenance; all-route F05 heading-order failure is independently reproduced. |

F10 supersedes earlier compilation- or viewport-proxy-based UX claims. CSS viewport checks, device scale factor and a `200%` proxy are not evidence of verifiable browser-level 200% zoom.

## F10 validation reconciliation — 2026-09-23

Commit `000b38f`, dirty working tree (167 changed/untracked entries at capture), local Windows/Chromium one-worker execution. Current synthetic browser evidence: general local **30/30**, dedicated seeded Home **15/15**, dedicated seeded readiness **5/5**, online fixture **43/43**, owner-auth **3/3**, all with clean exit 0 and no skips. Exact commands, modes, viewports and JSON artifacts are in the 23 September F10 handoff entry; these supersede the historical 16/14 local, 35/15 local and 41/2 online failures without erasing them. The 50 formerly general-local scenarios are accounted for as 30 general + 15 Home + 5 readiness. The F07 focus and F05 heading defects reproduced on 16 September now pass focused/current suites. F09 reminder preference persistence required a lowercase-weekday product fix; the manual journey checks its PUT payload and reload.

Web/core unit suites pass 136/136 and 90/90; typecheck, lint and production build exit 0. Database local activities/imports/coaching/analytics/pipeline/sync/cloud and direct activity-review suites pass 2/5/7/1/3/15/66/3 respectively, with logs in `.local/evidence/f10-db-20260923-223209/`. Unit/type/build logs are in `.local/evidence/f10-final-20260923-230931/`. `lint` duplicates the TypeScript command, so it is not a separate static-lint gate. The aggregate npm command repeatedly hangs after displaying 30/30 general-local passes and was interrupted (exit 1, no JSON); the three direct configurations above exited cleanly. This remains an **infrastructure FAIL**, owned by test infrastructure, and prevents a clean aggregate-process claim.

The progress-summary counts above were recomputed from their actual rows. MN-A01 is **IN PROGRESS**, because current automated axe and viewport checks pass but real browser-controlled 200% zoom, screen reader, switch control and software keyboard remain unperformed. DB-A01 and GS-A01 likewise remain partial. Human comprehension, real OAuth/provider persistence, authenticated deployed and anonymous-access smoke are also outstanding; deployment was not performed. Ticket 13 and the release gate remain **IN PROGRESS / not approved** until those checks and the aggregate shutdown issue have evidence or an accepted disposition.
