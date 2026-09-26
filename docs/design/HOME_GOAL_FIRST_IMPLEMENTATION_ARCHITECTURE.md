# Goal-first Home implementation architecture

Status: implementation handoff
Decision date: 25 September 2026
Scope: additive product/data work required to deliver the approved Goal → Today's focus → Latest activity Home design. This document does not specify an on-track verdict or a new race-readiness model.

## Summary

Home will orient the runner around their approved main race goal and next approved milestone, explain today's effective approved workout or rest, and preview the latest recorded activity. The page will state plainly that race-day progress cannot yet be assessed when it has only a current-fitness estimate. It may show a short observation about recorded training, with its period and source limitations.

The local product already stores a structured settled goal and associates an approved plan with a goal ID and revision. Home's local Today response currently exposes only goal title, purpose, and date. The online approved-plan projection stores the plan but does not expose the linked goal; online Today currently returns `goal: null`. The dashboard's marathon prediction is extrapolated from a recent activity and is labeled current fitness. It is not a race-date assessment. See [the Home design change](HOME_GOAL_FIRST_DESIGN_CHANGE.md), [coaching contracts](../../packages/core/src/contracts/coaching.ts), [the cloud prediction builder](../../packages/core/src/services/cloud-dashboard.ts), and [the cloud Today projection](../../packages/core/src/services/cloud-coaching.ts).

This handoff supersedes earlier Home hierarchy statements as directed by [DESIGN_INTENT_CONTRACT.md](DESIGN_INTENT_CONTRACT.md). Preserve the three primary destinations (Home / Training / Plan), explicit proposal approval, existing plan version authority, and evidence limits.

## Goals and non-goals

### Goals

- Show an approved marathon goal with its target date, distance, and target time when those values exist.
- Show the next explicitly approved race milestone with its date, distance, and own target time. The user's example is a half marathon before the marathon.
- Show today's approved effective session or explicit rest, its approved purpose and prescription cue, and why it belongs to the approved plan. On a rest day, include the next effective scheduled workout when one exists.
- Show the latest recorded activity by activity date, including while its review is pending. Reuse the persisted review and comparison reference.
- Explain progress honestly. For this release, provide a factual observation from recorded training where supported and say race-day progress cannot yet be assessed because a validated race-date assessment is not available.
- Keep the three groups in the agreed order and usable at phone and desktop widths.

### Non-goals

- No new prediction calculation, race-date forecast, readiness score, probability, on-track classification, causal workout-to-race-time claim, or automatic plan adaptation.
- No inference of a half-marathon milestone from a selectable prediction distance, an activity, or an unstructured rationale.
- No session completion inference from date proximity. No change to approval authority, plan schedule permissions, athlete scope, privacy boundaries, or reminder delivery.
- No application implementation is included in this document-only handoff.

## Current system and data findings

| Concern | Current source and limit | Required direction |
|---|---|---|
| Main goal | `SettledGoal` contains title, why, target kind, distance/date, optional target time and optional event name. A plan holds `goalId` and `goalRevision`. Local Today returns a narrower goal summary. | Resolve the exact goal linked to the selected approved plan/version; expose a safe summary without changing goal authority. |
| Milestone | No structured milestone field or milestone relationship exists in the plan proposal contract. | Add explicit milestone data to a new proposal version and preserve it with the approved plan context. |
| Online goal | Cloud stores `TrainingPlanProjection.plan` as JSON. That plan has a goal ID, but no settled-goal snapshot. Cloud Today currently sets its goal to null. | Add an immutable, plan-version-linked goal-context projection published by the paired device. |
| Prediction | Cloud dashboard emits 5 km, 10 km, half-marathon and marathon estimates based on recent runs, with a heuristic estimate band. `generatedAt` does not identify a supported race-date forecast or prove input coverage. | Keep it in readiness detail as current fitness. Do not use it as the Home progress verdict. |
| Training observation | Cloud dashboard derives weekly distance and running activity count from normalized activities. | Use only as an observation of recorded activity for an explicitly stated period. Do not imply the record is complete or the trend proves race readiness. |
| Latest review | Home already loads the latest activity and persisted activity review separately. The review contract exposes plan/session match state and comparison evidence. | Keep activity and review availability independent; use the same review on Home and detail. |
| Today / rest | Today exposes the effective session for the selected date. `rest` can also mean there is no workout on the date. | Distinguish a prescribed rest entry from an unscheduled date and supply the next effective non-rest session. |

The repository worktree contains no local coaching database. Production goal values, existing activity coverage, and whether a milestone exists in any private source were not inspected. Treat these as a pre-implementation, read-only verification task, not a reason to create values in code or in this document.

## User experience and content contract

Home has exactly three persistent groups, in DOM and visual reading order:

1. **Goal and milestone.** Show the active approved main race, date and target time when set; show the next approved milestone and its own target when present. Lead with one concise progress statement and one reason. For the first release, the expected assessment wording is equivalent to: “Race-day progress cannot yet be assessed: the available marathon estimate describes current fitness, not your race-day result.” Add one recent-training observation only when it is directly supported by recorded data, for example: “Recorded running: [distance] across [activity count] runs from [start] to [end].” Label it as recorded history.
2. **Today's focus.** Show the effective approved workout or rest, date, approved purpose, prescription/focus cue and a plain relationship to the approved goal (for example, “Part of your approved marathon plan”). Do not generate motivational causation. For an explicit rest entry, explain the supplied recovery purpose and show the next scheduled effective non-rest workout and date when available. If no workout entry exists for today, say none is scheduled; do not call that intentional rest.
3. **Latest activity.** Show the latest recorded activity identity/date and a brief planned-versus-done observation plus bounded goal implication only when a persisted review has a reliable plan/session reference and supplies that conclusion. Otherwise show the recorded facts and actual pending/unavailable state. Keep a named View session action.

Use direct links from these summaries to readiness detail, Plan, Calendar, and activity detail. No raw prediction grid or operational status panel becomes a fourth group. Existing plan and review advice remains advisory and never changes an approved prescription.

The first screen is a review target, not a reason to reduce text size or hide caveats: show all three summary groups on common desktop viewports without scrolling; on common phone viewports show the full goal and today's focus and a latest-activity preview where feasible at normal readable text size. Review at the binding contract's 320, 390, 768, 1024, and 1440 CSS-pixel widths and 200% zoom. Keep one column and no horizontal page scrolling below 768px. Maintain semantic order at every width.

## Data contracts and lifecycle

### Proposal compatibility and milestone authority

- Preserve `coaching-plan-proposal.v1` parsing and its existing approval behavior. Treat a valid v1 plan as having an empty milestone list; do not infer a milestone from its goal text or prediction options.
- Introduce `coaching-plan-proposal.v2` as a distinct versioned envelope. It contains the existing proposal content and a `milestones` list of zero or more race targets. Each milestone has a stable ID, display title, performance distance, target date and required positive target time in seconds; event name is optional. Limit the list to 12, require unique IDs and dates, and require each milestone date to be on or before the main performance goal date. Preserve proposal, goal, routine, context and athlete identity checks.
- V2 content hashing includes the milestone list. Proposal review displays each milestone and its difference from the active approved version. Approval/rejection remains the existing explicit user decision. A proposal import or saved draft does not publish or activate milestones.
- Store approved milestone data with the immutable plan version. The next milestone is the approved milestone with the earliest date on or after the runner's current plan timezone date. If all milestones are in the past, show no upcoming milestone; do not infer that one was completed. A plan replacement may change milestones only through proposal review and approval.

### Online approved goal-context projection

Add a `TrainingPlanGoalContextProjection` persisted in Neon, keyed by athlete and plan ID and associated with the exact plan version and approval content hash. It holds a strict, bounded snapshot of the approved main goal's user-facing fields and approved milestones plus a canonical context hash and publication timestamp. The snapshot is scoped to the approved plan version; it does not claim that the goal record remains the currently settled goal after a later replacement. It is immutable after first successful publication. A retry with identical hash is idempotent; conflicting content for the same plan/version is rejected.

Add a device-authenticated additive endpoint `POST /api/v1/sync/device/plan-goal-context`. The request identifies athlete, plan ID/version, goal ID/revision, approved plan content hash, settled goal snapshot, milestones, and context hash. The server verifies the paired device/athlete scope, validates the settled goal and milestone schemas, loads the corresponding already published approved plan, checks plan/goal identity and version/hash, then inserts the projection transactionally. A missing plan projection or mismatched identity/hash returns a conflict/unavailable response and is safe to retry after correction. This endpoint never approves, activates, edits, or retires a plan.

Extend local sync publication so an approved plan publication is followed by its linked goal-context projection. Read the goal by that plan's goal ID and verify its revision and user-facing fields against the immutable approved source proposal (`proposedGoal`) embedded in that plan. The local goal row may now be `superseded` because a later goal was approved; this does not invalidate a snapshot proven by that historical plan's matching ID/revision and approval content hash. Read milestones from the plan's validated source proposal. Do not use the current synthetic legacy-goal fallback as backfill evidence. The online Home remains usable while the sidecar is absent and clearly reports that approved goal context is not available online.

### Read interfaces

- Add actor-scoped `GET /api/v1/coaching/goal-context/active`. It reads the active approved plan and its matching immutable projection. Response data has a state (`ready`, `goal_only`, `no_active_plan`, `projection_pending`, or `unavailable`), nullable plan reference, nullable main goal summary, milestones (empty only when a ready projection explicitly contains none), and projection publication metadata. A missing projection is not returned as an empty milestone list or “no goal”. Local mode reads the active plan's linked goal snapshot and proposal using the same response schema; it may return `goal_only` if a settled goal exists without an active plan. Cloud with no active plan reports `no_active_plan`, since absence of an active cloud projection does not prove the local goal is absent.
- Extend `todayRouteDataSchema` additively with optional `nextWorkout` and `todayScheduleKind` fields. `todayScheduleKind` distinguishes `prescribed_session`, `prescribed_rest`, `unscheduled`, and `unavailable`. `nextWorkout` is the first effective upcoming non-rest, non-skipped session strictly after today's date in the plan timezone, or null when none exists. Keep old clients compatible; new clients treat a response lacking these fields as legacy/unavailable, never as confirmed absence.
- Reuse existing dashboard overview, activities list and persisted activity-review interfaces. Do not add goal verdict fields to their existing payloads in this phase.
- Document the additive routes/schemas in `API_CONTRACT.md`, the new Neon projection and migration in `DB_SCHEMA.md`, and the paired-device/read responsibilities in `ARCHITECTURE.md` when implementation proceeds.

## Home data flow and failure behavior

Load goal context, Today, latest activity/review, and optional analytics independently. The goal-context group must not depend on analytics success. The Today summary must not wait for the review. Refreshing one source must not reorder sections, move focus, reset scroll, or make a different section appear empty.

| Condition | Required user-facing result |
|---|---|
| No settled goal locally | Say no goal is approved; provide a Plan link. Keep usable schedule and training information. |
| No active plan but a settled local goal exists | Show goal as approved and say there is no approved schedule; do not show proposed sessions as today's prescription. |
| No active cloud plan | Say no approved plan is available online; do not assert that no goal exists locally. |
| Cloud plan exists, projection not published | Show the active plan status and “Approved goal details are not available online yet”; preserve Today and activity. |
| Goal is consistency-type or has no race target time | Show the actual goal type/available target. Say the race target time is not set; do not turn it into a race-performance comparison. |
| No milestone | Show the main goal and “No upcoming milestone is set.” |
| No compatible race-date assessment | Say race-day progress cannot yet be assessed and name the limitation. A current-fitness estimate may be reached in readiness detail only. |
| Sparse or unavailable activity history | Omit the training observation or state that there is not enough recorded history for it. Never equate no history with no progress. |
| Prescribed rest / unscheduled today | Label from `todayScheduleKind`; only prescribed rest may be called intentional. Include next workout only if the API returns one. |
| No latest activity | Say no activity is recorded and link to Training/Add training. Do not infer a missed workout. |
| Review pending or failed | Show actual status, measured activity facts, and View session. Omit review conclusions that are not ready. No invented completion time or progress percentage. |
| Stale/error in one source | Name the affected source and preserve other groups. Keep last usable content with age when available; do not turn failure into an empty state. |

## Implementation responsibilities and sequence

1. **Preflight data audit:** On an authorized read-only environment, inspect the active plan, linked settled goal ID/revision/target, proposal version/source, and available activity coverage. Record only whether fields are present/valid and any gap in the handoff ticket; do not copy private target values into source control. If the local goal is absent or legacy-unverifiable, the UI must use the unavailable state until the runner imports and approves valid data.
2. **Core contracts and approval:** Add v2 proposal/milestone validation and approval comparison. Preserve v1 acceptance and existing approval confirmation. Ensure content hashes and immutable plan snapshots include milestones.
3. **Local persistence/sync and cloud projection:** Implement immutable sidecar persistence, migration, device endpoint, paired-device publisher, retry/idempotency, and backfill for verified approved versions. Publish no draft. On replacement/selection of a historical approved plan, resolve the projection for that exact plan version.
4. **Read composition:** Add active goal-context read for local/cloud modes and additive Today next-workout/schedule-kind fields. Keep standard actor/device authorization and athlete scoping. Map missing sidecars to pending/unavailable, not false absence.
5. **Home presentation:** Replace the existing lead estimate layout with Goal and milestone → Today's focus → Latest activity. Move estimates, uncertainty, trends and detailed session analysis behind contextual detail links. Preserve Home/Training/Plan navigation and return context.
6. **Rollout:** Apply the additive database migration before deploying code that reads the projection. Deploy server contracts and publisher, backfill verified plans, then enable the Home layout. The new screen can ship with a truthful projection-pending state; no destructive backfill or production write is part of verification. If projection publication fails, retry through the paired sync path and keep Home useful.

## Acceptance criteria and verification

### Contracts and persistence

- [ ] V1 proposal fixtures still parse/import/approve with zero milestones; V2 fixtures round-trip all approved milestone values and include them in the hash.
- [ ] Invalid target time/distance/date, duplicate milestone IDs/dates, milestone after main goal, wrong athlete/plan/goal revision, or content-hash mismatch are rejected before approval or projection.
- [ ] Rejecting/importing a proposal does not change active goal, plan or cloud projection. Explicit approval creates the exact goal/milestone snapshot for that immutable plan version.
- [ ] Projection publication is paired-device and athlete scoped, idempotent on replay, conflicts on changed content, and cannot change activation state. Historical plan selection reads that plan's own projection.
- [ ] Backfill publishes only when the goal snapshot's ID/revision matches the immutable proposal attached to the approved plan and the plan approval hash is valid. A goal row may be superseded by a newer approved goal; missing or synthetic legacy goal data remains unavailable.
- [ ] Today returns correct schedule kind and next effective non-rest workout across rest, unscheduled, skipped, amended, moved, end-of-plan and timezone-boundary cases. Legacy responses missing additive fields remain clearly unavailable.

### Home states and behavior

- [ ] Goal, today's focus, latest activity appear in stable DOM/visual order; each data source fails independently.
- [ ] Main goal and milestone display only approved values; no plan/draft/goal mismatch is hidden. Goal-time absence and no upcoming milestone have distinct states.
- [ ] Progress copy never claims on-track/off-track. It distinguishes current-fitness estimate from race-date assessment and labels recorded-train observations with period and coverage limitations.
- [ ] Explicit prescribed rest differs from no scheduled entry. Next workout is effective, future, non-rest, and not skipped.
- [ ] Latest recorded activity is shown while review is queued/waiting/processing/attention/error. Planned-versus-done and goal implications require supported persisted review and plan/session identity.
- [ ] No-goal, goal-without-plan, cloud projection-pending, no milestone, no target time, no compatible prediction, stale source, no activity, pending review, and group error fixtures show truthful copy and useful detail paths.

### Responsive/accessibility and rollout

- [ ] At desktop 1440px (and a common laptop viewport), all three summary groups are visible without scrolling where feasible. At 390px phone width, main goal and today's focus are fully visible in a common viewport and latest activity preview appears where feasible at normal text size. Record viewport height and any infeasibility; do not shrink essential text or hide caveats.
- [ ] Inspect 320, 390, 768, 1024 and 1440 CSS-pixel widths and 200% zoom. No page-level horizontal scroll, clipped essential text, inaccessible control, or changed reading order.
- [ ] Keyboard and screen-reader checks confirm heading order, status updates, link names, focus return from detail, 44×44 CSS-pixel targets, contrast, and reduced-motion behavior.
- [ ] Deploy/rollback check confirms old proposal v1 and existing plan reads continue to work. A missing projection leaves the approved plan and Home schedule intact; rollback can disable the new Home composition without deleting goal-context rows.

### Implementation verification record — 25 September 2026

The Home browser checks use a synthetic fixture; these measurements do not verify the live account. At 390×844 CSS pixels, the approved goal content ends at y=591 and Today's focus ends at y=832, so both fit. The latest-activity summary begins below the first screen (activity identity ends at y=965 and its takeaway at y=1069); that optional phone preview does not fit at readable text size in this fixture. At 1024×900 all three summaries fit, with the latest takeaway ending at y=898. At 1440×900 it ends at y=813.

The browser checks found no horizontal overflow at 320, 390, 768, 1024 or 1440 CSS-pixel widths, or at the 720-pixel effective viewport used for the 200% zoom check. Keyboard navigation, focus return, reduced motion and axe accessibility checks passed. The 390-pixel and desktop first-screen measurements are recorded by `F02 records first-screen summaries` in `apps/web/e2e/redesign-home.spec.ts`.

## Decisions and remaining data checks

- Milestones are part of an approved plan version, not prediction options or freeform Second Brain text.
- One next milestone is selected from explicitly approved future milestones by the plan timezone date. A past milestone is not reported as completed without completion evidence.
- The online read model uses a plan-linked immutable sidecar because the existing plan publication is immutable and the online app does not own a mutable goal record. This keeps plan version, goal snapshot and milestones auditable together without rewriting an already approved plan JSON payload.
- No on-track verdict ships in this slice. A future assessment needs a separately reviewed method, evidence provenance/coverage, compatible timeframe, uncertainty semantics, and a versioned assessment contract.
- Before backfill, validate whether the live approved marathon target time and linked main goal are present in the plan's immutable approval source, whether the current approved plan is tied to that goal revision, and whether any half-marathon milestone is already explicitly approved. If absent, the product should show missing/pending states until a new proposal is approved; it must not recreate private values from estimates or notes.
