# Race Predictor UX North Star

Strategic direction for Astra · 12 September 2026

For binding redesign implementation rules and acceptance checks, follow [DESIGN_INTENT_CONTRACT.md](DESIGN_INTENT_CONTRACT.md). It takes precedence for redesign UX decisions; this document supplies the strategic rationale.

Sources: [App inventory](APP_INVENTORY.md), [UX audit](UX_AUDIT.md), and [Product goals and user intent](PRODUCT_GOALS_AND_USER_INTENT.md). This document describes the intended experience; it is not an implementation backlog or evidence that the proposed capabilities already exist. Audit findings are design inputs, with technical and responsive claims requiring validation during detailed design.

> Open Race Predictor, understand your recent training and race outlook at a glance, and see one clear next action. Explore more only when you need it.

Simplicity is a governing requirement: few choices, concise information, and predictable navigation. The responsibilities below describe what the experience must answer, not a requirement to display every answer, control, or detail at once.

## 1. Target user experience

The primary user is a runner managing their own training toward a race goal. Deeper analysis serves the same runner when they want to investigate the evidence; it does not require a separate coach or multi-athlete experience.

On launch, the runner should encounter a short, connected account of their training:

1. **My target and current outlook:** the race distance, date, desired outcome, and what the available evidence supports about being on track.
2. **My recent training:** a short summary of the latest recorded session, explaining execution against the relevant prescription and implications for the goal, with direct access to other recent sessions.
3. **My next action:** one prioritized action, normally today's approved session or rest. When a review or data correction is needed first, explain why it takes priority.

The initial view has these three compact information groups. Confidence and the most consequential caveat sit within the outlook; they do not become additional dashboard panels. Show a short conclusion and supporting reason in each group, with a clearly named way to open detail. Detailed metrics, earlier activities, and technical diagnostics remain accessible through the relevant summary.

This refines the earlier “workout-first Today” direction: recent training review is a primary launch task alongside today's prescription. It must not be buried beneath prediction charts or operational status. Use a compact goal summary to orient the runner, then give recent-session commentary the main explanatory space and keep today's action easy to reach.

If evidence is incomplete, the runner should understand what is known, what cannot yet be assessed, and what would help. Missing data must never read as poor performance. A runner without an approved plan can still review training and supported predictions.

## 2. Core UX principles

1. **Connect evidence to the goal.** Every prominent insight should explain its relevance to the selected race or training objective. Keep the target visible when interpreting predictions or comparing periods.
2. **Explain before expanding.** Lead with a concise conclusion and supporting reason. Keep metrics, splits, trends, and source data in optional detail, with no chain of nested disclosures needed to understand the answer.
3. **Give different concepts distinct meanings.** Plan adherence describes execution against a prescription. Readiness describes evidence about the race objective. Prediction confidence describes uncertainty in the estimate. Data freshness describes how current the inputs are. One cannot substitute for another.
4. **Keep uncertainty beside the claim.** Show a supported range and its meaning when available. Explain confidence limits and influential assumptions in plain language. Avoid invented percentages, readiness scores, or guarantees.
5. **Offer one clear primary action per screen or workflow step.** Prioritize following the plan, resting, reviewing a session, correcting data, or discussing a change as appropriate. Supporting links remain quieter. Continuing as planned is a valid outcome and does not require an unnecessary button.
6. **Make consequential changes deliberate.** Commentary informs the runner; approved plans and schedule changes remain under the runner's control.
7. **Protect attention through consistent hierarchy.** Use the same language and presentation for equivalent actions and states across screens. Promote warnings according to their effect on the decision.
8. **Support the daily decision on a phone.** Recent-session review, readiness interpretation, today's action, and essential recovery flows must work with touch, keyboard, and assistive technology.
9. **Reduce decisions through useful defaults.** Start with the active race goal, recent training, and the current schedule. Show filters and advanced options when requested or relevant, rather than asking the runner to configure each visit.
10. **Make navigation predictable and smooth.** Use a small, stable set of destinations, meaningful labels, and consistent back behavior. Preserve the selected item, filters, scroll position, and keyboard focus when returning from detail. Favor responsive feedback and stable content over decorative transitions.

## 3. Primary user journeys

| Journey | Experience | Successful outcome |
|---|---|---|
| Return after training | Launch → read latest-session execution and goal-implication summary → open comparison or other recent sessions only if needed | Runner can explain how the session went and what it means, including any uncertainty. |
| Check race readiness | Read the goal outlook and confidence summary → open supporting trends and assumptions if needed | Runner understands whether the evidence supports the goal and how strongly. |
| Prepare for today | Launch → find approved session/rest → understand purpose and prescription → inspect Calendar if needed | Runner knows what to do without mistaking commentary for an approved change. |
| Establish a goal and plan | Define target and constraints → add history as needed → prepare context → continue in Codex → return to saved draft → review differences → explicitly approve | Runner understands the full sequence, current step, and which plan is active. |
| Add or recover training data | Enter from recent training/Activities → upload CSV or single-activity GPX, or connect/import from Strava → inspect results → view accepted activities or resolve issues | Runner knows what arrived, what needs attention, and whether commentary or analytics are still processing. |
| Adjust the schedule | Open planned session → inspect effective prescription → propose permitted change with reason → review consequences → confirm | Runner sees the updated schedule and can recover the original prescription and change history. |

Session commentary follows a consistent reading order: **what was recorded → how it compares with the relevant plan → what that suggests for the goal → what to do next → evidence limits**. When the session-to-plan relationship is uncertain, show that limitation explicitly. A session can support a training objective without proving a measurable improvement in race performance.

This is an explanation pattern, not five compulsory panels or navigation steps. Summarize it in a few sentences and reveal supporting evidence on request. Planning and import flows present only the choices relevant to the current step, with a visible way to resume.

## 4. Key screens and their purpose

Organize primary navigation around three destinations: **Home, Training, and Plan**. Home answers the immediate questions; Training contains recorded activities; Plan contains the goal and future schedule. Calendar is a view within Plan. Settings is a secondary utility entry, and data-quality recovery is reached from the affected training or prediction. Final labels and route mappings can be validated during detailed design; the screen responsibilities below must not become seven equal navigation choices.

| Screen or surface | Primary purpose | Information priority |
|---|---|---|
| Home / evolved Today | Orient the returning runner and support the next decision | Three compact groups: race outlook with confidence; latest-session commentary with access to recent training; one prioritized next action. |
| Race readiness and prediction detail | Explain the race estimate and whether the goal is supported | Open from the Home outlook. Target comparison, supported uncertainty, relevant trend, and evidence. Full assumptions and provenance are optional detail, with consequential caveats retained in the summary. |
| Activities and session detail | Review training and understand execution | Recent history; concise review; relevant planned-versus-recorded comparison; goal implication; expandable metrics and evidence. Import is available in this workflow. |
| Goal and Plan | Establish intent and manage the authoritative training plan | Settled goal and active plan first; explicit creation/review stages; draft differences and approval; historical versions on demand. |
| Calendar within Plan | Understand the schedule and inspect permitted changes | Clear distinction between planned sessions and recorded activities; concise daily summaries; contextual detail and change history. Compact screens favor an agenda. Today's session also links directly to its schedule context. |
| Data Quality | Explain limitations and support recovery | What is affected; why it matters; supported corrective action; import and processing detail. Accessible from affected predictions and activities. |
| Settings and connections | Manage preferences and supporting services | Preferences, Strava connection, reminders, and local context/sync grouped by user purpose. Explain local/online capability differences at the relevant action. |

## 5. What the redesigned app should make easier

- Find the latest recorded training immediately after launch and reach earlier recent sessions without searching through diagnostics.
- Understand execution commentary without reading a full activity record or interpreting raw telemetry.
- Trace an assessment back to the relevant activity, prescription, goal, and time period.
- Compare the race target with the prediction while distinguishing current evidence from any supported race-date projection.
- Understand why confidence is limited and whether there is a practical action that could improve the evidence.
- Move from an imported activity to visible history, pending/ready commentary, and the next useful action.
- Resume an interrupted planning workflow and distinguish drafts, active plans, and historical approvals.
- Recover from missing or delayed data while continuing to use available training and plan information.
- Reach the daily answer without selecting filters or visiting several screens; open relevant evidence directly and return to the same place.

## 6. What to remove, simplify, or deprioritise

| Treatment | Direction |
|---|---|
| Remove from primary presentation | Decorative navigation numbering, repeated technical identifiers, duplicate status messages, always-open filter bars, and multiple equally prominent action buttons. |
| Simplify | The external planning handoff into understandable stages with a clear return point; dense session reviews into a summary with expandable evidence; version terminology into plain explanations. |
| Deprioritise on launch | Healthy sync/device details, import counters, full plan history, exhaustive telemetry, and undirected trend charts. Retain access where they help investigation. |
| Simplify navigation | Use Home, Training, and Plan as primary destinations. Keep Calendar within Plan, prediction detail within the outlook journey, and Settings/Data Quality secondary. Avoid competing menus and unnecessary intermediate screens. |
| Defer | Multi-athlete management, embedded AI chat, automatic plan adaptation, decorative readiness gauges, and additional dashboard modules without a clear user question. |

The existing dark visual identity can continue. Typography, contrast, spacing, and information hierarchy should establish importance; accent colors supplement explicit meaning.

## 7. Design risks and trade-offs

- **Recent training versus today's workout:** both are frequent launch intents. Reserve immediate access for both; emphasize newly available commentary without hiding the prescribed session or changing navigation unpredictably.
- **A simple outlook versus false certainty:** “on track” is useful only when tied to a defined goal and adequate evidence. Use a supported explanation or an explicit inability to assess when those conditions are absent. Do not imply race-date forecasting from a current-fitness estimate.
- **Goal-impact commentary versus unsupported causation:** one workout cannot establish a precise race-time gain. Explain what it suggests about training execution or a broader trend, and identify what remains unproven.
- **Plan comparison versus uncertain matching:** dates alone do not prove that an activity fulfilled a prescription. Comparisons must identify their reference and reliability, including relevant plan versions and amendments.
- **Clarity versus transparency:** summaries should reduce reading effort while keeping material caveats visible. Place full provenance and diagnostics one level deeper.
- **Fewer choices versus discoverability:** use explicit detail links and direct access from the relevant summary. Do not hide frequent actions behind generic menus or make the runner navigate through several levels to reach them.
- **One primary action versus user control:** visually prioritize the most relevant action while keeping legitimate alternatives available. A recommendation must not force a plan change or block access to recent training.
- **Fast access versus asynchronous review:** display newly recorded activity immediately; show commentary as pending, unavailable, or ready separately. A local review delay must not hide cloud activity data.
- **Desktop depth versus mobile usability:** retain rich investigation on desktop and provide concise summaries, agenda access, and progressive disclosure on mobile.

Before detailed design, validate which prediction uncertainty, trend, and plan-comparison evidence is actually available. These capabilities determine truthful copy and states; the north star does not assume a new analytical model already exists.

## 8. Non-negotiable UX decisions

1. Recent training and session commentary are directly accessible on launch, alongside a clear route to today's approved session/rest.
2. The race target and assessment timeframe accompany readiness and prediction claims. If either is missing, say what can still be assessed.
3. Prediction uncertainty, influential assumptions, and material data issues are visible with the assessment. Unsupported confidence scores and goal-impact claims are excluded.
4. Recorded activity, plan comparison, coaching interpretation, and approved prescription remain distinguishable. Commentary never silently marks completion or changes a plan.
5. Importing history, publishing context, and reading or importing a draft never activate a plan. Activation and permitted schedule changes have explicit consequences and confirmation.
6. Loading, no data, pending review, failed request, stale information, and successful completion have distinct meanings and useful next steps. Errors must not masquerade as empty history or “no active plan.”
7. Available information remains usable when another source fails. Activity, prediction, review, and context freshness are identified independently.
8. Core journeys work on narrow screens and with keyboard navigation, readable contrast, visible focus, and announced status changes. Understanding a week must not require a wide desktop grid.
9. The product remains centered on one runner's goal. Technical setup and operational detail receive prominence only when they affect that runner's task.
10. Home presents three compact information groups and one clear primary action at most. The five core user questions must be answerable through this summary and its directly linked detail, without five separate dashboard modules.
11. Primary navigation is organized around Home, Training, and Plan. Supporting screens do not receive equal navigation weight; the structure and labels remain stable across visits and devices.
12. Detail opens with context and a predictable return path. Returning restores the runner's place; loading and refresh must not unexpectedly reset the view or reorder content. Animation respects reduced-motion preferences.

## Handoff to Astra

Build a simple experience around **recent training → execution against plan → meaning for the race goal → confidence → next action**. Express this through three compact Home groups, one prioritized action, and three primary destinations: Home, Training, and Plan. Put deeper evidence and supporting tools behind clear contextual links, with reliable return behavior. Evaluate concepts by whether a runner can explain their latest session, the race outlook and its limits, and the next action without prompting or unnecessary navigation. Use the product-goals document's comprehension and task-completion measures to compare designs.
