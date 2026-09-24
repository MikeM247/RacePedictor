# Race Predictor Information Architecture and Core User Flows

Design specification input · 12 September 2026

Authority: [DESIGN_INTENT_CONTRACT.md](DESIGN_INTENT_CONTRACT.md). This document applies that contract to navigation and journeys; it does not override it or authorize additional domain capabilities. Supporting rationale: [UX_NORTH_STAR.md](UX_NORTH_STAR.md).

Flow IDs F01–F10 are for traceability in subsequent screen specifications and tickets. New URL states below are proposed UI behavior, not claims about existing implementation. No application code or tickets are included.

## 1. Recommended navigation structure

Primary navigation is always **Home → Training → Plan**, in that order. Settings is a separate secondary utility. There are no primary Predictions, Trends, Calendar, Import, or Data Quality destinations.

| Destination | Responsibility | Contextual surfaces |
|---|---|---|
| Home | Understand the race outlook, latest training, and next action. | Readiness detail, training trends and evidence within that detail, direct latest-session review, direct today's schedule context. |
| Training | Browse recorded sessions and understand their execution. | Activity detail, Filters, Add training, Data Quality utility link. |
| Plan | Understand the goal and approved plan; manage the schedule deliberately. | Local Overview / Calendar switch; staged goal/plan creation; saved draft review; approved history. |
| Settings — secondary | Manage supporting preferences and services. | Preferences, connections, reminders/context setup; expand the relevant group when reached contextually. |
| Data Quality — secondary | Understand a data limitation and recover where possible. | Context-specific issues, import results, supported recovery and processing information. |

Home's three groups are **Race outlook → Recent training → Next action**. They are information groups, not navigation tabs. Keep exactly this order during loading and refresh. Each screen or active step has at most one filled primary action; other destinations remain clear text links or outlined controls.

### Shared navigation and flow rules

- Use a direct, named entry to detail. The latest full session review, readiness detail, and today's schedule context each require one activation from Home.
- Preserve the originating page, selected item, filters, scroll position, and focus. Returning from detail restores that context. A direct deep link without origin has a labeled parent link.
- Distinguish **Back to Home** from **Back to training** according to the actual origin. A visible Training link remains available when session detail was opened from Home.
- Opening, filtering, inspecting evidence, and using Back never change a goal, prescription, approval, or completion state.
- Use the active goal and current schedule by default. Keep advanced choices closed until needed. Do not make routine visits start with filter selection.
- Show available activity records immediately while commentary or analytics load independently. Preserve usable content after a partial failure.

Contract references: N1–N5, UX3–UX6, V1–V3, I1.

## 2. Route hierarchy

Logical hierarchy follows the three destinations even where existing URL paths remain siblings.

| Surface | Route or recommended UI state | Current / proposed | Primary selection and return |
|---|---|---|---|
| Entry | `/` → `/dashboard` | Existing redirect. | Home; retain existing authentication checks. |
| Sign-in | `/login` | Existing. | No dashboard primary selection; preserve safe intended destination. |
| Home | `/dashboard` | Existing route; redesigned content. | Home. |
| Readiness | `/dashboard?view=readiness` | Proposed additive state. | Home; Back to Home. |
| Training trends | `/dashboard?view=readiness#training-trends` | Proposed anchor within readiness detail. | Home; same readiness content, no extra screen or tab. |
| Prediction evidence | `/dashboard?view=readiness#evidence` | Proposed anchor within readiness detail. | Home; single evidence disclosure, no nested disclosures. |
| Training list | `/dashboard/activities` | Existing route; label becomes Training. | Training. |
| Session detail | `/dashboard/activities?activityId=<id>` | Activity selection query is already read by the app; redesign must complete return/refresh behavior. | Training; contextual Back to Home or Training. |
| Add training | `/dashboard/activities?view=import` | Proposed additive workflow state. | Training; Back to origin or Training on direct entry. |
| Plan overview | `/dashboard/plan` | Existing. | Plan / Overview. |
| Create or resume plan | `/dashboard/plan?view=create` | Proposed additive workflow state. | Plan / Overview; show the verified current stage. |
| Calendar | `/dashboard/calendar` | Existing. | Plan / Calendar. |
| Date/session context | `/dashboard/calendar?date=YYYY-MM-DD&session=<id>` | Existing parameters; session is optional. | Plan / Calendar; return to launch context. |
| Data Quality | `/dashboard/data-quality` | Existing; remain directly accessible. | None of the three primary links selected; page title and contextual Back identify location. |
| Settings | `/dashboard/settings` | Existing. | Secondary Settings selected; none of the primary links selected. |
| Connections setup | `/dashboard/settings#connections` | Proposed anchor opening the relevant settings group. | Settings; preserve the return to import or affected data. |

Route rules:

- Preserve existing paths, query parameters, authentication callback parameters, and supported deep links. Do not rename URLs to match navigation labels.
- New query/anchor states control presentation only. Refresh must retain the selected detail or workflow entry; derive draft/approval stage from actual stored state, not from a query claiming completion.
- A session detail request targets the selected ID even if the activity is outside the visible list page. Missing/deleted records show a recoverable message and parent link; never substitute another session.
- Do not combine activity selection and import in a generated link. Handle malformed or conflicting states safely by explaining the invalid destination and offering Training, without initiating a write.
- Data Quality keeps the existing upload capability for legacy/direct entry. Its normal redesigned role is recovery; Add training reuses the same supported import workflow and rules.
- Utility links carry only safe navigation context. Keep note content, credentials, and private paths out of URLs. Preserve return context without accepting arbitrary external return destinations.

Contract references: N2–N5, ALLOW3, DENY3–DENY4.

## 3. Primary dashboard flow — F01

**Entry point:** App launch or Home navigation.

**User goal:** Understand the race outlook, what the latest session means, and the next appropriate action.

**Steps:**

1. Render the shell and three stable groups; load each group's evidence independently.
2. Show the active race target, supported outlook, confidence meaning, and material caveat in Race outlook.
3. Show the latest recorded session by activity date. Present concise execution/goal commentary or its real pending/unavailable state.
4. Show today's approved session/rest and purpose. Select at most one primary action using the decision order below.
5. Let the runner read without clicking, or open View readiness, View session, or today's schedule context directly.

**Key decisions:** A supported blocking condition affecting the next task takes action priority, with an explanation. Otherwise, if there are no activities, prioritize Add training; if training exists but goal/plan setup is needed, prioritize that setup; otherwise prioritize today's approved session when actionable. Rest may require no filled button. All other useful entries remain secondary. A review delay or an unrelated sync issue alone does not displace a usable prescription.

**Success state:** Runner can describe the latest session, the goal outlook and its limits, and what to do next. Merely reading is a successful visit.

**Error/empty states:** Replace only the affected group with a loading, missing-goal, missing-plan, no-training, pending-review, stale, or retry state. Authentication may replace the page. Never turn missing records into a missed-workout claim.

**Design intent:** Deliver a short connected explanation, with recent training prominent and no additional dashboard panels. References: P1–P3, U3, V1–V3, C3, L1–L3.

## 4. Activity upload/import flow — F02

**Entry point:** Add training in Training; Home's no-training action; existing Data Quality upload entry.

**User goal:** Add trustworthy activity history and know what was accepted or still needs attention.

**Steps:**

1. Open Add training with a single source choice: file upload or Strava. Show availability and current connection state.
2. For file upload, explain supported CSV limits and the one-activity-per-GPX-file rule before selection. Choose a file, then explicitly Import file.
3. Show validation/import progress without invented percentages. Confirm accepted, duplicate, rejected, and warning results from the actual response.
4. For Strava, use the existing connection if available; otherwise open the relevant Settings group, continue through authorization, and return to import.
5. Offer the supported recent-history request: last 90 days, capped at 150 activities. Explain that newly completed workouts can arrive automatically after connection.
6. Confirm a queued request as queued. Link to Training for records that arrive and to relevant status/recovery for actionable delays.
7. On usable file results, offer View training. Show review generation as a separate state; importing does not imply that coaching commentary or a new prediction is ready.

**Key decisions:** File versus Strava; authorize versus cancel; inspect accepted records versus correct rejected data. With actionable rejection, emphasize correction; otherwise emphasize View training. Duplicates alone do not require re-upload.

**Success state:** File results are confirmed and accepted records are accessible, or a Strava request is durably queued and its next destination is clear. Full Strava ingestion success is shown only after records are actually received.

**Error/empty states:** No file; unsupported/malformed/oversized file; partial acceptance; duplicate-only result; failed upload; authorization cancellation; disconnected provider; queued delay; unsupported runtime mode. Preserve entered choices where safe; if a file cannot survive reload, explicitly ask for re-selection.

**Design intent:** Import belongs to training history, with a short source-specific path and no requirement to understand infrastructure. Retain supported local/online boundaries; do not render a working Strava control in an unsupported mode. References: L2, I2, S1, DENY3–DENY4.

## 5. Race goal setup flow — F03

**Entry point:** Home setup action; Plan creation entry; saved draft resume.

**User goal:** Establish a race objective and approve a plan that fits training constraints.

**Steps:**

1. Open Plan Overview. Explain whether there is no goal, no approved plan, an active plan, or a saved proposed replacement.
2. Where local creation is supported, collect the existing goal title, target date/distance, purpose, and training availability. Reuse existing profile/routine values and supported defaults.
3. Let the runner inspect/add history if needed without making history inspection a compulsory detour. Do not add unsupported goal fields; a structured target-time objective is reviewed only if supported by the existing proposal workflow.
4. Explicitly publish context. Show that context is ready, how to continue in Codex, the expected proposal JSON, and the return entry.
5. Import the returned proposal as a draft, or resume an existing persisted draft. Show goal outcome, prescribed plan, meaningful differences, and freshness limitations.
6. Choose approval or rejection; confirm the target and consequences. If stale-history acknowledgement is required, expose it before confirmation.
7. After server confirmation, identify the settled goal and active plan and offer Open Calendar. Retain approved history as secondary detail.

**Key decisions:** First plan versus replacement; resume versus create; approve versus reject. Importing, publishing context, and leaving the page never activate a plan. Abandoning a replacement keeps the current approved plan.

**Success state:** Explicit approval establishes the authoritative goal/plan; Home and Calendar reflect that version. A saved draft is a resumable intermediate state, not setup completion.

**Error/empty states:** Missing/invalid inputs; context publication failure; invalid proposal; no returned file; unavailable saved draft; stale history; conflicting revision; approval failure. Preserve inputs and draft where supported and expose the exact next step.

**Design intent:** One understandable sequence with one action per stage, including the external handoff. **Online mode:** current creation/approval remains local; explain where to continue and how the approved plan reaches the online app. Online selection of an existing approved version retains its explicit activation confirmation. Do not imply online drafting is implemented. References: L2, I3, I5, DENY3–DENY5.

## 6. Prediction review flow — F04

**Entry point:** View readiness in Home Race outlook.

**User goal:** Understand the prediction relative to the target and how strongly the evidence supports it.

**Steps:**

1. Open readiness detail with the same target and assessment timeframe as Home.
2. Read the supported estimate, available uncertainty, a short explanation, and material caveats.
3. Inspect comparison with the target only where the goal and prediction basis are compatible. Label current-fitness estimates separately from any supported race-date forecast.
4. If useful, inspect training trends (F05) or evidence/limitations (F06) within this detail.
5. Return to Home or follow a specific supported action into Plan or data recovery. Reading the estimate changes nothing.

**Key decisions:** Accept the summary or inspect evidence; change comparison distance only when existing prediction options support it. Such a display selection must not edit the active race goal.

**Success state:** Runner can explain the estimate, timeframe, relation to the goal, and principal uncertainty.

**Error/empty states:** No target; no compatible prediction; insufficient history; confidence unavailable; stale estimate; failed fetch. Retain valid estimates as estimates where possible, label limits, and avoid fabricated on-track/confidence categories.

**Design intent:** Make prediction interpretation directly discoverable without another primary destination or a wall of metrics. References: primary question table, UX2, UX6, C5, L3.

## 7. Training trend review flow — F05

**Entry point:** Training trends within readiness detail; a contextual Training link may open that same section directly.

**User goal:** Understand what recent training patterns show and whether they support the race interpretation.

**Steps:**

1. Show the available weekly-distance series for the recent supplied period, with dates, units, and data coverage. The current presentation uses the last 12 weeks; do not imply other series are available without verifying them.
2. Present a concise supported trend explanation and text equivalent of any chart. Identify an incomplete current week or missing periods where known.
3. Reveal optional period/source controls only if supported by existing data. Preserve an applied-filter summary; do not introduce an unrestricted metric builder.
4. Inspect supporting activities for a period if an accurate filtered link is supported; otherwise provide a labeled Training entry without pretending it selects that period.
5. Return to the same readiness section or originating Training view.

**Key decisions:** Summary versus evidence; supported time window; inspect activities versus return. Compare like periods only. Changes in distance are observations, not proof of improved readiness or successful plan adherence.

**Success state:** Runner can describe the observed pattern and its limitations without being led to an unsupported performance conclusion.

**Error/empty states:** No history; too few comparable periods; partial week; missing series; stale data; fetch failure. Show available points with coverage context, not interpolated or invented history. Unavailable period controls stay absent.

**Design intent:** Trends are evidence for a question, not a new dashboard destination. No invented training load, readiness curve, or predictive model. References: UX1–UX3, C5, N5, DENY2–DENY3.

## 8. Data quality/confidence flow — F06

**Entry point:** Material caveat in Home/readiness; prediction evidence disclosure; import result; Training's Data Quality utility.

**User goal:** Understand what limits the assessment and whether there is a practical correction.

**Steps:**

1. Read the specific limitation next to the affected claim. Keep prediction uncertainty separate from input freshness/completeness.
2. Open evidence for the relevant assessment: source period, available drivers, assumptions, and known missing inputs. Do not require opening Data Quality merely to read a caveat.
3. If an actionable data issue exists, follow a contextual link to Data Quality with a named affected item or task and return context.
4. Present the supported remedy: correct/re-upload, reconnect, inspect queued work, refresh, or take no action. Offer only remedies the app can actually execute.
5. After confirmed correction or refresh, return to the original assessment and show its current state. If recomputation has not occurred, retain the prior result and its age.

**Key decisions:** Correctable data issue versus an evidence/model limitation; wait versus act; inspect source versus return. Fresh data does not automatically imply high prediction confidence, and correction does not promise a better predicted time.

**Success state:** Runner understands how the limitation affects interpretation and has either completed a supported correction or learned why no immediate action is needed.

**Error/empty states:** Confidence not supplied; evidence unavailable; delayed local review/context while cloud records are fresh; provider failure; failed correction; no issues. Use “No known issues” only when the check succeeded, not after an error.

**Design intent:** Explain the consequence first and keep operational detail secondary. Do not expose private source content or invent recovery endpoints. References: UX2, UX6, S1, T3–T4, DENY3.

## 9. Empty-state onboarding flow — F07

**Entry point:** First authenticated visit or an existing runner with missing setup/history.

**User goal:** Reach a useful training or race assessment with minimal setup decisions.

**Steps:**

1. Load actual goal, plan, and history states before showing empty messages.
2. Keep Home's three groups. Replace missing content in place; do not add a fourth onboarding panel or compulsory wizard.
3. Choose one primary action using the table below. Keep other setup routes available as secondary links.
4. Complete the relevant import or planning step and return to Home. Show the new usable state immediately, separately from pending review/analytics.
5. Continue setup when useful; returning sessions must resume actual persisted progress rather than restart onboarding.

**Key decisions and default action:**

| Verified state | Primary action | What stays accessible |
|---|---|---|
| No activities, regardless of goal/plan | Add training, unless a supported blocking condition requires recovery first. | Existing goal/plan, today's prescription, and secondary goal setup. |
| Activities but no goal | Set up a race goal through F03. | Activity review, supported general estimates, Training. |
| Goal/history but no approved plan | Create a plan, or Review saved draft if one exists; explain local continuation online. | Goal outlook and activity history. |
| Approved plan/history; latest review pending | Today's approved action or rest. | Latest measured session and its real review state; no forced setup restart. |
| No matching records after filtering | Clear filters in the filtered surface. | Existing dataset; this is not first-use onboarding. |

**Success state:** Runner reaches usable training or approved-plan content and knows the next optional step. A readable activity is useful even before prediction or commentary exists.

**Error/empty states:** Failed initial reads, unsupported online creation, disconnected provider, pending import/review. Do not treat an error as missing setup or route the runner through duplicate setup.

**Design intent:** Offer one useful starting point while preserving control and access. References: U3, UX3, V1, L2, section 10 of the contract.

## 10. Error recovery flows — F08

**Entry point:** An affected Home group, activity, form, request result, utility screen, or protected deep link.

**User goal:** Recover the task without losing context, repeating a completed write, or misunderstanding the data.

**Steps:**

1. Identify the failed operation locally and retain safe usable content and inputs.
2. Explain what is known, what remains unchanged or uncertain, and the supported recovery.
3. Offer one primary recovery action when one exists; leave navigation available.
4. On recovery, update the affected state and restore the original task context.

**Key decisions:** Retry a read, correct input, reconnect, wait for queued work, or reload/review a conflict. Check the authoritative result after an uncertain write response before offering another consequential submission.

| Case | Recovery branch | Successful recovery / fallback |
|---|---|---|
| Network/read failure | Retry the affected section; keep prior content labeled if available. | Fresh content replaces its local error, or the runner can continue elsewhere. |
| Partial/invalid import | Preserve accepted results; identify correction; reselect corrected file when needed. | Confirm new result and retain deduplication behavior. |
| Expired sign-in | Use existing sign-in flow with a safe intended destination. | Return to the requested surface; clearly identify any unsaved input that could not be retained. |
| Strava authorization cancelled/disconnected | Return to import/setup with explanation; reconnect only on explicit action. | Connection confirmed; history request remains a separate choice. |
| Delayed queue/review | Show actual waiting/processing state; link supported status or retry. | Review/activities become available independently; no delivery promise. |
| Plan/schedule revision conflict | Preserve the user's attempted values for comparison; reload current state; require review and confirmation again. | Server accepts a reviewed change; no automatic overwrite. |
| Write response lost | Read current plan/job/import result where supported before retrying. | Confirm actual state, or clearly report uncertainty without claiming success. |
| Deleted/invalid deep-linked record | Explain that the requested item cannot be shown; offer its parent. | Training/Plan opens without substituting a different record. |
| Unsupported capability or evidence | Give a truthful unavailable state and supported alternative, if any. | User can use the remaining app; no retry loop for a capability that does not exist. |

**Success state:** The intended task is restored or its limitation is understood, with usable data and navigation retained.

**Error/empty states:** Repeated failure stays local and actionable; do not add repeated banners, fabricate empty data, or announce unchanged polling repeatedly.

**Design intent:** Recover the specific task, preserve trust, and avoid duplicate side effects. References: I2–I6, section 10, N4, DENY3.

## 11. Mobile navigation behaviour — F09

**Entry point:** App launch, primary navigation, or deep link at widths below 768 CSS pixels. Medium widths from 768–1199 use the same primary-navigation and detail-return behavior.

**User goal:** Read the same meaningful summaries and complete core tasks without hunting through menus or panning a desktop layout.

**Steps:**

1. Show one labeled Home / Training / Plan row and a separate Settings utility. No hamburger is required to discover the primary destinations.
2. Read Home groups in their fixed vertical order, using normal page scrolling.
3. Open session detail as the current content view; preserve the originating list or Home state. Use an explicit context-sensitive Back action.
4. In Plan, use the Overview / Calendar switch. Calendar defaults to Agenda below 1200px.
5. Stack forms and comparisons. Keep submit/cancel and dialog dismissal reachable with the software keyboard open.

**Key decisions:** Primary destination, then one contextual detail or action. Do not introduce additional mobile-only navigation categories or hide material caveats for space.

**Success state:** Runner completes the same daily interpretation and core import/planning actions with visible labels, readable content, and reliable return behavior.

**Error/empty states:** Use the same flow semantics as desktop, in place. Errors must not push recovery off-screen permanently; resize must not clear forms, active selection, or the current task.

**Design intent:** Few choices and continuous context across small screens. Minimum 44×44px targets, 16px compact gutters, keyboard accessibility, reduced motion, and no page-level horizontal scrolling apply. References: A1–A6, R1–R6.

## 12. Desktop navigation behaviour — F10

**Entry point:** App launch, primary navigation, or deep link at widths of 1200 CSS pixels or more.

**User goal:** Move smoothly between the daily summary, training investigation, and plan while preserving context.

**Steps:**

1. Use the left rail with Home / Training / Plan and a secondary Settings entry. Use a content width capped at 1280px and 24px gutters.
2. Keep Home's groups in their logical reading sequence rather than filling the viewport with parallel dashboards.
3. In Training, allow list/detail columns. Selecting an activity preserves list filters and position; opening/closing detail uses the same semantics as compact layouts.
4. In Plan, retain the local Overview / Calendar switch. Show the current four-week Calendar view, existing date semantics, and contextual session actions.
5. Inspect detail, evidence, or one confirmation surface at a time; return focus to the relevant launcher or updated task state.

**Key decisions:** Where to investigate, whether to open optional evidence, and whether to explicitly confirm a permitted change. Hover never becomes a requirement for discovering an action.

**Success state:** Runner can inspect richer evidence and return to the same list, calendar window, or Home section without rebuilding context.

**Error/empty states:** Keep errors within affected sections; preserve available columns/content. On resize below 1200px, switch to compact detail and Agenda behavior without losing selection or the current date context.

**Design intent:** Use additional space for readable comparison and preserved context, not additional top-level choices. References: N1–N5, V1–V4, R1–R6.

## Handoff for screen specifications and tickets

Use this architecture together with the binding contract. Every subsequent screen specification should identify its flow IDs, relevant contract requirements, default primary action, secondary entries, data dependencies, state variants, direct-entry behavior, and return behavior.

Carry these dependencies explicitly: supported prediction uncertainty and comparable trends; available plan-reference evidence in reviews; local versus online creation/import capabilities; durable import/queue status visibility; and additive query/anchor state. Where evidence or an operation is absent, specify the truthful fallback and record the capability gap rather than silently adding backend scope.

Validate the complete journey from launch to recent-session meaning, race interpretation, and next action before splitting work into tickets. The contract remains the acceptance authority; this document supplies the navigation and flow detail.
