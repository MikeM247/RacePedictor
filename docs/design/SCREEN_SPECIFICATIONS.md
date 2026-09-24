# Race Predictor Redesign Screen Specifications

Design specification input · 12 September 2026

This document is governed by [DESIGN_INTENT_CONTRACT.md](DESIGN_INTENT_CONTRACT.md) and follows [INFORMATION_ARCHITECTURE_AND_USER_FLOWS.md](INFORMATION_ARCHITECTURE_AND_USER_FLOWS.md). It defines the screen behavior required for implementation. It does not define backend changes or introduce new prediction, matching, or coaching capabilities.

## Shared screen rules

- Primary navigation has exactly **Home**, **Training**, and **Plan**. Settings is secondary.
- Home always presents three groups, in order: **Race outlook → Recent training → Next action**.
- Each screen or active workflow step has at most one filled primary action.
- Detail opened from a summary returns to the originating context with selection, filters, scroll position, and focus restored.
- Detail is progressive: show a conclusion and relevant caveat first; reveal evidence only when requested.
- Activity data, coach review, prediction, plan state, and sync/context freshness load independently.
- Missing evidence is labeled unavailable; it is never represented as zero, a failure, poor performance, or false confidence.
- All screens use semantic text states in addition to color, visible focus, keyboard support, reduced motion, and a minimum 44px interactive target.

## Screen 1 — Application shell and primary navigation

### Route, if known

Shared shell for `/dashboard`, `/dashboard/activities`, `/dashboard/plan`, `/dashboard/calendar`, `/dashboard/data-quality`, and `/dashboard/settings`.

### Purpose

Provide stable orientation and smooth movement between the three primary destinations and secondary utilities.

### Primary user question

Where am I, and where should I go next?

### Primary action

Select the current primary destination: Home, Training, or Plan.

### Secondary actions

- Open Settings.
- Use contextual Back or Close from detail.
- Use the skip-to-content link.

### Main content sections

- Brand and current product identity.
- Primary navigation: Home, Training, Plan.
- Secondary Settings link with current-state cue when required.
- Main content region with one H1 supplied by the active screen.

### Component list

- Shared application shell.
- Primary navigation.
- Secondary utility navigation.
- Skip link.
- Breadcrumb or contextual parent link where a direct deep link has no origin.
- Status region for local screen feedback.

### Loading state

Keep navigation and page heading visible. Replace only the affected content area with labeled placeholders. Do not show empty history or “no plan” before the relevant request resolves.

### Empty state

The shell itself is never empty. The active screen supplies its own contextual empty state and one appropriate primary action.

### Error state

Keep navigation available. Display the affected screen's error and recovery locally. Authentication errors use the existing sign-in flow; do not replace a failure with empty content.

### Success state

Navigation shows the correct current destination. State-changing feedback remains in the screen that changed and does not disappear before it can be understood.

### Mobile behaviour

Show one labeled Home / Training / Plan row and a separate Settings utility. Do not use a hidden hamburger as the only way to discover primary navigation. Keep the row from becoming horizontally scrollable.

### Desktop behaviour

Use the left rail with Home / Training / Plan and a separate Settings entry. Cap content at 1280px with 24px gutters. Do not use rail width to add more destinations or dense status panels.

### Acceptance criteria

- Exactly Home, Training, and Plan are presented as primary destinations.
- Current destination is exposed with text and `aria-current`.
- Settings is secondary and is not mistaken for a fourth primary destination.
- Browser Back, contextual Back, and Close preserve the originating context.
- Navigation is usable by keyboard, at 200% zoom, and at 320px without horizontal page scrolling.

## Screen 2 — Home

### Route, if known

`/dashboard`

### Purpose

Give the runner a short, connected account of race outlook, recent training, and the next action.

### Primary user question

Am I on track, what does my recent training say, and what should I do next?

### Primary action

Choose one context-appropriate action: Add training, Set up race goal, Review saved draft, View session, or open today's approved action. Rest may have no filled action.

### Secondary actions

- View readiness from Race outlook.
- View session from Recent training.
- Open today's schedule context.
- Open Training.
- Open Plan.
- Open a contextual data-quality recovery link.

### Main content sections

1. **Race outlook** — target/date, supported estimate or outlook, one reason, confidence meaning, material caveat, and relevant freshness.
2. **Recent training** — latest activity by activity date, concise execution-versus-plan commentary, goal implication, review state, and evidence limitation.
3. **Next action** — today's approved session/rest, purpose, and one prioritized next step.

No separate KPI grid, pipeline panel, infrastructure dashboard, or undirected chart group appears by default.

### Component list

- Home page header with local date/timezone.
- Race outlook summary.
- Confidence/caveat line.
- Latest-session summary.
- Review-status indicator.
- Next-action/session summary.
- Contextual links to readiness, session detail, Calendar, Training, Plan, and Data Quality.
- Independent section state components.

### Loading state

Keep all three group positions. Load each group independently with labeled placeholders. A pending review must not block the activity summary or today's action.

### Empty state

- No goal: outlook explains that readiness cannot be compared to a target and links to Set up race goal.
- No activities: recent training explains how to add training and gives Add training as the primary action.
- No plan: next action explains that no approved session exists and links to Plan; activity history remains usable.
- No goal, activities, or plan: show the most useful first action based on verified state, without adding an onboarding wizard.

### Error state

Replace only the failed group. State what failed, keep other groups usable, and offer one supported retry or recovery. Do not turn a prediction failure into “no goal” or a history failure into “no activities.”

### Success state

The runner can identify the target outlook, latest-session takeaway, and next action without opening another screen. Completed import, plan approval, or review updates the relevant group with a durable state and an appropriate link.

### Mobile behaviour

Use one vertical reading sequence: outlook, recent training, next action. Keep commentary to a short summary; open detail as the current view with an explicit Back to Home. Do not compress text or hide material caveats to fit above the fold.

### Desktop behaviour

Keep the same reading order in a capped content column. Recent training may receive more width and explanatory space, but the three groups remain visually distinct and are not replaced with parallel analytics cards.

### Acceptance criteria

- The three persistent groups appear in the required order.
- Latest activity is shown by activity date even when its review is pending.
- The latest full review, readiness detail, and today's schedule context each open in one activation.
- No more than one filled primary action is visible for the current state.
- Race outlook includes target/timeframe and confidence or a truthful unavailable state.
- A runner can identify the latest-session takeaway, outlook limits, and next action within 30 seconds after content loads in usability validation.

## Screen 3 — Readiness and prediction detail

### Route, if known

Recommended additive state: `/dashboard?view=readiness`, with optional `#training-trends` and `#evidence` anchors. Keep Home selected.

### Purpose

Explain the race estimate or readiness outlook relative to the active goal, including confidence and material limitations.

### Primary user question

How much does the available evidence support my target race?

### Primary action

View the most relevant supporting evidence, normally Training trends when available.

### Secondary actions

- Open evidence and assumptions.
- Open a relevant data-quality recovery action.
- Return to Home.
- Open Training or Plan context.

### Main content sections

- Target and assessment timeframe.
- Supported estimate/outlook and plain-language interpretation.
- Confidence meaning and material caveat.
- Relevant training trend summary.
- Evidence/assumptions disclosure.
- Source and freshness metadata at quieter emphasis.

### Component list

- Readiness summary.
- Prediction/estimate display.
- Confidence and limitation component.
- Text-equivalent trend summary.
- Optional chart with units and period labels.
- Evidence disclosure.
- Contextual recovery link.
- Back to Home link.

### Loading state

Keep the target heading and detail shell. Show placeholders in the affected estimate, trend, and evidence regions independently.

### Empty state

Explain whether the target, compatible prediction, comparable history, or confidence evidence is missing. Keep any valid measured training facts available and link to the one useful next action.

### Error state

Identify whether the estimate, trend, or evidence request failed. Offer Retry for the affected region while keeping the last usable stale result visible when available.

### Success state

The runner can state the estimate/outlook, timeframe, relation to the goal, and main uncertainty. Reading the detail does not change the goal or prediction.

### Mobile behaviour

Stack summary, confidence, caveat, and supporting evidence. Keep the main conclusion visible before any chart. Charts must not require horizontal scrolling; provide text summaries.

### Desktop behaviour

Use a readable single-column narrative with optional evidence beside or below it. Use space for comparison clarity, not extra KPI cards or new navigation.

### Acceptance criteria

- The detail opens directly from Home and returns to Home context.
- The same target and assessment timeframe are shown as on Home.
- Current-fitness estimates are not labeled as race-date forecasts.
- No unsupported confidence score, probability, range, or on-track verdict is invented.
- Charts include units, periods, comparison basis, and an equivalent text explanation.
- Material assumptions and data issues remain visible beside the relevant claim.

## Screen 4 — Training list

### Route, if known

`/dashboard/activities`, labeled **Training** in primary navigation.

### Purpose

Provide recent-first access to recorded sessions and clear entry to session detail or adding training.

### Primary user question

What training have I done recently, and which session should I inspect?

### Primary action

Open the most relevant selected session, or Add training when history is empty.

### Secondary actions

- Add training.
- Open labeled Filters.
- Clear applied filters.
- Load more history.
- Open Data Quality for a specific issue.
- Return to Home.

### Main content sections

- Page heading and short purpose statement.
- Recent-first training list.
- Applied filter summary, only after filters are used.
- Selected session detail region on wide screens.
- Add training entry.

### Component list

- Training list/table.
- Activity row with date, title, distance, duration, pace, and available status/review cue.
- Filters disclosure and Clear action.
- Loading skeleton/list state.
- Detail panel or replacement view.
- Pagination/load-more control.
- Data Quality contextual link.

### Loading state

Show the list shell and row placeholders. When loading more, keep existing rows and label only the continuation control as loading.

### Empty state

- No training: explain how to add CSV, GPX, or supported Strava history and show Add training.
- No filtered results: explain the active filters and show Clear filters.
- Review pending: keep the activity row visible with its real status.

### Error state

Keep already loaded rows if available. Identify whether list or selected detail failed; offer Retry for that region. Do not clear filters or selection on a read error.

### Success state

The selected activity opens with the correct record and the list remains recoverable. After import, accepted activities are visible or the result clearly identifies the queued state.

### Mobile behaviour

Use a single-column list. Selecting a row replaces the list with detail and provides Back to training; restore the selected row, filters, and list position on return. Filters open as one labeled surface, not an always-visible control wall.

### Desktop behaviour

Use list/detail columns where width permits. Keep the list readable and preserve selection while detail loads. Do not make the list depend on hover.

### Acceptance criteria

- Primary navigation says Training and selects it for `/dashboard/activities`.
- Records are sorted recent-first by activity date unless an explicit supported sort is applied.
- Add training is visible without navigating to Data Quality first.
- Filters are collapsed by default and applied filters remain visible with Clear.
- Selected detail loading/error does not replace or reset the activity list.
- A direct `activityId` deep link opens the requested record or a recoverable missing-record state.

## Screen 5 — Activity detail and Coach's review

### Route, if known

`/dashboard/activities?activityId=<id>`; the same detail may be reused from Home and Calendar.

### Purpose

Explain a recorded session, how it compares with the relevant plan when supported, and what it suggests for the goal.

### Primary user question

How did I execute this session, and what does it mean for my training?

### Primary action

View the concise Coach's review or its actual pending/unavailable state. If a plan association requires a user decision, choose the relevant plan session only when supported.

### Secondary actions

- View comparison.
- View evidence/source categories.
- Request updated feedback where supported.
- View splits and route information.
- Return to Training or Home.
- Open the relevant Plan context.

### Main content sections

1. Session identity/date.
2. Run at a glance: distance, duration with elapsed/moving meaning, pace, elevation.
3. Coach's review: takeaway, execution comparison, goal implication, next step, evidence limits.
4. Comparison reference and match status.
5. Optional telemetry: splits, route availability, provenance, and other metrics.

### Component list

- Detail header and Back control.
- Four-metric summary.
- Review status/narrative.
- Plan comparison table.
- Evidence disclosure.
- Splits and route sections.
- Provenance/state labels.
- Retry/request feedback control where supported.

### Loading state

Show the session identity and detail shell while loading the selected record. Load Coach's review independently; do not block metrics on review generation.

### Empty state

- No review yet: show “Not reviewed yet” or actual queued state with metrics available.
- No linked plan: state “No planned session is linked” and provide workout-only commentary if available.
- No splits/route/sensor: label each optional section unavailable; keep the session usable.

### Error state

Activity detail failure offers Retry and Back to training. Review failure is local to Coach's review and must not hide metrics. Never display an unavailable review as a negative session assessment.

### Success state

The runner can identify what was recorded, the plan reference and match status, the main execution takeaway, goal implication, next step, and evidence limits. The review is clearly labeled as interpretation and does not alter the plan.

### Mobile behaviour

Use a single-column detail view with Back to training/Home. Keep the review summary above optional telemetry. Comparison rows stack as labeled planned/recorded/interpretation blocks; no inner horizontal scroll.

### Desktop behaviour

Use a readable detail column with optional expandable evidence. Preserve the Training list beside it when opened from the list. Calendar reuses the same activity/review composition.

### Acceptance criteria

- The same persisted review and evidence reference is used from Home, Training, and Calendar.
- The first view shows up to four key metrics before optional telemetry.
- Commentary distinguishes recorded facts, plan comparison, goal implication, next step, and evidence limits.
- No completion, adherence, causal improvement, or readiness claim is inferred from a weak or absent match.
- Elapsed and moving duration are labeled correctly; unavailable values are not shown as zero.
- Review pending, ready, limited-evidence, retryable-failure, and no-plan states are distinct.

## Screen 6 — Add training/import

### Route, if known

Recommended state: `/dashboard/activities?view=import`; existing upload capability remains available from `/dashboard/data-quality`.

### Purpose

Add activity history with minimal choice and make the import result actionable.

### Primary user question

How do I add my training, and what happened to the data I selected?

### Primary action

Import file for a selected CSV or single-activity GPX, or explicitly connect/import from Strava when that source is available.

### Secondary actions

- Switch between File and Strava source.
- View training after accepted results.
- Correct/re-upload a rejected file.
- Open Settings connections.
- Return to the launching screen.

### Main content sections

- Source choice with one visible selected source.
- File rules or Strava connection state.
- File selection/import control.
- Result summary: accepted, duplicate, rejected, warning.
- One recommended next action.
- Processing/review status link where relevant.

### Component list

- Source switch.
- File picker with persistent label/help.
- Import button.
- Progress/status line.
- Result count summary.
- Warning/rejection list.
- View training/recovery link.

### Loading state

Disable the submitting action, label the operation, and preserve the selected source/file context. Do not show invented progress or allow duplicate submission.

### Empty state

Before selection, explain CSV and GPX rules and show the single relevant file action. For duplicate-only results, explain that no new activities were added and offer View training.

### Error state

Distinguish no file, unsupported type, malformed content, file limit, network failure, authorization cancellation, disconnected provider, and queued delay. Preserve safe form choices and provide one recovery action.

### Success state

Show actual counts and whether the result is complete, partial, duplicate-only, or queued. Offer View training or a specific correction. Do not claim review/prediction completion from import success.

### Mobile behaviour

Use a short single-column source flow. Make file rules readable before the picker, keep the import button visible with the keyboard, and stack result counts and warnings.

### Desktop behaviour

Use a compact panel within Training. Keep the activity list or origin context accessible after completion; do not require a separate Data Quality visit for normal import.

### Acceptance criteria

- Add training is reachable from Home no-training and Training.
- CSV and one-activity GPX constraints are visible before file selection.
- File and Strava states are truthful for local/online availability.
- Results distinguish accepted, duplicate, rejected, warning, partial, and queued states.
- A successful import provides a direct path to Training.
- No import action activates or changes a plan.

## Screen 7 — Plan overview and staged plan workflow

### Route, if known

Plan: `/dashboard/plan`; creation/resume state: recommended `/dashboard/plan?view=create`.

### Purpose

Show the authoritative goal and approved plan first, then guide the runner through goal/context, Codex handoff, proposal review, and explicit approval.

### Primary user question

What is my current goal and plan, and what step am I at if I am creating or changing it?

### Primary action

Open the one relevant stage: Create plan, Resume saved draft, Review proposal, or Approve plan.

### Secondary actions

- Open Calendar within Plan.
- Reject draft.
- View approved history.
- Open Training for history context.
- Cancel/Back without changing the active plan.

### Main content sections

- Settled goal summary.
- Active approved plan summary.
- Local Overview / Calendar switch.
- Current workflow stage and short explanation.
- Goal/context form when active.
- Codex handoff instructions.
- Proposal draft/review.
- Collapsed approved history.

### Component list

- Goal/plan summary.
- Stage indicator with plain-language labels.
- Goal form with persistent labels.
- Training availability selector.
- Context publication status.
- Proposal file picker/import status.
- Draft comparison and freshness warning.
- Approval/rejection confirmation dialog.
- Approved history disclosure.

### Loading state

Show Plan heading and active-plan region immediately. Load active plan, saved draft, and history independently; do not show “no active plan” until active-plan loading completes.

### Empty state

Distinguish no goal, no active plan, no saved draft, and no approved history. Show one relevant setup action while leaving Training accessible. A saved draft is resumable and must not be represented as no plan.

### Error state

Keep entered form data and draft where safe. Identify whether profile/context, proposal, active plan, history, or approval failed. Revision conflicts require reload/review; no silent retry of a consequential write.

### Success state

After server confirmation, show the settled goal and active approved plan, state what Home and Calendar now use, and provide Open Calendar. Context publication says only that context is ready; proposal import says only that a draft is ready.

### Mobile behaviour

Use one stage at a time. Keep active goal/plan summary above the workflow. Stack fields and proposal comparison, keep approval consequences visible, and make Back/Cancel reachable. Approved history remains collapsed.

### Desktop behaviour

Use a readable single workflow column with optional supporting history. The active plan remains visually authoritative; creation and draft areas do not look active until opened.

### Acceptance criteria

- Plan is selected as a primary destination and has a clear Overview / Calendar local switch.
- Active approved goal/plan is distinguishable from draft and approved history.
- The stage sequence is explicit: goal/context → Codex → proposal import → review → confirm.
- Publishing context or importing a proposal never activates a plan.
- Approval/rejection and historical activation state the affected plan and consequences.
- Stale history, invalid proposal, conflict, and approval failure have recoverable states.

## Screen 8 — Calendar within Plan

### Route, if known

`/dashboard/calendar`; preserve `date=YYYY-MM-DD` and optional `session=<id>` deep-link parameters.

### Purpose

Show the current approved schedule and permit only supported, auditable future-session changes.

### Primary user question

What is scheduled, what happened, and what can I change safely?

### Primary action

Open the selected date/session details. For a permitted future change, the primary action is the single current operation such as Review move or Amend session.

### Secondary actions

- Switch Overview / Calendar within Plan.
- Open Agenda on compact layouts.
- Reschedule, skip, restore, or record skipped when permitted.
- View activity detail.
- Close details and return to the calendar position.

### Main content sections

- Calendar range and timezone.
- Concise day/session summaries.
- Recorded activities separate from planned sessions.
- Selected detail: effective prescription, approved source, cautions, history, permitted actions.
- Confirmation/amendment form with reason.

### Component list

- Calendar/Agenda switch.
- Week/date grid or agenda list.
- Date information control.
- Session/activity summary.
- Detail dialog or contextual detail surface.
- Amendment/reschedule/skip/restore controls.
- Reason field and validation.
- Collision/out-of-range warning.
- History disclosure.

### Loading state

Keep Calendar heading, range, timezone, and local navigation. Load schedule and supporting activity records independently; show detail loading without hiding the grid/agenda.

### Empty state

Distinguish no active plan, no scheduled session, no recorded run, and no records available in the range. A rest date is valid. Explain “no completion inferred” when an activity cannot be matched.

### Error state

Keep any usable schedule visible and identify whether schedule or activity detail failed. Retry only the affected data. Conflicts require reload/review before resubmission.

### Success state

Show the updated effective schedule, original approved prescription, saved reason, and history after server confirmation. Do not claim an activity completed a session because it appears on the same date.

### Mobile behaviour

Use Agenda below 1200px. Detail replaces the list/grid and has a visible Close/Back action. Stack form fields and comparison values; do not require horizontal panning to understand a week.

### Desktop behaviour

Use the four-week Monday–Sunday context where readable. Date cells remain concise; details open contextually. Preserve keyboard scrolling and direct date/session deep links.

### Acceptance criteria

- Calendar is a Plan subview, not a fourth primary destination.
- Planned sessions and recorded activities are visibly distinct.
- Today is read-only; future permitted changes preserve source prescription and history; past sessions can only be recorded as skipped.
- Every state-changing action requires the existing reason and confirmation rules.
- Collision, out-of-range, stale, and revision-conflict states are actionable.
- Compact layouts use Agenda and do not force a wide grid.

## Screen 9 — Data Quality and recovery

### Route, if known

`/dashboard/data-quality`; normally entered contextually from Home, Readiness, Training, or import results.

### Purpose

Explain how data limitations affect a claim and provide a supported correction or a clear no-action result.

### Primary user question

What is limiting trust in this information, and what can I do about it?

### Primary action

Perform the single supported recovery: correct/re-upload, reconnect, retry, inspect queued work, or take no action.

### Secondary actions

- View affected Training/activity.
- Return to the originating readiness or Home context.
- Expand counts, warnings, processing history, or diagnostics.

### Main content sections

- Affected claim/data source.
- Practical consequence.
- Current state/freshness.
- Recommended recovery.
- Optional import counts/warnings/history.

### Component list

- Issue summary.
- State/status component.
- Recovery action.
- Import result counters.
- Warning/rejection list.
- Return-context link.

### Loading state

Keep the page purpose and originating issue label. Load issue details and processing history independently.

### Empty state

Show “No known issues” only after a successful check. If there is no import history, explain how to add training rather than implying the dataset is healthy.

### Error state

State that the quality check or recovery operation failed. Do not report no issues after a failed check. Keep the originating assessment available through Back.

### Success state

Show the confirmed new state and whether reassessment is complete, pending, or unchanged. Return to the originating claim with its age and current caveat.

### Mobile behaviour

Show consequence and recovery first; place counts and diagnostics below. Keep one recovery action prominent and preserve the Back context.

### Desktop behaviour

Use a compact recovery panel with optional detail. Do not turn it into a standing operational dashboard when no issue affects the user's current task.

### Acceptance criteria

- Data Quality is not selected as a primary destination.
- Every displayed issue names the affected claim or dataset and practical consequence.
- Confidence, freshness, completeness, and review status remain separate concepts.
- No known issues is shown only after a successful check.
- Recovery returns to the originating context and accurately reports pending versus complete work.
- Private paths, tokens, raw payloads, and arbitrary source text are never shown.

## Screen 10 — Settings and connections

### Route, if known

`/dashboard/settings`; contextual anchors such as `#connections` may open a relevant group.

### Purpose

Manage preferences, reminders, Strava/local connections, and structured context exchange without competing with daily training decisions.

### Primary user question

Which supporting settings affect my training data or reminders, and what is their current state?

### Primary action

Save the currently selected setting or complete the explicitly selected connection/setup action.

### Secondary actions

- Connect/reconnect/disconnect Strava.
- Queue the supported recent-history backfill.
- Pair/revoke local device where supported.
- Configure timezone/reminders.
- Generate/copy Codex handoff.
- Return to originating import or recovery context.

### Main content sections

- Preferences and timezone/reminder settings.
- Workout sources/connections.
- Local device/context exchange.
- Handoff/automation status.
- Recovery/status messages.

Only the relevant group expands by default when entered contextually.

### Component list

- Settings group/panel.
- Persistent form labels and controls.
- Connection status/actions.
- Backfill queue status.
- One-time credential display/copy where already supported.
- Handoff output/status.
- Save/confirmation state.

### Loading state

Keep Settings heading and groups. Load each group independently with clear group-level placeholders; do not imply disconnected status while status is unknown.

### Empty state

Unconfigured settings explain the consequence and one setup action. “Not configured” is distinct from disabled, disconnected, unavailable, and error.

### Error state

Identify the affected preference, provider, device, or handoff. Preserve unrelated settings and offer only the supported recovery. Do not expose tokens, raw provider errors, or private source paths.

### Success state

Show the persisted setting or confirmed connection state. A queued Strava backfill says queued, not imported. A prepared handoff says prepared, not scheduled.

### Mobile behaviour

Use stacked, collapsible groups with one open group at a time. Keep critical save/connect/cancel controls visible and credential copy reachable above the keyboard. Avoid an all-sections-long page by default.

### Desktop behaviour

Use a two-column layout only when each group remains scannable; place operational/credential details across the full width only when required. Settings stays visually secondary to Home, Training, and Plan.

### Acceptance criteria

- Settings is secondary navigation and preserves the existing supported settings.
- Local and online capability differences are explicit at the relevant control.
- Preference persistence, connection, backfill, device, and handoff states are distinct.
- No success message claims external scheduling or ingestion until confirmed by the authoritative state.
- Sensitive values and private content remain protected.

## Screen 11 — Sign-in

### Route, if known

`/login`

### Purpose

Authenticate the runner and return them safely to the intended application destination.

### Primary user question

How do I get into my Race Predictor workspace?

### Primary action

Sign in with the existing supported authentication method.

### Secondary actions

- Retry after an authentication error.
- Return through the safe existing navigation path if available.

### Main content sections

- Race Predictor identity.
- Sign-in action.
- Authentication status/error message.

### Component list

- Sign-in panel.
- Brand mark/logo.
- Authentication button/control.
- Status/error message.

### Loading state

Disable the sign-in action and state that authentication is in progress. Keep the page identity visible.

### Empty state

Not applicable as a data screen. The sign-in action remains available.

### Error state

State that sign-in failed and offer Retry. Do not show dashboard empty states or expose protected data.

### Success state

Return to the requested safe destination, normally Home, without losing the intended deep link when it remains valid.

### Mobile behaviour

Use a single-column panel with readable labels and a full-width touch target. Avoid horizontal overflow.

### Desktop behaviour

Center a compact sign-in panel without adding marketing or dashboard content.

### Acceptance criteria

- Authentication failures are distinct from empty application data.
- Successful sign-in returns to the intended safe route.
- No protected data or unsafe arbitrary return destination is exposed.
- Keyboard, focus, contrast, and touch-target requirements pass.

## Screen 12 — Cross-screen acceptance checklist

The specifications are ready for implementation only when each applicable screen satisfies these shared checks:

- [ ] The screen identifies its flow ID, route, primary question, one primary action, and secondary actions.
- [ ] Loading, empty, error, and success states are distinct; pending, stale, unavailable, partial, and authentication states are added where applicable.
- [ ] State changes are confirmed by the authoritative response before success is shown.
- [ ] Home, Training, and Plan remain the only primary navigation destinations.
- [ ] No screen invents prediction, confidence, matching, completion, goal impact, or training evidence.
- [ ] Detail links preserve source context and Back restores selection, filter state, scroll, and focus.
- [ ] Responsive behavior is specified at compact, medium, and wide ranges without page-level horizontal scrolling.
- [ ] Keyboard, focus, status-announcement, contrast, 200% zoom, and reduced-motion behavior are covered.
- [ ] Copy separates recorded facts, generated interpretation, data freshness, uncertainty, and approved plan authority.
- [ ] The design does not add an embedded AI chat, automatic plan adaptation, multi-athlete controls, or a new visual direction.

The next implementation handoff should reference the relevant screen number, flow ID, and contract requirement IDs. Any capability absent from current contracts must be labeled as a dependency or unavailable state rather than silently implemented as UX.
