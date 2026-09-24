# Race Predictor Current UX Audit

Scope: current implemented user experience, using `docs/design/APP_INVENTORY.md`, the current page components, and the current visual/responsive styles. This is an audit only; it does not define the final redesign.

Severity meanings:

- **High** — likely to block task completion, cause a harmful misunderstanding, or affect a primary flow.
- **Medium** — creates meaningful friction or uncertainty but has a viable workaround.
- **Low** — polish, consistency, or discoverability issue with limited immediate impact.

## Executive summary

The strongest UX risk is that the app contains several safe, carefully controlled workflows but does not always expose their sequence clearly. Plan creation depends on an external Codex exchange and a JSON proposal file; import begins from Data Quality; predictions live inside Today; and local versus online Settings are substantially different. The UI provides many safety messages and state-specific controls, but the overall “what do I do next?” path remains unclear, particularly for a first-time user and on smaller screens.

## 1. Confusing flows

### High

- **Plan creation is a multi-system handoff with no single end-to-end orientation.** The user enters goal data, publishes context, leaves the app to continue in Codex, returns with a JSON file, imports it, reviews it, and approves it. The Plan page labels these as Step 1 and Step 2, but the external Codex step is represented only by status copy. The user may not know where to continue, what Codex output is expected, or how to return to the exact draft flow.
  - Evidence: `PlanPage`, `Publish context for Codex`, `Continue planning in Codex`, and proposal JSON import in `apps/web/components/coaching/coaching-pages.tsx`.

- **Activity import and data quality are separated conceptually but not operationally.** Activities contains the primary history workflow and links to Data Quality for “Import activities,” while Data Quality is also the only manual upload entry point. Users looking to add a run may not expect to find upload under a quality/diagnostic page.
  - Evidence: Activities links to `/dashboard/data-quality`; upload is implemented in `DataQualityPage`.

- **The distinction between an approved plan, a saved draft, and an active plan is easy to lose.** Plan supports persisted drafts, approved history, activation of older approved versions in online mode, and proposal approval. These are safe operations, but the page contains several similarly worded actions and status labels.

### Medium

- **Today combines coaching, prediction, analytics, pipeline status, and freshness.** The current workout is the primary user need, but the page then moves through latest feedback, prediction snapshot, training signals, and import pipeline content. This makes it unclear whether the page is primarily for today’s action or for analysis.

- **Calendar contains several different mental models at once.** The user can inspect planned sessions, recorded activities, activity details, effective prescriptions, source prescriptions, history, and schedule changes. The information is correct but the relationship between “what was planned,” “what happened,” and “what can be changed” is not immediately obvious.

- **Strava backfill is presented as a Settings action.** Connecting Strava and importing the last 90 days are data-ingestion tasks, but they are placed beside preferences, local device pairing, Second Brain context, and reminder configuration.

## 2. Unclear user actions

### High

- **The next action after an empty Plan state is indirect.** The user is told to start with Codex, but the exact sequence—complete inputs, publish context, continue externally, import proposal, review, approve—is not summarized as a visible checklist or progress state.

- **The next action after a successful manual import is under-specified.** The success message confirms that history was updated and the active plan was not changed, but does not provide a clear next action such as viewing imported activities, checking warnings, or refreshing Today.
  - Evidence: `Import finished. Your coaching history is updated; your active plan was not changed.` in `DataQualityPage`.

- **Prediction selection has limited discoverability.** Race distance is a selector in the Today toolbar only when multiple prediction options exist. There is no explicit prediction section in navigation or a clear link from the goal/plan to prediction interpretation.

### Medium

- **“Review move” in Calendar is not self-explanatory.** The action leads into a scheduling decision, but its label does not tell the user whether it previews collisions, changes dates, or confirms an amendment.

- **“Make this approved plan active” is a high-impact action embedded in history.** The confirmation is present, but the action’s relationship to Today and Calendar could be more prominent before the user opens an older version.

- **The Data Quality page does not visibly distinguish CSV and GPX constraints until the helper text is read.** The one-activity GPX limit is important and may be missed because the file control itself has one combined label.

### Low

- **The rail’s numeric labels (`01`–`06`) add visual structure but little task meaning.** They do not communicate status, progress, or priority and may compete with the actual labels.

## 3. Weak visual hierarchy

### High

- **Today’s primary workout and secondary analytics compete for attention.** The page starts with the coaching card, but the remainder of the page presents multiple similarly weighted content groups. The prediction KPI row and training signals can visually read as equally important to the day’s prescription.

- **Plan’s active state, creation workflow, draft review, and version history are all substantial panels.** The user must visually parse which panel is authoritative now and which panels are preparation or historical reference.

### Medium

- **Status information is distributed across toolbar metadata, status chips, inline status lines, warning panels, and panel copy.** This creates a fragmented state hierarchy. “Healthy,” “success,” “ready,” “active,” “draft,” “stale,” and “action required” are not presented as one consistent state vocabulary.

- **Data Quality gives import result counters strong prominence, but recommended next action is lower in the panel.** Accepted, duplicate, rejected, and warning counts are visible, while the action required to resolve a rejected or warning result is expressed mostly as prose.

- **Calendar day cells are information-dense.** The desktop grid shows seven columns with date, status, session/activity summaries, and an information control. At reduced widths it becomes horizontally scrollable, which weakens the immediate overview.

### Low

- **Visual hierarchy varies between page families.** Today uses dashboard content groups; Activities has a list/detail shell; Plan, Calendar, Data Quality, and local Settings use coaching panels; online Settings has its own sync-oriented structure.

- **The current theme uses a visible grid texture in the navigation rail.** This is restrained, but it is the one decorative treatment that can compete with a function-first analytical presentation.

## 4. Information quantity on key screens

### High

- **Plan is overloaded for a high-consequence workflow.** Goal setup, routine inputs, context publishing, proposal import, proposal review, approval/rejection, saved draft handling, and approved version history all live on one route. The page is comprehensive but difficult to scan and understand as a sequence.

- **Calendar detail can become overloaded.** A selected date may expose activity records, planned session context, prescription, approved source, cautions, history, and permitted actions in one surface. This is valuable for auditability but may overwhelm users who only need the day summary.

### Medium

- **Today contains more information than the daily decision requires.** The prediction snapshot and training signals are useful, but they are mixed into the same primary page as today’s session and latest coach feedback.

- **Settings combines unrelated categories.** Local preferences, reminders, Second Brain exchange, Codex handoff, Strava, local device pairing, credentials, and operational statuses can all appear in Settings depending on mode.

- **Activities detail is rich relative to the list.** Distance, elapsed time, pace, elevation, telemetry, splits, route availability, provenance, and coach review are all available. The structure is appropriate for analysis but needs strong progressive disclosure to avoid making every inspection feel heavy.

### Low

- **Data Quality is sparse before the first import.** The empty result panel explains what will appear, but the page does not provide broader dataset health context until data exists.

## 5. Loading, empty, error, and success states

### High

- **Today’s server-rendered initial load does not expose a page-level loading state.** The dashboard data is fetched in the route before the shell is returned. Client-side analytics loading exists for online refresh behavior, but a user navigating to Today does not get a consistent loading treatment across the full page.

- **Today’s initial data failure is handled at route/render level rather than with a clearly evidenced page-level recovery state.** The shell supports error and empty states, but the current page data fetch can fail before the shell receives a view model. This creates a risk that the user sees a generic framework error rather than the intended actionable state.
  - Evidence: `DashboardPage` awaits `dataSource.getDashboardData()` before rendering `DashboardShell`.

- **Local Settings has no clearly consistent loading/error/success model visible from the route inventory.** Online Settings explicitly tracks loading/error states; local Settings is rendered directly through `SettingsPage`, creating a mode-dependent state experience.

### Medium

- **Data Quality has idle, loading, error, and success states, but no explicit disabled/unsupported-file state beyond a generic missing-file validation message.** Invalid file type, oversized file, malformed CSV/GPX, and partial-import outcomes should be distinguishable to the user.

- **Plan has independent loading states for active plan, draft, and history, but the user may see incomplete sections without a clear page-level loading explanation.** The page can show active-plan content while history or saved-draft content is still loading.

- **Success feedback is often transient inline text.** Important outcomes such as plan activation, proposal rejection, Strava backfill queueing, and device credential creation are not always accompanied by a durable state change or a clear destination link.

### Low

- **State labels are inconsistent across components.** `StatusLine` uses idle/loading/success/error while other surfaces use healthy/current/warning/danger or provider-specific statuses.

## 6. Mobile and responsive weaknesses

### High

- **The six-item navigation becomes a dense three-column navigation row on mobile.** This is functional, but six equal-priority links plus branding and page content consume substantial vertical space and reduce clarity about the current destination.

- **Calendar remains a wide, horizontally scrollable seven-day grid below 1,200px.** At mobile widths each day column still has a minimum width, so the user must pan horizontally to understand a week. An agenda is documented as the compact alternative, but the current responsive CSS still preserves the wide grid structure.

- **Plan and Settings remain long, dense forms/panel stacks on small screens.** The responsive rules stack columns, but they do not reduce the amount of content or establish a compact step-by-step mode for high-density workflows.

### Medium

- **Activities filters collapse to multiple rows but remain control-dense.** Four filter controls and filter actions can occupy much of the first viewport before the activity list.

- **Activity detail uses a side-panel concept that changes to an explicit return action on compact screens.** This preserves functionality, but switching between list and detail can be less contextual than the desktop layout.

- **Long labels and status copy may wrap heavily at narrow widths.** Examples include proposal status, plan activation messages, freshness explanations, and Calendar action copy.

### Low

- **Mobile buttons are not uniformly full-width.** Some coaching actions become full-width while other controls remain intrinsic-width, creating inconsistent touch-target rhythm.

## 7. Inconsistent components and styling

### High

- **Local coaching pages and online Settings use different visual implementation layers.** The current coaching stylesheet contains older light-surface declarations followed by Night Ops overrides, while dashboard styles and sync components have separate conventions. This increases the chance of visual drift and makes state patterns harder to learn.

- **Page shells are split across `DashboardShell`, `ActivitiesShell`, `CoachShell`, and `OnlineSyncSettings`.** Shared navigation exists, but toolbar anatomy, content spacing, metadata placement, and state rendering are not fully standardized.

### Medium

- **The repository documentation still contains the older Overview/Performance navigation model.** This conflicts with the implemented Today/Plan/Calendar structure and can lead future work toward the wrong information architecture.

- **Button, input, and focus styling is duplicated across dashboard, activities, and coaching CSS.** Even where the visual result is similar, separate selectors make consistency harder to maintain.

- **Panel anatomy varies.** Some panels have eyebrow/title/status/action headers; others use plain headings, lists, or direct content without the same header/action/body structure.

- **Status chips and state panels do not share one clearly defined component contract.** The same semantic idea is represented through chips, colored borders, inline text, and `role=status`/`role=alert` blocks.

### Low

- **The navigation rail uses “Night Ops” as a product sublabel while page headers use “Training workspace” or “Training command centre.”** The language is coherent in tone but not fully consistent in user-facing orientation.

- **Some copy uses technical terms without immediate explanation, including “history fingerprint,” “approval record,” “Second Brain,” “local sync,” and “provider.”** These may be clear to experienced users but are not self-evident to new users.

## 8. Where users may not understand what to do next

### High

- **First visit with no active plan:** the user needs to understand that they must create a goal, publish context, use Codex, import a proposal, and approve it. The current copy communicates this in fragments.

- **After importing a file with warnings or rejections:** the user needs a prioritized correction path. The current result shows counts and warnings, but the next action is primarily textual.

- **When Today has no analytics but does have coaching:** the page correctly keeps coaching independent, but the user may not know whether to refresh, import data, or simply continue with today’s session.

- **When Strava is connected but data is not yet visible:** the user may not know whether to wait, backfill, refresh Activities, or inspect Data Quality. Queueing language indicates asynchronous work but does not establish a clear monitoring path.

### Medium

- **When a saved draft is surfaced:** “Review saved draft” is useful, but the user may not know why it is newer, what changed, or whether opening it affects the active plan.

- **When an older approved plan is selected for activation:** the user may not understand that it changes Today and Calendar while preserving prescriptions.

- **When a Calendar date contains no recorded run:** the explicit “No completion inferred” rule is safe, but users may need stronger explanation of how activity matching currently works and what action, if any, is available.

## Priority summary

### High-priority audit themes

1. Make the Plan/Codex/proposal/approval journey legible as one workflow.
2. Make manual import discoverable as an activity task and give import results a clear next action.
3. Establish a stronger Today hierarchy around the daily workout before analytics.
4. Ensure initial page-level loading and error recovery are consistent, especially Today and Settings.
5. Provide a truly compact Calendar/Plan experience for mobile rather than primarily shrinking or scrolling desktop structures.
6. Unify page shells, panel anatomy, and semantic state presentation.

### Medium-priority themes

1. Separate or progressively disclose analytics, prediction, infrastructure, and settings detail.
2. Clarify Calendar action names and plan-version semantics.
3. Reduce filter and status density on compact layouts.
4. Align online and local Settings into one understandable information architecture.

### Low-priority themes

1. Remove or repurpose non-semantic navigation numbering.
2. Normalize tone and terminology.
3. Consolidate small visual and focus-style differences.

## Handoff summary for Astra

The audit finds that Race Predictor is functionally cautious and state-aware, but its primary workflows are fragmented across page modes and external handoffs. Astra should prioritize a clear Plan-to-Codex-to-proposal-to-approval journey, a more discoverable import workflow with actionable results, a workout-first Today hierarchy, consistent page-level state handling, and compact mobile alternatives for Calendar and dense forms. Preserve explicit approval, independent freshness, non-inferred completion, and single-athlete ownership rules while addressing hierarchy and next-action clarity.
