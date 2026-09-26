# Race Predictor Design Intent Contract

Version 1.1 · 25 September 2026 · Binding UX direction

## Authority and use

This is the source of truth for the redesign's information architecture, presentation, interaction, and UX acceptance. It translates [UX_NORTH_STAR.md](UX_NORTH_STAR.md) into implementation constraints, informed by [APP_INVENTORY.md](APP_INVENTORY.md), [UX_AUDIT.md](UX_AUDIT.md), and [PRODUCT_GOALS_AND_USER_INTENT.md](PRODUCT_GOALS_AND_USER_INTENT.md).

- **MUST / MUST NOT** are binding. **MAY** identifies implementation discretion.
- For redesign UX conflicts, follow this contract before the north star, older screen specifications, UI guidelines, proposals, or existing presentation. Specifically, older six-link navigation and dashboard-density rules are superseded.
- Existing data/API contracts, authentication, privacy boundaries, and approved coaching rules remain binding. This document does not authorize new analytical models, automatic adaptation, or altered persistence semantics.
- Later explicit user decisions override this document and must be recorded here. Luna must not silently revise binding requirements to fit an implementation shortcut.
- If a requirement needs unavailable data or conflicts with a domain rule, use the truthful unavailable state, record the specific gap, and continue independent work. Do not invent evidence or report the affected requirement complete.
- Audit observations are hypotheses to verify in the current app, not instructions to recreate an assumed defect. This contract defines the desired result and does not claim the redesign is already implemented.
- **25 September 2026 Home amendment:** [HOME_GOAL_FIRST_DESIGN_CHANGE.md](HOME_GOAL_FIRST_DESIGN_CHANGE.md) records the runner's later explicit decision. Its Goal → Today's focus → Latest activity hierarchy and phone-first Home requirements supersede the earlier Home order and space allocation in the north star, information architecture, screen specifications, and implementation backlog. Other domain, navigation, evidence, interaction, and accessibility rules here continue to apply. A current-fitness estimate is supporting detail, not the Home lead.

## 1. Product purpose

**P1.** Help a runner understand what recent training means for their target race, how much to trust that assessment, and what to do next.

**P2.** The default experience MUST prioritize comprehension with few choices: a short goal and milestone orientation, today's approved focus, and the latest activity. Evidence and supporting tools are available on request.

**P3.** Today's approved workout or rest MUST be visible immediately after launch. Reviewing the latest activity MUST remain directly accessible on Home, including while its review is pending.

## 2. Target users

**U1.** Design for one runner managing their training toward a race goal, returning both after a workout and before the next session.

**U2.** Support deeper analysis as an optional activity for that runner. Do not introduce athlete switching, team management, role selection, or a separate coach workspace.

**U3.** A runner without a plan, a race goal, complete history, or ready commentary MUST still be able to use the information that is available. Setup must not block access to recorded training.

## 3. Primary user questions

| Question | Required answer | Evidence limitation |
|---|---|---|
| Am I on track for my target race? | Target, assessment timeframe, supported outlook, and a short reason. | No on-track verdict without a defined target and evidence that supports that comparison. |
| What does recent training say about readiness? | What was recorded, relevant comparison with the plan, and what the result suggests for the goal. | A single session does not prove a precise improvement in race performance. |
| How confident is the prediction? | Available uncertainty and its meaning, with the most consequential limitation. | Do not invent ranges, probabilities, confidence categories, or scores. |
| What should I do next? | One prioritized next step with a reason; today's approved workout/rest stays visible. | Advice does not change the approved prescription. |
| What assumptions or data issues affect the prediction? | Material limitations near the claim; direct access to fuller evidence and supported recovery. | Missing data means unknown, not poor performance or zero readiness. |

These questions MUST be answered through summaries and direct detail access. They MUST NOT become five equally weighted Home panels.

## 4. UX principles

**UX1.** Show the conclusion and one supporting reason before raw metrics. Keep explanatory depth optional.

**UX2.** Distinguish plan execution, race readiness, prediction uncertainty, and data freshness. Do not use one label or score to represent all four.

**UX3.** Default to the active goal, latest recorded activity, and current schedule. Hide advanced filters until requested; preserve active filter context once applied.

**UX4.** Use a stable information order. Fresh content may update within a section but MUST NOT move sections, steal focus, reset scroll, or reorder a list being inspected without user action.

**UX5.** Each screen or active workflow step has at most one primary action. Secondary actions remain available with lower visual weight. No primary button is required when the useful outcome is simply reading or resting.

**UX6.** Keep material caveats beside their claims. Progressive disclosure MUST NOT hide information necessary to interpret the summary correctly.

## 5. Navigation principles

**N1.** Exactly three primary destinations, in this order and with these labels: **Home, Training, Plan**. Settings is a separate, secondary utility link. Do not add a fourth primary destination or numbered navigation.

**N2.** Preserve existing URLs and deep links. Relabeling navigation does not require renaming routes.

| Destination or surface | Existing route / entry | Navigation treatment |
|---|---|---|
| Home | `/dashboard` | Primary Home selected. |
| Training | `/dashboard/activities` | Primary Training selected. |
| Plan overview | `/dashboard/plan` | Primary Plan selected; local Overview / Calendar switch. |
| Calendar | `/dashboard/calendar` | Primary Plan selected; same local switch with Calendar selected. Preserve date/session deep links. |
| Prediction detail | Open directly from Home outlook | Secondary detail; keep Home context. No new primary navigation link. |
| Data Quality | `/dashboard/data-quality` | Secondary recovery surface; direct links from affected data plus a Training utility link. Do not show a misleading primary selection. |
| Settings | `/dashboard/settings` | Secondary utility destination with its own current-state cue. Preserve authentication behavior. |

**N3.** From Home, the full latest-session review, readiness detail, and today's schedule context MUST each be reachable in one activation. Other recent sessions are reachable through the Training link. “Activation” means click, tap, or keyboard activation; scrolling is allowed.

**N4.** Back/close MUST return to the launching context, restoring selection, filters, list position, and focus. Directly loaded detail MUST have an explicit parent destination when no return context exists. Browser Back must work for route-based navigation.

**N5.** Do not make frequent navigation depend on hover, icon recognition, or a generic overflow menu. A secondary detail may open one evidence disclosure; do not nest disclosure inside disclosure.

## 6. Visual hierarchy rules

**V1.** Home contains exactly three persistent content groups, in reading order: **Goal and milestone → Today's focus → Latest activity**. Loading, empty, and error content replace the affected group. Authentication failures may replace the page. Avoid extra alert panels; place domain warnings in the affected group. Follow the Home amendment linked above for content and states.

**V2.** The goal and milestone header is slim, with one honest progress conclusion and one reason. Today's focus receives the main explanatory space; the latest activity is a concise preview with direct detail access. Preserve this order in the DOM and visually; do not move the groups based on feedback availability.

**V3.** A primary action is the single visually emphasized filled button in the active screen or dialog. Other controls use quieter links or outlined buttons. An open dialog becomes the active interaction surface; the page behind it is inert.

**V4.** Use one page heading, clear section headings, readable body text, and quieter metadata. Do not give timestamps, sync state, model versions, or history identifiers the same emphasis as the runner's takeaway.

**V5.** Preserve the dark, matte palette and existing brand assets. Use semantic tokens: navy surfaces, off-white text, cyan interaction, violet categorization, lime success, amber caution, red error/destructive. No ornamental gauges, glass panels, persistent glow, large gradients, or decorative motion.

**V6.** Use the existing sans-serif family; page headings 24–28px, section headings 18–20px, body 16px, metadata 13–14px. Use 4/8/12/16/24/32px spacing and 8–10px panel/control corners. Do not shrink essential explanations to fit more content.

## 7. Component rules

**C1.** Equivalent controls MUST share appearance, semantics, and behavior across Home, Training, Plan, and utility screens. Reuse a common shell, button variants, summary/panel anatomy, form fields, statuses, and dialog behavior. Avoid new page-specific variants unless the interaction requires them.

**C2.** A summary consists of a heading, conclusion, short supporting text, relevant state/caveat, and optional detail link. Do not nest cards solely for decoration or make an entire card clickable when it contains other controls.

**C3.** Home's Latest activity MUST show the latest recorded session by activity date, even if its review is pending. Do not substitute an older reviewed activity without labeling it. Reuse the same persisted review and evidence reference in Home, activity detail, and Calendar; do not generate separate narratives for each.

**C4.** Show up to four key metrics before optional telemetry in activity detail: distance, duration with elapsed/moving meaning, pace, and elevation. Omit unavailable metric values or label them unavailable; do not display missing values as zero.

**C5.** Charts belong in detail when they answer a specific question. Label units, periods, and comparison basis, and provide an equivalent text summary. No unlabeled confidence bands or plots populated with invented values.

**C6.** Forms use persistent labels and adjacent help/errors. Validate before submission where possible; server validation remains authoritative. Filters are behind a labeled Filters control, with a visible applied summary and Clear action after application.

## 8. Screen layout rules

| Surface | Default visible content | Secondary content and actions |
|---|---|---|
| Home: Goal and milestone | Active approved main race goal, next milestone and its target when supported; one evidence-grounded progress conclusion and reason, or a truthful inability to assess. Material caveat/freshness stays beside the claim. | “View readiness” opens prediction, uncertainty, trend, drivers, assumptions, and evidence. No separate KPI grid or pipeline panel. |
| Home: Today's focus | Today's approved workout/rest, its purpose, what to focus on, and why it serves the goal. On a rest day, also show the next approved workout when available. | Direct schedule link. A blocking review/data action may take button priority, but must not hide today's prescription. |
| Home: Latest activity | Latest session identity/date; concise supported planned-versus-done takeaway and goal implication, or the real pending/unavailable review state. | “View session” opens full review. Other recent records live in Training. |
| Training | Recent-first activity list; labeled Filters and Add training controls. | Selected activity detail; pagination; Data Quality utility link. Keep list context when opening detail. |
| Activity detail | Session identity, key metrics, Coach's review, known comparison reference/status and next-step advice. | Comparison, splits, route availability, telemetry, and evidence. Do not manufacture a map from a route-availability flag. |
| Plan overview | Settled goal and active approved plan; local Overview / Calendar switch. | One creation/resume entry, staged proposal review, and collapsed approved history. Do not display the full creation form and history by default. |
| Calendar in Plan | Current four-week context on wide screens; concise date summaries and detail access. | Agenda on compact screens; existing permitted amend/move/skip/restore flow and source/history details. Preserve current calendar date/timezone semantics. |
| Add training | One visible source choice: upload file or Strava, with existing connection state. | File rules before selection; supported result counts; View training or a specific correction. Strava setup opens the relevant Settings section with a return path. |
| Data Quality | Affected data, practical consequence, and supported next action. | Counts, warnings, processing history, and diagnostics on demand. No successful-import claim from queue acknowledgement alone. |
| Settings | Clearly grouped preferences, connections, and reminders/context setup. | Expand only the selected group; retain all supported controls. Local/online availability must be explained where it affects an action. |

**L1.** Home commentary should be 2–3 short sentences, normally no more than 80 words. Full activity review may be longer. If supplied content lacks a short summary, use a faithful excerpt and labeled full-review access; retain material limitations separately. Never rewrite clinical, training, or model conclusions to meet a word budget.

**L2.** Plan creation MUST expose the current stage: goal/context → continue in Codex → import proposal → review → confirm. Tell the runner how to continue externally, what to bring back, and how to resume the saved draft. Do not imply publishing context has created or approved a plan.

**L3.** Outlook and commentary MUST use supported evidence. If the app supplies a current-fitness estimate, label it accordingly; do not present it as a race-date forecast. If goal impact or confidence cannot be assessed, say so concisely and leave useful measured facts visible.

## 9. Interaction rules

**I1.** Reading, navigation, expanding evidence, and changing presentation filters MUST NOT mutate goals, plan approval, schedule, or activity-completion state.

**I2.** Show responsive loading feedback after a user action. Disable the submitting action while pending and prevent duplicate submissions. Do not show saved/activated/completed until the server confirms it.

**I3.** Keep the existing explicit proposal approval/rejection and historical-plan activation confirmations. Name the affected plan and explain the effect on Home and Calendar. Review advice remains advisory; no Apply recommendation action.

**I4.** Preserve session permissions: today is read-only; future sessions allow existing supported changes; past sessions may only be recorded as skipped, without restore. Changes require a 1–500 character reason and retain the approved source and history. Respect collision and out-of-range validation.

**I5.** Preserve entered form data on recoverable failure. On a revision conflict, explain the change and require reload/review before resubmitting; do not silently retry a consequential write. Warn about unsaved edits only when they would actually be lost.

**I6.** Use one interaction surface at a time; no nested dialogs. Keep Cancel/Back available except when leaving would disrupt an in-progress write; explain that pending state and restore exit controls on resolution.

## 10. Empty/loading/error/success state rules

Every data-dependent surface MUST implement applicable states below. A missing capability is an unavailable state, not a fabricated successful result.

| State | Required treatment |
|---|---|
| Initial loading | Preserve shell and section positions; show labeled placeholders in the affected section. Do not briefly show “no plan” or empty history while fetching. |
| Refreshing | Keep usable prior data with its age; indicate refresh locally. Preserve focus and scroll. |
| No goal / no plan | Distinguish the two; offer the relevant setup entry while keeping activities and supported analytics accessible. |
| No activities | Explain how to add training, with one Add training action. Filtered emptiness instead offers Clear filters. |
| Rest / skipped / unconfirmed | Use the persisted coaching state. No activity record does not prove a missed session, and a rest day is not an error. |
| Review pending | Show activity immediately and the actual queued/waiting/processing state. No invented progress percentage or completion time. |
| Unavailable optional evidence | Name the missing comparison, sensor, split, route, or confidence evidence; keep the rest of the record usable. |
| Error | Name the affected task, give a safe explanation and supported retry/recovery. Never map failure to an empty dataset. |
| Stale | Keep last usable content labeled with relevant age/reason. Activity, prediction, review, and context freshness remain independent. |
| Partial import | Show accepted/duplicate/rejected/warning results and the supported correction. Do not announce full success when some records failed. |
| Queued operation | Confirm that the request was queued and where to check its result. Do not claim ingestion or feedback is complete. |
| Success | Show a durable changed state or inline confirmation with a useful destination. Do not rely solely on a disappearing toast. |
| Authentication required | Use the existing sign-in/recovery flow and preserve a safe intended destination. Do not expose private data or show an empty-history substitute. |

**S1.** Report a fault once in its relevant context. Healthy operational details stay secondary; avoid repeated warnings and live-region announcements on unchanged polling responses.

## 11. Accessibility rules

**A1.** Use native links/buttons and semantic landmarks. Provide a skip link to main content, one H1, logical headings, labeled navigation, and an explicit current destination.

**A2.** All workflows MUST work by keyboard. Focus is visible and never hidden behind sticky elements. Dialogs have a name, initial focus, contained Tab/Shift+Tab navigation, an inert background, Escape when cancellable, and focus return to the launcher.

**A3.** Associate labels, instructions, and errors with fields. Invalid submission focuses the first invalid field. Announce meaningful loading/success changes politely and actionable failures appropriately without reading the entire page again.

**A4.** Enforce contrast of at least 4.5:1 for normal text and 3:1 for large text and essential control boundaries/focus indicators. Status must also be conveyed in text; color alone is insufficient.

**A5.** Interactive targets MUST be at least 44×44 CSS pixels, including padded icon controls. Essential content must remain readable at 200% zoom and reflow at 320 CSS pixels without page-level horizontal scrolling.

**A6.** Respect reduced-motion preferences. No hover-only instructions, automatic focus movement on background refresh, or flashing/continuous decorative animation.

## 12. Responsive design rules

**R1.** Use these shared layout ranges: compact below 768px; medium 768–1199px; wide 1200px and above. Do not independently invent page-specific navigation breakpoints.

**R2.** Wide screens use a left primary navigation rail and a content area capped at 1280px with 24px gutters. Medium and compact screens use one visible, labeled row for Home / Training / Plan and a secondary Settings utility. Compact content uses 16px gutters. No duplicate primary menus or horizontal menu scrolling.

**R3.** Design Home phone-first in one column with compact summaries and no horizontal scrolling. Keep the goal and today's focus fully visible in a common phone viewport, with a latest-activity preview visible if feasible at normal readable text size; viewport review must document where that is not feasible. On common desktop viewports, all three group summaries should appear before scrolling. Groups remain in one reading sequence across widths and MUST NOT become three dense side-by-side dashboards. Do not shrink text or hide material caveats to force content above the fold.

**R4.** On wide screens, Training MAY use list/detail columns. Below 1200px, selected detail replaces the list view and offers Back to training with restored list context. The latest-session summary remains visible on Home without opening detail.

**R5.** Calendar defaults to the four-week view on wide screens and Agenda below 1200px. Do not force horizontal panning to understand a week. An explicit view choice may persist while it remains usable at the current width.

**R6.** Forms and comparison content stack on compact screens. Mobile dialogs use the available width, with a visible close action, scrollable content, and no nested scroll traps. Software keyboards must not make submission or dismissal unreachable.

## 13. Copy and tone rules

**T1.** Speak directly, calmly, and concretely. Use runner-facing terms: Home, Training, Plan, Today's focus, Latest activity, Coach's review, View session, Add training, and View readiness. Use Activities only where describing records or an existing technical route.

**T2.** Prefer “You ran 48 minutes against the planned 45” to a generic success/failure grade. Label elapsed/moving duration correctly and do not infer effort from pace alone.

**T3.** Separate recorded facts from generated interpretation. Identify AI-generated commentary and its relevant plan/evidence reference in detail. Do not claim a specific race-time improvement from one workout or offer certainty beyond the evidence.

**T4.** State limitations plainly: “No planned session is linked” or “Confidence is unavailable.” Explain technical concepts such as approval versions in ordinary language; keep IDs, raw errors, tokens, private paths, and source-note content out of routine UI.

**T5.** Button labels describe the result. Use “View session,” “Import file,” or “Approve plan”; avoid “Go,” “Process,” and “Submit” when a specific action is known. Simplified copy MUST NOT omit the consequence of a plan decision.

## 14. What Luna is allowed to change

**ALLOW1.** Implement the specified navigation, labels, layouts, progressive disclosure, shared components, copy, focus handling, and responsive behavior. These choices do not require repeated design approval.

**ALLOW2.** Refactor presentation code and consolidate CSS/tokens to meet this contract while preserving public behavior and unrelated user changes. Choose component names, internal structure, and equivalent low-risk layout techniques.

**ALLOW3.** Add contextual entry points and additive UI deep-link state; preserve existing routes, query parameters, authentication redirects, and data semantics. Relocate an existing action without changing its permissions or backend effect.

**ALLOW4.** Make minor spacing/alignment adjustments within the defined scale and reuse existing tools. Record missing evidence and implement the required unavailable state. Detail surfaces may be routes, panels, or dialogs if they obey navigation, responsiveness, and accessibility rules.

## 15. What Luna must not change

**DENY1.** Do not expand primary navigation, Home content groups, or simultaneous primary actions; add settings for routine defaults; or recreate the dense analytics dashboard under new labels.

**DENY2.** Do not invent race scores, target probabilities, model ranges, causal goal impact, training phases, session matches, or completion. Do not turn generated commentary into an approved prescription.

**DENY3.** Do not change API contracts, prediction calculations, approval authority, canonical history, deduplication, sync/privacy boundaries, timezone semantics, or domain permissions to simplify the interface.

**DENY4.** Do not remove supported import, history, recovery, approval, or schedule capabilities because they are secondary. Do not imply unavailable local/online features are working. No new provider, embedded chat, automatic adaptation, or multi-athlete workflow.

**DENY5.** Do not silently adopt unimplemented features from older proposals, introduce a new visual identity or dependency stack solely for styling, remove material caveats, or treat an exception as permission to rewrite this contract.

If an exception is necessary, document the requirement ID, concrete conflict, proposed alternative, and user impact for review. Continue compliant independent work; do not claim the exception is approved.

## 16. Definition of done for UX implementation

The redesign is complete only when the applicable checks below pass with recorded evidence. An unavailable state is acceptable when the underlying capability is absent; an unimplemented UI requirement is not.

- [ ] Exactly Home / Training / Plan appear as primary navigation. Existing routes, Calendar date/session links, and authentication return paths still work.
- [ ] Home has Goal and milestone → Today's focus → Latest activity in the required order, with at most one prominent action and no separate diagnostics or KPI dashboard. Today's approved workout/rest and latest activity are shown even while the activity review is pending.
- [ ] The full latest-session review, readiness detail, and today's schedule context each open directly from Home. Back restores the originating context.
- [ ] Available session commentary explains execution, supported goal implication, and next-step advice; material evidence limits and plan-reference uncertainty remain clear.
- [ ] Each readiness/confidence claim is traceable to supported data and timeframe. No-goal, missing-confidence, absent-comparison, and limited-data cases are truthful.
- [ ] End-to-end checks cover file import and partial/reused results; supported Strava queued states; plan handoff/draft resume/approval; and permitted schedule changes with reason, conflict, and confirmation.
- [ ] Loading, empty, unavailable, pending review, error, stale, and success cases are exercised per affected surface. Failure in review or sync does not hide usable training or coaching.
- [ ] Screens are visually inspected at 320, 390, 768, 1024, and 1440 CSS-pixel widths, plus 200% zoom. Record whether common desktop viewports show all three Home summaries without scrolling, whether common phone viewports show the full goal and today's focus and a latest-activity preview where feasible, and why any viewport cannot meet that target at readable size. No page overflow, clipped essential text, unreachable controls, or forced mobile Calendar panning.
- [ ] Keyboard journeys verify navigation, disclosures, forms, dialogs, Escape, focus containment/return, and preserved list position. Automated accessibility checks are supplemented by manual focus, status-announcement, and contrast checks.
- [ ] Unprompted prototype or usability review checks whether the runner can identify the main goal and milestone, today's approved focus, latest-activity takeaway or pending state, and the principal progress limitation within 30 seconds after content loads. This is a proposed acceptance target, not an existing measured result; record actual observations and any unresolved failure.
- [ ] Applicable type/build checks and focused regression tests pass. Verification uses controlled fixtures or an authorized test environment; production data is not mutated merely to prove a flow.
- [ ] Handoff records requirement IDs covered, routes/screens changed, screenshots and checks, missing backend evidence, and remaining exceptions. User-facing documentation is aligned. No unfinished binding requirement is reported as complete.

Luna's final handoff must state what the runner can now do, provide verification evidence, and name any unresolved contract requirement. Visual resemblance alone does not satisfy this contract.
