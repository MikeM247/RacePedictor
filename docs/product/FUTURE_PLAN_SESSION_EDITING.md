# Future Plan Session Editing

Feature: Reasoned future-session amendments
Description: Allow the athlete to amend a future session in the active plan from RacePredictor while preserving the approved prescription and recording why the change was made for later AI coaching review.
Priority: High
Area: Calendar, Today, coaching context, local and cloud coaching persistence
Reason: The athlete needs to adapt an approved plan when real-life conditions change without losing the source plan, its safety history, or the rationale an AI coach will need during a later review.
Acceptance Criteria:
- A plan step is treated as one planned training session, and only a session whose effective date is after the athlete's current local date in the saved IANA timezone can be amended.
- An eligible session can be amended in RacePredictor Calendar without editing the approved source prescription in place.
- The athlete can amend title, purpose, prescription, duration, optional distance, optional RPE, optional start time, and cautions. Date changes continue through reschedule; skip and restore remain explicit operations.
- Every amend, reschedule, skip, and restore request requires a trimmed reason of 1 to 500 characters. The UI cannot confirm the change without it, and the API rejects a missing or blank reason.
- Each successful change is append-only and records plan ID, session ID, actor, timestamp, reason, changed fields, before values, after values, expected revision, and resulting revision.
- Calendar and Today use the latest effective session values while continuing to expose the approved original and a readable change history.
- The next generated structured coaching context includes the reasoned future-session change history so an AI can review it later. The product does not claim that review occurred and does not automatically adapt or approve another plan.
- Concurrent or stale revisions fail safely without overwriting another change; the athlete is prompted to reload and review the latest session.
- Past and current-day sessions, inactive or retired plans, and sessions outside the active plan cannot be amended.
- The signed-in owner can use the feature in the deployed cloud app, and the local coaching workflow retains equivalent behavior.
- Loading, validation, saving, success, error, and revision-conflict states are keyboard accessible and usable at the supported desktop and mobile widths.
- Core contract, local repository/service, cloud persistence/handler, UI-state, route, and browser tests cover success and meaningful failure paths.
Dependencies:
- Existing active-plan, Calendar, Today, optimistic revision, audit-event, owner-authentication, cloud projection, and local coaching-context publication capabilities.
- Architecture decision documenting append-only overrides as a controlled exception to the immutable approved prescription boundary.
Risks:
- A direct mutation would destroy approval provenance; implementation must derive effective values from immutable source data plus ordered amendments.
- Cloud and local projections can diverge unless amendments participate in existing sync/change-feed behavior.
- Free-form reasons may contain sensitive information; they must stay within authenticated coaching data and must not be emitted to routine logs or public status surfaces.

## Product Assumptions
- "Future steps" means future planned training sessions, not Codex task-plan steps.
- Today is intentionally not editable; editing is centralized in Calendar to avoid competing interaction models.
- A later AI review consumes structured coaching context. It does not imply immediate or automatic AI action.
- Bulk edits, editing plan-level goals or weekly structure, and marking an edit as AI-reviewed are outside this slice.

## Prioritisation Summary
- This is High priority because it closes a practical plan-adherence gap while retaining the product's explicit-approval and auditability principles.
- A single-session append-only amendment is the smallest safe slice. Automatic adaptation, bulk editing, and full plan regeneration remain deferred.

## Recommended Next Item
Implement reasoned future-session amendments end to end because the current Calendar already has optimistic, auditable schedule operations and is the lowest-risk place to extend the behavior without weakening plan approval history.
