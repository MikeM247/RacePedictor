# Activity split comparison

Implemented 2026-10-06 from the approved desktop/mobile bar-chart design.

## Runner experience

Splits appear immediately below the activity summary in Calendar and Training. They open initially when data exists. Disclosure state, Chart/Table choice, selected split and visible window are retained per athlete/activity for the browser session.

Actual pace is a lime bar. Violet dashed markers show exact/approximate targets; range shading preserves both bounds. Effort-only blocks show guidance without a numeric marker. Pace is labelled min/km with faster values higher. The scale includes the whole activity and all numeric targets and stays fixed when paging.

Charts at least 540 CSS pixels wide show ten splits, narrower charts show five. Next/Previous and horizontal swipes advance nine/four splits with one-split overlap; the last window clamps to the end. Tap/click a bar or numbered selector for its exact pace, planned range and difference. Left/Right keys move selection. Arrow controls are 44px. Table view exposes all recorded splits and guidance. The final 193m example is labelled as a partial split, not a full kilometre.

No approved comparison, failed reads and stale comparisons leave actual splits usable. Loading and retry are scoped to the planned comparison. Effort guidance is never converted into a numeric target. Recorded provider splits are not represented as official course splits.

## Architecture and boundaries

- Core contracts: `packages/core/src/contracts/activity-pace-comparison.ts`.
- Server integrity/source reconstruction: `packages/core/src/services/activity-pace-comparison.ts`.
- Browser calculations: `packages/core/src/services/split-pacing.ts`.
- Shared UI: `apps/web/components/activities/activity-split-comparison.tsx`.
- PostgreSQL repository: `packages/db/src/cloud/prisma-activity-pace-comparison-repository.js`.
- Local receipt cache: `packages/db/src/local-activity-pace-comparison.js`.
- Routes: `apps/web/lib/server/pace-comparison-handlers.ts` plus thin authenticated route wrappers.
- Decision: [ADR 0009](../adr/0009-reviewed-activity-pace-comparisons.md).

Blocks reference inclusive, zero-based recorded split indices. Kinds are `exact`, `approximate`, `range` and `effort`. Range pace bounds are seconds/km ordered faster to slower. Sparse coverage is permitted and labelled "No approved target". Overlapping, reversed, out-of-bounds or unsorted blocks are rejected. Plan/proposal schemas are unchanged.

## API

| Endpoint | Authentication | Result |
|---|---|---|
| GET `/api/v1/activities/:activityId/pace-comparison` | Owner session in cloud / existing local mode | `{ data: { activityId, status: "ready" \| "none" \| "stale", comparison } }` |
| GET `/api/v1/sync/device/activities/:activityId/pace-comparison-context?planId=…&sessionId=…&sessionRevision=…` | Paired device | `{ data: { activity, activityRevision, comparisonRevision, source } }` |
| POST `/api/v1/sync/device/activity-pace-comparisons/publish` | Paired device, rechecked in transaction | Validated approved artifact → 201 `{ data: { comparison } }` |

Identifiers and schemas are bounded and strict. Actor athlete scope is authoritative. Missing data returns 404; invalid input 400; stale revision/source, reused artifact identity and transaction conflicts 409. Publication disabled by the feature flag returns 503. Identical replay returns the original comparison and creates no additional row.

## Review and publication workflow

Run commands from the repository root. Reuse the existing DPAPI paired-device credential; do not paste bearer tokens into commands. Set RACEPREDICTOR_CLOUD_URL for the intended environment. Set RACEPREDICTOR_DATABASE_PATH if the accepted cloud receipt should also be available in local mode. Local viewing resolves cloud IDs via the existing activity mapping; differing split values show a stale comparison.

1. Deploy the additive migration and API before preparing a real artifact. `prepare` only reads the explicit activity and historical prescription:

```powershell
npm run db:pace-comparison --workspace @racepredictor/db -- prepare --activity <activity-id> --plan <approved-plan-id> --session <session-id> --out draft.json
```

This creates `draft.json` and `draft.json.context.json` without overwriting existing files. Add `--session-revision N` only when reviewing that exact amendment revision; omission selects the original approved prescription.

2. Codex fills `blocks` from that prescription, retaining approximate language, ranges and effort conditions. Show the source prescription and proposed blocks to the owner. Validate without approving:

```powershell
npm run db:pace-comparison --workspace @racepredictor/db -- validate --draft draft.json --context draft.json.context.json
```

3. Only after explicit approval of those exact blocks, seal and publish:

```powershell
npm run db:pace-comparison --workspace @racepredictor/db -- approve --draft draft.json --context draft.json.context.json --owner-approved --out approved.json
npm run db:pace-comparison --workspace @racepredictor/db -- publish --artifact approved.json
```

Artifact approval does not publish. Publication checks the authoritative source and revisions again. Retry the same artifact after an uncertain response; never silently edit approved bytes. A conflict requires preparing and reviewing fresh context. A correction appends a new comparison revision.

## Sunday race example

The synthetic regression fixture uses 22 recorded splits, including a final 193.1m segment. Candidate reviewed blocks are km 1–3 approximately 5:55/km, km 4–15 at 5:50–5:52/km, and after km 15 "build only if sustainable" without a numeric target. The source was identified during design as plan v11; it must be re-fetched and verified before publication.

The fixture is not an approved production artifact. No live comparison has been published by this implementation. After deployment, prepare the actual activity `activity_strava_20441911939` against plan `plan_74598ed2-1815-4e5e-ab32-d7284d4e3a24`, session `session_a74ff2bc-2324-4fb2-80b0-177e57d25d77`. Review the fetched prescription and block boundaries before approving; do not assume the plan revision is a session amendment revision.

## Release and rollback

1. Generate Prisma client and apply normal migrations in the intended environment. Comparison migration is `20261006140000_activity_pace_comparisons`; local schema version 6 adds its cache independently. Preserve unrelated journal migrations in this shared checkout.
2. Deploy the build, authenticate as the owner, verify actual-only state, then publish the explicitly reviewed real artifact through the paired-device workflow.
3. Verify the same comparison in Calendar and Training, on desktop and mobile, with no activity/plan writes on view.
4. If needed, set `RACEPREDICTOR_PACE_COMPARISONS_ENABLED=false` and redeploy. Historical records are retained. Re-enabling restores valid overlays.

Local receipt caching occurs on publication from the configured workstation. Automatic comparison fan-out to other local devices is not included. There is no native mobile project in this repository; mobile is the responsive web application.

Validation evidence: [QA report](../progress/activity-split-comparison-qa-20261006.md).
