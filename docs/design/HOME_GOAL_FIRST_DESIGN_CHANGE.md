# Home design change: goal, today's focus, latest activity

Decision date: 25 September 2026. Status: approved design direction for architecture and implementation planning; no UI implementation is authorized by this document alone.

## Authority and scope

This records the runner's later explicit Home decision. It amends [DESIGN_INTENT_CONTRACT.md](DESIGN_INTENT_CONTRACT.md) V1–V2, its Home layout rows, and R3. Wherever [UX_NORTH_STAR.md](UX_NORTH_STAR.md), [INFORMATION_ARCHITECTURE_AND_USER_FLOWS.md](INFORMATION_ARCHITECTURE_AND_USER_FLOWS.md) F01, or [SCREEN_SPECIFICATIONS.md](SCREEN_SPECIFICATIONS.md) Screen 2 specifies **Race outlook → Recent training → Next action**, use **Goal and milestone → Today's focus → Latest activity** instead. The revised binding contract records this precedence. Other rules in those documents remain applicable, including three primary destinations, direct detail access, truthful unavailable states, and explicit plan authority.

The affected default screen is Home (`/dashboard`). Readiness detail, Training/activity detail, Plan, and Calendar remain supporting destinations. This is a content and responsive-priority change, not permission to add a new prediction model or change plan semantics.

## Problem and desired outcome

The current Home can read like an analytics report: a large current-fitness half-marathon estimate and technical explanation lead, a queued latest-activity review follows, and today's intentional rest is below the initial screen. The screenshot establishes what was displayed, not whether an approved goal or milestone is absent from storage. The architect must determine whether that data exists and is disconnected from Home before proposing data changes.

The product should guide one self-coaching runner toward a race goal. It should reassure and motivate through explanations grounded in actual goals, prescriptions, activities, and supported assessment evidence. On arrival, the runner should know **what they are aiming for, what matters today, and what the latest training says**. If progress cannot be assessed, the page should explain why without turning uncertainty into a negative verdict. The runner may manually request analysis initially; automatic analysis is optional future work.

### Confirmed user requirements

- The active plan's marathon is the main goal. A half marathon with its own target time is the next milestone in the user's example. The design must support an approved main goal and a distinct next milestone; the example does not establish actual dates or target values.
- The runner is willing to develop the goal and plan in Codex, import the proposal, and explicitly approve it in the app. Import alone never activates a plan.
- Home order is goal/milestone, today, latest activity. Goal, today/next, and latest activity should be visible on a common desktop screen without scrolling.
- Home is designed phone-first: one column, compact summaries, no horizontal scrolling. The goal and today's focus should fit in the first common phone viewport; show a latest-activity preview there if feasible without reducing normal text size or accessibility. This is a review target, not an all-phone guarantee.
- Today's focus explains the approved workout or rest, what to focus on, its purpose, and how it serves the goal. On rest days it also identifies the next approved workout.
- Latest activity offers direct access and a concise planned-versus-done takeaway and supported goal implication, or its real review-pending state.
- The page retains Home / Training / Plan as primary navigation. Detailed prediction, uncertainty, trends, session analysis, and plan detail open from summaries.

### Non-goals

- No embedded in-app planning chat, autonomous goal/plan changes, automatic plan adaptation, or assumption that analysis runs automatically.
- No invented goal values, race-date forecast from a current-fitness estimate, on-track score, precise workout-to-race-time effect, or session completion inferred from date proximity.
- No fourth Home group or primary navigation destination, dense KPI grid, or raw prediction report on Home.
- No change to approval, schedule-edit, privacy, authentication, sync, or API semantics solely for presentation. Required data-contract work is a separately scoped architecture decision.

## Primary journeys

1. **Open Home before training:** read the approved main goal and next milestone, read today's approved workout or intentional rest, understand the purpose and focus, then open Calendar in one activation only if more prescription detail is needed.
2. **Open Home after training:** see the latest recorded activity by activity date immediately, even if commentary is pending. When a supported comparison is ready, read the concise takeaway and open the full session in one activation. The goal and today's focus remain above it.
3. **Inspect readiness:** read one conclusion and reason beside the goal. Open View readiness for estimate basis, uncertainty, trends, and caveats. Return to the same Home context. A current-fitness estimate is labeled as such and is not silently compared with a race-date goal.
4. **Establish or revise a plan:** follow Plan's Codex handoff, import a proposal as a draft, review it, then explicitly approve. Home updates only after the authoritative goal and plan are confirmed. A saved draft never appears as the active goal or today's prescription.

On a phone these journeys use the same order and named links, touch targets, and one-column reading flow. No hover, sideways pan, or collapsed disclosure is required to find today's focus. Detail replaces the summary view or opens through an accessible route/panel with an explicit return. The first phone viewport prioritizes orientation and today's decision; the latest activity remains directly below, with a preview visible where normal text and device size allow.

## Home information hierarchy and content contract

Exactly three persistent groups, in the same DOM and visual order at every width. Each independently loads or reports failure. The page may have one visually primary action for its current state; named detail links remain secondary. Use the approved goal and effective schedule as authoritative sources. Keep caveats adjacent to claims.

| Order | Group and minimum visible content | Direct detail |
|---|---|---|
| 1 | **Goal and milestone:** approved main race, date/target if available; next approved milestone and target if available; one short, honest progress conclusion and one evidence reason or the precise reason assessment is unavailable. The header stays slim. | View readiness for estimate, timeframe, uncertainty, trends, evidence; Plan for goal and approved plan details. |
| 2 | **Today's focus:** today's effective approved workout or intentional rest; purpose; practical focus cue; why it serves the approved goal. On rest days show the next approved workout and its date when known. | Open today's/next workout in Calendar or Plan schedule context. |
| 3 | **Latest activity:** latest recorded activity identity/date; a short planned-versus-done observation and bounded goal implication where a reliable linked prescription and review exist. Otherwise name the missing comparison or actual review state. | View session for full review, metrics, comparison, evidence, and limits; Training for other activities. |

Use compact, plain-language copy. Illustrative placeholders below are copy patterns, **not assertions about this runner or available data**:

> **Goal:** Marathon on [date] · target [time]. Next milestone: half marathon on [date] · target [time]. **Progress:** [supported conclusion or “We cannot assess progress yet”]. [One concrete evidence reason or missing-evidence reason].

> **Today's focus:** [approved workout title and prescription] / “Rest today.” Focus on [approved cue]. This [serves the goal by the plan's stated purpose]. **Next workout:** [title, date] when today is rest and one is scheduled.

> **Latest activity:** [activity name, date]. “[Recorded fact] against [linked approved prescription]” when that comparison is supported. “[Bounded interpretation for the goal, with limitation].” Or: “Review pending. Your activity is recorded; a plan comparison and goal implication are not ready yet.”

When a review is pending, show the real state (queued, waiting for local device, processing, attention, or failure if known) without implying a completion time. Avoid a technical device explanation unless it clarifies why the review is delayed or what the runner can do.

## Narrative and evidence rules

- Separate **recorded fact**, **approved prescription**, **plan execution comparison**, **generated interpretation**, **readiness estimate**, and **data freshness**. The summary must not blend them into an unsupported “on track” judgment.
- A positive or negative on-track conclusion requires an approved target, compatible assessment timeframe and distance, sufficiently relevant evidence, and a defined interpretation of the comparison. If those are unavailable, say what cannot be assessed and why. A current-fitness estimate alone is not a race-date forecast.
- Explain too easy, too hard, or on prescription only when supported by relevant prescribed and recorded dimensions and a trustworthy session link. Do not infer effort solely from pace or duration; absent sensor/context data may limit this judgment. Name the comparison basis and uncertainty in detail.
- Say what a session **suggests** for the training objective when evidence supports it; avoid a precise causal race-time gain or loss from one workout. A pending review yields no generated goal implication. Preserve measured facts and the approved next step.
- Prefer one meaningful reason near each conclusion. Keep material limitations beside the claim. Detail can contain longer analysis, provenance, prediction intervals when genuinely available, and technical diagnostics.
- Do not turn coaching commentary into an approved prescription, mark a session complete, or adapt the plan automatically. Analysis may be manually triggered where supported; the UI must reflect pending, ready, failed, and stale states from authoritative sources.

## Responsive and accessibility behavior

- At compact widths, use one column and 16px gutters consistent with the binding contract. Retain readable 16px body text, visible headings, essential caveats, and 44×44 CSS-pixel touch targets. Summaries should use spacing and concise content to fit, never truncated essential meaning or smaller text.
- At common desktop widths, use a compact connected reading sequence that exposes all three summaries in the first screen where feasible. Extra width may improve line length and internal layout, but the order stays the same and the page must not become three analytics dashboards.
- Review at 320, 390, 768, 1024, and 1440 CSS-pixel widths, 200% zoom, and representative phone viewport heights. Record which summaries are visible before scrolling and why any target is infeasible. No page-level horizontal overflow or clipped controls.
- Preserve semantic landmarks, one H1, logical headings, keyboard access, visible focus, text status in addition to color, adequate contrast, polite state announcements, reduced motion, and predictable return focus. Loading/refresh must not move sections, focus, or scroll.

## Required states and behavior

| State | Home treatment |
|---|---|
| Loading / refreshing | Keep all three group positions. Load independently. During refresh retain usable dated content and its age. Do not flash false empty states. |
| No approved goal | Say no goal is approved, link to Plan setup, and keep today's/recorded information that is genuinely available. A draft is labeled draft. No on-track claim. |
| Goal but no approved plan | Show the approved goal if it exists; say there is no approved workout schedule and provide Plan continuation. Do not present proposed sessions as today's plan. |
| No milestone / milestone target | Show the main goal; omit the milestone line or say a next milestone/target is not set as appropriate. Do not synthesize one from race distance or prediction. |
| No compatible prediction / insufficient evidence | Show the goal and an honest progress-unavailable conclusion with one reason. Keep any current-fitness estimate in readiness detail with its actual label and timeframe. |
| Stale goal, plan, activity, prediction, or review | Identify which source is stale and its relevant age where known. Preserve still-usable information and do not transfer one source's freshness to another. |
| Today's rest | Say rest is intentional when supported by the effective approved schedule, explain purpose from approved plan evidence, and show the next approved workout/date if one exists. No workout prescribed is not an error. |
| No activity | Say no activity is recorded; offer Add training through Training. Do not infer a missed workout. |
| Latest activity without reliable plan match | Show measured activity facts and “No planned session is linked” (or equivalent). Omit planned-versus-done and goal impact claims requiring that match. |
| Review pending / unavailable | Show latest activity and actual queue/processing/attention state; omit the unready interpretation and keep View session available. A manual trigger appears only if supported. |
| Group error | Name the failed source, retain the other two groups and any safe prior data, offer supported retry/recovery. Do not display failure as no goal, no plan, no activity, or poor progress. |

## Architecture and data questions to resolve before implementation

These are **technical investigations**, not confirmed defects or permission to fabricate fields:

1. **Approved main goal and milestone:** Locate authoritative active goal, plan version, race date/distance/target-time fields, and whether a separately targetable half-marathon milestone exists in the approved proposal and stored model. Determine whether Home already receives these fields or only fails to present them. If milestone target is absent from approved data, define an explicit proposal/approval and additive contract path; do not infer it from the current half-marathon estimate.
2. **Progress assessment:** Determine available prediction basis (current fitness versus race-date projection), supported distances/timeframes, uncertainty, freshness, and whether any documented on-track comparison exists. If there is no compatible comparison, implement the unavailable conclusion; do not derive an ad hoc verdict in presentation code.
3. **Today's purpose and next workout:** Confirm where approved session intent, focus cues, effective amendments, rest designation, plan timezone, and next scheduled session are available. If purpose is unavailable, use an honest short fallback rather than generated motivational copy presented as approved plan content.
4. **Session-plan relationship:** Identify whether the latest recorded activity has an authoritative link to the correct approved plan version and effective schedule, including amendments. A shared date alone is insufficient. Define the comparison dimensions and unresolved-match state before claiming too easy, too hard, or on prescription.
5. **Review availability:** Confirm persisted review status, summary, evidence reference, manual trigger capability, and local-device dependency. Home should reuse the same persisted review as activity detail and Calendar, without independently generated narratives.
6. **Surface contracts and failure isolation:** Check the existing Home/readiness/plan/activity data interfaces and loading behavior. Any new field or endpoint requires separate contract, privacy, migration, and compatibility review under `docs/CONTEXT.md`; this document does not select an implementation.

## Implementation implications and sequencing

1. Audit approved goal/milestone and Home data flow; record what is available, missing, or merely disconnected. Validate the example against actual authoritative records without exposing private values in design artifacts.
2. Define the minimum truthful Home view states and any additive data contract needed for approved goal/milestone, effective today/next schedule, evidence-backed progress, and linked review. Preserve version and freshness provenance.
3. Implement the three-group Home composition and named detail routes using current navigation and shared visual/accessibility rules. Keep detailed analysis on existing supporting surfaces.
4. Verify the approved-plan handoff, activity detail, readiness detail, and Calendar links still return to Home context. Update older F01/Screen 2 documentation or cross-reference this change in implementation tickets so its earlier order is not reused.
5. Validate representative real and controlled empty/pending/stale/error states, responsive layouts, and runner comprehension. An unsupported analytical capability is reported as a gap, not delivered as a confident UI label.

## Acceptance criteria for the change

- [ ] Home has exactly the three groups in the approved order in DOM and visual reading order at all widths; Home / Training / Plan remain the only primary destinations.
- [ ] A runner can identify the main approved goal, next approved milestone and its target when present, one supported progress conclusion/reason or precise assessment gap, and today's focus without opening detail.
- [ ] Today's approved workout/rest, purpose, practical focus, goal relationship, and next workout on rest days are accurate to the active version/effective schedule. A missing prescribed focus is labeled rather than invented.
- [ ] The latest recorded activity is shown by activity date even with review pending. A planned-versus-done takeaway and goal implication appear only when their references and evidence support them.
- [ ] Goal, today's schedule context, latest session, and readiness detail have named direct links; the latter three open in one activation from Home and return with context, scroll, and focus preserved.
- [ ] Current-fitness estimates, race-date assessments, uncertainty, plan execution, review state, and source freshness have distinct labels. No unsupported on-track verdict, causal workout effect, session match, or completion is shown.
- [ ] No-goal, no-plan, no-milestone, no-prediction, stale, rest, no-activity, review-pending, unmatched-session, loading, and group-error states are exercised independently. One group's failure leaves the other usable groups available.
- [ ] Common desktop viewport review checks all three summaries before scrolling. Common phone viewport review checks the full goal and today's focus plus a latest-activity preview where feasible; results include viewport dimensions and readable-text/accessibility trade-offs. Review 320/390/768/1024/1440 CSS-pixel widths and 200% zoom; no horizontal overflow.
- [ ] Keyboard, screen reader reading order/status, focus return, contrast, 44px targets, and reduced motion are checked. A short unprompted usability check verifies the runner can state the goal, today's action, latest-activity state, and principal uncertainty without confusing a draft or pending review with approval/completion.
- [ ] Implementation handoff records data gaps and any additive contracts, links to evidence for screenshots/checks, and updates the earlier F01/Screen 2 material if work proceeds.

## Decision log

| Decision | Reason | Superseded direction |
|---|---|---|
| Lead Home with the approved main goal and next milestone, one conclusion and reason. | The goal anchors the runner's daily decision; a large raw estimate does not. | Large Race outlook/technical estimate as the lead content. |
| Give today's approved workout/rest the main explanatory space, before latest activity. | The runner wants immediate practical and motivational guidance, especially on a phone. | Recent training receives the main Home explanatory space; Next action comes third. |
| Keep latest activity as the third compact group with direct access and truthful pending state. | Recent training remains easy to inspect without displacing today's focus. | Recent training as the second and visually dominant group. |
| Design Home phone-first while retaining desktop first-screen visibility targets. | The runner often checks on a phone; readability and accessibility remain binding. | Desktop-first Home emphasis inherited from earlier docs. |
| Treat progress and workout implications as evidence-bounded, and manual analysis as acceptable. | Reassurance must remain credible; no automatic analysis or causal certainty is established. | Any interpretation that would imply an automatic or unsupported verdict. |

## Sources and limits

Design context: [DESIGN_INTENT_CONTRACT.md](DESIGN_INTENT_CONTRACT.md), [UX_NORTH_STAR.md](UX_NORTH_STAR.md), [PRODUCT_GOALS_AND_USER_INTENT.md](PRODUCT_GOALS_AND_USER_INTENT.md), [INFORMATION_ARCHITECTURE_AND_USER_FLOWS.md](INFORMATION_ARCHITECTURE_AND_USER_FLOWS.md), [SCREEN_SPECIFICATIONS.md](SCREEN_SPECIFICATIONS.md), and [../CONTEXT.md](../CONTEXT.md). The current-production observations above come from the user's screenshots and discussion. They are a prompt to investigate data wiring, not proof of a missing goal record or a particular backend defect.
