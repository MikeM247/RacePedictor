# Activity split comparison

Implemented 2026-10-06 from the approved desktop/mobile bar-chart design; updated 2026-10-07 for the shared activity dialog and refined split targets.

## Activity entry and full-screen detail

Calendar and Training share one full-viewport `ActivityDetailDialog`. In Calendar, the date control continues to open or select the day summary, while each recorded activity title/metric control opens that activity directly. The compact Day details dialog retains planned-session actions and activity summary launchers; opening an activity overlays its full record and closing restores the day view and launcher. Training rows and direct `activityId` links open the same dialog while the activity list, filters, loaded pages, scroll position, selected-row context, and browser history remain mounted. The dialog includes the existing brand image and contextual Back to Calendar/Training control, with a fixed header and one vertical scroll region. It traps focus, closes on Escape, inerts the background, locks body scrolling, restores focus, and retains Back during loading, missing-record, and retryable errors. Only the selected activity is fetched; no API, URL contract, or viewing write is added.

## Runner experience

Splits appear immediately below the activity summary in Calendar and Training. They open initially when data exists unless the user saved them collapsed. Disclosure state, Chart/Table choice, All splits/Detail choice, selected split and visible window are retained per athlete/activity for the browser session.

Actual pace is a lime bar. Numeric planned targets use hollow, solid `#d5adff` rectangular outlines with the same x-coordinate and width as the actual bar and a lower edge at the chart baseline. The target stroke is 1.75px, separated from green fill by a dark under-stroke 1px wider; below 540px plot width it is 1.5px. Exact and approximate blocks use their stored target pace. Range blocks outline the existing midpoint and preserve the target bounds in a narrow same-width lavender band. Effort-only, missing, stale and unavailable comparisons never gain a numeric target outline. Pace is labelled min/km with faster values higher. The scale includes the whole activity and all valid numeric targets and stays fixed between views and while paging.

All splits is the default and shows the complete activity (all 22 splits in the half-marathon fixture) on desktop and mobile. Detail calculates capacity from plot width at 44px per column, capped at ten (approximately six at 390px and five at 320px). Next/Previous and horizontal swipes advance with one-split overlap; the last window clamps to the end. Detail initially includes the selected split. Selection survives mode changes, resizing and reopening. A native selected-split picker and previous/next split buttons remain available when numbered selectors cannot fit. Numbered selectors use 44px targets where columns allow. Table view exposes all recorded splits, both target bounds, approximate notation and effort guidance. The final 193m example is labelled as a partial split, not a full kilometre.

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
