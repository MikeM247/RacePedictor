# Road to Comrades dashboard

> **21 October 2026 management amendment:** Home's former Manage achievements dialog launcher is now Manage milestones, linking directly to Settings. The old achievement manager is replaced by MilestoneManager and MilestoneAchievementEditor, with a single native dialog and shared history APIs. Planned-target requests follow the approved-plan boundary. Use [the current milestone flow](MILESTONE_MANAGEMENT.md) for management instructions below.

Owner direction, 17 October 2026: implement option one, second version, including achieved milestones. The photographic background is decorative; all text, milestones, statuses, controls and recorded facts are live HTML. This supersedes the slim banner and inline check-in presentation in the 13 October Home design amendment.

## Data and achievement rules

| Surface | Authoritative source | Behaviour |
| --- | --- | --- |
| Main goal and future races | Existing verified active goal-context API, approved goal revision and plan milestones | Sort by race date, deduplicate the main goal, retain each race's own target. Never fill gaps from a prediction or example image. |
| Historical achievements | New athlete-scoped `race_achievements` records in the application database, linked to existing recorded activities when available | Preserve labels and optional dates/results from history. A PB is an explicit user confirmation, never inferred from a partial activity list. Unknown dates/times remain absent. |
| New achieved targets | Confirmed race result linked by target ID, race date and official distance; compare elapsed result against that target | `sub`/`under` means strictly less than; a numeric target means at most. An unrelated 10 km run, expired target, missing result or prediction never earns a checkmark. |
| Daily feeling | Existing athlete-scoped wellbeing journal GET/PUT | First Home visit on a plan-local day opens a modal after the journal loads. Save or Skip today persists through the existing revision-checked API. Closing defers the prompt for the current browser session; Edit remains available. No writes on page load. |
| Next session | Existing Today and effective Calendar endpoints | Retain the approved up-next selection, rest, amendments, ambiguity and recorded-run advancement rules. Summarise approved structured duration/distance; expand the full prescription. All supplied cautions stay visible. |
| Last activity | Existing recorded activities API | Show real distance, elapsed time, pace, date and detail link. Decorative landscape image is never a claimed GPS trace or activity photograph. |

The inspected database schema stores activity dates, distances and elapsed times and race reflections, but no explicit achievement/PB categorisation. Add `race_achievements` (PostgreSQL migration) and its local SQLite equivalent. The new `/api/v1/coaching/race-history` API supports GET, revision-checked PUT and DELETE. Reads are athlete scoped; cloud writes require the signed-in owner. A source activity link must belong to that athlete. Manage achievements searches existing recorded activities, prefills their facts, allows the owner to check the official distance/result, and explicitly confirms the category. Historical achievements without known dates/times can also be recorded. Editing/removing a record updates the timeline; stale revisions are rejected and reloaded. No arbitrary notes are extracted, no prediction is treated as a race result, and no sample data is used as a fallback.

Historical records require `confirmedBy: "user"` and an explicit achievement type to display a manually confirmed achievement. A newly linked result can earn a goal achievement only when its date/distance/elapsed time satisfy the current approved target. Retain stable record IDs and target links. Never match on distance alone. Completed targets move to Achieved; unmatched past targets remain labelled Result pending, not achieved. The server captures the approved target criteria with each linked result, so an earned historical milestone survives plan replacement. A corrected result is re-evaluated against that original target; the current approved targets are evaluated separately. Client-supplied target snapshots are discarded. New plan revisions and achievement edits re-evaluate these rules without mutating either source. Confirmed official result facts are snapshots: later GPS edits do not silently rewrite them; corrections use Edit achievement.

## Presentation and behaviour

Use the existing Speedzone brand, navy surfaces, cyan interaction colour and lime completed markers. A licensed/AI-generated, locally served sunrise road photograph provides the wide hero, with a dark contrast overlay and live goal/date/target. Asset source and illustrative status are documented alongside the asset. No interface screenshot is used as a background.

Desktop: compact greeting/check-in control; photo hero with goal and View plan; connected Achieved → Now → Ahead timeline; compact next session and last activity cards side by side. Keep the existing Home, Calendar, Readiness navigation and Settings utility. Mobile: shorten the hero, stack Achieved and Ahead with a connecting Now marker, wrap or expand long milestone lists without horizontal page overflow, then next session and last activity. Never shrink six labels into one row. Goal and milestone detail links are keyboard accessible; status uses words and symbols as well as colour.

The optional daily modal uses native dialog focus containment, Escape, backdrop, scroll locking and return focus. Good / Okay / Low are labelled choices, followed by Save check-in. Skip today is explicit. Existing detailed check-in editing remains available. Wait for plan timezone before reading/opening the automatic prompt; roll over at plan-local midnight, re-read on return/focus, and preserve failed/conflicting writes for review. Check-in never alters the approved workout.

Refresh goal, history, schedule and activity reads on focus/visibility return and every minute while visible. Keep successful content mounted while refreshing to avoid stealing focus or resetting expanded details. Fetch errors are scoped to the affected content and stale saved content is labelled.

## Delivery stages

1. Create `codex/road-to-comrades-dashboard`; record this plan and the owner amendment. Inspect existing contracts and retain their auth/approval rules.
2. Add validated race-history data, local/cloud CRUD and pure target/result projection. Test PB confirmations, under versus equal targets, unrelated results, corrected history, plan changes, empty/error states and athlete isolation.
3. Create the hero asset and implement the live responsive hero/timeline, compact session/last-activity cards and daily modal. Retain full session details and recovery cautions.
4. Run type checking and focused contract/service/API tests. Exercise the full browser flow with deterministic fixtures, real local route reads, no page-load writes, persisted check-in save/skip/reload, errors/conflicts, keyboard focus/Escape, midnight/timezone changes, refreshed plans/history, and narrow/desktop layouts. Capture review screenshots and run accessibility checks.
5. Record validation evidence and any source-data gaps. Production deployment and the one-time classification of existing race results are separate from this branch's visual implementation; no production plan or result is rewritten by viewing the dashboard.

## Historical data handover

The three owner-confirmed labels are Comrades PB, 10 km goal, and half-marathon goal. Do not hardcode them in a component or seed them into an unrelated athlete. Use Manage achievements to find those existing race activities and confirm their categories in the application database. Dates/times may be omitted until verified. Imported activity facts alone do not prove an all-time PB; that label requires owner confirmation. Demo and browser test records are clearly synthetic and never become production fallback content.


## Background settings (owner addition)

Settings → Appearance → Dashboard background provides a current preview, JPEG/PNG/WebP upload (4 MB maximum), explicit Save background, and Restore default. The upload is decoded and validated on the server, limited to 40 million pixels, rotated from EXIF, resized within 1920×1080, stripped of metadata and converted to WebP (maximum 1 MB). A single small private image per athlete is stored in `dashboard_appearance` (PostgreSQL BYTEA / local SQLite BLOB), avoiding new external storage credentials. The image is streamed through an authenticated, athlete-scoped endpoint with private/no-store and nosniff headers. No untrusted external image URL is fetched. The main hero refreshes the saved preference on Home and focus; goal/timeline text remains live. Restore removes only that athlete's preference. Last-activity decoration stays illustrative.

## Implementation map

- Core: `packages/core/src/contracts/race-history.ts` validates results; `services/race-journey.ts` projects achievements and current targets without writes.
- Persistence: `apps/web/lib/server/race-history.ts` implements scoped PostgreSQL/SQLite CRUD, source-activity ownership checks and revision conflicts; `dashboard-appearance.ts` validates and stores private images.
- API: `/api/v1/coaching/race-history`, `/api/v1/dashboard/appearance`, and `/api/v1/dashboard/appearance/image` use the existing sensitive-route authentication boundary.
- UI: Home goal context renders the live photo/timeline; the achievement manager selects existing activities and confirms classifications. Today retains its schedule selection logic and adds expandable instructions. Daily check-in uses the existing journal plus a native modal. Both local and online Settings include Appearance.

## Deployment and first use

1. Review the branch and screenshots linked from `ROAD_TO_COMRADES_VERIFICATION.md`. Screenshots use synthetic test facts; they are not a production race-data export.
2. Deploy through the existing application release workflow, which generates Prisma and runs migrations. The additive `20261017120000_race_achievements` migration must be applied to the deployment's database before the new APIs serve traffic. It creates the achievement and appearance tables without rewriting activities or approved plans.
3. On Home, open Manage achievements, search existing race activities (with Load more for older pages), check the official result, choose Personal best or Goal achieved, and Save. Record the three owner-confirmed accomplishments using their existing facts; leave unknown values blank. A linked target requires race date, official distance and elapsed time.
4. Check upcoming race names/targets in the approved plan. This UI does not modify an approval or invent missing future events. Refresh/focus Home after plan/history changes.
5. In Settings → Appearance upload and save a preferred photograph, or restore the default. Preferences are athlete scoped and survive reload on other devices.

Production records have not been backfilled or changed in this worktree. Database structure was inspected from the application schema; the live production race rows were not retrieved. One-time classification is deliberately explicit because an imported training activity alone cannot establish an all-time PB or an official race result.
