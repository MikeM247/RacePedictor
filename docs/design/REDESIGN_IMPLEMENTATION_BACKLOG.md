# Race Predictor Redesign Implementation Backlog

Status is tracked per ticket with the checkbox in the ticket heading: `TODO`, `IN PROGRESS`, `BLOCKED`, or `DONE`. Update the status, implementation notes, test evidence, and completion date as work progresses. Tickets are ordered for the safest independent implementation sequence.

## Source of truth

- [Design Intent Contract](DESIGN_INTENT_CONTRACT.md)
- [Screen Specifications](SCREEN_SPECIFICATIONS.md)
- [Information Architecture and User Flows](INFORMATION_ARCHITECTURE_AND_USER_FLOWS.md)
- [Design System Rules](DESIGN_SYSTEM_RULES.md)

## Sequencing principles

Implement shared semantics before page composition; preserve existing routes, APIs, authentication, persistence, permissions, and coaching rules; keep data-dependent sections independently stateful; and validate the launch-to-training-to-outlook-to-next-action journey before polishing secondary screens. No ticket authorizes a new prediction model, automatic plan adaptation, provider, athlete/role workspace, or persistence behavior.

## Ticket 01 — TODO — Establish redesign tokens and shared layout primitives

### Ticket title

Establish semantic design tokens and responsive layout primitives

### Goal

Give all redesign screens one reusable visual foundation for the matte dark palette, typography, spacing, panel geometry, focus treatment, and shared compact/medium/wide breakpoints.

### Design intent

Preserve the existing brand and dark matte language while making semantic meaning consistent: navy surfaces, off-white text, cyan interaction, violet categorization, lime success, amber caution, and red error/destructive. Use the specified 4/8/12/16/24/32px spacing, type scale, 8–10px corners, 1280px wide content cap, and 16px compact gutters. Do not add glow, gauges, large gradients, or decorative motion.

### Likely files/components affected

- `apps/web/app/globals.css`
- `apps/web/components/dashboard/dashboard.css`
- `apps/web/components/coaching/coaching-ui.css`
- Shared button/panel/status styles currently used by dashboard, activities, and coaching components

### Implementation notes

- Normalize existing one-off colors and dimensions to semantic CSS custom properties.
- Define shared breakpoint behavior at `<768px`, `768–1199px`, and `>=1200px`.
- Preserve the existing sans-serif family and brand assets.
- Include visible focus, reduced-motion, forced-colors, and 200%/320px behavior in the primitives.
- Do not remove legacy styles until consumers are migrated; keep this ticket limited to the foundation.

### Acceptance criteria

- Semantic tokens cover surfaces, text, borders, focus, interaction, category, success, caution, and error.
- Shared layout utilities support the three required width ranges without page-specific breakpoint variants.
- Body, page heading, section heading, control label, metadata, and eyebrow sizes follow the design-system ranges.
- Focus indicators meet the required visibility/contrast intent and reduced motion disables nonessential transitions.
- Existing screens still render without a functional regression.

### Test cases

- Render an existing dashboard, activity, plan, calendar, data-quality, and settings route at 320px, 768px, 1199px, 1200px, and 1440px.
- Verify keyboard focus is visible on links, buttons, form controls, and disclosures.
- Verify text remains readable at 200% zoom and there is no page-level horizontal scroll at 320px.
- Run the existing web unit/typecheck/build checks.

### Dependencies

- None; this is the foundation ticket.

### Risk level

Medium

## Ticket 02 — DONE — Rebuild the application shell and navigation

### Ticket title

Implement Home / Training / Plan shell with secondary Settings navigation

### Goal

Provide stable orientation across all dashboard surfaces while preserving current routes and deep links.

### Design intent

Exactly three primary destinations appear in order: Home, Training, Plan. Settings remains a separate secondary utility. The shell must be discoverable without hover or a hidden mobile-only menu, expose the current destination semantically, and preserve launching context on Back/Close.

### Likely files/components affected

- `apps/web/components/dashboard/dashboard-navigation.tsx`
- `apps/web/components/dashboard/dashboard-shell.tsx`
- `apps/web/components/activities/activities-shell.tsx`
- `apps/web/components/coaching/coaching-pages.tsx`
- `apps/web/components/dashboard/dashboard.css`
- Route page wrappers under `apps/web/app/dashboard/**`

### Implementation notes

- Relabel Today as Home and Activities as Training; do not rename URLs.
- Keep Plan as the parent selection for both `/dashboard/plan` and `/dashboard/calendar`, with a local Overview/Calendar switch handled by the owning screen.
- Keep Data Quality secondary and avoid a misleading primary selection.
- Preserve the skip link, one H1 supplied by the active screen, `aria-current="page"`, browser Back, and contextual parent links for direct detail entry.
- Keep Settings authentication behavior unchanged.

### Completion notes — 2026-09-12

- Implemented the shared shell with exactly three primary links: Home (`/dashboard`), Training (`/dashboard/activities`), and Plan (`/dashboard/plan`).
- Calendar remains selected under Plan without changing its `/dashboard/calendar` route; Data Quality and Settings are visibly grouped as secondary utilities.
- Preserved the skip link, route-aware `aria-current="page"`, existing URLs/deep links, authentication boundaries, and page-owned H1s.
- Added route-mapping unit coverage and updated the existing browser shell assertions for the new navigation contract.
- Validation evidence: web typecheck passed; web test suite passed (96 tests); focused Playwright route/overflow and reduced-motion/forced-colors checks passed.

### Acceptance criteria

- The shell presents only Home, Training, and Plan as primary navigation.
- Settings is visibly secondary on wide, medium, and compact layouts.
- The correct current destination is exposed in text and with `aria-current`.
- All existing dashboard routes and deep links continue to resolve.
- Primary navigation is keyboard usable and does not require hover, icon recognition, a hamburger, or horizontal scrolling.

### Test cases

- Navigate through Home, Training, Plan, Calendar, Data Quality, and Settings using keyboard only.
- Open each existing route directly and verify the expected current navigation cue.
- Use browser Back after route navigation and verify the originating route remains correct.
- Exercise the shell at 320px and 1200px; verify only the required navigation treatment is visible.

### Dependencies

- Ticket 01.

### Risk level

Medium

## Ticket 03 — TODO — Add reusable state, action, summary, detail, and dialog primitives

### Ticket title

Create shared interaction and data-state components

### Goal

Make loading, refreshing, empty, unavailable, queued, stale, error, partial, success, status, summary, detail, and confirmation behavior consistent across screens.

### Design intent

Keep caveats beside claims, preserve usable prior content during refresh, never map failure to empty data, and distinguish plan execution, readiness, review state, prediction uncertainty, and freshness. Use one primary action per active surface and one interaction surface at a time.

### Likely files/components affected

- New shared components under `apps/web/components/ui/` or the existing shared component location
- `apps/web/components/dashboard/panel-card.tsx`
- `apps/web/components/dashboard/dashboard.css`
- `apps/web/components/coaching/coaching-ui.css`
- Existing state and dialog usages in `apps/web/components/**`

### Implementation notes

- Define explicit state APIs rather than screen-specific text conventions.
- Build summary anatomy as heading, conclusion, supporting text, state/caveat, and optional detail link.
- Build detail and dialog primitives with named regions, focus containment/return, inert background, Escape when cancellable, and visible Close/Cancel.
- Build status badges with text and semantic tokens; do not use color alone.
- Keep submitting actions disabled while pending and do not claim completion before server confirmation.

### Acceptance criteria

- All shared primitives have documented state inputs and do not fabricate values or progress.
- Loading placeholders preserve approximate content geometry and are labeled.
- Errors identify the affected task and supported recovery; stale content remains visible when available.
- Dialogs satisfy keyboard and focus requirements and cannot nest.
- Buttons provide only primary, secondary, and text/link levels with 44px minimum targets.

### Test cases

- Unit-test each state variant, including loading versus empty, queued versus complete, stale versus error, and partial import.
- Keyboard-test opening, tabbing, Escape, cancel, and focus return for a dialog.
- Verify duplicate submits are prevented and a failed form retains entered values.
- Verify unchanged polling does not repeatedly announce the same state.

### Dependencies

- Ticket 01.

### Risk level

Medium

## Ticket 04 — IN PROGRESS — Replace the dashboard composition with the Home experience

### Ticket title

Implement Home as Race outlook, Recent training, and Next action

### Goal

Let a runner understand the target outlook, the latest recorded training, and today's approved action from the launch screen.

### Design intent

Home has exactly three persistent groups in this DOM and reading order: Race outlook → Recent training → Next action. Recent training is the main explanatory area. Keep setup non-blocking, show the latest activity by activity date even when review is pending, and never replace missing evidence with a score or stronger claim.

### Likely files/components affected

- `apps/web/components/dashboard/dashboard-shell.tsx`
- `apps/web/components/dashboard/dashboard.css`
- `apps/web/components/coaching/today-coaching-card.tsx`
- `apps/web/components/coaching/latest-activity-feedback.tsx`
- `apps/web/lib/dashboard-view-model.ts`
- `apps/web/app/dashboard/page.tsx`

### Implementation notes

- Remove the default KPI grid, pipeline panel, and undirected chart group from Home composition; retain supporting data for detail surfaces where already supported.
- Compose the three groups with shared summary/state primitives.
- Use one context-appropriate filled action; rest/no-action-needed may have none.
- Add direct links for readiness detail, latest session detail, today's schedule, Training, Plan, and affected Data Quality recovery.
- Keep independent loading/error states per group and keep useful activity/today content available while analytics or review loads.

### Acceptance criteria

- Home contains only the three required persistent groups in the required order.
- The latest recorded activity is shown by activity date, including pending review state.
- Target/timeframe, supported outlook, reason, uncertainty meaning, caveat, and freshness are present or truthfully unavailable.
- Today's approved workout/rest remains visible when no goal, no plan, or pending review exists.
- Latest review, readiness detail, and today's schedule context each open in one activation.
- Home never displays more than one filled primary action for the current state.

### Test cases

- Test verified states: complete data, no goal, no plan, no activities, pending review, stale analytics, failed outlook, and failed history.
- Verify a newer pending activity is not replaced by an older reviewed activity.
- Verify reading order and links with a screen reader and keyboard.
- Verify Home remains one vertical sequence at compact, medium, and wide widths.

### Dependencies

- Tickets 01–03.

### Risk level

High

### Completion notes — 2026-09-12

- Replaced the KPI/pipeline Home composition with exactly three ordered groups: Race outlook, Recent training, and Next action.
- Preserved prediction distance selection and existing prediction data/calculation behavior; unsupported race-date/on-track and probability claims are labeled unavailable.
- Added independent latest-activity loading, empty, error, and review-pending handling. The latest activity is selected by activity date and is not replaced by an older reviewed session.
- Kept today’s approved workout/rest and plan/calendar links available while outlook or review data is unavailable; compact Home mode does not change existing coaching route behavior.
- Validation evidence: web typecheck passed, web unit suite passed (96 tests), production build passed, and `git diff --check` passed for touched implementation files.
- Readiness/prediction detail remains separate Ticket 05 scope; Home provides inline supported evidence disclosure without adding a new primary destination.
- Focused polish pass (2026-09-12): aligned Home compact gutters and shared coaching controls to the contract spacing/target scale, restored the 24–28px page-heading and 18–20px section-heading ranges, tightened narrow-screen session stacking, and clarified retry/session action labels without changing data or business behavior.
- Made Home freshness/outlook dates deterministic across server and browser locales to remove a presentation-only hydration mismatch surfaced by the browser smoke.

### F02 implementation notes — 2026-09-15

- Added the Home-only `home-review-presentation.ts` presenter. It retains supplied assessment/advice text verbatim; it never word-clips. Short review content may include its adjacent source headline and complete advice only within the 80-word/three-sentence target. Long, over-budget, multi-sentence, or unpunctuated assessment text is shown in full with a visible fidelity-fallback explanation and one-activation full-review access.
- Recent training now keeps complete match interpretation, supplied plan version, all distinct material limitations, persisted review revision, advisory/prescription distinction, and the explicit `Goal impact cannot be assessed from the available review evidence.` limitation beside its claim. It does not infer goal progress from plan matching or the current-fitness outlook.
- Kept the three persistent groups in order and compacted the outlook value/spacing. No API, persistence, calculation, review-request, prescription, or schedule-mutation behavior changed.
- Restored the full-session Home return by carrying only an in-session recovery token, activity identity, scroll position and launcher id. Home → session → Home restores focus to the original session-review link; no review text is cached and the journey issues no consequential write.
- Added 6 presenter tests and 15 focused Home Playwright cases. `npx playwright test --config playwright.home.local.config.ts` passed 15/15 with an isolated local dashboard snapshot and intercepted client reads; `npx playwright test --config playwright.online.config.ts redesign-home.spec.ts` passed 15/15 with online fixture responses. Both runs wrote no failure screenshots/traces; transient isolated Next build directories are under `apps/web/.next-e2e-*-digital-coach-*/`.
- `npm test --workspace @racepredictor/web` passed 129/129, `npm run typecheck --workspace @racepredictor/web` passed, and `npm run build --workspace @racepredictor/web` passed. Adjacent readiness passed 5/5 in both local and online fixture modes; online Training return passed 3/3.
- Ticket remains **IN PROGRESS**: a 30-second unfamiliar-runner comprehension observation, screen-reader/keyboard review, true browser-level 200% zoom inspection, deployed/authenticated smoke, and the remaining independent Home state matrix are deliberately not marked complete.

## Ticket 05 — IN PROGRESS — Add readiness/prediction detail from Home

### Ticket title

Implement contextual readiness and prediction detail

### Goal

Give the runner optional evidence for the Home outlook without introducing a fourth primary destination or changing prediction behavior.

### Design intent

Lead with conclusion, target, timeframe, evidence basis, and limitation; reveal trends and assumptions progressively. Current-fitness estimates must remain labeled as such. Reading and changing presentation filters must not mutate the goal or prediction.

### Likely files/components affected

- `apps/web/components/dashboard/dashboard-shell.tsx`
- `apps/web/components/coaching/coaching-pages.tsx`
- `apps/web/components/dashboard/feature-trend-list.tsx`
- `apps/web/lib/dashboard-view-model.ts`
- `apps/web/app/dashboard/page.tsx`
- Existing prediction/trend data clients and tests

### Implementation notes

- Use additive query/anchor state such as `?view=readiness`; keep Home selected and preserve existing URLs.
- Reuse supported prediction options and data; do not add confidence categories, probabilities, ranges, readiness curves, or forecast models.
- Put charts behind detail only when they answer a named question; provide unit/period/comparison labels and a text equivalent.
- Keep a local retry/error state for estimate, trend, and evidence regions and preserve stale values when available.

### Acceptance criteria

- The detail opens from Home and returns to Home with context/focus restored.
- It shows the same target and assessment timeframe as Home.
- Unsupported on-track verdicts and confidence visuals are absent.
- Material assumptions and data issues remain beside the affected claim.
- Supported trend content includes labels and an equivalent text explanation.

### Test cases

- Test compatible target, no target, incompatible estimate, insufficient history, unavailable confidence, stale estimate, and partial evidence.
- Verify direct URL entry has an explicit Back to Home link.
- Verify opening and closing detail does not change goal, plan, or prediction data.
- Verify chart/text parity and no horizontal scroll on compact layouts.

### Dependencies

- Tickets 01–04.

### Risk level

Medium

### F01 completion notes — 2026-09-15

- F01 preserves canonical driver direction/confidence and trend feature labels through the web view model; malformed or incomplete legacy local snapshots remain a recoverable unavailable assessment rather than being silently relabeled.
- Home now derives its concise reason deterministically from the greatest absolute non-zero supplied signed contribution, with a stable key tie-break and a bounded conflicting/neutral/no-evidence fallback. It explicitly does not attribute or predict finish time.
- Readiness is an addressable `#readiness` disclosure. Direct entry, explicit Back, browser Back/Forward, focus restoration, bounded selected-distance recovery state, and read-only evidence actions were verified with synthetic local and online browser fixtures.
- The detail renders all supplied driver contributions and feature/unit/period-specific weekly observations as text. Gaps, zero and negative observations are preserved; no chart scale, target compatibility, confidence score, or readiness verdict was invented.
- Target reads validate `todayApiResponseSchema`; valid null is confirmed absence, while malformed, network, 404/503 and authorization failures remain distinct failed reads. Existing target data is retained for a non-authority refresh failure; stale request generations are ignored.
- This ticket remains **IN PROGRESS** because human comprehension, assistive-technology validation, deployed/authenticated journeys and the full compatible/incompatible/insufficient-history fixture matrix are not demonstrated by F01.

## Ticket 06 — IN PROGRESS — Recompose Training list and filters

### Ticket title

Implement recent-first Training history with contextual filters

### Goal

Make recorded sessions easy to inspect and provide a clear, bounded entry to Add training and Data Quality recovery.

### Design intent

Training is recent-first history, not an analytics dashboard. Filters stay collapsed until requested, applied context remains visible, and empty filtered results offer Clear filters. Selection, filters, scroll, and loaded rows survive detail loading and recoverable read errors.

### Likely files/components affected

- `apps/web/components/activities/activities-shell.tsx`
- `apps/web/components/activities/activities.css`
- `apps/web/app/dashboard/activities/page.tsx`
- `apps/web/lib/local-activities-data-source.ts`
- `apps/web/lib/activities-api-client.ts`
- Activity list tests and E2E specs

### Implementation notes

- Relabel the route as Training while retaining `/dashboard/activities`.
- Keep row content to date, title, distance, duration, pace, and available status/review cue.
- Use native list/table semantics with one clear selection target per row.
- Add labeled Filters, visible applied summary, Clear action, Load more only when continuation exists, Add training, and contextual Data Quality link.
- Support direct `activityId` entry and a recoverable missing-record state.

### Acceptance criteria

- Records are sorted recent-first by activity date by default.
- Filters are collapsed by default and active filters remain visible with Clear.
- No-activity and no-filter-match states are distinct and actionable.
- List rows remain available when selected detail loads or fails.
- Direct missing activity links do not substitute another record.

### Test cases

- Test default ordering, filter application, clear, empty history, filtered emptiness, pagination/load-more end, and list read failure.
- Test keyboard row selection and selected-state semantics without color-only cues.
- Test direct valid and invalid `activityId` links.
- Test mobile replacement detail and restoration of filters, selection, scroll, and focus.

### Dependencies

- Tickets 01–03.

### Risk level

Medium

## Ticket 07 — IN PROGRESS — Implement reusable activity detail and review composition

### Ticket title

Implement activity detail with four metrics, review states, and plan comparison

### Goal

Explain what was recorded, how it relates to a supported plan reference, and what the persisted review suggests without overstating evidence.

### Design intent

Show session identity and up to four key metrics first: distance, duration with elapsed/moving meaning, pace, elevation. Separate recorded facts, plan comparison, goal implication, next step, review state, and evidence limitations. Reuse the same persisted review/evidence reference from Home, Training, and Calendar.

### Likely files/components affected

- `apps/web/components/activities/activity-coach-review.tsx`
- `apps/web/components/activities/activities-shell.tsx`
- `apps/web/components/activities/activities.css`
- `apps/web/lib/activity-formatters.ts`
- Activity detail API routes under `apps/web/app/api/v1/activities/[activityId]/**`
- `apps/web/app/api/v1/coaching/activity-reviews/latest/route.ts`

### Implementation notes

- Keep review loading independent from activity metrics.
- Use comparison columns Measure, Planned, Recorded, Interpretation only when a supported plan comparison exists.
- Label unavailable optional splits, route, sensor, provenance, and no-plan states; never use zero placeholders or manufacture maps.
- Keep review advice advisory and do not add Apply recommendation behavior.
- Use the existing detail route/query behavior and preserve parent context.

### Acceptance criteria

- Detail shows the four key metrics before optional telemetry with correct units and duration semantics.
- Review pending, ready, limited-evidence, retryable failure, and no-linked-plan states are distinct.
- Weak or absent matching does not become completion, adherence, causal improvement, or readiness.
- The same persisted review and evidence reference is used by all existing entry points.
- Compact comparison stacks without inner horizontal scrolling.

### Test cases

- Test elapsed-only, moving-only, both, and unavailable duration values.
- Test pending, queued, ready, limited, failed, and no-plan review states.
- Test supported comparison and unavailable planned/recorded values.
- Test Home, Training, and Calendar entry points resolve to the same review reference.

### F03 implementation evidence — 16 September 2026

- Shared response validation rejects a review returned for another activity. The app-local reader cancels superseded reads, retains same-activity content during recoverable refresh failures, clears it after authorization failures, and prevents a late GET from overwriting an explicit request acknowledgement.
- Local and online `redesign-review-consistency.spec.ts` fixture runs each passed 2/2 cases: Home, Training, and Calendar render the same persisted review revision, suggested-match qualification, evidence reference and advisory boundary with no writes; Training retains the saved review after a failed manual refresh.
- Full local and online Home suites each passed 15/15 after the F03 changes. Online Training-detail passed 3/3. The standalone local Training-detail run timed out waiting for its pre-existing Load-more control in two F04 cases, so it is not counted as F03 evidence.
- Human comprehension, screen-reader testing, actual browser-level 200% zoom, deployed/authenticated verification, and the full status/match matrix in Calendar remain outstanding.

### Dependencies

- Tickets 01–03 and Ticket 06.

### Risk level

High

## Ticket 08 — IN PROGRESS — Implement Add training/import flow

### Ticket title

Implement file and Strava training import with truthful result states

### Goal

Let the runner add training with one visible source choice and understand accepted, duplicate, rejected, warning, queued, or failed outcomes.

### Design intent

Import belongs to Training history and should not require infrastructure knowledge. Explain file rules before selection, preserve source/return context, distinguish authorization from history import, and never imply ingestion, review, or prediction completion from queue acknowledgement.

### Likely files/components affected

- `apps/web/components/activities/activities-shell.tsx`
- `apps/web/components/activities/activities.css`
- `apps/web/components/sync/online-sync-settings.tsx`
- `apps/web/app/api/v1/imports/upload/route.ts`
- Strava routes under `apps/web/app/api/v1/providers/strava/**`
- `apps/web/lib/local-activity-import-service.ts`
- Import route/unit/E2E tests

### Implementation notes

- Use the existing upload capability and add a bounded import view/state such as `?view=import`.
- Present File or Strava as the single visible selected source.
- State CSV limits and one-activity-per-GPX-file before the picker.
- Use actual server counts for accepted, duplicate, rejected, and warning results; support partial and duplicate-only outcomes.
- Preserve entered safe choices on recoverable failures and provide one next action: View training, Correct file, Settings, or status/recovery.

### Acceptance criteria

- Import action is explicit, disabled during submission, and duplicate submissions are prevented.
- File validation distinguishes missing, unsupported, malformed, oversized, network, and queued outcomes.
- Strava cancellation/disconnection returns with an explanation and does not reconnect implicitly.
- A queued request is labeled queued; completed ingestion is claimed only after records are actually available.
- Review/prediction readiness remains a separate state from import success.

### Test cases

- Test valid CSV, valid single-activity GPX, invalid file, partial result, duplicate-only result, failed upload, and queued response.
- Test Strava connected, disconnected, authorization cancelled, and return-path behavior.
- Test pending button behavior, preserved form state, and result navigation.
- Test mobile file rules, keyboard-visible action, and stacked result summary.

### Dependencies

- Tickets 01–03 and Ticket 06.

### Risk level

High

### Completion notes — 2026-09-12

- Added an explicit Add training source choice on the existing Data Quality recovery surface: file upload or Strava.
- Preserved the existing upload API and import semantics while adding client-side file-type validation, pending-submit protection, actionable error recovery, accepted/duplicate/rejected/warning summaries, and a durable View Training success action.
- Added truthful Strava connection, unavailable/disconnection, queued backfill, and delayed-availability messaging. Queue acknowledgement is not presented as completed ingestion, review, or prediction readiness.
- Manual activity entry was not present in the existing product and was not introduced by this ticket.
- Validation evidence: web typecheck, web unit suite, production build, and import route tests passed.

### F08 evidence — 2026-09-14

- File and Strava now own separate durable result state. A completed File result cannot expose a Strava action while File remains selected; server-schema fields distinguish staged/processing, normalized/unavailable, duplicate-only, rejected, warnings and reuse.
- File/backfill acknowledgement copy names the affected import task, practical consequence and supported return/correction action. It never treats import, connection or queue acknowledgement as review/readiness recomputation.
- Training → Data Quality → return restores the selected session, applied filter, disclosure, position and semantic focus from bounded per-tab metadata. The journey is read-only apart from the deliberate upload used in the fixture.
- Executed evidence: web typecheck and 111 unit tests pass; local and online `f08-recovery.spec.ts` each pass 2 browser cases; online schema-valid partial-import regression passes; web production build passes.
- Still open: live Strava cancellation/direct callback presentation, valid CSV fixture browser coverage, 320px/actual zoom and assistive-technology verification. Ticket remains **IN PROGRESS**.

## Ticket 09 — IN PROGRESS — Recompose Plan overview and staged workflow

### Ticket title

Implement Plan overview with explicit staged creation, draft, and approval states

### Goal

Make goal and plan status understandable while preserving explicit Codex handoff, saved-draft resume, approval/rejection, and history semantics.

### Design intent

Expose the stage sequence goal/context → continue in Codex → import proposal → review → confirm. Setup must not block activity access or imply that publishing context creates/approves a plan. Existing explicit confirmations and owner control remain authoritative.

### Likely files/components affected

- `apps/web/components/coaching/coaching-pages.tsx`
- `apps/web/components/coaching/active-plan-overview.tsx`
- `apps/web/components/coaching/coaching-ui.css`
- Plan routes under `apps/web/app/api/v1/coaching/plans/**` and `proposals/**`
- Plan and coaching tests

### Implementation notes

- Keep the default view focused on settled goal, active approved plan, and one creation/resume entry.
- Keep full creation form, proposal review, and approved history out of the default visible area until their stage is active.
- Use persistent labels/help/errors, supported defaults, server-authoritative validation, and draft preservation.
- Keep approval/rejection and historical-plan activation confirmations explicit, naming the affected plan and Home/Calendar consequence.
- Explain local/online boundaries and how to resume a saved draft; do not imply unsupported online drafting.

### Acceptance criteria

- No-goal, no-approved-plan, active-plan, saved-draft, and proposed-replacement states are distinct.
- Current workflow stage is visible and has at most one filled primary action.
- Publishing context, importing a proposal, leaving, and saving a draft do not activate a plan.
- Approval only shows confirmed active state after server confirmation.
- Abandoning a replacement preserves the current approved plan.

### Test cases

- Test first plan, replacement, resume draft, invalid proposal, missing returned file, stale history, approval failure, and revision conflict.
- Verify invalid fields retain values and focus moves to the first invalid field.
- Verify approval/rejection dialogs have target/consequence and keyboard focus behavior.
- Verify Home and Calendar update only after confirmed approval.

### Dependencies

- Tickets 01–03.

### Risk level

High

### Completion notes — 2026-09-12

- Clarified the existing Plan creation flow as Goal & context → Continue in Codex → Import proposal → Review → Confirm without adding navigation or changing approval semantics.
- Added supported optional race target time capture (`HH:MM:SS`) alongside target outcome, date, distance, purpose, and training availability; the value is validated and carried through the existing context publication contract.
- Added adjacent guidance for required data, prediction assumptions, missing history, and the fact that publishing/importing/leaving does not activate a plan.
- Labeled Home's existing prediction-distance selector as presentation-only settings; changing it does not mutate the race goal or calculation inputs.
- Validation evidence: web typecheck, web unit suite (96 tests), and core unit suite (90 tests) passed after the final typecheck fix; `git diff --check` has no whitespace errors in touched lines.

### F07 follow-up — 2026-09-13

- Approval, rejection and approved-version activation now retain reviewed identities and keep pending, failure, conflict, uncertain-outcome and confirmed-result feedback in the active dialog. Reconciliation is read-only and requires explicit rereview before another confirmation.
- F06 follow-up added independent, contract-validated Plan reads; durable context download/instructions and preference restoration; and the explicit local five-stage workflow. Web unit tests now pass 106/106, web typecheck and production build pass. Focused Playwright work remains unresolved because the isolated online runner stalled without a final result; responsive 200% zoom, keyboard/assistive-technology and deployment checks are still unperformed. Ticket 09 remains **IN PROGRESS**. Neither this evidence nor the F07 dialog work completes shared F05/F06/F10 criteria.

## Ticket 10 — TODO — Recompose Calendar inside Plan

### Ticket title

Implement Plan Calendar four-week and Agenda views with existing schedule permissions

### Goal

Let the runner inspect current plan context and permitted session actions without losing date, timezone, selection, or history context.

### Design intent

Calendar is a local Plan switch, not a fourth destination. Use four-week context on wide screens and Agenda below 1200px; preserve existing date/timezone semantics and session permission rules. A read-only today, future edits, and past skip-only behavior must remain truthful.

### Likely files/components affected

- `apps/web/components/coaching/coaching-pages.tsx`
- `apps/web/components/coaching/coaching-ui.css`
- `apps/web/app/dashboard/calendar/page.tsx`
- Calendar routes under `apps/web/app/api/v1/coaching/calendar/**`
- Calendar coaching service and tests

### Implementation notes

- Retain existing `date` and `session` deep-link parameters.
- Use an explicit Overview/Calendar switch with Plan selected in the shell.
- Keep date summaries concise, provide detail access, and avoid a week layout that requires horizontal panning to understand it.
- Preserve existing amend/move/skip/restore flow, 1–500 character reasons, collision/out-of-range validation, source/history, and revision-conflict recovery.
- Use one dialog at a time and keep Cancel/Back available except during an acknowledged pending write.

### Acceptance criteria

- Wide screens show the readable four-week context; below 1200px the default is Agenda.
- Today remains read-only; future and past actions respect existing permissions.
- Consequential changes require the existing reason and explicit confirmation.
- Date/session deep links and browser/contextual Back restore the correct context.
- Revision conflicts do not silently overwrite or retry.

### Test cases

- Test wide, medium, compact, timezone/date boundaries, and resize without losing context.
- Test today, future, past, skipped, collision, out-of-range, and invalid-reason cases.
- Test direct session link, selected-session detail, dialog focus, and Back behavior.
- Test failed and uncertain write responses against the authoritative current state.

### Dependencies

- Tickets 01–03 and Ticket 09.

### Risk level

High

## Ticket 11 — IN PROGRESS — Implement Data Quality and contextual recovery

### Ticket title

Implement Data Quality as a specific, non-misleading recovery surface

### Goal

Help the runner understand a material data limitation, its consequence, and the supported correction without exposing unnecessary operational detail.

### Design intent

Explain the consequence first. Keep uncertainty separate from freshness/completeness, make operational details secondary, and provide only remedies the app can execute. “No known issues” is valid only after a successful check.

### Likely files/components affected

- `apps/web/components/coaching/coaching-pages.tsx`
- `apps/web/components/coaching/coaching-ui.css`
- `apps/web/app/dashboard/data-quality/page.tsx`
- Import/sync/status data sources and routes
- Data-quality and recovery tests

### Implementation notes

- Support contextual entry from Home/readiness/import/Training with affected task and return context.
- Show affected data, practical consequence, and one supported next action first; put counts, warnings, processing history, and diagnostics behind secondary detail.
- Distinguish correct/re-upload, reconnect, inspect queued work, refresh, and no-action states.
- Preserve stale assessment until recomputation actually occurs and avoid promising a better prediction.

### Acceptance criteria

- The page never claims “no known issues” after a failed check.
- Affected claims link directly to relevant evidence/recovery and return to the launching context.
- Queue acknowledgement is not presented as ingestion or review completion.
- Private source content, raw errors, tokens, paths, and arbitrary notes are not exposed.
- Recovery errors remain local and actionable.

### Test cases

- Test actionable missing data, unavailable evidence, stale data, queued work, provider failure, failed correction, successful correction, and no-issues-after-successful-check.
- Test context and focus restoration from Home, readiness, import, and Training.
- Test screen reader status announcements are meaningful and not repeated on unchanged polling.

### Dependencies

- Tickets 03, 05, 06, and 08.

### Risk level

Medium

### F08 evidence — 2026-09-14

- Data Quality now gives File results and Strava queue acknowledgements source-owned, consequence-first recovery text and a single primary return/check action. Warnings are sanitized rather than rendering raw local analytics failures.
- Home/readiness and Training can create an opaque, allowlisted recovery record; Training restoration is browser-tested with filters, a re-read loaded second page, selected detail and focus. Full Home/readiness, Settings/OAuth and no-issue/failed-check matrices remain incomplete.
- Do not mark this ticket complete: direct provider cancellation is still an API error, not a trusted UI return; human comprehension, assistive technology, 320px and deployment checks remain open.

## Ticket 12 — IN PROGRESS — Recompose Settings and preserve sign-in recovery

### Ticket title

Implement grouped Settings and protected-route recovery states

### Goal

Keep supported preferences, connections, reminders, and context setup available without turning Settings into a primary product destination or changing authentication behavior.

### Design intent

Settings is a secondary utility. Show clearly grouped controls, expand only the selected group, explain local/online availability where relevant, and use the existing sign-in/recovery flow with a safe intended destination.

### Likely files/components affected

- `apps/web/components/coaching/coaching-pages.tsx`
- `apps/web/components/sync/online-sync-settings.tsx`
- `apps/web/components/coaching/coaching-ui.css`
- `apps/web/app/dashboard/settings/page.tsx`
- `apps/web/app/login/page.tsx`
- `apps/web/app/login/sign-in.module.css`
- Auth/session tests

### Implementation notes

- Preserve all currently supported controls and API contracts; do not add providers, roles, athletes, or coach workspaces.
- Use persistent labels, adjacent help/errors, server-authoritative saves, pending states, and durable confirmation.
- Keep connection setup and import return paths explicit.
- Treat authentication required as distinct from empty history and preserve the safe destination.

### Acceptance criteria

- Settings remains secondary in every shell layout.
- Preference, connection, reminder/context, privacy, and operational groups are clearly distinguished where supported.
- Failed saves retain safe entered values and do not show false success.
- Strava setup returns to the originating import flow after explicit authorization.
- Expired sign-in returns safely without exposing private data or substituting empty content.

### Test cases

- Test each supported settings group collapsed/expanded behavior and keyboard navigation.
- Test successful save, validation error, network failure, and pending duplicate prevention.
- Test connected, disconnected, cancelled, and reconnected provider paths.
- Test protected deep links with expired session and intended-destination recovery.

### Dependencies

- Tickets 01–03 and Ticket 08.

### Risk level

Medium

### F08 limited integration — 2026-09-14

- Settings now preserves an allowlisted import-recovery destination, provides a no-write return action, and distinguishes a failed provider-status read from a disconnected account. A confirmed OAuth marker prompts an authoritative status reread and does not claim ingestion/readiness.
- This does not complete Ticket 12: its broader preference/group/sign-in work and live cancel/reconnect evidence remain outstanding.

### F09 implementation evidence — 2026-09-14

- **IN PROGRESS, not complete.** Local Settings now treats the schema-validated preference response as the confirmed baseline, retains a separate draft, and exposes independent preference/context retries. An initial preference failure has no editable fallback values; a failed refresh retains only confirmed data and dirty entries are not replaced by a late read.
- Reminder setup is staged: save clean enabled preferences → prepare an empty-body handoff request → explicitly continue → type/paste an external task reference → confirm. Prepared artifact paths are displayed separately and are never hydrated into the external-task field. Copy/preparation says neither scheduling nor delivery is verified. One synchronous mutation guard covers the three local reminder writes.
- Online Settings keeps `section=connections|devices|privacy|operations`: Connections owns Strava; **Paired computer** owns pairing, its one-time credential, history and revocation; Operations is accurately named. Provider, device/session and operations reads have independent retries and generation guards.
- Evidence: `npm run typecheck --workspace @racepredictor/web`; `npm test --workspace @racepredictor/web` (115 passing, including four focused Settings state cases); `npm test --workspace @racepredictor/core` (90 passing); `npm run db:test:local-coaching` (7 passing). Manual browser evidence on isolated local/online fixture servers confirms local prepared-state reference separation and no 320px horizontal overflow, plus online provider/device failed reads with their resource-specific retries. Existing local/online Settings Playwright specs were updated for staged labels but the focused managed-server run did not complete cleanly; 200% zoom, auth-return and live-provider checks are not claimed.
- Keep Ticket 12 **IN PROGRESS**. Missing F09 acceptance evidence includes controlled browser 503/malformed/lost-response/repeated-Enter matrices, actual 320px/200% zoom and keyboard/focus checks, return/auth recovery journeys, and live provider/assistive-technology/deployment checks.

## Ticket 13 — IN PROGRESS — Add cross-screen accessibility, responsive, and journey verification

### Ticket title

Validate the redesign end to end against the contract

### Goal

Provide the final evidence that the core journey and all implemented state variants satisfy the binding UX direction without introducing regressions.

### Design intent

Validate comprehension and trust across launch → recent training → activity review → race outlook → evidence/recovery → today's action, while preserving one primary action, stable context, truthful states, and accessible interaction at every width.

### Likely files/components affected

- `apps/web/e2e/*.spec.ts`
- `apps/web/test/*.test.ts`
- `apps/web/playwright.config.ts`
- All redesigned components and route wrappers
- Any shared accessibility/test helpers

### Implementation notes

- Add focused tests for the contract requirements, then one end-to-end journey test using existing fixtures/data sources.
- Cover authenticated and authentication-required paths, local and online mode boundaries where already supported, and independent section failures.
- Verify no unsupported visual or product patterns were added: KPI wall on Home, gauges, fabricated confidence, nested dialogs, hidden mobile nav, or automatic adaptation.
- Record unresolved capability gaps as unavailable-state evidence rather than marking them complete.

### Acceptance criteria

- Core journey completes with keyboard and pointer at compact, medium, and wide widths.
- All screens have one H1, logical headings, labeled navigation, skip link, visible focus, semantic state text, and no color-only meaning.
- 320px reflow, 200% zoom, reduced motion, and dialog behavior pass.
- Loading, empty, error, stale, queued, partial, unavailable, and success states are covered where applicable.
- Browser Back and contextual Back/Close restore selection, filters, list position, date context, form stage, and focus.
- Existing authentication, API, persistence, permission, and coaching tests remain green.

### Test cases

- Run unit, typecheck, build, and Playwright suites.
- Use axe or equivalent checks on each redesigned route if available in the existing test setup.
- Run the core journey with pending review, no goal, no plan, failed read, partial import, and revision conflict fixtures.
- Manually verify Home comprehension target: outlook, latest-session takeaway, caveat, and next action are identifiable within 30 seconds after load.

### Dependencies

- Tickets 01–12, with each completed ticket's tests available.

### Risk level

Medium

### Progress note — 2026-09-12

- Completed a focused implementation polish pass for responsive gutters, shared control targets, typography hierarchy, card/list spacing, state action hierarchy, and runner-facing retry/session microcopy.
- Remaining verification is the boundary-viewport/browser accessibility and end-to-end evidence listed in the QA matrix; this ticket is not complete until those checks are executed and recorded.

### Progress note — 2026-09-16

- F05 adds Chromium local and online responsive/accessibility coverage. The suites exercise all six redesigned routes at 320, 375, 390, 414, 767, 768, 1024, 1199, 1200 and 1440 CSS pixels, assert no document horizontal overflow, verify the skip link targets the main landmark, and scan Home with axe.
- Shared responsive rules now use the contract compact boundary below 768px. Calendar preserves the runner's preferred wide view after a compact Agenda transition, and dialogs use dynamic viewport limits and a filtered focusable set.
- Ticket 13 remains **IN PROGRESS**: active Plan/Data Quality/Settings workflow resize coverage, dialog failure/pending matrices, actual desktop-browser 200% zoom, NVDA, software-keyboard, comprehension and deployed/authenticated checks remain open.

### F10 reconciliation — 2026-09-16

### F10 follow-up — 2026-09-17

- F07 dialog focus recovery and initial-route F05 axe heading order now have passing focused Chromium regressions.
- `test:e2e:local` sequences isolated general, Home and readiness configurations, checking ports without terminating other processes.
- Ticket 13 remains **IN PROGRESS** pending complete applicable suites and the explicit browser zoom, assistive technology, comprehension, live-provider and deployed verification gates.

- F10 adds isolated JSON Playwright reports, owner-auth Next-output isolation, request-write recording and explicit Training client-filter setup. This is test infrastructure and evidence work only; product contracts and persistence are unchanged.
- The final evidence cannot mark Ticket 13 complete. All-route axe now reports `heading-order` failures on Training, Plan, Data Quality and Settings, and the Plan conflict recovery regression leaves focus away from the review-history heading after `Return to review`. Both remain executable failing regressions with no expected-failure exemption.
- Earlier references to a 200% viewport proxy or compilation as UX evidence are superseded: neither establishes browser-level 200% zoom or human accessibility acceptance. Those checks remain open.
- Ticket 13 stays **IN PROGRESS** and the release gate is **BLOCKED** pending the two product defects plus real browser-zoom, assistive-technology, human-comprehension, live-provider, authenticated deployed and deployment-smoke evidence. See the F10 record in `docs/progress/race-predictor-astra-implementation-handoff.md` and the QA matrix for commands and artifacts.
- Final F10 Chromium results: online fixture **41 pass / 2 fail** (F07 focus return and F05 heading order); local isolated snapshot **35 pass / 15 fail**. The local result additionally exposes stale legacy fixture/assertion work and is recorded as a failure, not treated as a release pass.

### F10 validation reconciliation — 2026-09-23

- The preceding 41/2 online and 35/15 local results are historical and superseded, with artifacts retained. At commit `000b38f` in a dirty working tree, independently launched Chromium configurations now pass and exit cleanly: general local 30/30, seeded Home 15/15, seeded readiness 5/5, online fixtures 43/43, owner-auth 3/3. The local count change is a configuration reassignment (30 + 15 + 5 = 50), not a dropped scenario. See the F10 handoff for exact commands, viewport/mode details and JSON paths.
- The full manual local coaching journey passes. Its final rerun found and fixed an F09 product defect: reminder preferences sent capitalized weekdays to a lowercase-only API; the regression now asserts the exact PUT payload and persisted values. Current F05 initial-state all-route axe and F07 conflict focus regressions pass; expanded-dialog/disclosure axe coverage remains open. Web/core units, database suites, typecheck and production build also pass with the logged results in the handoff. The `lint` script currently repeats the TypeScript check.
- The aggregate `test:e2e:local` process still hangs after displaying 30/30 general-local passes; repeated attempts were interrupted with exit 1 before their JSON report or subsequent configurations. Direct executions of all three local configurations exit 0. Assign this remaining aggregate process-exit defect to test infrastructure; do not count the aggregate gate as passed.
- Ticket 13 remains **IN PROGRESS**. Automated success does not establish browser-controlled 200% zoom, screen-reader/switch-control/software-keyboard use, unfamiliar-runner comprehension, real OAuth/provider persistence, or authenticated deployed/anonymous smoke. QA, Product, integration QA and the release owner retain those respective checks; no deployment or live-account action was performed. Release approval remains outstanding.

## Product assumptions and open gaps

- Existing routes, APIs, authentication, persistence semantics, coaching rules, provider behavior, and session permissions remain the implementation authority where the redesign documents defer to them.
- The current repository contains the component and route families named in the tickets; engineers should adjust exact file paths only when the existing architecture has moved.
- Supported prediction uncertainty, comparable trend data, plan-reference evidence, durable import/queue status, and local/online capability boundaries must be verified against current contracts before implementation. If unavailable, implement the specified truthful unavailable state and record the gap.
- No backend expansion is implied by this backlog.

## Recommended next item

Start with Ticket 01, then Ticket 02. The redesign cannot be evaluated consistently until semantic tokens, responsive ranges, and the three-destination shell are stable; these two tickets also reduce the risk of page-specific patterns appearing during later screen work.

### F10 validation reconciliation — 2026-09-24

The earlier F10 notes describing unresolved F05 heading-order defects, the F07 focus regression, expanded-axe coverage gaps and an aggregate-local shutdown failure are historical and superseded by the final run recorded in `docs/progress/race-predictor-astra-implementation-handoff.md`. The final aggregate local run passes 32 general + 16 seeded Home + 5 seeded readiness tests; online fixtures pass 44/44; owner-auth fixtures pass 3/3. All listed unit, local/cloud database, type/lint and production-build checks exit 0. The aggregate required elevated local Windows process rights so Playwright could stop its isolated Next servers; no runner code change was required. Schema-valid fixtures now render the Home prediction disclosure and Plan history for expanded axe scans.

F05's additional dialog heading defects were fixed with level-2 modal titles and an internal heading-level option for shared activity content nested inside Calendar. The expanded all-route disclosure scans and the Plan/Calendar dialog scans pass. Earlier failure screenshots/traces are retained in their original isolated run directories and are explicitly superseded by separate final JSON reports.

**Ticket 13 remains IN PROGRESS; release approval is not granted.** Real browser-controlled 200% zoom, screen reader, switch control, software keyboard, unfamiliar-runner comprehension, real OAuth/provider persistence, deployed authenticated journey, anonymous access-control checks and deployment smoke have not been performed. `db:test:contracts` is also outstanding because `DATABASE_URL` is unset; no live database was accessed. No deployment or live-account change occurred.

Follow-up branch: `codex/release-readiness-2026-09-24`, based on merged `main` commit `0c5f5022b5b7cd600ade662b32907259f131c89c`. Changes remain uncommitted pending review.
