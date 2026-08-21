# Phase 1 Digital Coach Product and Backlog

## Product Outcome

RacePredictor Phase 1 turns the existing local activity-history and analytics foundation into a digital running coach for one athlete. Planning conversation happens in Codex with the athlete's Second Brain context. The app remains the source of truth for the agreed goal, approved training-plan version, scheduled routine, imported activity history, and reminder preferences.

The first release succeeds when the athlete can bring their full available running history into the local app, use that history and personal context to plan with Codex, deliberately approve a structured proposal, interact with the resulting calendar, and see a useful Today card plus a configurable daily Codex reminder.

## Confirmed Phase 1 Scope

- Single local athlete; no account, login, household, coach-client, or multi-tenant workflows.
- Activity history imported manually from bounded Garmin CSV files or one-activity GPX files.
- Qualitative history and planning conversation live in the athlete's Second Brain and Codex workflow.
- A versioned structured artifact transfers context from the app to Codex and a plan proposal from Codex back to the app.
- The app owns the active structured goal, immutable approved plan version, calendar, and reminder preferences.
- A plan proposal remains a draft until the athlete explicitly approves it.
- Approved plan prescriptions remain immutable; a material plan change creates a new proposal and version.
- Calendar operations such as reschedule, skip, and restore preserve the original prescription and an audit trail.
- Dates and reminders use `Africa/Johannesburg` by default. The reminder defaults to 06:30 local time and is configurable.
- Reminder delivery is split between a reliable in-app Today card and a recurring Codex automation handoff for AI-generated motivation.
- Automated unit, integration, contract, and critical-journey browser tests are part of the Phase 1 release gate.

## Explicit Phase 2 Deferrals

- Automatic Garmin Connect synchronization, webhooks, background polling, and token/account management.
- Automatic post-run AI review, plan adaptation, or activation of a revised plan.
- Automatic advice based on newly imported activities. A Phase 1 import may make an older proposal visibly stale, but does not alter the active plan.
- Autonomous changes to the approved goal, plan prescription, or calendar.
- App-owned push, SMS, WhatsApp, or email notification delivery.
- Embedded in-app AI chat, autonomous agent execution, or cloud-hosted athlete memory.
- Multi-athlete collaboration, authentication, native mobile apps, and medical or injury diagnosis.

## Phase 1 Backlog

Feature: Complete Local Coaching History
Description: Let the athlete manually import and retain all available running activities so planning is grounded in a canonical, deduplicated local history.
Priority: High
Area: Activity import, normalization, and coaching context
Reason: Trustworthy history is the minimum input for useful planning and unlocks every coaching workflow.
Acceptance Criteria:
- The athlete can choose a Garmin-compatible CSV file and see accepted, duplicate, rejected, and warning counts before considering the import complete.
- The athlete can choose a GPX file containing exactly one activity; a zero-activity or multi-activity file is rejected with a clear corrective message.
- Re-importing the same file or activity does not create another canonical `Activity`.
- Every successfully normalized activity is queryable in chronological history and represented in the generated coaching-context manifest.
- The context manifest states the earliest and latest activity dates, total activity count, generation time, and a deterministic history fingerprint.
- Imported raw files, the local database, and generated coaching artifacts remain in configured local, Git-ignored storage by default.
Dependencies:
- Existing ingestion, staging, normalized activity, and local SQLite boundaries
- CSV and GPX parser validation
Risks:
- Garmin export variants and incomplete sensor fields can reduce context quality; warnings and completeness metadata must remain visible.

Feature: Second Brain Coaching Context Handoff
Description: Publish a safe, versioned, machine-readable snapshot that lets Codex plan from activity history plus the athlete's long-lived Second Brain goals, constraints, preferences, and reflections.
Priority: High
Area: Coach exchange and Second Brain integration
Reason: The athlete wants to plan in Codex, while the app must keep an auditable boundary around authoritative structured state.
Acceptance Criteria:
- The app produces a `coaching-context.v1` artifact that validates against a shared schema before publication.
- The artifact includes the single athlete identifier, timezone and units, complete normalized activity summaries or an explicit complete-history reference, history watermark/fingerprint, current approved goal and plan identifiers when present, and references to relevant Second Brain context notes.
- Generated context is clearly marked as app-owned and is regenerated atomically; user-authored note sections are never overwritten.
- The artifact contains no credentials, access tokens, executable instructions, or raw trackpoint payloads.
- Codex can use the artifact and referenced notes without requiring an embedded chat service in the app.
- Missing or unreadable optional narrative notes are reported as context warnings and do not corrupt canonical activity history.
Dependencies:
- Complete Local Coaching History
- A configured local Second Brain coaching-exchange directory
- Accepted artifact boundary in `docs/adr/0002-digital-coach-control-boundaries.md`
Risks:
- A very large activity history can make an unconstrained prompt impractical; the artifact must preserve complete-history traceability while allowing derived summaries for prompt efficiency.

Feature: Codex Goal and Plan Proposal Import
Description: Accept a structured proposal produced after the athlete and Codex discuss the goal, constraints, routine, and recommended training approach.
Priority: High
Area: Coach exchange, contracts, and proposal review
Reason: This is the bridge from conversational planning to an app-owned plan without letting free-form AI output become active state.
Acceptance Criteria:
- The app accepts only a supported `coaching-plan-proposal.v1` artifact from the configured exchange directory or an explicit file-selection action.
- The imported artifact is schema-validated, size-limited, content-hashed, idempotent, and stored as a non-active `PlanProposal` (shown as Draft in the UI).
- The proposal includes a goal, goal rationale, plan date range, timezone, weekly structure, individual session prescriptions, assumptions, source history fingerprint, and generated timestamp.
- Unsupported schema versions, invalid dates, overlapping identifiers, missing required prescriptions, or unsafe content are rejected with field-level errors.
- A proposal whose history fingerprint no longer matches current imported history shows a stale-context warning and cannot be approved until the athlete explicitly acknowledges it or requests a refreshed proposal.
- Importing a proposal never changes the active goal, plan, calendar, or reminder preference.
Dependencies:
- Second Brain Coaching Context Handoff
- Shared proposal schema and validation contract
Risks:
- Free-form AI output can be inconsistent; the JSON artifact is authoritative for import and any companion Markdown is explanatory only.

Feature: Explicit Goal and Plan Approval with Versioning
Description: Give the athlete a clear review and confirmation step that atomically promotes a draft into the active goal and immutable plan version.
Priority: High
Area: Goal and plan lifecycle
Reason: Coaching suggestions affect real training behavior; silent activation or in-place mutation is unsafe and impossible to audit.
Acceptance Criteria:
- The review shows target outcome, target date, plan range, weekly rhythm, every prescribed session, assumptions, cautions, and material differences from the current active version.
- The athlete can approve or reject the proposal; leaving or closing review does not imply approval.
- Approval requires an explicit confirmation action and an expected proposal revision, preventing stale or double approval.
- A successful approval atomically creates immutable goal/plan version records, creates the initial calendar instances, records approval time and source proposal, and moves the active-plan pointer.
- If approval fails, no partial goal, plan, or calendar state becomes active and a recoverable error is shown.
- Editing an approved prescription creates a new draft proposal/version; the previous approved version remains viewable.
- At most one plan version is active for the single athlete at a time.
Dependencies:
- Codex Goal and Plan Proposal Import
- Goal, proposal, plan-version, session, and approval persistence contracts
Risks:
- Plans may span a daylight-saving timezone elsewhere; all local-date computations must use the saved IANA timezone rather than a fixed offset.

Feature: Interactive Routine Calendar
Description: Present the approved plan as an understandable calendar and let the athlete make explicit operational scheduling changes without losing the original prescription.
Priority: High
Area: Calendar and planned sessions
Reason: A plan becomes useful only when it fits the athlete's real weekly routine.
Acceptance Criteria:
- The calendar offers week and agenda views for the active plan and clearly marks today, workout type, intent, target, estimated duration, and completion/schedule status.
- The athlete can reschedule, skip, and restore a future session through keyboard- and pointer-accessible interactions with a confirmation step.
- A calendar adjustment records actor, timestamp, reason when supplied, prior date/status, and resulting date/status.
- Operational calendar changes do not edit the immutable prescribed session in the approved plan version.
- Conflicts such as two demanding sessions on one day or a session outside the plan range produce a warning before confirmation.
- Empty, loading, stale, and error states explain how to recover without losing the approved plan.
Dependencies:
- Explicit Goal and Plan Approval with Versioning
- Calendar query and adjustment contracts
Risks:
- Drag-and-drop alone would exclude keyboard users and obscure confirmation; every operation needs an accessible non-drag alternative.

Feature: Today Coaching Card
Description: Make the current purpose and session immediately visible each day, even if Codex reminder delivery is unavailable.
Priority: High
Area: Today dashboard
Reason: The daily moment is the core habit surface and provides a reliable fallback for motivation and plan context.
Acceptance Criteria:
- The default dashboard shows today's local date, active goal summary, days until target when applicable, scheduled session or rest day, session intent, prescription, and any schedule warning.
- The card resolves the date using the configured IANA timezone and defaults to `Africa/Johannesburg`.
- No-active-plan, rest-day, missed-session, loading, stale, and error states each have distinct, actionable copy.
- The card links to the relevant calendar session and the active plan version.
- The deterministic plan cue remains available from local data without a live AI request.
- The Today card never claims that an activity was reviewed or the plan was adapted in Phase 1.
Dependencies:
- Interactive Routine Calendar
- Active plan and Today query contracts
Risks:
- Ambiguous handling around midnight can surface the wrong session; timezone behavior requires boundary tests.

Feature: Configurable Daily Codex Reminder Handoff
Description: Store a daily reminder preference and produce an exact handoff for a recurring Codex automation that generates contextual motivation from the currently approved plan.
Priority: High
Area: Reminder settings, automation handoff, and Today dashboard
Reason: The athlete explicitly wants daily motivational encouragement, while reminder delivery must not make the local app depend on a background notification service.
Acceptance Criteria:
- Reminder settings default to enabled daily at 06:30 in `Africa/Johannesburg` and allow the athlete to change time, timezone, or enabled state.
- The app produces a copyable/versioned Codex handoff containing recurrence, timezone, athlete-facing prompt intent, and a reference to current app-owned coaching context rather than embedding a stale plan copy.
- The user is told that saving preferences configures app state but does not itself prove that a Codex automation was created.
- The UI separately shows app preference status and Codex handoff/automation status as known, unknown, or confirmed; one is never inferred from the other.
- The reminder prompt asks Codex to ground encouragement in today's approved session, goal motivation, and relevant constraints without changing the plan or claiming medical authority.
- Disabling the reminder does not hide the in-app Today card or alter the plan.
Dependencies:
- Today Coaching Card
- Second Brain Coaching Context Handoff
- Reminder preference and handoff contracts
Risks:
- Codex automation availability is external to the app; the handoff must be useful even when automation status cannot be queried.

Feature: Phase 1 Automated Product Quality Gate
Description: Prove the complete local coaching journey through layered automation and a final Product Owner acceptance review before release.
Priority: High
Area: Cross-cutting quality and release readiness
Reason: Planning, approval, dates, and reminders influence real training decisions and require stronger evidence than a happy-path demo.
Acceptance Criteria:
- Unit tests cover artifact validation, history fingerprinting, plan lifecycle rules, timezone/day selection, conflict warnings, and reminder default/configuration behavior.
- Contract tests cover all new request/response schemas and standard error envelopes.
- Persistence integration tests prove idempotent artifact import, atomic approval, immutable approved versions, one-active-plan enforcement, and auditable calendar adjustment behavior.
- Import tests cover bounded CSV, one-activity GPX, duplicate retries, malformed files, and partial validation failures.
- Browser tests cover manual import through proposal review/approval, calendar adjustment, Today rendering, and reminder settings/handoff at supported desktop and responsive-baseline widths.
- Lint, typecheck, unit, integration, and browser test gates pass for touched workspaces.
- Architecture, API, schema, UX, roadmap, and progress documents match the delivered behavior.
- A Product Owner reviews every Phase 1 acceptance criterion against working evidence and records accepted gaps or blocks before the feature is presented as complete.
Dependencies:
- All Phase 1 feature slices
- Test fixtures that contain no private athlete data
Risks:
- External Codex automation delivery cannot be made deterministic in repository tests; Phase 1 tests the generated handoff and UI status separation, not the external service's delivery guarantee.

## Product Assumptions

- The user-approved defaults supplied for this gate resolve initial timezone, reminder time, import formats, runtime profile, and AI/app responsibility questions.
- `Africa/Johannesburg` is an IANA timezone configuration, even though its current offset is normally `+02:00`.
- "Know all my history" means every successfully normalized activity is retained and included in the coaching context's complete-history manifest; raw trackpoints are not required in an AI prompt.
- The existing `Running Context.md`, generated weekly reviews, and activity-context notes remain the qualitative Second Brain sources unless configured otherwise.
- Companion Markdown may explain a proposal to the athlete, but only validated structured JSON crosses into app-owned state.
- Phase 1 may warn that new history makes a proposal stale. It must not perform the Phase 2 behavior of reviewing the run or recommending/activating adaptations automatically.

## Prioritisation Summary

- History and the structured context handoff come first because AI planning cannot be trustworthy or reproducible without them.
- Proposal import and explicit approval/versioning form the next vertical slice because they establish the control boundary before calendar work.
- Calendar and Today follow because they turn an approved plan into a daily routine.
- Reminder handoff follows Today so external motivation always has a reliable in-app fallback.
- The automated Product Owner gate is defined now and runs throughout delivery; final acceptance waits until every preceding slice has evidence.

## Recommended Next Item

Feature: Complete Local Coaching History

This is the best first implementation slice because it builds on the existing import/analytics work, closes the Phase 1 GPX and CSV acceptance boundary, and produces the canonical history fingerprint required by every later Codex proposal and approval decision.

## Phase 1 Release Acceptance

Phase 1 is acceptable only when one local athlete can complete this full journey without production seed data or hidden manual database edits:

1. Import CSV and/or a single-activity GPX and understand any rejected or duplicate data.
2. Generate a current coaching-context artifact backed by the complete normalized history and Second Brain references.
3. Plan conversationally with Codex and import its valid structured proposal as a draft.
4. Review and explicitly approve the goal and plan version.
5. Adjust the routine in the calendar while retaining prescription history.
6. Open Today and understand what to do and why.
7. Configure the daily reminder and use the Codex automation handoff, with status clearly separated from the in-app reminder preference.
8. Pass the automated quality gates and final Product Owner review.
