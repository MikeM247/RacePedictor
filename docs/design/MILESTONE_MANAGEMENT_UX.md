# Milestone management — product and UX design

Status: implementation contract, authorised by the owner on 21 October 2026 for `codex/milestone-management`. No production plan or athlete data has been changed. Preview content is illustrative. The final role handoff and architecture are in [Milestone management](../plans/MILESTONE_MANAGEMENT.md).

## Product outcome

The athlete can find, create, link and remove milestones without confusing a confirmed achievement with a planned race target. Settings → Milestones is the management destination; Home's existing timeline provides a contextual Manage milestones entry. Preserve Home, Calendar and Readiness as primary navigation.

## Existing behaviour verified

Initial design source: the dashboard redesign worktree. Implementation is based on current main at `a8597e1`, in a separate feature checkout. This is source inspection, not verification of a deployed environment.

- `apps/web/components/dashboard/milestone-settings.tsx` already groups achievements and upcoming targets, but only achievements expose management controls.
- `race-achievement-manager.tsx` already supports creation, activity search/pagination, editing, optional activity and approved-target links, user confirmation and revision-checked removal. Improve this flow rather than build a second store.
- `packages/core/src/contracts/race-history.ts` permits unknown historical dates/results and retains target snapshots. A linked target requires date, official distance and elapsed result. A plain race-result record requires a target; a historical achievement requires explicit confirmation of its category.
- `packages/core/src/services/race-journey.ts` compares an explicitly linked result with the target's own ID, date, distance and time. A recorded run alone does not prove achievement. “Under/sub” is strict; a numeric time target is inclusive.
- `docs/GOAL_UPDATE_PROCESS.md` requires a complete proposal v2, explicit owner approval and verified publication for planned race-target additions, removals or changes. The current contract requires a target time, allows twelve milestones, and requires unique IDs/dates no later than the primary performance goal.
- `docs/design/DESIGN_INTENT_CONTRACT.md` and `docs/plans/ROAD_TO_COMRADES_IMPLEMENTATION.md` establish the navy/cyan/violet/lime palette, existing navigation, Home timeline and native-dialog conventions.

## User Flow

- Home → Manage milestones, or Settings → Milestones → browse Achievements / Race targets.
- Add milestone → choose Achieved milestone or Planned race target.
- Achievement → optionally choose a recorded race → check name, date, official distance and elapsed result → select category and optional approved target → explicitly confirm → Save milestone.
- Assign race on an existing achievement or an elapsed race target → choose one of the athlete's recorded runs → review prefilled facts → confirm → save. Cancel preserves the previous link. Change race uses the same flow. Unlink race removes the source link only; checked official facts remain until explicitly edited.
- Remove achievement → named confirmation describing the impact → Remove milestone → refresh list and Home. The source activity remains in activity history.
- Add/edit/remove planned target → collect proposed change → Prepare plan update → continue to the existing Plan / Create a plan with Codex workflow → full proposal review, approval and publication. Preparation alone never changes the active timeline or calendar.

## Screen Breakdown

### Settings → Milestones

Affected route: existing `/dashboard/settings`, with a proposed `#milestones` anchor for contextual entry. Retain `/dashboard/plan` as the existing plan-management destination. No new primary route is needed.

- Context breadcrumb and title; short explanation that these records feed Home's timeline.
- One Add milestone primary action.
- Achievements tab: saved confirmed achievements and linked race-result records, with honest status. Each row has a name, known date/distance/result, linked-race state and visible Edit / Assign race or Change race / Remove actions. Unknown fields show “Date not set” or “Result not set”; never zero or a guessed value.
- Race targets tab: primary goal displayed separately as plan context, then intermediate race targets in date order. Labels distinguish Upcoming, Result pending and any load/publication issue. Show each target's own distance and time. Past unfulfilled targets remain visible; they are not silently marked achieved.
- Race targets expose Record result for elapsed dates, Edit and Remove. A future result action is unavailable with a visible explanation. The primary goal links to Plan and has no milestone-delete control.
- New target requests stay clearly separate from approved rows. Show “Plan update prepared” only after preparation; never imply a draft or approved plan has been saved if it has not.

### Add / edit milestone dialog

Use the existing NativeModal. One active dialog at a time; the activity picker expands within it.

- Achieved: name required; category required; optional historical date, official distance and elapsed result; optional recorded-activity link; optional approved-target link. Explicit owner-confirmation checkbox is required to save. If linked to a target, date/distance/result become required. The race-result category also requires a target.
- Race picker: search recorded running activities with title, local date, distance and elapsed time. Retain existing Load more. Selection prefills facts as a draft. The athlete checks official distance/result before saving. No automatic PB classification.
- Planned: name, distance, date and target time required; event name optional. Use stable milestone ID on edit. Explain that this prepares a plan change. The primary action is Prepare plan update, not Save milestone.
- The preview uses a native elapsed-time text field accepting `mm:ss` or `h:mm:ss`; production enforces positive bounded values with seconds/minutes below 60. Numeric fields retain existing contract bounds.
- Errors sit beside fields, with an error summary after a failed submit. Preserve input and selected links. Saving disables duplicate submission and shows progress.

### Remove confirmation

- Achievement: “Remove ‘[name]’ from your milestones? Its linked recorded activity will stay in your history.” Buttons: Keep milestone / Remove milestone. This deletes the achievement record, not the activity. It may cause a linked current target to return to Ahead / Result pending after re-evaluation.
- Planned: “Remove ‘[name]’ from the plan?” Explain that it prepares a revised plan and the approved target remains until replacement approval/publication. Buttons: Keep target / Prepare removal.

## Key Interactions

- Assigning a race means linking a recorded running activity to a confirmed result/achievement. It does not create or retarget an approved race goal.
- Editing an activity link does not itself prove target success. The server owns target snapshots; clients never supply trusted snapshots.
- A linked result that misses the target remains a recorded result, with no achieved checkmark. Record deletion, result correction and target removal trigger the existing projection rules.
- Provide explicit unlink controls for the recorded activity and approved-target relationship. When changing to a historical achievement, clear the target link only after the athlete confirms the intended classification.
- A race that was already recorded elsewhere should be surfaced for review before creating a duplicate achievement; do not silently overwrite or merge records.
- Changes from another session return a conflict state with Reload latest. No blind retry, automatic overwrite or lost edit.

## Edge Cases

| State | Required behaviour |
|---|---|
| No achievements | “No achievements yet” and Add milestone. Preserve Race targets access. |
| No active performance goal | Achievements remain manageable; planned-target form explains the prerequisite and links to Plan. |
| Target time unknown | Do not invent a time or create an event-only structured target; explain the current contract limitation. |
| Target limit / duplicate date / date after goal | Field-level error; preserve the proposed change for correction. |
| Activity search empty or failed | Clear search/Retry; historical manual confirmation remains available. |
| History loaded, goal context unavailable | Keep historical editing available; disable new target-link selection until verified targets load. Retain saved historical snapshots. |
| Load/refresh error | Label last-loaded content as stale and expose Retry. Do not present it as an empty list. |
| Save/remove failure | Keep the dialog open, preserve values and provide retry with the correct current revision. |
| Plan update pending publication | Show the actual state; Home continues to use its verified approved context. |
| Source activity corrected or missing | Retain checked official snapshots; show unavailable source honestly. Never silently rewrite official facts. |
| Date crosses timezone midnight | Use the saved plan timezone, defaulting as the existing app does. A future race cannot be recorded as already achieved. |

## UX Risks

- “Milestone” currently covers both history and plan-owned targets. Resolve with explicit tabs, statuses and different submit labels.
- Removing a historical achievement can reveal an unfulfilled approved target again. Confirmation and success feedback must describe the effect.
- A large activity archive can make selection slow. Reuse current search and cursor pagination, with stable selection as more results load.
- An activity's GPS distance/time may differ from an official race result. Prefill for convenience, keep fields reviewable and require confirmation.
- A plan-update request could be mistaken for a saved target. Label it “Prepared” and explain the next step; only approval/publication creates live approved data.

## Handoff Notes

- Keep the existing native modal, semantic palette and application typography. The interactive preview represents the management component, not a replacement application shell.
- Wide: two-line information rows with compact visible actions. Narrow: stack metadata and wrap labelled actions; no horizontal page scroll. Modal content uses a single scroll region, 16px mobile gutters and reachable controls.
- Every control has an accessible name; visible focus, native keyboard operation, trapped modal focus, Escape/cancel and focus restoration are required. Use status text as well as colour. Minimum 44px effective touch targets; 4.5:1 normal-text contrast.
- Loading, empty, stale, error, conflict and pending-publication states need implementation coverage. The preview demonstrates the normal local interactions and confirmation paths; it is not a connected application or full error-state simulator.
- Reuse scoped history CRUD, activities search and current goal-context reads. Planned changes integrate with the existing approval workflow; no direct active-goal or plan-milestone mutation endpoint is proposed.
- The plan-change handoff carries operation, affected stable ID, base approved plan/goal identity and hash, and complete current/proposed milestone lists. It uses athlete-keyed session storage across same-tab navigation/reload, explicit single-request replacement and a portable JSON download. Plan checks the current base before use. Closing the tab can discard it; it is never server-persisted approved data.

Feature: Create and edit achieved milestones
Description: Make existing history creation/editing directly discoverable from one Milestones manager.
Priority: High
Area: Settings → Milestones; Home contextual entry
Reason: Delivers the requested creation flow using existing scoped persistence.
Acceptance Criteria:
- Add milestone offers Achieved milestone and Planned race target with clearly different outcomes.
- An achieved milestone requires a name, permitted category and explicit owner confirmation; unknown historical facts remain absent.
- Successful save persists one record with a stable ID and refreshes the manager and Home projection; reload retains it.
- Cancel writes nothing. Invalid input and failed saves retain values and show a recoverable error.
- Editing preserves existing links unless explicitly changed and checks the current revision.
Dependencies:
- Existing race-history API, approved target reads, native modal and Home refresh path.
Risks:
- Result records must not be presented as confirmed target achievements without satisfying projection rules.

Feature: Assign, change and unlink a recorded race
Description: Reuse recorded-activity search to connect a milestone to its evidence and, when applicable, an approved target.
Priority: High
Area: Milestone editor and elapsed-target Record result action
Reason: Makes the existing assignment capability obvious and prevents inaccurate achievement claims.
Acceptance Criteria:
- Assign race and Change race open searchable, paginated recorded running activities scoped to the athlete.
- Selecting a race prefills a draft; the previous saved link is unchanged until explicit confirmation and save.
- Official facts remain editable and target-linked records require date, distance and elapsed result.
- Linked target achievement requires the correct target identity/date/distance and time comparison; a mismatch remains a recorded result.
- Unlinking a source activity preserves checked official facts and leaves the activity itself unchanged.
- Unknown/missing activities, empty search, retry and existing saved target snapshots are handled honestly.
Dependencies:
- Existing activity search, race-history CRUD and race-journey projection.
Risks:
- GPS facts may not be official results; duplication and plan-revision links need deliberate review.

Feature: Remove an achieved milestone safely
Description: Add a visible, named removal flow with clear consequences.
Priority: High
Area: Achievements list and confirmation dialog
Reason: Completes the requested milestone lifecycle and reduces accidental deletion.
Acceptance Criteria:
- Remove opens a confirmation naming the achievement and explaining that the source activity remains.
- Keep milestone/Escape cancels without a write; confirmation submits one revision-checked removal.
- Success refreshes list and Home, including any target that returns to Result pending; reload retains the deletion.
- Failures retain the confirmation with a useful retry path; revision conflicts require reload and review.
- Removing a milestone never deletes recorded activity data or changes an approved plan.
Dependencies:
- Existing DELETE race-history endpoint and current-revision reads.
Risks:
- An unfulfilled approved target can reappear after its result record is removed.

Feature: Prepare planned race-target additions, edits and removals
Description: Collect a target change in the manager and hand it to the established full-plan review workflow.
Priority: High
Area: Race targets tab; existing Plan creation/review workflow
Reason: Covers planned milestone management while preserving approved-plan authority.
Acceptance Criteria:
- Add/edit validates required name, positive distance, valid date and supplied positive target time; the primary performance goal prerequisite, twelve-target limit and unique IDs/dates are enforced.
- A target cannot be dated after the primary goal; no target time is guessed.
- Prepare plan update retains the operation and base version for the existing Plan workflow, clearly labelled as a prepared request.
- Remove target explains that approved data remains active until a complete replacement proposal is explicitly approved and published.
- Approval reviews the complete proposal and material session changes; import alone does not activate it.
- Home changes only after verified publication of the approved version; cancel/reject leaves the current version active.
- The main goal is shown separately and routes to its existing Plan flow rather than milestone deletion.
Dependencies:
- Athlete-keyed session-storage handoff and exact base validation defined in the architecture; existing proposal v2, approval and goal-context publication.
Risks:
- This spans the planning workflow; request preparation must never be represented as a canonical saved milestone.

## Product Assumptions

- This request concerns RacePredictor: supported by the registered project and the recent dashboard-design context. Both milestone meanings are covered because the current UI exposes both.
- Scope includes the owner-authorised branch implementation. Merging, production deployment and live plan changes are separate decisions.
- Race assignment means selecting an existing recorded activity, consistent with the current achievement manager. A future-event catalogue or registration service is outside this request.
- The feature branch starts from current main, retaining its homepage/authentication fixes. Deployment status is not inferred from source.
- No new role/qualifier property, optional-time target schema, autonomous achievement matching or embedded AI chat is added.

## Prioritisation Summary

- First ship achievement creation, race assignment and named removal as the bounded management improvement, reusing current APIs.
- Then ship planned-target handoff after its retention/base-version design is settled. Its broader dependency should not hold up historical management.
- Optional timeline rearrangement, image changes and new primary navigation are outside this design.

## Recommended Next Item

Create and edit achieved milestones, with the common manager/editor shell. It gives the athlete a usable entry immediately and supplies the surface reused by assignment and removal.

## Preview verification

The interactive design passed 18 local browser checks: creation, explicit confirmation, race assignment, named deletion/cancellation, linked-target achievement, prepared target addition/removal, Escape/focus restoration and layout checks. The 760px and 320px browser previews, including the narrow editor, had no horizontal overflow or JavaScript runtime errors. Desktop and mobile screenshots were visually inspected. These checks validate the design prototype only; live persistence, authentication, conflicts and deployed integration remain implementation acceptance work.
