# Milestone management: product handoff and implementation architecture

21 October 2026. Owner instruction: implement the reviewed milestone-management design on its own GitHub branch. Branch: `codex/milestone-management`. The detailed UX and acceptance criteria are in [the UX contract](../design/MILESTONE_MANAGEMENT_UX.md).

## Problem Framing

- Goals: create milestones, assign/change/unlink recorded races, remove milestones, and prepare planned race-target changes in one discoverable manager.
- Constraints: approved plans are immutable; historical achievement confirmation and target success are separate; source activities must survive milestone deletion; preserve athlete isolation, revision checks and existing navigation.
- Assumptions: milestone refers to both confirmed history and plan-owned race targets, as in current Settings. A race assignment refers to a recorded running activity, not an external future-event catalogue.
- Open questions: none blocking this slice. Cross-device draft storage is outside scope; a portable change-request download covers moving a request to the paired local planning device.

## Requirements Check

Confirmed: the owner requested implementation of the preceding UX proposal, including an isolated branch. Retain existing Home/Calendar/Readiness navigation. Home's Manage milestones link opens Settings with `section=milestones`. Read-only viewing never writes history or plans.

### Product Owner → Architect flow

1. Enter from Home → Manage milestones or Settings → Milestones. Load history and verified approved goal context independently. A failure in one resource must not erase the other.
2. Achievements is the default category. List every saved history record with name, known official facts, source-activity link state and truthful achievement/result status. Expose Edit, Assign race/Change race and Remove as labelled controls.
3. Add milestone opens one native dialog. Choose Achieved milestone or Planned race target. Historical creation is available without a plan. Planned creation requires a verified active performance goal.
4. For an achievement, enter its name and explicitly confirmed type. Dates, distance and time may be absent when unknown. Optionally expand the recorded-race picker; search and Load more use existing running-activity APIs. Select a race, preserve a user-entered milestone title, prefill the race facts and clear previous confirmation. Save only after explicit owner confirmation. A linked approved target requires date, official distance and elapsed result; a plain race-result category requires that target.
5. Assign/Change race opens that same editor and picker for the selected record. The previous persisted link stays unchanged until Save. Unlink removes only the source link; checked official facts remain. Warn if another saved record already uses that source activity. Cancel/Escape writes nothing.
6. On Save, validate the existing core contract, submit one revision-checked PUT, and refresh saved history. Do not infer a PB. Determine target success with the existing projection, including saved server snapshots. A valid result that misses the target remains a recorded result.
7. Remove achievement opens a named confirmation explaining activity retention and possible return of its approved target to Result pending. Keep milestone/Escape cancels. Confirm sends one revision-checked DELETE. Errors preserve the dialog; conflicts require an explicit latest-record reload and review before another decision.
8. Race targets shows the main goal separately, intermediate targets by date, and Upcoming/Result pending states. Record result is available only on/after the target date. The primary goal links to Plan and cannot be removed as an intermediate milestone.
9. Add/Edit planned target requires name, distance, date and supplied time; optional event name. Use the current milestone schema and enforce twelve targets, unique IDs/dates and a date on/before the primary goal. Edit preserves ID. Remove target requires a named Prepare removal confirmation.
10. Prepare plan update/removal computes the complete requested intermediate-target list and stores a request scoped to this athlete in this browser tab. Preparation is labelled as such; no approved target changes. One prepared request is supported at a time. Replacing one requires explicit acknowledgement. Discard affects only the prepared request.
11. Continue in Plan reads current verified goal context, then retrieves only that athlete's request. Compare athlete, plan ID/version/revision/approval hash, goal ID/revision and the base milestone list. A mismatch blocks using it and directs the athlete back to prepare against current data; do not rebase automatically.
12. A current request shows operation, base version and the requested complete milestone list. Provide copyable instructions and a portable JSON download. Local mode exposes Continue to plan review, opening the existing creation workflow. Online mode explains that the request must go to the paired local planning workflow. Neither action imports, approves or activates a plan.
13. The coach follows GOAL_UPDATE_PROCESS with current context, existing approved plan and selected Second Brain evidence, returns a complete proposal v2 with the unchanged primary goal and requested milestones, and explains training implications. Existing owner import/review/approval and verified publication gates remain authoritative. Home uses only verified approved data.

## Architecture Overview

System context: Next.js client management components compose existing core contracts/services and athlete-scoped API routes. Existing PostgreSQL/SQLite achievement persistence remains authoritative. New prepared requests are untrusted user drafts in tab-scoped session storage, never approved-plan inputs by themselves.

Key decisions:

- Reuse race-history CRUD and recorded-activity search: avoids a second milestone store and preserves revision/auth enforcement.
- Replace Home's embedded achievement-management launcher with a contextual Settings link: one canonical manager, no extra primary navigation.
- Retain NativeModal: existing focus containment, Escape, inert background and body-scroll behaviour.
- Put change-request validation/computation in a browser-safe core service: one contract used by preparation, storage parsing and Plan validation.
- Session storage is explicitly a draft transport. It survives same-tab navigation/reload, is athlete-keyed and carries base-version evidence. It is not durable multi-device storage. A JSON download supports the paired-device handoff without another API/migration.
- Block stale handoffs rather than merging. Automatically applying a request to a newer approved plan would hide a material review decision.

## Component Design

| Component | Responsibilities | Failure handling |
|---|---|---|
| MilestoneSettings | Independent validated history/context reads; stale/retry states; primary-goal context; refresh after writes | History failure preserves target access; goal failure preserves historical editing and saved target snapshots |
| MilestoneManager + MilestoneAchievementEditor | Categories, named actions, one modal, activity selection, confirmed CRUD and planned-request preparation | Preserve form on validation/API error; conflict blocks writes until reload; duplicate submissions guarded |
| milestone-management core service | Parse elapsed input, compute/validate complete planned change, validate base identity and render portable coaching instructions | Reject invalid, malformed, cross-athlete, stale or inconsistent requests |
| milestone-change-storage app helper | Athlete-keyed sessionStorage serialization and explicit discard | Catch unavailable/quota storage; preserve draft and explain recovery |
| MilestonePlanHandoff | Re-read current goal context, display only the current athlete's request, check base, copy/download, enter existing local workflow | Show Retry for failed reads; block stale/malformed requests; clipboard failure leaves selectable text |

## Data Model

No authoritative entity/schema changes. RaceHistoryRecord continues to link an optional Activity and approved target; server-owned targetSnapshot preserves historical criteria. No migrations or backfill.

Local source reads now pass configured `RACEPREDICTOR_ATHLETE_ID` to existing activity list/detail adapters, matching milestone persistence. The previous implicit `athlete_001` default could return another local athlete's search results when a configured profile was in use. The default remains when no athlete is configured; a two-athlete regression test covers isolation.

Prepared request v1: schema name, athlete ID, base plan reference, base goal, base milestone list, operation (add/edit/remove), affected milestone ID and proposed complete milestone list. All lists use existing raceMilestoneSchema. Exactly the claimed operation must transform the base list into the proposed list. Primary-goal identity is unchanged. Dates/IDs are unique and count ≤12. Reject a request for another athlete or any changed base evidence before use. Browser data is never authority for server approval.

## API Contracts

Unchanged: `GET/PUT/DELETE /api/v1/coaching/race-history`, `GET /api/v1/activities` with existing cursor/search, `GET /api/v1/coaching/goal-context/active`, and existing Plan context/proposal/decision/publication routes. No direct active-milestone mutation endpoint.

Authorization: retain signed-in owner writes in cloud and local mode's existing boundary; activity links remain athlete checked by the server. Existing 409 revisions are preserved. Never send client-authored trusted target snapshots.

## Non-Functional Requirements

- Performance: history/context load independently; recorded activities load only when the editor picker opens; retain bounded search pages and ignore obsolete requests.
- Reliability: cancel writes nothing; errors retain input; success follows server acknowledgement; no automatic retry of stale writes. Browser draft persistence failures must be visible.
- Security/privacy: athlete-scoped API data and session-storage keys; validate stored JSON before use; no plan or result data in URL query strings; clear only the current request on discard.
- Accessibility: semantic names, readable status text, visible focus, native modal, focus return to a stable action after a removed row, keyboard category navigation, 44px touch targets and no narrow-width overflow.
- Observability: reuse existing API error responses/logging. Display actionable scoped errors, not raw response bodies or private diagnostics. No new telemetry dependency.

## Execution Plan

1. Record UX/product/architecture contracts; create isolated branch from current main.
2. Add core change-request service and focused validation tests.
3. Implement unified manager and Home entry; preserve existing scoped CRUD and result projection.
4. Add planned-change storage and Plan handoff with stale-base protection and portable instructions.
5. Run core/web tests, types, production build, browser lifecycle/failure/responsive/accessibility coverage. Update source-of-truth screen/architecture/progress docs.
6. Commit/push only feature files and open a reviewable PR. No merge or production deployment is included.

## Risks and Trade-offs

- A tab-scoped request can be lost when the tab closes. Label that limit, provide download and never imply server persistence.
- A valid missed target is not an achievement. Use the existing projection, never generic green success for every saved result.
- A corrected/deleted result can return a target to Ahead. Named confirmations and success status describe this effect.
- Online plan creation is intentionally local-owned. Provide export and explicit instructions rather than an unavailable online create button.
- The request is a planning instruction; full proposal/schema/history validation and owner approval still apply. A browser base match is an early UX guard, not an authorization gate.

## Validation

Core: elapsed formats/bounds, exact add/edit/remove transformation, target limits/date uniqueness/goal boundary, stale base and athlete isolation.

Browser: no page-load writes; create/reload, assign/change/unlink, missing confirmation, named remove cancel/confirm, failed save, 409 and explicit reload, matching/missed result, planned request navigation/reload, stale/malformed/foreign request, online handoff, narrow overflow, keyboard modal focus, accessibility.

Reuse existing history repository/route tests for durable scoped CRUD; add a real local-browser persistence flow against isolated fixtures where appropriate. Build/typecheck and existing projection regression tests remain required.

Rollout: ordinary feature-branch review/CI and normal frontend release. No database migration, credential or deployment configuration change. Rollback the frontend commit; existing records remain compatible. Closing a tab/discard removes only its unapproved request.

ADR Needed: no. This is reversible client workflow composition retaining the existing approved-plan boundary; its limitations are documented here.

## Skill Invocation Summary

- Skills: product-owner, ux-ui-designer, architect, software-engineer-general, ui-developer, devops-engineer, playwright-e2e, qa; React quality checklist after TSX edits.
- Requirements Validated: yes, with explicit tab-local draft transport and paired-device handoff decisions above.
- Enforcement Files Read: apps/web/AGENTS.md, CONTEXT, ARCHITECTURE, design/screens, DESIGN_INTENT_CONTRACT, GOAL_UPDATE_PROCESS and ROAD_TO_COMRADES_IMPLEMENTATION. Root/docs AGENTS and .codex enforcement files are absent in this checkout.
- Key Risks: stale plan base, target/achievement confusion, conflict overwrites and browser draft lifetime.
