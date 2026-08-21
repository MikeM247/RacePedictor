# Night Ops UI Redesign Implementation Plan

Status: QA In Progress

Created: 2026-08-20

Design direction: Option 2 — Night Ops

Target: RacePredictor authenticated web application

## Project Manager Summary

- Objective: Redesign the existing RacePredictor experience as a calm, dark, sci-fi training command centre while making Today, Calendar, Plan, and Activities easier to scan and use.
- Current Stage: UX/UI planning and delivery sequencing.
- Status: Implementation is complete across the planned UI slices; final cross-slice QA and preview review remain.
- Recommended Next Action: Complete full regression and browser evidence, then request Product Owner acceptance of the exact preview.

## Outcome

The redesign should let the athlete answer these questions within seconds:

1. What is my approved session today?
2. What is planned for the rest of this week?
3. Where am I in the active approved plan?
4. What did I do recently, and what metrics were recorded?
5. Is any workout, sync, plan, or context data stale or action-required?

Night Ops changes information hierarchy, layout, visual language, and responsive behavior. It does not change coaching authority, data ownership, approval semantics, APIs, persistence, or the meaning of existing states.

## Scope

### In Scope

- The canonical routes in `docs/design/screens.md`:
  - Today: `/dashboard`
  - Plan: `/dashboard/plan`
  - Calendar: `/dashboard/calendar`
  - Activities: `/dashboard/activities`
  - Data Quality: `/dashboard/data-quality`
  - Settings: `/dashboard/settings`
- Visual parity for `/login` after the dashboard experience is stable.
- A shared Night Ops token layer, application shell, navigation, toolbar, panels, status treatment, typography, focus states, responsive rules, and lightweight motion.
- Workout-first Today hierarchy.
- Calendar session summaries with contextual detail instead of full prescriptions inside narrow day columns.
- Plan grouping by explicit calendar weeks, with approved-version history kept separate.
- Stable Activities master-detail behavior.
- Loading, empty, error, stale, disconnected, conflict, disabled, success, and action-required states.
- Accessibility, responsive, unit, integration, Playwright, and visual-regression validation.

### Out of Scope

- New API versions, database schema changes, or persistence behavior.
- Automatic training-plan creation, approval, adaptation, or activity-to-session matching.
- A `Start Workout`, `Complete Workout`, or inferred completion action.
- New health data such as sleep, HRV, VO2 max, or recovery scores unless already present in an approved contract and current payload.
- Invented plan phases such as Base, Build, Peak, or Taper when the approved plan does not explicitly contain them.
- Embedded AI chat, Garmin controls, multi-athlete switching, real-time streaming, or new notification delivery.
- Decorative cockpit gauges, holograms, glassmorphism, heavy glow, background video, or non-functional charts.
- A light/dark theme toggle in the initial delivery.

## Non-Negotiable Product Boundaries

- Today and Calendar continue to display the last explicitly approved structured plan.
- Imported or synchronized activities cannot approve or change a plan.
- Approved prescriptions remain immutable; effective amendments remain separate and retain reasoned history.
- Future-session amend, move, skip, and restore actions retain the current confirmation, revision, collision, range, and audit rules.
- Past and current-day sessions remain read-only where the existing rules require it.
- A stale proposal or competing calendar edit continues to fail safely and require review.
- Fresh workout data, Strava state, Second Brain snapshot state, and local-device state remain independent signals.
- Color is never the only carrier of state.
- Private paths, note bodies, tokens, raw provider data, and arbitrary Second Brain text must not appear in the UI, fixtures, screenshots, logs, or telemetry.

## Night Ops Design Contract

### Visual Character

- Dark, matte and precise rather than glossy or cinematic.
- Dense enough for repeated desktop use, with clear spacing and restrained decoration.
- Thin technical borders and a subtle grid rhythm may support grouping, but must not compete with training data.
- Cyan indicates primary interaction and current selection.
- Violet distinguishes workout categories or secondary analytical context.
- Lime indicates confirmed healthy/success states.
- Amber indicates stale, warning, pending, or action-required states.
- Red is reserved for destructive actions and failures.
- Glow is limited to a faint focus/selection halo. Default panels do not glow.

### Proposed Tokens

Token names are semantic; final values must pass contrast validation before approval.

| Token | Draft value | Purpose |
|---|---:|---|
| `--rp-bg` | `#07111d` | Page background |
| `--rp-nav` | `#081522` | Navigation background |
| `--rp-surface` | `#0e1b2b` | Primary panel |
| `--rp-surface-raised` | `#132438` | Selected or raised panel |
| `--rp-border` | `#293b4e` | Default structural border |
| `--rp-border-strong` | `#3c5268` | Strong separation |
| `--rp-text` | `#f5f8fc` | Primary text |
| `--rp-text-muted` | `#a9b6c6` | Secondary text |
| `--rp-cyan` | `#20c7f5` | Primary action/current state |
| `--rp-violet` | `#9b78ff` | Workout category/secondary accent |
| `--rp-lime` | `#9ddd3b` | Healthy/success |
| `--rp-amber` | `#f4b942` | Warning/stale/action required |
| `--rp-danger` | `#ff6577` | Error/destructive |
| `--rp-focus` | `#67ddff` | Keyboard focus ring |

### Typography and Density

- Retain the existing single sans-serif family unless a separately approved font change proves a meaningful readability improvement.
- Use tabular numerals for distance, time, pace, date, confidence, and status metrics.
- Page title: 24–28 px.
- Section title: 17–20 px.
- Body: 14–16 px.
- Metadata: 12–13 px, never below 12 px.
- Panel radius: 8–12 px.
- Spacing scale: 4, 8, 12, 16, 24, 32 px.
- Transitions: 120–180 ms for color, border, and opacity only; honor `prefers-reduced-motion`.

### Responsive Contract

- `>= 1200 px`: full labelled sidebar, multi-column Today, Calendar master-detail, Activities master-detail.
- `900–1199 px`: compact navigation rail, reduced panel columns, Calendar defaults to Agenda or summary-plus-detail rather than seven narrative columns.
- `768–899 px`: single primary column with contextual drawers/panels; no cramped seven-column week.
- `< 768 px`: stacked layout, concise toolbar, Agenda calendar, preserved import/approval/amendment actions, full-width dialogs.
- The exact breakpoint may move during visual testing, but seven day columns are allowed only while day labels, session titles, status, duration, and focus states remain readable without horizontal page scrolling.

## User Flow

- Enter Today and see the approved workout or intentional rest state before infrastructure status.
- Review the visible current week and select a session to open Calendar detail.
- Move to Plan to understand active version, date progress, weekly rhythm, assumptions, and sessions grouped by week.
- Open Activities, filter history, and inspect a selected activity without losing list position.
- Use the compact toolbar status summary to expand freshness details only when needed.
- Use Data Quality or Settings for recovery and configuration without confusing those actions with coaching decisions.

## Screen Breakdown

### Today — `/dashboard`

Primary hierarchy:

1. Toolbar: Today, local timezone/date context, race-distance control, active plan version, compact freshness summary.
2. Approved workout/rest card: title, purpose, prescription, duration, status, warnings, `Open session`, and `Open active plan`.
3. Current-week strip: concise sessions from the effective calendar, with today and changed/skipped sessions clearly identified.
4. Active-plan progress: date range, elapsed/remaining time, session count, and target event/countdown when supported.
5. Recent analytics: prediction KPIs, meaningful trends, and recent imported activities.
6. Expanded system status and import information below the coaching decision or behind an explicit disclosure, except when action is required.

Rules:

- No `Start Workout` or completion action.
- Do not claim an activity completed a prescribed session.
- Independent freshness failures remain individually named.
- Additional Calendar or Activities requests load independently so their failure does not hide the approved Today card.

### Calendar — `/dashboard/calendar`

Primary hierarchy:

1. Toolbar: visible date range, timezone, Previous/Today/Next, Week/Agenda.
2. Week summary: day, date, session type, short title, duration/distance, effective status, and amendment marker.
3. Selected-session detail: current purpose, effective prescription, target, cautions, source prescription, prescribed/effective dates, and ordered history.
4. Future-session actions: amend, move, skip, or restore, using the existing reason and conflict rules.

Rules:

- Full prescriptions do not render inside narrow week cells.
- Deep links select and reveal the requested session.
- Current and past sessions clearly explain read-only status.
- Agenda is the default below the readable week-grid threshold.
- A selected session remains selected while its dialog opens and after recoverable validation errors.

### Plan — `/dashboard/plan`

Primary hierarchy:

1. Active approved plan: status, coaching version, approval record, date range, goal, timezone, and session count.
2. Progress: time-based plan progress and target countdown when supported by approved dates.
3. Weekly rhythm and sessions grouped by explicit calendar week.
4. Assumptions, cautions, and approved rationale.
5. Creation/replacement workflow and saved-draft review where allowed by the current online/local mode.
6. Approved version history, collapsed by default except for the selected version.

Rules:

- Do not infer named training phases from session titles or dates.
- Only one week or approved historical version needs to be expanded at a time.
- Approval, rejection, and active-version selection keep their existing confirmation and immutable-prescription language.

### Activities — `/dashboard/activities`

Primary hierarchy:

1. Toolbar: activity count and import link.
2. Compact filters with visible active-filter state.
3. Desktop master list plus sticky detail panel.
4. Smaller screens use a drawer or dedicated detail surface with a clear return to the preserved list position.
5. Detail groups overview metrics, splits, and route availability; unavailable metrics are de-emphasized rather than dominating the layout.

Rules:

- Selecting an activity changes only the detail loading surface.
- Activity rows prioritize title, date, distance, elapsed time, and pace when available.
- Performance deltas appear only when they can be computed from approved, comparable data and are labelled with their comparison basis.
- Missing split or route data does not block core detail.

### Data Quality — `/dashboard/data-quality`

- Lead with the current health/action summary when provider or import status exists.
- Keep CSV/GPX selection and bounded-import language explicit.
- Group accepted, duplicate, rejected, warnings, retrying, action-required, and terminal states by the action the athlete should take.
- Do not expose stack traces, tokens, raw payloads, object keys, or private paths.

### Settings — `/dashboard/settings`

- Group into Connections, Paired Computer, Reminder/Preferences where present, Privacy Boundary, and Operations.
- Use compact status rows for healthy items and expand detail/actions contextually.
- Keep disconnect, replace, and revoke visually distinct and confirmation-protected.
- Keep app reminder preference, prepared handoff, and external automation status separate where those controls are available.

### Login — `/login`

- Apply Night Ops typography, surfaces, focus states, and brand treatment only after dashboard acceptance.
- Do not change authentication behavior or introduce account lifecycle features.

## Key Interactions

- Current/selected cards use cyan border and an explicit text label, not color alone.
- Workout categories may use violet/cyan/amber icon or border accents while retaining a text type.
- Toolbar status opens a labelled details panel and supports Escape, outside-click where safe, focus return, and keyboard traversal.
- Calendar selection is separate from calendar mutation.
- Dialogs retain focus trapping, Escape behavior when not saving, focus restoration, first-invalid-field focus, and announced saving/success/error/conflict states.
- Loading uses stable skeleton dimensions or concise status panels to prevent layout jumps and false empty states.
- Tooltips are supplementary; essential labels and state are never tooltip-only.

## Edge Cases

- No active plan, intentional rest day, skipped session, missed/unconfirmed session, and out-of-plan dates.
- Calendar week with no sessions, several sessions on one day, or a moved session whose source date is outside the visible week.
- Partial Today success where coaching loads but status, analytics, Calendar, or Activities does not.
- Activity with missing pace, splits, heart rate, power, or route metadata.
- Long workout titles, prescriptions, caution text, goal text, and device names.
- Stale Second Brain context with current Strava activity data, and the inverse.
- Disconnected provider, offline local computer, cloud failure, unauthenticated owner, and action-required durable work.
- 200% zoom, narrow browser, reduced motion, high-contrast/forced-colors mode, and keyboard-only use.

## Technical Approach

### Boundaries

- Keep orchestration and page composition in `apps/web`.
- Consume existing `packages/core` contracts and `/api/v1` routes.
- Do not add direct database access to UI components.
- Do not duplicate coaching or calendar business rules in presentational components.
- `packages/ui` is not present in the current checkout; keep Night Ops primitives app-local until a shared package is intentionally established.

### Shared UI Structure

The implementation should converge the existing dashboard, coaching, Activities, and Settings shells on a shared page-shell contract instead of creating another independent shell.

Suggested app-local primitives:

- `DashboardPageShell`: navigation, toolbar, responsive content container, skip link, page status slot.
- `NightOpsPanel`: consistent panel header/action/body states.
- `StatusChip` and `StatusSummary`: semantic state mapping with icon/text/color.
- `MetricStrip`: consistent numeric label/value/unit presentation.
- `SessionSummaryCard`: concise effective-session summary shared by Today and Calendar.
- `SessionDetailPanel`: full Calendar context, source/effective comparison, history, and existing action launchers.
- `ActivityTelemetryRow`: scan-friendly activity summary.
- `AsyncSurface`: stable loading/empty/error/stale presentation without hiding sibling content.

These names are implementation guidance, not a requirement to create a new framework or component package.

### Styling Strategy

- Add semantic custom properties to `apps/web/app/globals.css` or one imported theme file.
- Replace hard-coded page colors incrementally as each slice moves to Night Ops.
- Preserve current class names where doing so reduces regression and merge risk.
- Keep route-specific grid and responsive behavior in the existing dashboard, coaching, and Activities stylesheets until common behavior is proven reusable.
- Use SVG/CSS sparklines only for approved data; avoid canvas-heavy or decorative visualization dependencies.
- Use one consistent icon family if icons are introduced. Select it during implementation and validate bundle/build impact before adoption.

### Data Strategy

- Reuse the existing dashboard overview, sync status, Today, Calendar, Plan, and Activities endpoints.
- New Today panels may call existing Calendar and Activities reads in parallel with independent states.
- Do not change a public contract solely for styling.
- If an approved requirement cannot be supported by current data, omit the element or create a separate Product Owner/architecture item; do not infer it in the UI.

### Active Worktree Constraint

Calendar amendment contracts, services, `coaching-pages.tsx`, `coaching-ui.css`, state helpers, and related tests already contain uncommitted work. Before implementation:

- establish ownership of the overlapping files;
- preserve all amendment behavior and tests;
- prefer additive presentational extraction over broad rewrites;
- do not reset, overwrite, or reformat unrelated changes;
- rebase or merge the first Night Ops slice only after the amendment state is understood.

## SDLC Plan

| Step | Role / Skill | Purpose | Status | Notes |
|---|---|---|---|---|
| 1 | Product Owner | Confirm Night Ops outcome, scope, and non-goals | Needs Review | Specifically approve dark-only initial release and no new workout actions |
| 2 | Architect | Confirm shared shell/component boundaries and whether Today can reuse existing Calendar/Activities reads | Not Started | No DB change expected |
| 3 | UX/UI Designer | Produce implementation wireframes and state matrix for the first slice | Not Started | Calendar at desktop, 1024 px, and 390 px first |
| 4 | UI Developer | Implement tokens, shell, and Calendar vertical slice | Not Started | `NO-1` then `NO-2` |
| 5 | QA | Validate first-slice acceptance, accessibility, and regressions | Not Started | Gate before expanding the redesign |
| 6 | UI Developer | Implement Today, Plan, Activities, and secondary screens in isolated slices | Not Started | One route group per review |
| 7 | Playwright/E2E | Validate canonical journeys and responsive states | Not Started | Use fixture data, not private athlete data |
| 8 | Product Owner | Review exact preview deployment | Not Started | Approve before production promotion |

## Backlog / Work Items

| Priority | Item | Area | Acceptance Criteria | Dependencies |
|---|---|---|---|---|
| High | `NO-0` Design and documentation gate | Cross-cutting | Night Ops tokens, route hierarchy, state matrix, responsive behavior, and non-goals are accepted and reflected in UX docs | User direction, Product Owner, UX/UI |
| High | `NO-1` Theme and shared shell foundation | Global shell | All canonical routes render in the Night Ops shell with correct active navigation, toolbar slots, focus states, content width, and responsive navigation; no route behavior changes | `NO-0`, overlapping-file ownership |
| High | `NO-2` Calendar vertical slice | Calendar | Readable week/agenda behavior, concise cards, selected-session detail, deep links, approved/effective distinction, and existing amendment controls pass at desktop, 1024 px, and 390 px | `NO-1`, existing amendment implementation |
| High | `NO-3` Workout-first Today | Today | Workout/rest state is first; current week and plan context are visible; freshness is condensed but truthful; analytics and independent failures remain recoverable | `NO-1`, `NO-2`, existing endpoints |
| High | `NO-4` Plan hierarchy | Plan | Active version and progress lead; sessions group by week; only supported facts appear; history and draft/approval controls preserve current semantics | `NO-1` |
| Medium | `NO-5` Activities master-detail | Activities | List position is stable; only detail loads on selection; desktop split and small-screen detail pattern pass; missing metrics remain graceful | `NO-1` |
| Medium | `NO-6` Data Quality, Settings, and Login parity | Secondary surfaces | Night Ops styling and compact hierarchy apply without changing import, provider, device, privacy, operation, or auth behavior | `NO-1`, route-specific work stabilized |
| High | `NO-7` Accessibility, regression, documentation, and preview gate | Cross-cutting | Automated checks pass, screenshots are approved, UX docs match delivery, and Product Owner accepts the exact preview | `NO-2` through `NO-6` |

## Detailed Slice Acceptance Criteria

### `NO-0` Design and Documentation Gate

- Update `docs/UI_GUIDELINES.md` with the approved Night Ops visual contract while retaining the calm analytical principles and anti-glass/heavy-glow rules.
- Update `docs/UI_UX_SPEC.md` only where hierarchy or responsive behavior changes.
- Update `docs/design/screens.md` only if interaction requirements change; routes and coaching boundaries remain unchanged.
- Provide wireframes or annotated mockups for Today, Calendar, Plan, and Activities at 1440 px, 1024 px, and 390 px.
- Record the state matrix for loading, empty, error, stale, success, disabled, conflict, disconnected, and action-required states.
- Confirm that generated mockup elements unsupported by current contracts are excluded.

### `NO-1` Theme and Shared Shell Foundation

- Night Ops semantic tokens are defined once and consumed by migrated surfaces.
- Every canonical route has a visible current-page indicator and labelled navigation.
- The toolbar has stable title, context, action, and status regions.
- A skip link, visible focus ring, logical landmark structure, and keyboard navigation are present.
- At 200% zoom, primary actions and page content remain reachable without two-dimensional page scrolling.
- Motion respects reduced-motion preferences.
- Existing loading/error routes remain functional during incremental migration.

### `NO-2` Calendar Vertical Slice

- Desktop week view shows all seven dates without embedding full prescriptions in the cells.
- Selecting a session reveals its complete current and source information in a contextual detail surface.
- Today, skipped, amended, moved, historical, and read-only states include text/icon cues.
- Week/Agenda preference and Previous/Today/Next remain keyboard accessible.
- Below the readable week threshold, Agenda or summary-plus-detail is used automatically.
- Amend, move, skip, restore, validation, collision, out-of-range, stale revision, success, and failure behavior remains unchanged and passes regression tests.
- Dialog focus management and announcements pass existing and new browser tests.

### `NO-3` Workout-First Today

- Workout, rest, no-plan, skipped, missed/unconfirmed, stale, loading, and error states lead the page appropriately.
- The approved prescription and purpose are visible before infrastructure details.
- The current week is visible using Calendar data and includes explicit effective status.
- Recent activities are never labelled as completed plan sessions without approved matching.
- Prediction metrics keep units, confidence context, model/version context where required, and timezone/date context.
- An action-required freshness state remains prominent; healthy signals collapse into a concise toolbar summary.
- Failure of optional Calendar, Activities, or status requests does not hide the Today coaching card.

### `NO-4` Plan Hierarchy

- Active approved plan, goal, coaching version, approval record, date range, timezone, and session count appear first.
- Progress uses explicit approved dates and is labelled as time progress, not coaching effectiveness.
- Sessions group deterministically by local plan week.
- Long plans do not render every prescription expanded by default.
- No named phases are inferred when absent from the approved plan.
- Proposal freshness, material differences, approval/rejection, history, and active-version selection retain current safety copy and confirmations.

### `NO-5` Activities Master-Detail

- Desktop keeps filters, history, and selected detail visible in a stable split layout.
- Selection and detail loading do not move the list or reset filters.
- A selected row is programmatically and visually identified.
- Small screens provide a clear open/close/back behavior and return focus to the selected activity.
- Details group core metrics before optional metrics, splits, and route availability.
- Loading, empty, API error, pagination/end-of-history, and missing optional-data states remain explicit.

### `NO-6` Secondary Surfaces

- Data Quality tells the athlete whether to retry, correct/re-upload, wait, or take no action.
- Settings distinguishes provider connection, local-device state, privacy boundary, reminder/handoff status where present, and operational guardrails.
- Destructive actions use Night Ops danger styling without becoming the dominant visual action.
- Login matches the visual system without changing authentication or account scope.

### `NO-7` Release Gate

- Source documentation matches delivered behavior.
- No private athlete information appears in new fixtures, snapshots, screenshots, or logs.
- The exact preview passes the critical Today → Calendar → Plan → Activities → Settings journey.
- The Product Owner signs off on readability, hierarchy, truthful status, coaching boundaries, and selected visual direction.
- Production promotion occurs only from the accepted preview artifact.

## File Impact Map

Expected existing files:

- `apps/web/app/globals.css`
- `apps/web/app/login/sign-in.module.css`
- `apps/web/components/dashboard/dashboard-navigation.tsx`
- `apps/web/components/dashboard/dashboard-shell.tsx`
- `apps/web/components/dashboard/online-dashboard-shell.tsx`
- `apps/web/components/dashboard/online-status-panel.tsx`
- `apps/web/components/dashboard/dashboard.css`
- `apps/web/components/coaching/today-coaching-card.tsx`
- `apps/web/components/coaching/coaching-pages.tsx`
- `apps/web/components/coaching/coaching-ui.css`
- `apps/web/components/activities/activities-shell.tsx`
- `apps/web/components/activities/activities.css`
- `apps/web/components/sync/online-sync-settings.tsx`
- `apps/web/e2e/digital-coach.spec.ts`
- `apps/web/e2e/online-dashboard.spec.ts`
- Relevant `apps/web/test/*.test.ts` files for view-state transformations

Likely additive files, subject to UI Developer/architecture review:

- Shared app-local shell/panel/status primitives under `apps/web/components/dashboard/`.
- Calendar summary/detail presentational components under `apps/web/components/coaching/`.
- Plan week-group and activity telemetry row presentational components near their owning feature.
- Focused E2E specification or screenshot helpers for Night Ops responsive journeys.

Documentation files during delivery:

- `docs/UI_GUIDELINES.md`
- `docs/UI_UX_SPEC.md`
- `docs/design/screens.md` when behavior changes require it
- `docs/progress/sdlc-progress.md` only when implementation actually changes delivery state

## Validation Plan

### Build

- `npm run build --workspace @racepredictor/web`

### Lint / Types

- `npm run lint --workspace @racepredictor/web`
- `npm run typecheck --workspace @racepredictor/web`

### Tests

- `npm test --workspace @racepredictor/web`
- Focused existing Calendar, Today, Activities, online-status, auth, and coaching view-state tests.
- Add tests only for logic or state transformations; do not assert incidental CSS implementation details.

### Playwright / E2E

- `npm run test:e2e --workspace @racepredictor/web`
- `npm run test:e2e:online --workspace @racepredictor/web`
- `npm run test:e2e:auth --workspace @racepredictor/web` when Login is touched.
- Required viewport evidence: approximately 1440×900, 1024×768, and 390×844.
- Required journeys:
  1. Today workout/rest understanding and navigation.
  2. Calendar week/agenda selection, deep link, amendment validation, confirmation, conflict, and focus return.
  3. Plan active-version review and safe approved-version selection.
  4. Activities filter, selection, detail loading, missing optional data, and small-screen return.
  5. Data Quality recovery guidance.
  6. Settings provider/device states and protected destructive actions.
- Run axe or equivalent automated accessibility checks if available; manual keyboard and screen-reader-oriented inspection remains required.

### Visual QA

- Capture deterministic fixture-based screenshots, never private production data.
- Compare panel hierarchy, content clipping, focus indicators, contrast, overflow, and long-content wrapping at each target viewport.
- Validate normal, hover, focus, selected, disabled, loading, empty, stale, warning, error, and success treatments.
- Check dark-surface contrast using WCAG targets: 4.5:1 for normal text, 3:1 for large text and meaningful component boundaries where applicable.

## Rollout and Rollback

- Deliver route-by-route behind normal source control and preview deployments; do not combine all routes into one unreviewable change.
- Keep data and API contracts unchanged so rollback is a frontend deployment rollback.
- Gate each route slice on unit/type/build/browser checks before starting the next route.
- Promote only the exact Product Owner-approved preview.
- If contrast, responsiveness, or critical-journey regressions fail, roll the affected route back to the last accepted UI while preserving unrelated calendar/amendment work.

## Risks / Dependencies

### Risks

- The dark theme can reduce readability if muted text or border contrast is too weak.
- Sci-fi styling can drift into decorative HUD clutter and obscure coaching priorities.
- Today may add parallel Calendar/Activities reads and create avoidable loading or performance coupling.
- Calendar and Plan share files with active amendment work, increasing merge and regression risk.
- The generated concept includes unsupported actions and metrics that could be mistaken for scope.
- A broad shell refactor can create regressions across all routes at once.

### Mitigations

- Contrast and keyboard validation are first-slice gates, not end-of-project polish.
- Use semantic tokens, matte panels, minimal accents, and purposeful visualizations only.
- Keep optional Today data in independent async surfaces and measure request/render behavior.
- Establish file ownership and land small presentational extractions around existing calendar logic.
- Maintain the explicit out-of-scope list in stories and review checklists.
- Migrate one vertical route at a time after the foundation.

### Dependencies

- Product Owner approval of the Night Ops design contract and dark-only initial scope.
- Architect confirmation of shell/component boundaries and Today data composition.
- Completion or coordinated ownership of current future-session amendment changes.
- Stable fixture data for private-safe responsive and visual testing.
- Preview deployment suitable for exact Product Owner acceptance.

### Assumptions

- Existing endpoints provide the approved facts required for the initial redesign.
- The current single-athlete navigation and route set remain authoritative.
- Night Ops replaces the current visual direction rather than becoming a user-selectable theme in the first release.
- No migration is required because the work is presentational and app-composition focused.

## Definition of Done

The Night Ops redesign is complete only when:

- all canonical routes use the accepted visual system;
- Today is workout-first and Calendar is readable at supported widths;
- Plan and Activities use the approved progressive-disclosure patterns;
- every required state is readable, keyboard accessible, and truthful;
- coaching, amendment, privacy, authentication, and synchronization boundaries remain unchanged;
- build, type, unit, E2E, responsive, accessibility, and visual gates pass;
- source documentation matches the implementation;
- the Product Owner accepts the exact preview before production promotion.

## Progress Update

- Completed: Live UX review, selection of Option 2 — Night Ops, shared theme/shell, workout-first Today, responsive Calendar detail, explicit-week Plan hierarchy, stable Activities detail, secondary-screen parity, and focused validation.
- In Progress: Cross-slice QA, full regression, browser verification, documentation review, and preview acceptance.
- Blocked: No implementation blocker. One existing broad-suite Calendar route status mismatch requires QA classification before release acceptance.
- Remaining: Full QA outcome, exact preview review, Product Owner acceptance, and promotion decision.

## Reporting

- Executive Summary: Night Ops can be delivered without API or database changes by introducing semantic dark-theme tokens, converging the shared app shell, and migrating one route at a time. Calendar is the first vertical slice because it has the highest usability risk and establishes reusable session summary/detail behavior for Today and Plan.
- Delivery Confidence: Medium.
- Next Best Step: Approve `NO-0`, then prepare Calendar wireframes and the state matrix before `NO-1`/`NO-2` implementation.
