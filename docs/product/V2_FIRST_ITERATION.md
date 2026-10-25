# V2 Suggested First Iteration: Reflect and Prepare

Status: Approved first-iteration scope; implementation recovered on work with passing local gates. Integrated preview verification and owner pilot remain behind two false-by-default server switches.\
Date: 22 October 2026\
Parent product direction: [V2 Product Design](V2_PRODUCT_DESIGN.md)

Visual reference: [V2 flow diagrams](V2_FLOW_DIAGRAMS.md)

UI/UX exploration: [Three visual directions](../design/v2-concepts/README.md) · [Screen design brief](../design/V2_SCREEN_DESIGN_BRIEF.md)

Approved visual design: [AI Companion layout and architect handoff](../plans/V2_AI_COMPANION_DESIGN_HANDOFF.md)

Implementation decisions and service boundaries: [V2 First Iteration Architecture](../plans/V2_FIRST_ITERATION_ARCHITECTURE_IMPLEMENTATION_PLAN.md) · [ADR 0010](../adr/0010-v2-conversation-led-coach.md)

Confirmed for this iteration: authenticated online site first; the existing server-side OpenAI integration; one retained athlete conversation until explicit deletion; complete replies with a generating indicator. Local Home and tools remain available, and interactive chat cannot change structured training state.

## 1. Iteration objective

Deliver one complete conversational journey inside RacePredictor: open the app, discuss the last training session or prepare for the next one, then move into the existing activity detail, Calendar, or race plan without losing context.

This iteration tests whether a contextual coaching conversation makes daily training decisions clearer. It does not require redesigning Calendar, replacing the race-plan workflow, or adding autonomous planning.

**Release outcome:** The athlete can have a genuine multi-turn exchange with the coach, revisit it later, and reach the correct existing training view with one contextual action.

## 2. Starting assumptions and delivery decisions

- Start with the existing single-athlete product and its current access controls. No new account or coach-client model is required.
- Use the authenticated, server-mediated online chat service and existing OpenAI integration described in the [implementation architecture](../plans/V2_FIRST_ITERATION_ARCHITECTURE_IMPLEMENTATION_PLAN.md). The first iteration uses complete replies and bounded provider quotas; local chat is not exposed.
- Reuse current approved goal, effective session selection, activity facts, published reviews, and saved wellbeing data. Do not build another planning or analytics engine.
- Use one ongoing conversation per athlete, with messages anchored to the selected activity/session and a dated context. The product remains coherent when the athlete moves between reflection and preparation.
- Deliver and validate in one explicitly selected runtime first. The implementation plan must name local, online, or both and document the other mode's behaviour; it must not imply unsupported chat availability. Existing Calendar and plan functions remain available in either mode.

This is a proposal for product scope. It does not claim that a chat API, conversation store, or AI runtime already exists in the repository.

## 3. Included scope

| Item | First-iteration behaviour |
| --- | --- |
| Coach as default entry | Evolve `/dashboard` into a conversation-led Home, with goal orientation and compact last/next training context. |
| Reflection journey | Discuss the latest selected activity, ask a useful follow-up, and connect the reflection to what comes next. |
| Preparation journey | Explain the actual next session and its purpose, answer follow-ups, and discuss the athlete's circumstances. |
| Actual conversation | Free-text input, contextual suggested prompts, multi-turn answers, saved history, and a retry path. |
| Explicit context | Display which activity/session is being discussed and allow switching between last training and next training. |
| Contextual navigation | Open activity detail, the correct Calendar session/date, or the existing race plan. |
| Return continuity | Restore the selected context, conversation, and position when returning from an existing view. |
| Existing wellbeing | Read today's saved check-in when available; link to the existing check-in/journal to add or edit it. |
| Degraded operation | Keep the goal/session facts and direct navigation usable independently of the AI response. |

### Proposed Home composition

1. Compact approved race-goal orientation with **View race plan**.
2. Small **Last training** and **Next training** context controls with the actual date and available facts. Show prescribed recovery separately when relevant.
3. One contextual coach opening followed by the conversation and message composer.
4. Relevant actions attached to the conversation, such as **View activity** or **View session**.

Keep Calendar and Readiness in the existing navigation and Settings secondary. Recommend renaming the Home navigation label to **Coach**, while preserving `/dashboard` and existing deep links. Adopt that naming explicitly in the design amendment before application changes.

The current automatic daily wellbeing modal would interrupt the conversation-first entry. The V2 entry moves its invitation into the coaching flow and opens the existing form only on request. Saved answers, skipped-today state, later editing, and explicit save behaviour remain intact.

## 4. Opening-context selection

Use current structured app state to choose the opening. Reuse the existing next-workout resolver; do not create a second definition of session completion.

Apply these rules in order:

1. On a deliberate return from activity/session detail, retain that selected context and the conversation. Refresh its facts without resetting the exchange.
2. On a new visit, if the latest recorded activity is newer than the activity last reflected on in the conversation, offer reflection first. Reflection means the athlete has actually responded about that activity; viewing it alone does not count.
3. Otherwise, prepare for the current effective next session. For prescribed rest, acknowledge recovery and show the supplied next workout if available.
4. If a record or session is ambiguous, display the candidates and ask the athlete to choose. Do not mark a day or workout completed.
5. With no approved plan or no activities, offer the useful available journey and a direct setup/import link. Partial data must not become a full-page blocker.

Always expose both **Reflect on last training** and **Prepare for next training** when their context exists. An explicit athlete choice overrides the suggested topic. Reopening the app must not generate duplicate greetings or repeat a reflection already answered. Refresh dated context separately from the saved transcript.

“Latest” follows activity occurrence time, not the time an older imported activity or review arrived. Date boundaries follow the athlete's saved timezone.

## 5. Primary journeys

### A. Reflect after training

1. Open Coach with the latest activity identified by title/date and recorded facts.
2. Coach asks how the session felt, using a current published review when one is available and relevant.
3. Athlete replies, for example: “The last part felt harder than expected.”
4. Coach asks a focused follow-up or explains the limits of the available comparison, then gives a supported takeaway.
5. Coach identifies the next planned session without claiming a schedule change and offers **View activity**, **View next session**, or **View calendar**.
6. Athlete opens a view and can return to the same conversation.

The reply persists as conversation history. It does not automatically update a wellbeing record, publish a Second Brain note, confirm a planned-session match, or record completion.

### B. Prepare before training

1. Open Coach or select **Prepare for next training**.
2. Coach names the selected session and date, explains its actual purpose, and references any relevant saved wellbeing answer.
3. Athlete asks a question or shares a constraint, for example: “I only have 30 minutes.”
4. Coach discusses that constraint. It may suggest an alternative, clearly labelled as advice, while keeping the current effective prescription visible.
5. **View session** opens the exact Calendar context. **View race plan** opens the existing plan overview.
6. Any eligible amendment is reviewed and saved through Calendar's existing reason-required workflow. Changes outside that scope continue through the existing plan process.
7. On return, the conversation refreshes current session state and acknowledges an actual confirmed change where one occurred.

For a current-day session that cannot be amended under existing rules, explain that boundary. Do not display an Apply action or claim that a suggested shorter workout has been scheduled.

## 6. Prioritised delivery backlog

All items below are required for the proposed first release; the order expresses implementation dependencies.

| ID | User story | Acceptance outcome |
| --- | --- | --- |
| V2-I1-01 | As an athlete, I arrive with the coach already oriented to my training. | Goal and last/next context resolve from current app records; opening follows section 4; direct navigation works before chat is ready. |
| V2-I1-02 | As an athlete, I can reflect on my last training through conversation. | A free-text reply receives a relevant follow-up; available facts and review limits are preserved; no completion or plan mutation occurs. |
| V2-I1-03 | As an athlete, I can prepare for my next session. | Coach identifies the effective session, answers a follow-up, and distinguishes current prescription from suggested alternatives. |
| V2-I1-04 | As an athlete, I can inspect what the coach is discussing. | Activity/session actions target the exact record; race-plan action opens the current existing plan; Back restores chat context and focus. |
| V2-I1-05 | As an athlete, I can resume my conversation. | Sent messages and successful replies persist across reloads for the same authorised athlete; failed sends are recoverable without duplicate messages. |
| V2-I1-06 | As an athlete, I can still use my training information when chat fails. | A failed or delayed response retains the draft and known training facts, offers retry, and does not disable Calendar or plan access. |

## 7. Coaching and data boundaries

Each reply uses the athlete's message, bounded relevant conversation history, and a current structured context snapshot. The snapshot should identify the approved goal/plan, selected effective session and revision, relevant activity and review state, saved wellbeing if available, timezone, and freshness. Exact contracts belong in the implementation design.

- Keep planned and recorded data separate. Use a confirmed association or label uncertainty when comparing them.
- Prefer current app state over an earlier conversational statement about the schedule. Retain historical messages with their dates and references.
- Revalidate contextual actions after a plan/session changes; a removed or retired target gets a recoverable explanation rather than a substitute record.
- Preserve material prescription cautions in the training context. Do not summarise away instructions the athlete needs to act safely.
- Persist conversation only within the athlete's authorised scope. The architecture documents provider handling, explicit deletion, and the context allow-list. Private local notes and raw Second Brain content are excluded from this iteration.
- The chat service has no calendar, goal, plan-approval, or wellbeing mutation tools in this iteration. Existing explicit user forms remain the route for those writes.
- Never show “saved”, “reviewed”, “completed”, or “plan updated” solely because the model produced that wording.

Chat history is a new persistence requirement. Its storage and protection need an explicit design; an existing activity-review queue is not automatically an interactive chat service.

## 8. Deferred scope

- In-chat proposal creation, approval, calendar amendments, or automatic structured extraction of wellbeing answers.
- New **Discuss with coach** launchers throughout Calendar, activity detail, and race plan; the first iteration proves outbound navigation and return first.
- Full weekly coaching reviews, long-term inferred memory, automatic note publication, and private Second Brain ingestion.
- Live workout mode, GPS recording, voice, proactive notifications, and new readiness/prediction models.
- Calendar or race-plan visual redesign, additional primary navigation destinations, and multi-athlete collaboration.

The existing Codex plan-generation workflow and asynchronous activity-review pipeline continue to serve their current purposes. The new chat must explain pending review/setup states without promising to complete those external processes itself.

## 9. Required acceptance scenarios

| Scenario | Expected product result |
| --- | --- |
| Latest activity and next session both available | Reflection is offered when unanswered; athlete can immediately switch to preparation. |
| Reflection already answered | Next visit can focus on preparation; saved discussion remains available without a repeated check-in. |
| Saved wellbeing answer exists | Coach can acknowledge the exact answer; no duplicate modal or incidental rewrite. Editing uses the existing journal. |
| Same-day run, multiple sessions, or uncertain association | Existing next-workout policy is respected; no inferred completion/adherence; Calendar remains the resolution path. |
| Prescribed rest or no scheduled session | Correct distinction is shown; no invented workout or instruction to compensate. |
| Review pending, unavailable, or stale | Available facts remain usable; coach labels the limitation and does not fabricate a review. |
| No goal/plan, no activities, or failed contextual read | Explain the affected gap, retain unaffected information, and offer the supported setup/import/retry path. |
| Plan/session changes while conversation is open | New replies use current state; earlier advice is not presented as the active prescription; invalid links recover clearly. |
| User asks to change today's session or their race goal | Coach explains the suggestion and routes to the supported process; no unsupported mutation or success claim. |
| Chat request fails or user reloads during a request | Preserve confirmed history and a recoverable draft; show the real state and deduplicate retry. |
| Navigate away and return | Restore conversation and selected record; preserve Calendar month, activity origin, browser Back, keyboard focus, and existing direct-link behaviour. |
| Mobile, keyboard, or screen reader use | Composer remains reachable; messages and status are accessible; no horizontal overflow or full-transcript re-announcement on each reply. |

Use isolated fixtures for journey verification and representative coaching prompts for response review. Verify actual context accuracy, meaningful follow-ups, correct navigation targets, persistence, and absence of structured side effects. UI screenshots or mocked chat text alone cannot demonstrate this release outcome.

## 10. Delivery sequence and release decision

1. **Design and architecture:** Approved decisions, owner-session boundary, online-first runtime, existing OpenAI integration, persistence/deletion rules, and complete-reply behaviour are recorded in the design contract, ADR, and architecture implementation plan.
2. **Connected journey:** Implement the Coach context, chat service, message persistence, and the two conversational journeys with existing-view actions and return continuity.
3. **Verification:** Exercise the acceptance matrix against the online runtime, existing Calendar/plan regressions, and real multi-turn response evaluation. Confirm that navigation and chat perform no structured training writes.
4. **Pilot:** After release gates pass, review whether the athlete can understand the next session and reflect on the last one with less effort. Track failed responses, incorrect context/actions, and whether advice was mistaken for a saved change.

Release when the six backlog outcomes and acceptance scenarios pass in the named supported runtime. Quantitative usage and latency targets should be agreed from pilot evidence rather than invented here. More messages or longer time in chat do not, by themselves, justify expansion.

Rollback should restore the existing Home experience while retaining saved conversations and all existing training records. Chat availability must be independently switchable so Calendar, Readiness, and race-plan management remain usable.

## 11. Confirmed implementation decisions

| Decision | Confirmed implementation |
| --- | --- |
| Default entry label | Coach at `/dashboard` on the authenticated online site; retain Calendar, Readiness, and secondary Settings. |
| Conversation organisation | One ongoing athlete conversation with explicit activity/session references and refreshed dated context. |
| Structured writes from chat | None in iteration one; route to existing forms and confirmations. |
| Wellbeing entry | Contextual invitation and existing form; open only when requested. |
| Supported runtime and AI service | Online first, through the existing server-side OpenAI integration. Chat UI and generation are separately gated. |
| Reply and retention | Complete reply with a generating indicator. Retain conversation until explicit history deletion. |

The [architecture implementation plan](../plans/V2_FIRST_ITERATION_ARCHITECTURE_IMPLEMENTATION_PLAN.md) records the contracts, privacy boundary, deployment defaults, and verification work for these choices.
