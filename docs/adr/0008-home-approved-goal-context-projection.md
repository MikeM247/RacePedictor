# ADR 0008: Immutable approved goal context for goal-first Home

- **Status:** Accepted
- **Date:** 2026-09-25
- **Decision owners:** Product Owner and RacePredictor delivery team

## Context

Home needs to lead with the approved race goal and milestones while preserving the existing immutable approved-plan contract. The online app does not own a mutable goal record. Some historical plans may lack a verifiable proposal source, and a cloud plan can be published before a paired device has supplied all goal fields.

## Decision

1. Proposal v1 remains strict and byte-compatible. Proposal v2 explicitly carries at most twelve validated race milestones. Milestones are included in the content hash, review comparison, and the approved training-plan version. Import or rejection never activates a plan.
2. An explicit paired-device publication creates an immutable `TrainingPlanGoalContextProjection` sidecar linked by athlete, plan ID/version, approval hash, goal ID/revision, and paired-device ID. The payload is accepted only after the existing cloud plan projection matches all those identities and the milestone snapshot.
3. Local publication derives the sidecar only from the approved plan's retained, hash-verifiable source proposal and a matching settled/superseded goal record. Synthetic legacy-goal fallbacks and unverified notes/predictions are not sources. Historical backfill uses the same verifier and is a manual command.
4. `GET /api/v1/coaching/goal-context/active` is actor/athlete-scoped. It distinguishes a ready context, goal-only local context, no cloud active plan, pending sidecar, and unverifiable/unavailable context. A missing cloud plan does not establish that a local settled goal is absent.
5. Today adds optional effective `todayScheduleKind` and `nextWorkout` fields without changing existing fields. Home orders Goal and milestone, Today's focus, Latest activity. Current-fitness prediction and evidence are detail-only. No on-track verdict or race-day progress conclusion is produced.
6. Goal-context publication is not part of scheduled Second Brain sync. Applying the additive migration precedes server rollout; verified historical publication follows deployment. Rollback disables the new Home composition and retains projection rows.

## Consequences

- Existing plan JSON and old v1 proposals continue to parse; v1 receives an empty milestone list only when materializing the sidecar.
- Home can truthfully show `projection_pending` until the explicit paired-device operation succeeds.
- Cloud goal/milestone reads are immutable and auditable against exact approved plan provenance. New target values require an explicitly approved plan proposal.
- Unverifiable historical plans remain unavailable until a verifiable approval source is available; data is never reconstructed from synthetic defaults.
- Migration, local publisher, device endpoint, actor-scoped reader, immutable replay/conflict tests, and Home-state coverage are required.

## Rollback

Disable or revert the goal-first Home composition while retaining the additive table and accepted sidecar rows. Do not delete or rewrite plan or goal-context projections during rollback.
