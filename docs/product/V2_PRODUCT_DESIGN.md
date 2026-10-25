# V2 Product Design: Conversational Running Coach

Status: Product proposal for future design and delivery; not implemented.\
Date: 22 October 2026\
Companion: [Suggested first iteration](V2_FIRST_ITERATION.md)

Visual reference: [V2 flow diagrams](V2_FLOW_DIAGRAMS.md)

UI/UX exploration: [Three visual directions](../design/v2-concepts/README.md) · [Screen design brief](../design/V2_SCREEN_DESIGN_BRIEF.md)

Approved visual design: [AI Companion layout and architect handoff](../plans/V2_AI_COMPANION_DESIGN_HANDOFF.md)

## 1. Product vision

RacePredictor V2 starts with a conversation with your coach. When you open the app, the coach helps you reflect on your last training session or prepare for your next one, using your agreed race goal, current training plan, recorded activities, and the context you choose to share.

The conversation leads naturally into the existing Calendar and race plan. Those views remain the places to inspect the schedule, understand the training progression, and manage agreed changes. You can reach them directly without completing a conversation.

**Product promise:** Every visit helps you understand where you are in your training, what matters now, and what to do next.

## 2. Problem and intended outcomes

The current product provides the training information and management tools, but the athlete must connect the last activity, today's wellbeing, the next session, and the race plan. V2 makes that connection through an ongoing coaching relationship.

The athlete should be able to:

- Understand what the last session means, with an opportunity to explain how it actually felt.
- Prepare for the next session and understand its purpose within the race plan.
- Discuss constraints such as time, fatigue, equipment, or travel.
- Move from advice to the exact activity, session, calendar date, or plan being discussed.
- See the difference between a coaching suggestion and an accepted change to the schedule.
- Return later without having to repeat the entire conversation.

The primary user remains one runner managing training toward a race. Multi-athlete coaching, team management, and a separate coach workspace are outside this proposal.

## 3. Existing foundation and proposed change

The current navigation has Home, Calendar, and Readiness as primary destinations, with Settings secondary. Race-plan management and activity history retain their existing routes. Home already presents approved goal context, the next workout, latest activity, and an optional wellbeing interaction. Activity reviews and plan creation include existing asynchronous or external coaching workflows.

V2 proposes replacing the default Home interaction with an in-app coaching conversation. This introduces a new capability: genuine multi-turn conversation inside RacePredictor. A static greeting or a link to Codex alone would not fulfil this direction.

This proposal changes the intended entry experience; it does not describe a shipped capability. Older Phase 1 documents explicitly defer embedded chat, and the current design contract prescribes a different Home composition. When implementation begins, record the adopted V2 scope as a dated design-contract amendment and update the relevant architecture decision. This documentation task leaves the existing implementation and its specifications intact.

The current app remains authoritative for recorded activities, the approved goal, approved plan, effective calendar sessions, and saved wellbeing records. Conversation history adds context; it does not become another active plan.

## 4. Product structure

| Surface | Athlete's question | Responsibility in V2 |
| --- | --- | --- |
| Coach, the proposed default Home | What matters now, and what should I do next? | Ongoing conversation, reflection, preparation, explanation, and contextual actions. |
| Calendar | When am I training, and how does it fit my week? | Existing schedule, planned and recorded items, session detail, and permitted calendar changes. |
| Race plan | What am I working toward, and how does training build toward it? | Existing approved goal, plan progression, milestones, proposal review, and plan management. |
| Readiness | What does the available evidence say about my current fitness and race outlook? | Existing analytical evidence, with its timeframe and limitations. |
| Activity detail | What happened in this session? | Recorded facts, splits, available coach review, and comparison evidence. |
| Settings | How do I manage supporting services and preferences? | Existing connections, wellbeing journal, preferences, imports, and supporting management entry points. |

Keep Calendar and Readiness directly accessible. Give the Coach a persistent **View race plan** link. Preserve existing routes and bookmarked destinations. A new primary Race Plan tab is not required to validate the experience.

## 5. End-to-end athlete journey

```text
Open app
   |
Coach: orient to the race goal and current training context
   |
   +-- Reflect on last training --> Discuss execution and how it felt
   |
   +-- Prepare for next training --> Explain purpose and discuss readiness/constraints
   |
   +-- Ask another question ------> Follow the athlete's chosen topic
   |
Open the relevant activity, session, Calendar, or race plan
   |
Review any proposed change through the existing explicit workflow
   |
Return to the conversation with the selected training context
   |
Train outside the app --> Activity recorded --> Reflect and prepare again
```

### Arrival and orientation

The first view provides a short goal reminder, the relevant last activity and next session, and one useful coaching opening. It should work before the athlete types. Avoid an empty chat box that requires the athlete to discover what to ask.

Example copy throughout this document is illustrative, not a statement about the athlete's actual training.

| Situation | Suggested opening and next step |
| --- | --- |
| Recent activity with an unresolved reflection | “How did your last run feel compared with what you expected?” Offer **Reflect on last training** and **Prepare for next training**. |
| Training today or an upcoming session, with no outstanding reflection | “Your next session is an easy run. Would you like to go through its purpose?” Open the exact session on request. |
| Prescribed rest | Explain the approved recovery day and offer a look ahead to the next session. Do not turn rest into a prompt to add training. |
| A scheduled session has no matching record | “I don't have a recorded activity for that session. Did you train?” Do not declare it missed. |
| Multiple plausible activities or planned sessions | Identify the choices and ask which one the athlete wants to discuss. Do not silently assert a match or completion. |
| No approved plan or race goal | Explain what is available and link to existing plan setup. Keep recorded activities usable. |
| New or incomplete activity data | State the known gap and allow the conversation and schedule to remain useful. |

The athlete can change topic at any point. Conversation is the default starting point, not a gate before using the rest of the app.

### After your last training

1. Identify the recorded activity and its date; make the selected context visible.
2. Use available recorded facts and any current activity review. Keep measured facts, the athlete's account, and coaching interpretation distinguishable.
3. Ask a focused follow-up about effort, execution, or an issue the athlete raises.
4. Explain one useful takeaway and its relevance to the upcoming training, within the available evidence.
5. Offer **View activity**, **View next session**, or **View calendar** as appropriate.

A record on the same date as a planned workout does not prove that workout was completed. An unavailable or pending review does not prevent discussion of the facts or the athlete's reflection.

### Leading up to your next training

1. Resolve the next session using current effective calendar state and the athlete's saved timezone.
2. Explain what is planned and why, using the actual supplied prescription and purpose.
3. Let the athlete share how they feel and whether the session fits their circumstances. Reuse a saved daily wellbeing answer without repeatedly asking for it.
4. Answer questions or discuss an alternative if appropriate. Make any proposed departure from the plan explicit.
5. Offer **View session**, **View calendar**, or **View race plan**. The athlete can leave ready to train without making a change.

### From conversation to Calendar and race plan

Actions open the precise selected record where supported, rather than a generic destination. Preserve existing activity dialogs and calendar interactions. Returning restores the conversation and the item being discussed.

V2 should also allow **Discuss with coach** from session, activity, and race-plan views. This returns to the same conversation with an explicit context reference; it does not create a competing coach or duplicate plan. Reciprocal entry points can follow the initial delivery.

### When the athlete wants to change training

The coach explains the suggested change and its rationale. A recommendation remains advisory until the athlete completes the appropriate existing action:

- Eligible future-session changes use the current reasoned amendment workflow, preserving the approved original and change history.
- Goal, plan structure, or other changes outside that workflow use the existing proposal and approval process.
- Current-day and past-session restrictions continue to apply. The coach must not promise an edit that Calendar will reject.

Only a confirmed saved result permits “Your schedule has changed.” A conversational “yes” alone does not apply a change in the first iteration.

## 6. Conversation continuity and trust

- Maintain an ongoing, athlete-scoped conversation with explicit references to the activities and sessions discussed. Returning should resume it; dates and context distinguish visits.
- Recheck current goal, plan, session, and activity state when answering. Old messages remain history, not current prescriptions. Flag material changes when an earlier recommendation no longer applies.
- Keep the next approved/effective session and direct navigation usable when chat is loading or unavailable.
- Use only context available to the product and approved for the coaching service. Do not imply access to private Second Brain notes, live sensors, or a completed review without an actual supported source.
- Save a statement such as “I felt tired” as conversation content. Structured wellbeing or calendar changes require their own explicit, confirmed save.
- Keep recovery and race claims proportional to evidence. Do not infer injury diagnoses, race readiness, session adherence, or improved predictions from conversational wording alone.
- Use the saved IANA timezone, defaulting to Africa/Johannesburg where none is supplied, for today, session dates, and rollover.

## 7. Delivery direction

| Stage | Product capability | Boundary |
| --- | --- | --- |
| Suggested first iteration | In-app conversation for last-session reflection and next-session preparation, with persistent context and direct links into existing views. | Read-only coaching; existing explicit forms retain all structured changes. See the companion scope. |
| Subsequent iteration | Discuss-with-coach entry points from Calendar, activity detail, and race plan; richer review of proposed adjustments. | Preserve current amendment eligibility, reasons, history, and approval authority. |
| Later V2 expansion | Weekly reflection, race-phase discussions, and more personalised continuity from deliberately selected context. | Scope only after first-iteration evidence; no commitment to autonomous plan changes. |

Live workout tracking, GPS recording, between-set guidance, voice coaching, new notification channels, and a new prediction model are outside this product direction's initial scope.

## 8. Measures of success

Evaluate the quality of the coaching journey, rather than rewarding longer chats:

- Athletes can explain their next session and its purpose after a short visit.
- Athletes can reflect on the last session without re-entering facts the app already holds.
- Contextual actions reach the correct activity, session, date, or plan, and return preserves the conversation.
- Athletes understand whether advice has changed their schedule.
- Calendar and race-plan use remain straightforward for athletes who prefer to navigate directly.
- Chat failures do not block training information or existing management actions.

Establish quantitative baselines during a pilot. Conversation length and number of messages are diagnostic measures, not primary success metrics.

## 9. Reference documents

- [Current binding design intent and dated amendments](../design/DESIGN_INTENT_CONTRACT.md)
- [Original Phase 1 digital-coach scope](PHASE_1_DIGITAL_COACH_BACKLOG.md)
- [Current coaching authority and external conversation boundary](../adr/0002-digital-coach-control-boundaries.md)
- [Reasoned future-session amendments](FUTURE_PLAN_SESSION_EDITING.md)
- [Amendment authority and effective-session model](../adr/0005-reasoned-future-session-amendments.md)
- [Activity coach feedback proposal and source limitations](../design/ACTIVITY_COACH_FEEDBACK_UX.md)
- [Current next-workout selection policy](../plans/HOME_UP_NEXT_IMPLEMENTATION_PLAN.md)
- [Daily briefing and existing wellbeing behaviour](../plans/HOME_DAILY_BRIEFING_IMPLEMENTATION_PLAN.md)
