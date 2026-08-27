# Reference-Parity UI Continuation Plan

Status: Complete — QA passed and local preview presented

Created: 2026-08-24

Reference: user-supplied Race Predictor home-screen concept

Target: the current RacePredictor web application

## Project Manager Summary

- Objective: continue the existing Night Ops theme across every current visual screen, using Today’s established widgets and the reference image’s shapes, density, borders, and semantic accents.
- Current stage: architecture and UX gates complete; implementation ready.
- Delivery strategy: converge the shared visual vocabulary first, migrate route-sized slices, then run the complete automated and browser validation gate.
- Product boundary: the reference is authoritative for visual language only. It does not authorize new metrics, training phases, workout actions, completion inference, data requests, or coaching behavior.

## Current Screen Inventory

| Screen | Route | Existing purpose |
|---|---|---|
| Today | `/dashboard` | Approved workout/rest, current week, analytics, freshness, and import status |
| Plan | `/dashboard/plan` | Active approved plan, explicit-week progress, proposal workflow, and immutable history |
| Calendar | `/dashboard/calendar` | Week/agenda schedule, selected-session detail, and reasoned amendments |
| Activities | `/dashboard/activities` | Filterable activity history and stable master-detail review |
| Data Quality | `/dashboard/data-quality` | Manual import, validation outcomes, and recovery guidance |
| Settings | `/dashboard/settings` | Reminder, handoff, provider, device, privacy, and operations state |
| Login | `/login` | Owner-only GitHub sign-in |

`/` remains redirect-only and receives redirect verification, not a separate themed screen.

## Reference Design Contract

The implementation will reuse the existing Night Ops tokens and Today component vocabulary:

- Deep navy matte background and navigation rail.
- Thin cool-gray borders, compact radii, restrained elevation, and dense analytical spacing.
- White primary text and cool muted secondary text.
- Cyan for current selection, focus, and primary action.
- Violet for planned training/category context.
- Lime for healthy or confirmed success.
- Amber for stale, changed, pending, or review-required state.
- Red only for failure and destructive actions.
- Workout hero, compact telemetry groups, current-week session cards, KPI cards, status chips, segmented controls, activity telemetry rows, progress rails, and bordered state panels.
- Text or an accessible label always accompanies colour.

Explicit exclusions from the concept image:

- No Start Workout or completion action.
- No inferred workout completion or coaching effectiveness.
- No invented Base/Build/Peak/Taper phases.
- No sleep, HRV, VO2 max, recovery score, generic confidence, freshness score, or sparkline unless already supported by a current contract and screen.
- No new API, database, authentication, provider, persistence, or plan-authority behavior.

## Architecture Decision

The work stays in `apps/web`. Shared styling remains app-local because there is no second UI consumer and no current `packages/ui` implementation.

Responsibilities remain separated:

- Route/server composition continues to fetch and prepare data.
- Existing domain adapters continue to decide stale, warning, conflict, disconnected, and error meanings.
- Shared shell and visual primitives only render prepared content and semantic tones.
- Calendar mutation rules, dialog focus handling, revision conflicts, and confirmation wording remain in the existing controller.
- Local and online Settings share visual surfaces, not controllers or invented unified state.

No API, schema, or persistence migration is required. Rollback is a frontend source/deployment rollback.

## Screen-by-Screen Delivery

### 1. Shared foundation

- Refine semantic tokens for shell dimensions, toolbar height, compact spacing, nested surfaces, controls, and tabular telemetry.
- Standardize the desktop rail, compact/tablet rail, mobile navigation, active route, toolbar, content gutter, panels, buttons, form controls, status chips, and focus treatment.
- Retain the skip link, landmarks, reduced motion, and forced-colour behavior.
- Remove cascade fragility from legacy light-theme declarations only when the affected screen is verified.

### 2. Today

- Keep the approved workout/rest surface first.
- Compact goal, active-plan, prescription, duration/purpose, warning, and action information without removing copy or states.
- Preserve the current-week session strip, prediction KPIs, training signals, driver contributions, import progress, and independent freshness surfaces.
- Keep optional failures isolated so coaching remains visible.

### 3. Plan

- Preserve active-plan-first hierarchy and the collapsed Create a plan with Codex workflow.
- Use compact telemetry, an explicit date-progress rail, supplied-week controls, bordered session rows, and progressive disclosure.
- Preserve proposal freshness, differences, approval/rejection, history, and approved-version selection semantics.

### 4. Calendar

- Keep seven readable columns at wide desktop and Agenda at narrower supported widths.
- Apply the same day-card, session-summary, selected-detail, status, and segmented-control language as Today.
- Preserve deep links, source/effective comparison, reason history, collision/range validation, conflict handling, and dialog accessibility.

### 5. Activities

- Tighten filters and telemetry rows while keeping the stable list/detail layout.
- Use a cyan selected rule and compact metric hierarchy.
- Preserve filters, pagination, provenance, optional-data states, detail loading, mobile back behavior, and focus restoration.

### 6. Data Quality

- Keep upload first and make accepted, duplicate, rejected, warning, staged, and normalized results use the established metric-panel vocabulary.
- Keep retry, correct/re-upload, wait, and no-action guidance explicit.
- Never expose tokens, object keys, raw provider payloads, stack traces, or private paths.

### 7. Settings

- Standardize local and online settings to the same toolbar, panel, form, status, and action hierarchy.
- Preserve the distinction between reminder preference, handoff, external automation, Strava, local device, privacy, and operations state.
- Keep destructive actions visually secondary until intentionally invoked.

### 8. Login

- Align the owner GitHub sign-in card with the dashboard brand, geometry, palette, focus treatment, and restrained grid backdrop.
- Keep the single sign-in action and owner-only scope unchanged.

## Responsive Contract

### 1440 × 900

- Full approximately 220px navigation rail and full toolbar.
- Seven-column Calendar.
- Today’s session, key facts, action, status, and current-week heading visible in the initial viewport when content length permits.
- KPI cards remain three columns; Activities remains split list/detail.

### 1024 × 768

- Compact rail and wrapping toolbar.
- Two-column summary grids where readable.
- Calendar uses Agenda rather than squeezing seven columns.
- Activities uses its single-pane responsive detail behavior.

### 390 × 844

- Top brand and compact multi-row navigation.
- No horizontal page scrolling.
- One-column panels, telemetry, forms, summaries, and actions.
- Calendar remains Agenda; Activities keeps its explicit return-to-list control.
- Long prescriptions, references, filenames, and status text wrap safely.

## Delivery Roles

| Stage | Role | Responsibility | Gate |
|---|---|---|---|
| Requirements | Product Owner | Screen inventory, priorities, acceptance criteria, exclusions | Complete |
| Technical design | Architect | Boundaries, risks, slice order, rollback, validation | Complete |
| Design handoff | UX/UI Developer | Gap matrix, component/style targets, responsive and accessibility contract | Complete |
| Implementation | Software Engineer | Scoped frontend implementation and regression coverage | Complete |
| Product validation | Playwright/E2E | Critical journeys and responsive browser evidence | Passed |
| Release gate | QA | Acceptance evidence, regressions, privacy, build/test status | Passed |
| Presentation | Project Manager/Product Owner | Present exact validated local preview | Presented for user review |

## Validation Plan

Automated gates:

- `npm run lint --workspace @racepredictor/web`
- `npm run typecheck --workspace @racepredictor/web`
- `npm test --workspace @racepredictor/web`
- `npm run build --workspace @racepredictor/web`
- `npm run test:e2e --workspace @racepredictor/web`
- `npm run test:e2e:online --workspace @racepredictor/web`
- `npm run test:e2e:auth --workspace @racepredictor/web`

Browser/product gates:

- Today → Calendar → Plan → Activities → Data Quality → Settings and Login entry.
- 1440×900, 1024×768, and 390×844.
- Loading, empty, stale, disconnected, warning, error, success, disabled, selected, conflict, and destructive-confirmation states where fixtures support them.
- Keyboard navigation, skip link, focus visibility/order, Calendar dialog focus handling, Activities focus return, reduced motion, forced colours, 200% zoom, overflow, and long-content wrapping.
- No unexplained console error, hydration failure, clipping, overlap, or unintended two-dimensional page scroll.
- No private athlete data in new fixtures, screenshots, logs, or QA artifacts.

## Acceptance Criteria

- All seven current visual screens use one coherent Night Ops/reference-derived vocabulary.
- Every existing Today widget remains available and semantically unchanged.
- No unsupported concept-image data or behavior is introduced.
- Local and online workflows continue to work through their existing controllers and contracts.
- Responsive, accessibility, automated, build, and browser gates pass or a pre-existing/environmental failure is explicitly classified.
- The exact tested local preview is left open for the user as the presentation artifact.

## Risks and Mitigations

- Broad shell regression: migrate shared geometry first, then verify route slices.
- Calendar behavior regression: do not move controller or mutation logic during visual refinement.
- CSS cascade fragility: normalize legacy light rules incrementally instead of rewriting the stylesheet wholesale.
- Unsupported screenshot features: retain the explicit exclusion list through engineering and QA.
- Dense layouts at zoom/narrow widths: use current Agenda and single-pane responsive fallbacks rather than compressing desktop grids.
- Environment-dependent online/auth tests: classify failures against configured preview requirements and do not present them as application passes without evidence.

## Definition of Done

Implementation is complete only when every current visual screen is aligned, all existing workflows and safety boundaries are preserved, required automated and browser gates pass, QA returns PASS, and the exact validated preview is presented to the user.
