# V2 First Iteration: Product Flow Diagrams

Date: 22 October 2026\
Status: Visual description of the agreed product approach; application changes are not implemented.\
References: [V2 product design](V2_PRODUCT_DESIGN.md) · [First-iteration scope](V2_FIRST_ITERATION.md)

## How to use these diagrams

The first diagram shows the athlete's experience. The second explains how the opening topic is chosen. The third distinguishes advice from a saved training change. These describe the existing first-iteration scope without adding new features.

Mermaid diagrams render in supported Markdown previews, including GitHub. The overview also has a [PNG preview](diagrams/V2_FIRST_ITERATION_FLOW.png), generated from its editable [Graphviz source](diagrams/V2_FIRST_ITERATION_FLOW.dot).

FigJam is suitable for collaborative review of this flow. A clickable Figma prototype would be the subsequent design artifact for experiencing screen layouts, buttons, and transitions. Neither is required to read or maintain this repository reference.

## 1. Athlete journey: conversation into the existing product

```mermaid
flowchart TD
    Open([Open the app]) --> Home["Coach Home<br/>Race goal · last training · next training<br/>Saved conversation and contextual opening"]
    Home --> Reflect["Reflect on last training"]
    Home --> Prepare["Prepare for next training"]
    Reflect --> Debrief["Discuss how it felt<br/>Use recorded facts and available review"]
    Prepare --> Brief["Understand the session and its purpose<br/>Discuss wellbeing, time, and questions"]
    Debrief --> Chat["Continue the conversation<br/>Ask follow-ups or switch topic"]
    Brief --> Chat
    Chat --> Activity["View activity<br/>Existing activity detail"]
    Chat --> Calendar["View session or calendar<br/>Existing Calendar and permitted actions"]
    Chat --> Plan["View race plan<br/>Existing goal and plan workflow"]
    Activity --> Return["Return to the same conversation<br/>Keep selected context; refresh training facts"]
    Calendar --> Return
    Plan --> Return
    Return -. Continue when useful .-> Chat

    classDef coach fill:#123340,stroke:#52cddd,color:#ffffff;
    classDef existing fill:#263247,stroke:#9ba9bd,color:#ffffff;
    class Home,Reflect,Prepare,Debrief,Brief,Chat,Return coach;
    class Activity,Calendar,Plan existing;
```

The two branches are conversation modes within one Coach screen, not separate products or compulsory screens. Suggested prompts help the athlete start; free text and changing the subject remain available throughout.

Calendar and Readiness remain directly accessible in navigation. **View race plan** remains available on Coach Home before the athlete sends a message. Direct navigation and existing bookmarks do not require passing through this flow. Returning uses ordinary navigation/Back behaviour; new **Discuss with coach** buttons throughout existing screens remain deferred.

The athlete may finish the visit after reading a useful answer. Opening a detail view or changing the plan is optional.

## 2. Choosing the coach's opening

```mermaid
flowchart TD
    Start([Arrive at Coach]) --> Returning{"Returning from a view<br/>with an active conversation?"}
    Returning -->|Yes| Resume["Restore the conversation and selected context<br/>Refresh facts without repeating the greeting"]
    Returning -->|No| Load["Load available current training context"]
    Load --> Resolve{"Is the relevant activity<br/>or session ambiguous?"}
    Resolve -->|Yes| Choose["Show candidates and let the athlete choose<br/>Do not infer a match or completion"]
    Resolve -->|No| Data["Use the available selected context"]
    Choose --> Data
    Data --> New{"Latest activity newer than<br/>the last activity reflected on?"}
    New -->|Yes| Reflect["Offer reflection on last training first"]
    New -->|No| Next{"Next session or<br/>prescribed rest available?"}
    Next -->|Yes| Prepare["Offer preparation or explain recovery<br/>Show the supplied next workout when available"]
    Next -->|No| Partial["Explain the available context<br/>Offer supported plan setup, import, or calendar access"]
    Resume --> Athlete["Athlete can choose another topic at any time"]
    Reflect --> Athlete
    Prepare --> Athlete
    Partial --> Athlete
```

Ambiguity is resolved before a record-specific claim. This is a clarification step, not another priority for selecting the coaching topic. Missing or failed data affects only the relevant context; useful facts and navigation remain available.

A reflection is answered when the athlete responds about that activity. Opening its detail or importing a record does not count as a reflection. Session selection follows the existing effective-calendar policy and saved timezone. An unanswered scheduled session is not automatically a missed workout.

## 3. From a coaching suggestion to a confirmed change

```mermaid
flowchart TD
    Constraint["Athlete shares a constraint<br/>Example: I have less time"] --> Advice["Coach discusses options<br/>Current prescription stays visible<br/>Suggestion is advisory"]
    Advice --> Change{"Does the athlete want<br/>to pursue a change?"}
    Change -->|No| Continue["Keep current plan<br/>Continue or finish the conversation"]
    Change -->|Yes| Type{"Which existing process applies?"}
    Type -->|Eligible future-session amendment| Calendar["Open Calendar<br/>Review changes and provide a reason<br/>Explicitly save using the existing form"]
    Type -->|Goal or wider plan change| Plan["Open race-plan management<br/>Use existing proposal and approval process"]
    Type -->|Requested operation not permitted| Limit["Explain the restriction<br/>Do not promise an unsupported edit"]
    Calendar --> Result{"Did the app confirm<br/>a saved change?"}
    Plan --> Result
    Result -->|Yes| Updated["Calendar and plan reflect the confirmed state<br/>Coach refreshes facts on return"]
    Result -->|Cancelled, failed, or still a draft| Unchanged["Keep the current agreed state<br/>Explain any pending step or error"]
```

For example, current-day prescription amendments are outside the existing editing rules. A conversational “yes” cannot bypass those rules. In iteration one, chat has no structured training mutation tools: successful conversation persistence is separate from saving wellbeing, changing a session, confirming completion, or approving a plan.

## 4. What an individual visit feels like

Illustrative dialogue; these are not the athlete's actual records or prescribed sessions.

| Moment | Before the next training | After the last training |
| --- | --- | --- |
| Coach opens | “Your next session is an easy run. Shall we go through it?” | “How did your last run feel compared with what you expected?” |
| Athlete replies | “Why is this session easy?” | “The final part felt harder.” |
| Coach follows up | Explains the supplied purpose in the plan and answers further questions. | Asks a focused follow-up and gives a supported takeaway using available facts. |
| Athlete inspects | **View session** opens the correct Calendar session. | **View activity** opens the recorded session and available review. |
| Athlete returns | Same conversation, selected session retained. | Same conversation, selected activity retained. |
| Useful outcome | Understand what to do and why. | Understand the last session and what to consider next. |

The same Home layout supports both visits. A clickable prototype can subsequently demonstrate this sequence: **Coach Home → conversation → existing detail view → return to the saved conversation**.
