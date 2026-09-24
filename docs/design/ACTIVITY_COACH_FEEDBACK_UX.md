# Activity coach feedback — UX proposal

Status: Design for review; not implemented or an amendment to the current screen specification.  
Date: 2026-09-08  
Skills: UX/UI Designer, followed by Architect.  
Companion: [End-to-end architecture](../plans/ACTIVITY_COACH_FEEDBACK_ARCHITECTURE.md).

## Design intent

After a workout, Mike should be able to understand what went well, how it relates to the intended session, and what to carry into the next workout. Feedback should sound like a coach who knows his training and personal context. It should explain its evidence, acknowledge gaps, and avoid grading every run as a success or failure.

The review runs on Mike's computer, using selected local knowledge-base material and ChatGPT/OpenAI analysis. It can appear later than the activity. Reading a workout never depends on a review finishing.

This proposal uses the existing Today, Activities, Calendar, Plan, and Settings routes. It follows the matte Night Ops style and the current activity-detail hierarchy. It adds neither a navigation destination nor an embedded chat.

## User Flow

1. An imported or synced workout appears in Activities and Calendar as it does today.
2. Its detail shows a small **Coach's review** section with **Waiting for review**. The workout metrics and other details remain usable.
3. A scheduled local job gathers the workout, applicable plan context, recent training, and selected Second Brain material. The user can continue using the app or close it.
4. Validated feedback becomes available in the app. A **New feedback** cue on the activity and a short Today preview help the user discover it.
5. Opening the activity shows a concise review directly beneath **Run at a glance**, followed by an expandable comparison and evidence section.
6. If the planned session is uncertain, the user can confirm a suggestion, choose another eligible session, or mark the workout unplanned. This queues an updated review; it does not change the plan or record completion.
7. Future plan changes continue through the existing deliberate planning and approval workflow.

Success: Mike can read the main takeaway and one useful next action within about 30 seconds, identify which plan the review compared against, and tell whether the feedback is current.

## Screen Breakdown

| Existing screen | Proposed placement | Behavior |
|---|---|---|
| Activities — `/dashboard/activities` | Full review inside the selected activity detail, after the four main metrics and before Additional telemetry | Primary home. Preserve the list, filters, scroll position, and selected row. |
| Calendar — `/dashboard/calendar` | The same review within each activity record in the date information dialog | Reuse the activity content and review data. Keep the current active-plan section below the activity records. |
| Today — `/dashboard` | One compact **Latest workout feedback** preview after today's approved session/rest card | Show activity/date, one takeaway, generated time, and **Read feedback**. Today's prescription retains priority. |
| Plan — `/dashboard/plan` | Existing plan workflow, reached through **Review plan with Codex** when relevant | Opens a planning handoff containing the review reference. It never starts a proposal or activates a plan on navigation. |
| Settings — `/dashboard/settings` | **Workout feedback** section beside local-device/Second Brain setup | Enabled state, selected source categories, requested cadence, verified runner status, last successful review, and pending count. |

Activities may gain an additive deep link, `/dashboard/activities?activityId=<id>#coach-review`. This is proposed behavior, not an existing contract. Following it loads the target even outside the current list page, preserves filters, and moves focus to the review heading after loading. A missing/deleted activity gives a recoverable message and return to history.

### Activity detail wireframe

Illustrative content below uses synthetic values, not Mike's actual workout or plan.

```text
ACTIVITIES                         SELECTED ACTIVITY
Filters and workout list           Morning easy run · 8 September
                                   Run at a glance
Selected run   New feedback         8.2 km    48:10    5:52/km    +70 m

                                   Coach's review             AI-generated
                                   Reviewed 8 September, 09:15

                                   A little longer than planned
                                   You ran 48 minutes against the planned
                                   45. The extra three minutes are the clearest
                                   difference; pace alone cannot tell us
                                   whether this stayed an easy effort.

                                   Next time, use the 45-minute duration
                                   as your stopping point for this session.

                                   Compared with: Tuesday easy run
                                   Suggested match · [Confirm] [Change]

                                   [Compare with plan ▾]
                                   [What informed this ▾]
                                   [Request updated feedback]

                                   Additional telemetry
                                   Splits
                                   Route
```

Use one ordinary bordered section, restrained violet for the AI label, and the existing semantic text/status colors. Avoid a score ring, decorative gauges, large hero treatment, or a new visual system.

### Review content

Default expanded content is approximately 100–180 words, with a hard maximum of 250 words for the main narrative:

- **Headline:** one specific takeaway, ideally under ten words.
- **Coach's assessment:** two short paragraphs addressing execution and its place in training. Use meaningful metrics rather than repeating all the telemetry.
- **Next time / Next step:** one concrete suggestion consistent with the approved plan. If advice depends on unknown effort or symptoms, make that dependency clear.
- **Comparison reference:** session title/date, plan display version or approval record, and match status. Never invent a coaching version label.
- **Evidence limitations:** a short visible line only when material, such as “No heart-rate or effort reflection available.”

The voice is direct, personal, measured, and encouraging when supported by the workout. Prefer “You ran three minutes longer than planned” to “You failed your duration target.” Avoid generic praise, unsupported readiness claims, diagnosis, or a prediction change based only on the generated narrative.

**Compare with plan** expands to a compact table:

| Measure | Planned | Recorded | Interpretation |
|---|---|---|---|
| Duration | 45 min | 48 min 10 sec elapsed | About 3 min longer; elapsed time includes stops |
| Distance | Not specified | 8.2 km | No distance target to compare |
| Effort | RPE 3/10 | Not recorded | Effort cannot be assessed |

Only use data genuinely available. Label moving and elapsed time explicitly. Do not equate heart rate with perceived effort. The existing plan has free-text prescriptions; exact pace zones and interval execution may be unavailable for structured comparison.

**What informed this** reveals the activity revision/time, comparison plan/session, comparison date, recent-history window, and human-readable source categories such as “Running preferences” or “This week's reflection.” It separates measured facts from coach interpretation. It does not expose local paths or private note excerpts online. Local provenance can offer **Open source note** only when a verified local integration is available; otherwise omit the action.

### Calendar and plan meaning

Keep the existing current-active-plan Calendar policy. New comparisons use sessions from the current active plan and capture the selected version when generated. Do not silently search retired plans for a historical match.

An already-generated review may refer to a plan that has since been retired. Label it **Based on a previous plan** and offer an updated review. Its saved evidence stays readable as history; it is not another scheduled-plan section in Calendar. This historical-review treatment is a proposed extension to approve with this feature.

Same-date activities and sessions remain separate records. Each activity gets its own review. Do not give a whole day a “completed” badge because feedback exists. For races, use the same activity surface; race-specific target comparison is available only when supported by explicit goal/session context, not inferred solely from the activity title.

## Key Interactions

### Planned-session association

- Show **Suggested match** when the deterministic matcher finds one suitable candidate; phrase advice as comparison with that session, not proof it was performed.
- **Confirm** records that this was the intended session. It does not certify full completion or adherence.
- **Change** expands an inline selector with eligible sessions from the active plan, their effective date and prescription, plus **Unplanned workout**. A chosen neighboring date must be explicit; do not automatically attach a run to a nearby day.
- Two plausible sessions produce **Choose a planned session**. A general workout review can still be delivered while the plan comparison is unresolved.
- A confirmed session already associated with another activity presents that conflict. The first release does not silently combine warm-up, main set, and cool-down files.
- Save shows **Match saved · Updated feedback queued**. Keep the old review with **Based on the previous match** until a replacement passes validation.
- Revision conflicts retain the user's visible selection, explain that the plan changed, and offer reload before saving again.

### Refresh and scheduling

**Request updated feedback** queues work and returns a durable acknowledgement. It never suggests that the browser started an AI model on the PC. Repeated clicks while the same request is pending reuse that request.

Settings distinguishes requested frequency, a prepared scheduler handoff, and confirmed external scheduling. Suggested starting cadence is hourly in `Africa/Johannesburg`; the existing local sync retains its own default 15-minute interval. These are proposed defaults. Do not show an exact next run unless a scheduler has reported it, and never promise arrival while the computer/app is unavailable.

Enabling setup explains that selected local context is sent to the chosen AI provider and a derived review is saved to RacePredictor. Source selection happens locally; cloud Settings shows approved categories and status. Pausing feedback stops new generation but preserves published reviews and workout sync. It does not silently claim that an external automation has been removed.

### Discovery and attention

Only a newly published revision creates **New feedback**. Opening the expanded review marks that revision read; background fetching does not. Today selects the latest activity with available feedback by activity date, not an old backfilled activity that happened to finish processing last.

Pending status remains within the activity or Settings. Do not issue a notification for each polling cycle. A future scheduler may notify on new feedback or an actionable failure if enabled; app push/email/SMS are outside this slice.

## Edge Cases

| State | Athlete-facing treatment | Available action |
|---|---|---|
| Not enabled | “Workout feedback is not set up.” | Set up feedback |
| Waiting for local pickup | “Waiting for your computer to review this workout.” | View setup; request remains durable |
| Claimed job with fresh lease | “Review in progress.” | Keep reading activity; no progress percentage |
| Worker heartbeat expired | “The review has been delayed.” | View status; automatic recovery remains possible |
| Generated locally, upload pending | “Feedback is waiting to sync” only if that status reached the cloud | Retry publication through runner; avoid claiming unseen local state |
| Ready | Narrative, plan reference, review time | Expand comparison/evidence; request update |
| Limited evidence | Ready review plus the specific missing input | Read usable feedback; add context in Second Brain |
| No active/applicable plan | “Workout review only — no planned session linked.” | Read review; optionally choose an eligible session |
| Ambiguous match | “Choose a planned session for a plan comparison.” | Choose or mark unplanned |
| Inputs changed | Previous review remains, labelled with what changed | Request update; bounded automatic refresh where configured |
| Retryable failure | “We couldn't finish this review. It will be retried.” | Retry request, deduplicated |
| Repeated/configuration failure | Concise reason such as “Local job needs attention.” | Open Settings; preserve metrics and older review |
| Read request failed | “Feedback couldn't be loaded.” | Retry only this section |
| Historical import | “Not reviewed yet.” unless explicitly queued for backfill | Request review |
| Unsupported sport | “Coaching feedback is currently available for running activities.” | Keep full activity detail |
| Deleted activity | No orphaned feedback or stale Today preview | Return to activity history |

## UX Risks

1. **Review mistaken for a plan change.** Keep “Next step” advisory; do not add Apply buttons. Plan changes retain the existing proposal/approval boundary.
2. **A plausible story outweighs weak evidence.** Keep match status and important missing evidence visible, with traceable comparisons. Avoid numerical confidence scores without calibration.
3. **Long feedback overwhelms the narrow detail panel.** Keep the main review concise, expand evidence on demand, and stack comparison rows on smaller screens.
4. **Private context leaks into public-looking UI.** This remains an authenticated owner view; publish a constrained derived review, not source excerpts or note titles. Sensitive context belongs in the local evidence record.
5. **The user thinks the PC is processing when it is off.** Display “Waiting” based on queue state and “In progress” only from a current claimed job, never from a saved preference.

## Handoff Notes

- Reuse the activity content composition currently shared by Activities and Calendar. Supply a separately loaded review view model so review errors cannot turn into activity-detail failures.
- Today must fetch its preview independently of the approved-session card. Read status and badge summaries in batches rather than one request per activity row.
- Desktop: retain the list/detail structure and existing panel sizing; give narrative a readable line length. Tablet/mobile: use the existing return-to-list behavior; comparison rows become stacked labelled values without horizontal page scrolling.
- Use semantic headings, labelled native buttons, visible focus, status text in addition to color, and polite announcements for genuine state transitions. Do not repeatedly announce polling results or the entire review. Match selectors must be keyboard accessible; closing returns focus to their launch control.
- Respect reduced motion and 200% zoom; the review should not trap scrolling inside another scroll pane in the Calendar dialog.
- Validate identical review revision/content across Today, Activities, and Calendar; delayed generation; no plan; ambiguous match; obsolete plan; multiple activities; missing sensors; failed upload; and a narrow viewport.
- Update `docs/design/screens.md` and `docs/UI_UX_SPEC.md` only when the proposal is adopted for implementation. Resolve their current exclusion of automatic post-run reviews explicitly while preserving the prohibition on autonomous plan changes.
- Remaining configuration decisions: exact local source allow-list, cadence, provider/model, and whether historical backfill is wanted. The architecture supplies defaults so these do not prevent design review.
