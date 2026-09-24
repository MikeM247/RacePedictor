# Race Predictor Product Goals and User Intent

This summary translates `APP_INVENTORY.md` and `UX_AUDIT.md` into a practical UX north-star input for Astra.

## 1. Primary user types

### Primary: self-coaching runner

A runner preparing for a race who wants to understand current readiness, follow an approved training plan, review completed training, and decide what to do next.

Typical needs:

- Set a race goal and training constraints.
- Import or connect training history.
- Open recent training immediately and understand each session’s execution against the approved plan.
- See commentary on what the session result means for progress toward the goal.
- Understand whether recent data supports the current prediction.
- See today’s session or intentional rest clearly.
- Trust that plan changes are explicit and controlled.

### Secondary: analytical/coaching-oriented user

A runner or coach who wants deeper inspection of activity history, trends, prediction drivers, data quality, plan versions, and schedule-change history.

This is supported by the desktop-first analytical layout, but the current product is explicitly single-athlete and owner-controlled; a separate multi-athlete or role-based workflow is not established.

## 2. Main jobs-to-be-done

1. **Review recent training:** “What did I do recently, and how did each session go?”
2. **Understand execution against plan:** “How closely did I execute the prescribed session, and where did I differ?”
3. **Interpret goal impact:** “What does this result mean for my progress and race readiness?”
4. **Assess readiness:** “Given my goal and recent training, how ready am I?”
5. **Understand prediction confidence:** “What is the prediction, how reliable is it, and what evidence drives it?”
6. **Know the next training action:** “What should I do today, and why?”
7. **Track progress:** “Am I following the plan and moving toward the goal?”
8. **Maintain trustworthy data:** “Is my training history complete, current, and free of import problems?”
9. **Control the plan safely:** “What changed, what is approved, and what will affect Today and Calendar?”
10. **Keep the system connected:** “Are Strava, local sync, and Second Brain context current?”

## 3. Top five user questions the app must answer

1. **What should I do today?**
   - Show the current session/rest state, purpose, prescription, duration, status, and next action.

2. **How ready am I for my target race?**
   - Show the current prediction/readiness snapshot in the context of the active goal and recent training.

3. **How confident should I be in that prediction?**
   - Explain the evidence, key drivers, data completeness, freshness, and limitations without implying unsupported certainty.

4. **Am I progressing toward my goal?**
   - Connect the active approved plan, recent activities, calendar progress, and trend signals without inferring completion where matching is unavailable.

5. **What action should I take next?**
   - Make the next step explicit after an import, warning, stale state, missing plan, saved draft, failed sync, or plan-review decision.

## 4. Most important user outcomes

- The runner can identify today’s correct session or rest state within seconds.
- The runner can access recent training from the launch experience without first navigating through multiple screens.
- For each recent session, the runner can see a concise, evidence-bounded commentary covering execution against the plan and implications for the goal.
- The runner understands the current race prediction and its evidence limits.
- The runner can tell whether data is fresh and trustworthy before relying on analytics.
- The runner can move from goal definition to an approved plan without losing context between Race Predictor and Codex.
- The runner can inspect training history and understand what each activity contributes to readiness.
- The runner knows exactly what to do after success, warning, empty, stale, or error states.
- The runner can change future scheduling deliberately while preserving the approved source prescription and an auditable reason.
- The runner can use core daily, import, plan, and activity workflows on a small screen.

## 5. Current gaps between the app and those outcomes

### High

- Today contains the right ingredients but gives coaching, prediction, analytics, import status, and infrastructure freshness competing visual weight.
- Recent training is available through Activities and latest-activity feedback, but the launch experience does not yet clearly establish recent training review as a primary user task.
- Activity commentary is not consistently framed as a comparison between the executed session, the approved prescription, and the resulting effect on the goal.
- The relationship between asynchronous Coach’s review, activity detail, Today, and Calendar is not always obvious.
- The Plan → Codex → proposal JSON → review → approval journey is safe but fragmented and does not make the full sequence obvious.
- Manual import is placed under Data Quality rather than being discoverable as a primary training-history action.
- Prediction is embedded in Today and is not connected clearly enough to a goal, confidence explanation, or dedicated interpretation flow.
- Initial loading and failure behavior is not consistent across Today, Settings, and coaching pages.
- Mobile Calendar still preserves a wide grid structure and can require horizontal panning.

### Medium

- Import outcomes provide counts and warnings but not always a prioritized next action or destination.
- The distinction between active plan, saved draft, approved history, and selected historical version requires careful reading.
- Activities, Calendar, and Settings expose substantial detail without a consistent progressive-disclosure model.
- Local and online Settings differ materially, making connection and data-freshness responsibilities harder to locate.
- State terminology and visual treatments vary across page families.

### Low

- Older documentation references Overview and Performance, which can misdirect future product and design work.
- Technical terms such as “history fingerprint,” “Second Brain,” and “approval record” may need plain-language support.
- Navigation numbering and some decorative rail treatment do not directly support user outcomes.

## 6. Recommended product success measures

### Primary outcome measures

- **Next-action clarity:** percentage of usability-test users who can identify the correct next action from Today, Plan, Data Quality, and post-import states without prompting.
- **Today comprehension:** time for a returning runner to identify today’s session/rest state, purpose, and prescribed action.
- **Recent-training comprehension:** time for a returning runner to find the latest completed session and explain how execution compared with the plan and what it means for the goal.
- **Training commentary usefulness:** percentage of users who can correctly identify the key execution result, goal implication, and recommended next action from recent-session commentary.
- **Plan completion:** percentage of users who successfully move from goal entry to approved plan without abandoning or requiring support.
- **Prediction understanding:** percentage of users who can accurately explain the current prediction, confidence/freshness context, and major evidence limitations.
- **Data trust:** percentage of users who can correctly determine whether their current dataset is usable, stale, or requires correction.

### Flow and quality measures

- Manual import completion rate, including CSV/GPX validation outcomes.
- Rate of duplicate/rejected imports that receive a corrective action or re-upload.
- Time from successful import to the user viewing the updated activity history or Today context.
- Percentage of recent activities with available commentary that clearly separates executed result, comparison with the approved prescription, goal/training implication, and evidence limits.
- Time from app launch to viewing a recent-session execution summary.
- Rate at which users open a recent activity and then continue to the relevant plan, calendar, or next-action context.
- Proposal review-to-approval completion rate and abandonment rate.
- Calendar amendment completion rate, including reason capture and confirmation comprehension.
- Percentage of users who can distinguish active plans, drafts, and approved historical versions.
- Strava connection, backfill, and first-ingested-activity completion rates.
- Recovery rate after loading, stale, sync, import, and API errors.

### Trust, safety, and accessibility measures

- Zero cases where users believe an unmatched activity automatically completed a planned session.
- Zero cases where users believe importing a proposal or activity changed the active plan without approval.
- Percentage of tested workflows completed using keyboard navigation and supported mobile layouts.
- Accessibility defect rate for dialogs, focus return, status announcements, and form validation.
- Percentage of state messages that include an actionable recovery path where one exists.

## North-star statement

Race Predictor should help a runner answer, with trustworthy evidence, **“What did I do recently, how did I execute against the plan, what does it mean for my goal, how ready am I, and what should I do next?”** The experience succeeds when the runner can move from recent training evidence to confident action without confusion about prediction limits, plan authority, data freshness, or workflow state.

## Handoff summary for Astra

Design around the self-coaching runner’s decision loop: open recent training, understand execution against the approved plan, interpret the result for the goal, assess readiness, take today’s action, and know the next step. Preserve explicit plan approval, evidence-bounded interpretation, independent freshness, and single-athlete ownership. Prioritize a recent-training entry point at launch, clear execution-versus-prescription commentary, goal-impact interpretation, a workout-first Today, a legible Plan/Codex workflow, actionable import states, understandable prediction context, and mobile-safe daily workflows. Measure comprehension and successful task completion—not just page usage.
