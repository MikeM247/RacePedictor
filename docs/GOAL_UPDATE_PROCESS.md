# RacePredictor Goal Update Process

**Audience:** the athlete, a human coach, and Codex / another AI coach  
**Use this process whenever the primary race goal changes, a new goal is set, or a race milestone is added, removed, or retargeted.**  
**Authority:** this guide follows the approval and publication rules in [ADR 0002](adr/0002-digital-coach-control-boundaries.md) and [ADR 0008](adr/0008-home-approved-goal-context-projection.md).

## The rule

The currently active approved plan is the only source for the Home Page's approved goal. A conversation, Second Brain note, generated proposal, or imported draft does not update that goal. A new goal becomes approved only after the owner reviews and explicitly approves its proposal in RacePredictor. The approved version is immutable. To change it later, create and approve another version.

For online Home, the paired device must also publish the approved plan and its verifiable goal context. Publishing Second Brain context alone does not publish or activate a goal.

## 1. Assemble the evidence

Before drafting, read this guide, the current approved plan, the latest `coaching-context.v1.json`, and the Second Brain notes the owner selected for this planning conversation. Use these sources in this order:

1. The owner's current, explicit decisions about the goal and intended outcomes.
2. The current approved plan and validated activity history for training context.
3. Selected Second Brain notes for motivation, preferences, constraints, and event details.

The published `second-brain-context.v1` payload contains only the selected structured sections. It intentionally does not contain goals, arbitrary note text, or plan prescriptions. Read the relevant owner-selected notes directly when they are available. If an event, target time, date, or commitment is unclear or conflicts across sources, ask the owner to resolve it before proposing that value. Never infer a race target from a fitness estimate or approval prose.

## 2. Confirm what is changing

Write down the intended primary goal and each supported milestone before creating a proposal.

- **Primary goal:** event or outcome, distance, date, target time if supplied, and why it matters.
- **Each milestone:** event/title, distance, date, target time if supplied, and its role in the plan (for example, a checkpoint or qualifier).
- **Commitment and uncertainty:** distinguish a goal the owner has committed to from a conditional aspiration in the discussion and proposal rationale. The current goal schema has no structured commitment field, and Home displays a supplied target time simply as “Target time.” If that would misstate a conditional target, pause approval until the owner accepts that presentation or the schema and Home display are updated.
- **Training implications:** identify whether the new goal changes the training plan, plan dates, or weekly schedule. Propose sessions suitable for the new goal and current evidence; explain material changes.

A primary goal and milestones are separate. Do not promote a tune-up or checkpoint to the primary goal just because it occurs sooner. Proposal v2 supports at most twelve milestones, each with a unique ID and date no later than the primary performance goal. Every milestone in the current schema requires a target time; there is no separate structured relationship field. The `milestones` array links them to the primary goal, while the plan summary/rationale explains whether each is a checkpoint, qualifier, or tune-up. The proposal validator enforces unique IDs/dates and the primary-goal date boundary.

If the owner has not approved a milestone target time, never invent one. The current v2 contract cannot represent an event-only milestone without a time. Tell the owner that limitation and leave that event out of structured milestones until they supply a benchmark or the contract is extended to support an optional target time.

## 3. Create a fresh proposal

In RacePredictor, open **Plan → Create a plan with Codex** (or resume the open workflow). Update the goal and context form with the new primary goal's title, reason, distance, race date, and target time when one is confirmed. Review the profile, timezone, weekly routine, and available days, then publish the context. Publishing creates planning context only; it does not approve or activate a plan.

Give Codex or the human coach all of the following:

- this guide (`docs/GOAL_UPDATE_PROCESS.md`);
- the newly published `coaching-context.v1.json`;
- the current active approved plan;
- the selected, relevant Second Brain notes.

Ask the coach to follow this guide and return one complete `coaching-plan-proposal.v2` JSON artifact. It must use the new goal from the published context as `proposedGoal`, include every supported intermediate race target in the top-level `milestones` array, and include a complete plan and weekly structure. Preserve existing sessions only when they still serve the new goal and remain appropriate; otherwise explain and revise them. Include assumptions and cautions. Do not return prose or a milestone-only patch as the proposal.

Milestone fields are `id`, `title`, `distanceMeters`, `targetDate`, and required `targetTimeSeconds`; `eventName` is optional. Do not add a `relationship` property because the current schema does not accept one. Use a stable descriptive ID with the event and date, such as `milestone_gaterite_20261004`. The app validates the proposal schema and content hash.

## 4. Import and review as the owner

Back on **Plan**, select and import the proposal JSON. Import creates a draft only. Review all of these before approval:

- the primary goal title, event, distance, date, and target time;
- each milestone's event, distance, date, target time, and relationship to the primary goal;
- plan dates, timezone, sessions, weekly structure, rationale, assumptions, cautions, and the material-difference list;
- whether the activity-history fingerprint is current, and any warning that requires acknowledgement.

Correct or reject a proposal with inaccurate or unsupported information. Only the owner should press **Review and approve** and then explicitly confirm the decision. Approval creates a new immutable plan version, settles its goal, and retires the previously active version atomically. Rejection leaves the current approved goal and plan active.

## 5. Publish the approved version to online Home

After local approval, export the active approved snapshot from the repository root:

```powershell
npm run coaching:export-active-plan -- --output ".local/racepredictor/approved-plan-current.json"
```

On the paired Windows device, load the existing sync settings and publish that exported plan:

```powershell
$syncConfig = Get-Content -LiteralPath "$env:LOCALAPPDATA\RacePredictor\local-sync-config.json" -Raw | ConvertFrom-Json
$env:RACEPREDICTOR_DATABASE_PATH = $syncConfig.databasePath
$env:RACEPREDICTOR_OBSIDIAN_VAULT_PATH = $syncConfig.vaultPath
$env:RACEPREDICTOR_CLOUD_URL = $syncConfig.cloudUrl
$env:RACEPREDICTOR_ATHLETE_ID = $syncConfig.athleteId
npm run sync:local -- publish-plan ".local/racepredictor/approved-plan-current.json"
```

The paired-device credential is read from its Windows-protected store; do not copy it into the document, shell command, or proposal. Successful publication reports both the plan and approved goal context. If the result says the goal context is pending, retry the sidecar after resolving the reported cause:

```powershell
npm run sync:local -- publish-plan-goal-context <approved-plan-id>
```

This explicit publication is separate from scheduled `sync-and-publish` Second Brain updates. It does not create or approve a plan.

## 6. Verify the result

Refresh Home and verify that it shows the new primary goal, target outcome, next approved milestone(s), and new plan version. Open Plan and confirm the same version is active. If Home says **projection pending** or **unavailable**, do not reconstruct goal fields from prose or edit cloud data; resolve the paired-device publication and source-verification issue, then retry publication.

Home may say race-day progress cannot yet be assessed. Keep that state unless RacePredictor has a supported comparison for that specific target and date. A current-fitness estimate is not proof of race-day progress.

## AI and human handoff checklist

- [ ] Read this process and the owner's selected source notes.
- [ ] Confirm the primary goal and milestone values with the owner; mark uncertain values as omitted or conditional.
- [ ] Use the latest published context and active approved plan; do not rely on stale generated context.
- [ ] Produce and validate a complete `coaching-plan-proposal.v2` with a full plan and structured milestones.
- [ ] Leave approval to the owner; import does not activate.
- [ ] After owner approval, publish the approved plan and verified goal context to the cloud when online Home must update.
- [ ] Verify Home against the active plan version and report any pending or unavailable projection truthfully.
