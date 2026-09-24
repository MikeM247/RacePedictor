# Race Predictor — implementation handoff for Astra

Implement the outstanding F01–F10 requirements from the [13 September design-intent review](race-predictor-design-intent-review-2026-09-13.md).

## Source of truth

- [Design Intent Contract](../design/DESIGN_INTENT_CONTRACT.md) — binding product-experience requirements.
- [Redesign Implementation Backlog](../design/REDESIGN_IMPLEMENTATION_BACKLOG.md) — implementation scope and acceptance criteria.
- [Redesign QA Matrix](race-predictor-redesign-qa-matrix.md) — required validation and release evidence.

Preserve unrelated working-tree changes, existing routes, API contracts, prediction calculations, privacy boundaries, explicit approval authority, timezone semantics and session permissions. Do not invent analytical evidence or automatically change approved prescriptions.

## Required implementation work

1. **F06 — Plan absence, loading and continuation**
   - Handle documented active-plan `404 NOT_FOUND` as normal absence.
   - Load saved drafts and history independently of the active-plan read.
   - Keep previously loaded plan content visible during refresh or recoverable error.
   - Implement reachable goal/context → continue in Codex → import proposal → review → confirm stages.
   - Provide concrete external continuation instructions and restore published context/saved drafts when returning.

2. **F07 — Approval errors and consequential actions**
   - Render pending, failure and recovery feedback inside the active confirmation dialog.
   - Preserve a durable conflict explanation while reloading authoritative data; require rereview before another decision.
   - Preserve draft input and focus. Do not silently retry consequential writes.
   - Keep one filled primary action per active workflow stage or dialog.

3. **F08 — Import ownership and contextual recovery**
   - Prevent successful file import from rendering Strava import controls while File remains selected.
   - Preserve accepted, duplicate, rejected, warning, reused and queued distinctions.
   - Explain the affected task, practical consequence and supported recovery action.
   - Carry the full safe return context through Data Quality → Settings → recovery → originating assessment.

4. **F04 — Training detail and return context**
   - Render selected activity detail independently of list emptiness or failure.
   - Preserve selection, applied filters, loaded pages, position and focus across navigation and return.
   - Provide an explicit parent destination for directly loaded detail.
   - Put optional telemetry, splits and route details behind labeled disclosures.

5. **F09 — Settings workflow and truthful states**
   - Separate connection and computer-pairing workflows.
   - Rename operational controls accurately rather than labeling them Reminder handoff.
   - Show preference-read failure with supported retry instead of silently substituting defaults.
   - Stage reminder preparation and external confirmation with one primary action.
   - Guard submitting controls while requests are pending.

6. **F01 — Evidence-led race understanding**
   - Use supplied evidence for a concise outlook reason.
   - Expose available driver contributions in readiness detail.
   - Label trends by their actual feature, units and period; do not call every feature weekly distance.
   - Distinguish failed target reads from genuine absence.
   - Retain current-fitness, uncertainty and unsupported target-comparison qualifications.

7. **F02 — Home hierarchy and interpretation**
   - Keep Race outlook → Recent training → Next action in a stable reading order.
   - Make the outlook compact and recent training the main explanatory area.
   - Use faithful concise review excerpts and retain material caveats beside the claim.
   - State supported goal implications or explicitly explain when they cannot be assessed.

8. **F03 — Review truthfulness and cross-screen consistency**
   - Preserve the newly corrected queued-review status on Home.
   - Preserve material limitations, match status, plan version and evidence references.
   - Verify ready, processing, retry, attention, unavailable, suggested and ambiguous comparison cases across Home, Training and Calendar.
   - Use the same persisted review; never substitute an older reviewed activity for the latest recorded activity without labeling it.

9. **F05 — Responsive behavior and accessibility**
   - Preserve verified 320px filter bounds, 1024px Training Back/focus, the single Plan switch and Calendar's 44px information target/inert background.
   - Verify contract breakpoints, resizing during active workflows and actual 200% zoom.
   - Include failed reads, pending writes, open dialogs, direct links and contextual returns.
   - Verify keyboard operation, focus restoration, target sizes, caveat readability and absence of page-level horizontal overflow.

10. **F10 — Regression coverage and honest release evidence**
    - Add behavior tests for the exact reproduced failures above.
    - Assert no unintended writes, correct pending/503/conflict handling, file/result ownership and full return restoration.
    - Update obsolete copy assertions and tests that click controls intentionally hidden on mobile.
    - Run relevant local/online E2E, typecheck, build and applicable unit/integration checks.
    - Reconcile backlog and QA completion claims with actual results.
    - Keep unperformed human comprehension, assistive-technology and deployment checks explicitly outstanding.

## F06 implementation plan — proposed, not implemented

Prepared 13 September 2026. This section plans **F06 only**; it does not authorize implementation or mark any finding resolved.

### Outcome and scope

A runner can open Plan without an approved plan, recover published planning context or a saved proposal, continue the five-stage workflow, and keep reading the last loaded approved plan while a refresh is pending or fails. Only an explicit, server-confirmed approval changes the settled goal and active plan.

Binding references: Design Intent Contract L2, UX4–UX5, I1–I6, section 10, A2–A6 and R1; Redesign Implementation Backlog Ticket 09; the 13 September review's F06 finding; QA rows GS-F01–GS-F05, GS-S01 and GS-PW01.

- Preserve `/dashboard/plan`, `/dashboard/calendar`, the single Overview / Calendar switch, existing request/response contracts, timezone semantics and approval authority.
- Apply absence/loading improvements in local and online modes. Creation, context recovery and proposal import remain local capabilities; online Plan retains approved-version selection and truthful local-workflow guidance.
- F06 owns staged presentation, stage navigation, read recovery and one primary action per stage. F07 owns decision-dialog failure/pending recovery and durable conflict explanations. Preserve those behaviors and provide the state boundary F07 needs; do not claim F07 complete through this work.
- Exclude embedded chat, automatic Codex launch or execution, new plan-generation services, automatic publication/approval, database migrations, new cloud drafting capabilities, and unrelated F01–F10 changes.

### Current implementation findings

Verified by source inspection of the current working tree; these are not new browser-test results.

| Area | Finding | Implementation implication |
|---|---|---|
| `apps/web/components/coaching/coaching-pages.tsx`: `apiRequest` | Errors retain a code but not HTTP status. | Preserve status as well as code so only the documented active-plan `404 NOT_FOUND` becomes absence. Do not globally swallow 404s. |
| `PlanPage.loadPlanPage` | Active-plan failure returns before draft/history reads begin. | Start independent resources independently and let each result render without waiting for the slowest resource. |
| Active-plan rendering | State retains `activePlan` after failure, but JSX renders it only when `planLoadState === "success"`. | Render usable content independently of refresh/error state; make the recovery message match what is visible. |
| `loadLatestProposal` | Draft eligibility uses the active-plan version supplied by the caller; read and import/decision feedback share `proposalState`. | Separate resource status from mutation status and reconcile eligibility after either read resolves. |
| Creation workflow | Setup and import/review sections render together. Derived `currentStage` cannot produce Import proposal. | Introduce explicit stage transitions and show only the current stage's interactive content. |
| `publishContext` | Keeps only a success message, discarding returned artifact paths and metadata. Plan does not read `context/current`. | Keep publication details and restore the validated context on a later visit. |
| `importProposal` | Clears the existing proposal before validating the replacement file. | Keep the previous saved proposal available if a new import fails; replace it only on confirmed import success. |

Relevant supporting code: `apps/web/components/coaching/active-plan-overview.tsx`, `apps/web/lib/coaching-ui-state.ts`, `apps/web/lib/local-coaching-service.ts`, coaching route handlers, and `packages/core/src/contracts/coaching.ts`. Existing E2E coverage is in `apps/web/e2e/digital-coach.spec.ts` and `online-dashboard.spec.ts`; some local journey assertions still use obsolete labels.

### Architecture and state decisions

Keep orchestration in the web app and reuse core contracts and existing persistence. Extract Plan-specific request/state helpers into a small app-local module if needed; avoid refactoring Calendar, Settings or Data Quality as part of this slice.

**Independent resource state.** Track active plan, approved history, latest proposal and current published context separately. Each resource distinguishes initial pending, confirmed data/absence, refreshing with previous data, and failed read with or without previous data. Store a client last-successful-read time separately from artifact capture time; neither is a new claim about plan freshness. Keep publication, import and decision mutation state separate so background reads cannot erase their results or draft input.

| Resource / existing contract | Normal absence | Failure and recovery |
|---|---|---|
| `GET /api/v1/coaching/plans/active` | HTTP 404 with `error.code = NOT_FOUND` means no active plan. | Other 404s, malformed responses, network failures and 5xx remain errors. Retry this resource only; keep previously loaded plan visible with its last-check time. A later authoritative absence clears the previously displayed active plan. |
| `GET /api/v1/coaching/plans/history` | Valid `{ plans: [] }` means no approved versions. | Keep prior history and show a local retry; failure must not become empty history. |
| `GET /api/v1/coaching/proposals/latest` (local) | Valid `{ proposal: null }` means no saved proposal. A non-`proposed` record is not an actionable draft. | Keep prior draft with a read warning and retry. Do not infer absence from unavailable or malformed responses. |
| `GET /api/v1/coaching/context/current` (local) | Valid `{ context: null }` means nothing has been published. | `CONTEXT_ARTIFACT_UNREADABLE` and other failures remain visible context-recovery errors; do not auto-publish or reset fields. |

Start supported reads together on mount, with per-resource completion handling. Use cancellation or request-generation guards so older reads cannot overwrite a later import, publication, approval or retry. Retain content only within the authorized session; authentication/authorization failures follow existing recovery and privacy behavior rather than exposing cached content.

Draft retrieval must not depend on an active-plan result. Once both results are known, preserve the existing actionable-draft rule (`status === proposed`, valid identity, and newer version than the active plan when present). If active-plan status is unknown, allow inspection of the saved proposal but do not describe it as a verified replacement or enable confirmation until authoritative state is available. Preserve server validation, expected revision and exact replacement ID as the final authority.

**Explicit workflow state.** Track the active stage independently of network success messages. Derive a suggested resume destination from persisted context/proposal data, but enter it through one creation/resume action. Never reopen Confirm on reload or restore stale-history acknowledgement from storage. Default overview keeps the approved plan readable and history collapsed.

| Stage | Entry and visible content | Primary action and transition | Secondary recovery/navigation |
|---|---|---|---|
| Goal & context | New setup or explicit edit of restored fields; clearly label planning goal versus settled goal. | Publish context for Codex → Continue in Codex only after confirmed publication. | Back/leave preserves in-page edits; field errors retain values and focus the first invalid field. |
| Continue in Codex | Confirmed publication or restored context; goal summary, artifact identity/capture time, cautions and concrete handoff instructions. | I have a proposal → Import proposal. This reports user intent, not verified external completion. | Copy instructions, obtain context JSON, edit context, or return to overview. |
| Import proposal | Explicit return from Codex, or a secondary “I already have a proposal” entry; labeled file picker and file requirements. | Import selected proposal → Review only after server validation succeeds. | No file means no submit. Cancelled selection, invalid JSON and failed imports remain here with recovery and any earlier saved draft intact. |
| Review | Successfully imported or explicitly resumed actionable saved proposal. | Review and approve → existing Confirm dialog. | Reject draft opens its existing explicit confirmation; Back or leave preserves the saved proposal and active plan. |
| Confirm | Explicit approval/rejection action from Review. | Existing confirm decision action; only server-confirmed approval displays a new active plan. | Cancel returns to Review with focus restored; preserve stale-history checks and F07's recovery boundary. |

While creation is open, demote or hide its overview launcher so it does not compete with the stage's primary action. Keep earlier-stage summaries and Back controls secondary. Stage changes focus the new stage heading only after an explicit user action; refreshes must not move focus or reset scroll. An open confirmation remains the sole active interaction surface with the background inert.

### External continuation and restoration

Use the existing publication response (`artifact`, `jsonPath`, `markdownPath`, hashes and goal/profile/routine data), followed by the existing current-context read where the full envelope is needed. Display only returned paths; do not guess a vault location or invent a Codex deep link.

The handoff must tell the runner to:

1. Open Codex on the computer used for the local coaching workflow and provide the published `coaching-context.v1.json` or its returned local path, with the existing selected Second Brain context.
2. Discuss the goal and routine using that artifact, then request a `coaching-plan-proposal.v1` JSON file compatible with the existing schema and context/goal/routine references. Proposal generation does not approve or activate anything.
3. Return to Plan → resume the workflow → Import proposal, select the returned JSON, review its goal, prescriptions, assumptions, cautions, history freshness and replacement impact, then explicitly confirm a decision.

Proposed implementation choice: expose a secondary download of the validated context envelope already returned by `context/current`, alongside copyable instructions. This provides a concrete context file after reload even though that GET response does not include publication paths. It requires no new endpoint or publication. Clipboard/download failure must leave readable instructions and a supported retry, without claiming the transfer succeeded.

On return or reload:

- Reload persisted context and latest proposal independently, even with no active plan or an active-plan read failure.
- Prefer **Review saved draft** when an actionable proposal is confirmed; otherwise offer **Resume with Codex** for available published planning context, or **Create a plan with Codex** when absence is confirmed. While reads are unresolved, avoid briefly declaring that no draft/context exists.
- Restore editable values from context profile, planning goal and routine, including optional target time and available days, without overwriting fields the runner has already edited while a delayed read completes. Preserve supported timezone/routine values rather than silently resetting restored context to UI defaults.
- If a saved context has already led to approval/rejection, treat it as previous published context, not proof of an unfinished draft. Show the authoritative proposal/active-plan outcome and let the user explicitly reuse/edit context for another plan.
- If restored context cannot be represented by the current performance-goal form, show its supported summary and continuation path without silently converting its goal type.
- Context and proposal identity mismatches remain explicit; do not silently attach a draft to a different artifact or hide existing server freshness/conflict checks.
- Recovery GETs, download/copy, stage navigation and leaving the workflow produce no publication, import, decision or activation writes. Only deliberate corresponding actions call those existing POST endpoints.

Persisted context and imported proposals provide durable resume. Unpublished edits and unsubmitted file selections are not newly promised cross-reload persistence; preserve them during in-page stage changes/recoverable errors and warn only when leaving would actually lose edits. Do not introduce a browser cache of private coaching history or an invented “Save draft” endpoint.

### Execution slices and acceptance criteria

Feature: F06.1 — Independent Plan reads and truthful absence
Description: Decouple active-plan, history and local draft reads; scope absence handling and retain usable content.
Priority: High
Area: Plan resource loading and API error metadata
Reason: Unblocks first-plan and saved-draft journeys and establishes the state model for later slices.
Acceptance Criteria:
- A real active-plan `404 NOT_FOUND` renders normal absence and still issues draft/history reads.
- A delayed or failed active-plan read does not delay available history/draft rendering; each failed resource has its own retry.
- Refresh and recoverable failure retain the loaded plan/history, label the state accurately and preserve focus/scroll.
- Invalid responses and non-absence failures never render a false no-plan/no-history state; stale responses cannot replace newer authoritative data.
Dependencies:
- Existing coaching contracts, local/cloud active-plan handlers and current proposal eligibility rules.
Risks:
- Parallel responses can invalidate draft eligibility or restore stale data; reconcile by resource identity/version and guard request ordering.

Feature: F06.2 — Recoverable published context and concrete Codex handoff
Description: Read current context independently, restore supported fields and provide reusable continuation instructions and context JSON access.
Priority: High
Area: Plan context publication and resume
Reason: Makes leaving for Codex and returning a supported journey.
Acceptance Criteria:
- Publication success retains actual artifact metadata and advances only after server success; failure preserves all entered values.
- Reload after publication restores context and offers continuation without republishing; reload after import offers the saved draft.
- Context absence, unreadable artifacts and unavailable capabilities are distinct; retry never overwrites dirty fields.
- Instructions identify the required context, proposal file and return steps; no unsupported external-completion claim appears.
Dependencies:
- F06.1 resource-state conventions and existing context publication/current contracts.
Risks:
- Current-context reads lack local paths; use the validated envelope download fallback. Older context may describe a completed workflow; reconcile with current proposal/plan outcomes.

Feature: F06.3 — Reachable five-stage Plan workflow
Description: Replace simultaneous setup/import/review controls with explicit stage transitions and a single primary action.
Priority: High
Area: Plan workflow presentation, import and confirmation entry
Reason: Turns the restored data into an understandable end-to-end runner journey.
Acceptance Criteria:
- Every named stage, including Import proposal, is reachable and visibly current; only that stage's interactive content is shown.
- First plan, replacement, resume, missing returned file and invalid import journeys work without losing a previous valid draft.
- Back, cancel and leaving preserve the approved plan; no decision/activation occurs before explicit confirmation.
- Saved drafts resume at Review, never Confirm; approval is unavailable while required authoritative state is unresolved.
- Keyboard focus follows explicit stage navigation, returns on cancellation, survives refresh and remains usable across contract breakpoints.
Dependencies:
- F06.1–F06.2; existing review content, decision contracts and modal behavior. Coordinate shared state changes with F07.
Risks:
- Refactoring the large shared component may affect other screens; isolate Plan changes and preserve existing confirmation checks.

Feature: F06.4 — Regression evidence and handoff reconciliation
Description: Verify the actual absence, refresh and continuation journeys and update only the evidence earned by those checks.
Priority: High
Area: Plan tests, Ticket 09 and redesign QA records
Reason: Previous PASS claims did not cover the reproduced failures.
Acceptance Criteria:
- Automated tests verify observable states, network calls and absence of unintended writes using the matrix below.
- Local and online Plan checks pass or have specifically recorded failures; unsupported local-only calls are absent in online mode.
- Ticket 09 and affected QA rows identify the exact checks run; shared F07 requirements and unperformed human/deployment checks remain outstanding.
Dependencies:
- F06.1–F06.3 and isolated synthetic E2E fixtures.
Risks:
- Existing unrelated failures and obsolete copy assertions can obscure the result; update affected Plan assertions and report unrelated blockers separately.

### Validation plan — execute during implementation, not during this planning task

| Scenario | Required assertions |
|---|---|
| No active plan, saved draft/history available | Exact 404/code fixture; independent GET counts; no Plan-unavailable error; saved draft opens Review and history remains accessible. |
| Slow/failed active read, successful secondary reads | Secondary resources render before the active request settles; local retry only; no false emptiness. Test failed draft/history reads independently too. |
| Loaded plan → refresh pending → 503 → retry | Same plan summary/prescriptions remain visible, refresh age/warning is accurate, focus/scroll survive; success updates data and authoritative absence clears it. |
| No context vs unreadable context | Null yields setup; unreadable yields contextual error/retry. Existing active plan/draft is still usable. |
| Publish → leave → reload → continue → import → reload | Goal/routine and artifact identity restore; handoff is actionable; saved proposal resumes Review; no POST occurs merely from returning. |
| Delayed restore or out-of-order response | Dirty fields remain unchanged; older GET cannot overwrite a newly imported draft or newly approved plan. |
| Missing/invalid/rejected proposal file | No selection produces no request; validation failure retains selected-file feedback and prior valid draft; no active-plan change. |
| Review/cancel/replacement/approval | All five stages reachable; no decision write before confirmation; cancel restores Review/focus; successful approval updates authoritative Home/Calendar. Preserve stale acknowledgement and rejection behavior. |
| Online absence/refresh/history | No local context/proposal reads or drafting controls; existing approved-version selection remains available when authoritative state allows it. |
| Responsive and keyboard journey | Exercise 320, 767, 768, 1199, 1200 and 1440 CSS px, resizing during pending/read-error/open-dialog states, plus actual 200% zoom; one filled primary, 44px targets, readable caveats, no page overflow and correct focus/inert behavior. |

Use focused app-local unit tests for response classification, response ordering, resume precedence and stage transitions; use Playwright to assert rendered retained content and full journeys rather than relying on source-string checks. Add a dedicated local `redesign-plan.spec.ts` if useful (already a QA candidate), and keep online scenarios in a spec matched by `playwright.online.config.ts`, or explicitly update its match list. Use isolated fixtures rather than the athlete's working database.

Planned checks from repository root:

- `npm test --workspace @racepredictor/web`
- `npm run typecheck --workspace @racepredictor/web` (the current lint script also runs this TypeScript check)
- `npm run test:e2e --workspace @racepredictor/web -- redesign-plan.spec.ts` if that proposed spec is added, plus affected Plan journeys in `digital-coach.spec.ts`
- `npm run test:e2e:online --workspace @racepredictor/web -- online-dashboard.spec.ts` for the online regression scenarios
- `npm run build --workspace @racepredictor/web`
- Run core/DB tests only if implementation actually changes those boundaries; API/schema changes are not expected.

Run the applicable F06 design-intent review after implementation and record failures without upgrading broad QA rows whose F07 or other requirements remain unverified. This plan supplies no test-pass, accessibility, deployment or release-readiness claim.

### Product assumptions, risks and delivery notes

- **Assumptions:** durable resume means server-persisted published context/imported proposals. Explicit five-stage presentation and JSON download are proposed implementation choices within the existing contracts, not new approved product capabilities.
- **Open questions:** none blocking this plan. If implementation exposes an unsupported restoration shape or capability, retain truthful read-only content and record the specific gap rather than inventing a conversion or API.
- **Prioritisation:** implement F06.1 first, then F06.2, F06.3 and F06.4. F07 may build on the separated decision state, but F06 cannot close shared confirmation-error criteria on F07's behalf.
- **Recommended next item:** F06.1, because independently available draft/history content is currently blocked by normal no-plan absence.
- **Migration / rollout:** no persistence migration, backfill or feature flag is planned. Deliver through the existing web release workflow after validation; rollback is limited to the F06 change set and must preserve the substantial unrelated working-tree changes.
- **Privacy / observability:** reuse authenticated/owner-scoped routes and existing safe errors. Do not log context contents, private paths or proposal payloads. Record request outcomes and test evidence without adding telemetry services.
- **ADR:** not needed; the plan preserves the existing local Codex boundary and explicit approval model.
- **Skill invocation summary:** Architect and Product Owner used for requirements validation, architecture/state boundaries and testable slices. Read `docs/CONTEXT.md`, `docs/ARCHITECTURE.md`, the design contract/backlog, current review/QA records and relevant contracts/source. `.codex/enforcement` is absent; the discovered web `AGENTS.md` requires reading installed Next.js guidance before later code changes.

### F06 implementation and evidence update — 2026-09-13

**Verdict: FAIL — implementation is materially advanced, but the F06 completion gate is not met.**

Implemented only within the F06 loading/continuation and staged-workflow boundary:

- `PlanPage` now reads active plan, approved history, saved proposal and published context independently. Only HTTP `404` with `NOT_FOUND` is normal active-plan absence; each successful Plan response is validated by its existing core envelope schema. Recoverable refresh failures retain the last valid resource, and each resource has its own retry, request generation and abort controller. Confirmed absence clears the retained active plan. Mutation paths invalidate superseded reads before applying returned publication/import/decision results.
- The current-context route is re-read as a validated `coaching-context.v1` envelope after reload. The UI can download that returned envelope, shows only returned publication paths/metadata, exposes copyable Codex instructions, keeps capture warnings visible, and reports copy/download failure without claiming a write occurred. Restored performance-goal/profile/routine values preserve timezone, units, preferred long-run day, desired weekly sessions and available days without overwriting dirty form input. A completed context and a non-performance target are explicitly described rather than converted into a fabricated race goal.
- The local workflow exposes only the current interactive stage: Goal & context → Continue in Codex → Import proposal → Review → Confirm. File selection and import are separate. Failed replacement imports retain the prior draft. A saved proposal can be inspected while active-plan authority is unresolved but cannot be decided until it is authoritative and context identity matches. Publishing, return navigation, retry, download and copy do not send a plan decision.
- Existing F07 confirmation state was retained. It continues to own approval/rejection/activation identity, pending and recovery semantics; this F06 work did not claim F07 complete.

Automated results actually earned:

| Command | Result | Evidence |
|---|---:|---|
| `npm test --workspace @racepredictor/web` | exit 0; 106 passed, 0 failed | Includes new deterministic F06 state-rule tests for exact absence classification, authority gating, generation ordering, preference restoration and unsupported target identification. |
| `npm run typecheck --workspace @racepredictor/web` | exit 0 | `tsc --project tsconfig.typecheck.json --noEmit` |
| `npm run build --workspace @racepredictor/web` | exit 0 | Next.js 16.3.0 production build, typecheck and route generation completed. |
| Focused local Plan Playwright cases in `digital-coach.spec.ts` | individual cases rendered/passed before the runner failed to terminate cleanly | Updated valid isolated fixtures for documented absence, saved-draft resume and explicit import. This is not a completed command result. |
| Focused online Plan Playwright case in `online-dashboard.spec.ts` | unresolved | Two obsolete assertions were corrected (session semantic element and compact Agenda behavior), but the isolated runner subsequently stalled without a final result. No pass is claimed. |

Remaining F06 blockers: complete deterministic Playwright journeys with clean exits and request-count/payload assertions for all F06 scenarios, including delayed read/mutation races, reload continuation, failed import retention, online zero-local-call checks and Home/Calendar timing; browser checks at 320, 767, 768, 1199, 1200 and 1440 CSS pixels plus actual 200% zoom; keyboard/focus/inert-dialog checks; and required human comprehension, assistive-technology and deployment validation. The existing online runner stall and the absence of those executions leave F06 incomplete. These are not evidence of broader release readiness.

## F07 implementation plan — proposed, not implemented

Prepared 13 September 2026. This section plans **F07 only**. It does not authorize implementation, resolve the review finding, or supply test-pass evidence.

### Outcome, requirements and scope

A runner confirming proposal approval, rejection or selection of a historical approved plan can see what is being changed, whether the request is pending, why it failed, and the supported next action inside the active dialog. Conflicts retain their explanation through authoritative reload and require another review before a new confirmation. An uncertain response never becomes an automatic repeat write or an unsupported claim that nothing changed.

Binding references: Design Intent Contract UX5, V3, I1–I6, section 10/S1, A2–A6, R1/R6 and T4; Redesign Implementation Backlog Tickets 03 and 09; the 13 September review's F07 finding; QA rows GS-F02–GS-F05, GS-A01, GS-R01, GS-S01, GS-D01, GS-X01, GS-PW01 and risk RR-08.

- Cover local proposal approval/rejection and online historical-plan activation. Preserve capability restrictions: online selection is between already approved versions; it does not introduce online proposal authoring or approval.
- Preserve routes, core schemas, expected revisions/replacement identities, owner/session checks, approval authority, immutable prescriptions and Home/Calendar update semantics.
- F06 owns Plan resource loading, saved-draft resume and stage navigation. F07 owns confirmation state, error placement, conflict/uncertain-outcome recovery and the remaining competing primary actions on these Plan surfaces. Integrate with the current F06 work without reimplementing its stages or claiming F06 complete.
- Calendar edits are regression coverage for shared dialog behavior and the no-retry invariant. Calendar workflow redesign, import recovery and Settings write handling remain outside this slice; their findings belong to the other handoff items.
- No database migration, new API, automatic context republishing, background decision retry, new persistence cache, or implementation code is proposed as part of this planning task.

### Current implementation findings

These observations come from the current working tree, which already contains changes beyond the earlier F06 plan. They are source findings, not fresh browser results or a claim that F06 is complete.

| Area | Current behavior | F07 implication |
|---|---|---|
| `coaching-pages.tsx`: `apiRequest` | Now retains HTTP status and error code, but malformed successful JSON can become an empty object. | Reuse existing metadata; validate decision/activation response envelopes with existing core schemas before presenting success. An unusable success response has an uncertain outcome. |
| `PlanPage.confirmDecision` and decision dialog | Decision pending/error still shares `proposalState` with import. Pending text is inside the dialog; failure `StatusLine` is in the inert review panel. | Give consequential decisions their own lifecycle and show their feedback once, inside the active dialog. |
| Conflict branch | Handles only `REVISION_CONFLICT`/`CONFLICT`, clears the proposal, reloads only the latest draft, then closes the dialog. | Keep a separate recovery record and reread the active-plan comparison as well as the draft; explicitly gate rereview and a fresh confirmation. |
| Current F06 read separation | `loadLatestProposal` now writes `proposalReadState`/`proposalReadMessage`, so it no longer directly replaces `proposalMessage`. | Do not repeat the earlier claim that this loader always erases the message. The remaining gap is dialog-local durable recovery and enforced rereview, with read-success messaging kept subordinate to the unresolved conflict. |
| `confirmPlanActivation` | Every error closes the activation dialog and triggers a broad Plan reload; the explanation lives in history. | Keep the candidate and error in the dialog, distinguish conflict from other failures, and use targeted recovery reads. |
| Confirmation identity | Requests use mutable `proposal`/`activePlan` state when submitted. | Bind a confirmation to the exact reviewed proposal revision and replacement/active-plan identity; a refresh must not silently change the decision target. |
| Local decision route and `_shared.ts` | Approval precondition failures can return HTTP 409 `PLAN_ACTIVATION_REJECTED`, `PLAN_NOT_READY` or freshness/version codes, not just `REVISION_CONFLICT`. | Classify actual status/code combinations; do not offer a blind retry for unrecognized 409s. Preserve specific supported stale-history recovery. |
| Local approval sequencing | The route activates the plan, then awaits `publishCoachingContext()` before returning. | An error response can follow a committed activation. Reconcile current state before any new decision; never promise that a 5xx means the plan stayed unchanged. |
| Latest proposal read | `getLatestProposal()` returns a currently proposed record, or null; it does not return a decided-proposal audit record. | A vanished draft cannot prove rejection succeeded. Reconcile approval against exact plan identity; report unresolved rejection outcomes truthfully. |
| Action hierarchy and focus | The creation launcher stays filled while a creation stage is open; multiple expanded online history entries can each expose a filled activation launcher. Existing modal hook traps/restores focus but has no explicit fallback for a removed launcher or a fully disabled dialog. | Demote launchers outside the current stage; complete pending focus containment and success/conflict focus fallback without introducing nested dialogs. |

Supporting sources: `apps/web/lib/local-coaching-service.ts`, `apps/web/app/api/v1/coaching/_shared.ts`, proposal decision/latest and plan activation route handlers, `apps/web/lib/server/cloud-read-handlers.ts`, `packages/core/src/contracts/coaching.ts`, `docs/ARCHITECTURE.md` and ADR 0004. Existing regression entry points are `apps/web/e2e/digital-coach.spec.ts`, `online-dashboard.spec.ts`, `apps/web/test/coaching-routes.test.ts` and `coaching-ui-state.test.ts`.

### Architecture and state decisions

Keep orchestration in the web app and persistence/domain authority in the existing service and repository layers. Use a small app-local confirmation state helper if needed, consumed by the two Plan dialogs. Reuse current modal behavior and button/status styles; change shared primitives only where required and verify their Calendar consumers.

**Separate resource, import and decision state.** F06's active-plan/history/proposal/context reads keep their own status. Proposal import retains its own feedback. A confirmation owns its action, reviewed target snapshot, pending guard, failure classification, recovery read status and rereview requirement. Background loaders may update resource data but cannot clear the confirmation's recovery explanation or make a stale confirmation actionable.

The reviewed snapshot includes proposal ID/revision and displayed comparison identity for a decision, or candidate approved-plan ID and expected current active-plan ID for selection. Keep stale-history acknowledgement scoped to that review. Do not manufacture default revisions for malformed proposals. Store this state in memory only; server-persisted proposals remain the durable drafts. A full page reload starts with fresh reads and never reopens Confirm or restores an acknowledgement automatically.

| State | Visible behavior and available actions | Transition and write rule |
|---|---|---|
| Ready to confirm | Named target/version, existing goal/plan consequence and explicit Home/Calendar effect; relevant cautions and stale-history acknowledgement. Confirm is the only filled action; Cancel is secondary. | Only an explicit confirmation sends the existing POST, using the reviewed identity and current permitted acknowledgement. |
| Submitting | Dialog-local polite progress and clear explanation that dismissal is temporarily unavailable. Disable submitting/mutating controls and Cancel/Escape dismissal; keep focus inside the dialog. | Set a synchronous in-flight guard before dispatch so double click, Enter and repeated handlers cannot send another request. No optimistic activation. |
| Definite validation/precondition failure | Retain target and inputs, show one contextual error and supported correction in the dialog, and restore exit controls. Associate field errors with the field when applicable. | Retry requires a deliberate action after correction; conflicts/freshness changes use the rereview path below. Never run the POST from an effect or read completion. |
| Conflict / review invalidated | Keep the dialog open with a durable explanation that the reviewed draft or active-plan state is no longer current. Disable the old Confirm; offer **Reload for review** as the single primary action. | Recovery issues GETs only. Reset acknowledgement and invalidate the old snapshot; do not simply substitute a new revision into the old confirmation. |
| Reloading / recovery read failed | Keep the original explanation and target visible while showing local progress or a recovery-read failure. Preserve draft inputs and the last usable plan. Cancel remains available because these are reads. | A failed required read keeps confirmation blocked and exposes **Retry reload**. Older responses cannot overwrite newer resource or recovery state. |
| Reloaded, review required | Keep the reason visible and offer **Review updated draft** or **Review current plan selection**. No enabled consequential Confirm yet. | Explicit navigation closes the dialog into the review surface, transfers the durable explanation there and focuses its heading. Only a later review action opens a fresh confirmation with newly reviewed identities. |
| Outcome uncertain | Explain that saving could not be confirmed and that current state must be checked before trying again. Keep the dialog and provide **Check current status**, plus secondary Cancel. | Network loss, timeout/abort, malformed success and potentially post-commit 5xx use targeted GET reconciliation. No automatic POST retry or claim of rollback. |
| Confirmed result | Present a durable success/current-state message naming the affected plan and next destination; close the dialog and restore useful focus. | Change active-plan UI only from validated server-confirmed state. Secondary read failure cannot turn a confirmed write into an apparent unsaved decision. |

**Durable means through the recovery flow.** The explanation survives read pending/success/failure, rerenders, resizing, dialog cancellation and transfer back to Review/history. Keep one visible instance on the current interaction surface; do not announce it again for unchanged read responses. Retire it after an explicit review/new confirmation or a reconciled terminal state, not merely because a GET succeeded. Do not store private payloads or errors in browser storage to persist this message across a full reload.

**A read is not rereview.** A successful reload must not re-enable the old Confirm. It yields a review action, followed by the normal fresh confirmation entry. If the draft disappeared, changed identity, is no longer eligible, or the selected plan is unavailable, explain the observed outcome and keep the stale decision unavailable. Never silently switch to another draft or approved version. A server error identifying stale history requires refreshed cautions and a new explicit acknowledgement even if the proposal revision is unchanged.

### Existing contracts and recovery rules

| Operation | Existing interface | Recovery reads and boundary |
|---|---|---|
| Local approve/reject | `POST /api/v1/coaching/proposals/:proposalId/decision`: `decision`, `expectedRevision`, optional `acknowledgeStale`, and exact `replacingPlanId` for replacement approval. Validate with the existing decision response schema. | Reload `GET /api/v1/coaching/proposals/latest` and `GET /api/v1/coaching/plans/active`; refresh approved history when reconciling approval or displaying changed history. Required reads must succeed before another decision; documented active-plan `404 NOT_FOUND` counts as authoritative absence. |
| Online approved-plan selection | `POST /api/v1/coaching/plans/:planId/activate`: exact `expectedActivePlanId`, including null for reviewed absence. Validate with the existing activation response schema. | Reload active plan and approved history. Resolve the candidate by ID from refreshed approved records and review the current replacement consequence. Do not change the endpoint's existing optimistic concurrency behavior. |
| Conflict classification | HTTP status/code metadata from the existing API helper. | Treat HTTP 409 and known conflict codes as requiring recovery, including `PLAN_ACTIVATION_REJECTED`, `PLAN_NOT_READY`, active-goal/routine/context version mismatches and stale-history acknowledgement requirements. Map specific safe explanations when supported; unknown conflicts get a truthful generic rereview message. |
| Authorization / missing target | Existing route security and target-not-found behavior. | Authentication/authorization uses existing safe recovery and destination handling. Missing targets require refreshed review/selection, never default identity substitution. Cached content is subject to existing privacy/session rules. |

Capture the current read generation when a recovery begins. Ignore late responses from before the decision/recovery or from a superseded attempt. Cancellation of a GET may stop presentation work; cancellation of a dispatched POST is not proof that the server cancelled the decision. Keep handler guards in addition to disabled controls, including when required authoritative reads are unknown or the reviewed target changed.

For uncertain outcomes:

1. Keep the attempted target identity and action. Show safe task-specific wording such as “We could not confirm whether this plan was made active. Check the current plan before trying again.” Do not display raw stack traces, IDs, private paths or arbitrary server details.
2. Read authoritative state using the interfaces above. If the exact attempted plan is now active, show that observed current state and prevent resubmitting the old approval/activation. Do not attribute the change to this request when the response cannot establish that.
3. If history confirms that the attempted proposal became an approved plan but another version is now active, explain those two facts. Do not reactivate it automatically. A returned active plan does not prove that post-approval context publication completed; do not report publication success or silently republish it.
4. If the same proposal remains actionable and the relevant reads succeeded, send the runner through Review and a fresh explicit confirmation. If the latest proposal is absent or different, that alone does not establish a rejection result; state that the attempted draft is no longer available through this read and leave the old decision disabled. Use existing supported review/history destinations; record an unresolved outcome if the APIs cannot establish more.
5. If reads fail or conflict with each other, preserve the uncertainty and a read-only retry. Do not infer success, absence or unchanged state. Record any API limitation separately rather than expanding contracts under F07.

For an ordinary validated success, commit the returned authoritative outcome to UI state, clear the completed pending action and show success independently of history refresh. If history refresh fails, keep the success and provide a separate history-read warning. Rejection success preserves the existing active plan. Navigation to Home/Calendar must read the confirmed current state through their existing data flow; no new cross-screen cache or optimistic prescription update is needed.

### Action hierarchy, draft preservation and accessibility

- Keep at most one filled primary action per active Plan stage/dialog. While creation is open, demote its overview launcher. Historical-version launchers are secondary so expanding several records does not create several primary actions; the selected confirmation owns **Make active**. Existing F06 stage progression remains intact.
- Approval and rejection dialogs name the reviewed plan version using ordinary labels and explain whether the proposed goal and Home/Calendar source will change. Keep full cautions available before confirmation. Reject is a deliberate consequential decision with its own confirmation, never a shortcut or automatic recovery.
- Preserve goal/context fields, draft identity/content, selected history entry and review position on recoverable failure. Do not reset F06 state when the confirmation fails. Reset stale acknowledgement only when closing/restarting confirmation or invalidating its reviewed context; a routine failure with unchanged context need not discard it.
- Name and describe each dialog; expose pending status politely and actionable failures once with appropriate alert semantics. Associate errors with relevant controls. Avoid an alert role whose live behavior is unintentionally overridden to polite for every error.
- Preserve focus inside the same dialog during pending/failure/read refresh. Provide a focusable dialog container or stable status target when all controls are disabled; Tab/Shift+Tab must remain contained. Restore Cancel/Escape as soon as the write settles, including failure and uncertain outcome.
- Cancel returns focus to the connected, usable launcher. If success or refreshed data removes it, use a deliberate fallback: Review heading for an available draft, active-plan heading after activation, or history heading when a candidate disappeared. Do not focus a detached/hidden element or let focus fall into inert content.
- Explicit transition to rereview focuses the review heading; background GET completion does not move focus or reset scroll. One dialog at a time, inert background, visible focus, 44px targets, 320px reflow and readable/scrollable content at actual 200% zoom remain required.

### Execution slices and acceptance criteria

**F07.1 — Isolate confirmation state and bind reviewed identities**

Scope: Separate proposal import/read feedback from consequential mutation state; introduce the reviewed target snapshot, synchronous submission guard, response validation and recovery classification in app-local code.

Acceptance criteria:

- No loader/import result clears decision status or changes a confirmed target silently.
- Repeated activation/approval/rejection events during pending send exactly one POST with the reviewed revision/replacement identity.
- Invalid/missing identifiers, unresolved authoritative state and invalidated snapshots cannot dispatch a write; no invented revision fallback.
- Real local/online conflict codes and malformed/lost responses enter the correct recovery state; no consequential POST originates from recovery effects.

Dependencies: Current F06 resource/stage boundary, core schemas and existing local/online route behavior. Reinspect the working tree before implementation because shared Plan changes are already in progress.

**F07.2 — Keep pending, failure and result feedback in the active dialog**

Scope: Apply the lifecycle to local approve/reject and online activation dialogs; retain targets, draft input and focus; separate confirmed write results from secondary refresh results.

Acceptance criteria:

- A delayed POST shows dialog-local pending feedback; duplicate submission and disruptive dismissal are unavailable while pending.
- A synthetic 503 shows an actionable error/uncertainty explanation inside the still-open dialog, without a duplicate background decision error or false success.
- Recoverable failure retains inputs and target, and restores exit controls; Cancel returns useful focus.
- Validated approval/activation success updates authoritative Plan state and provides durable confirmation; rejection leaves the current plan unchanged. A subsequent history-read failure does not invite repeating the successful write.

Dependencies: F07.1 and existing modal/status styles. Shared hook changes require focused Calendar regression checks.

**F07.3 — Durable conflict and uncertain-outcome reconciliation**

Scope: Implement targeted read recovery, persistent explanation, explicit rereview and fresh confirmation for both flows; preserve truthful unknown states when current APIs cannot identify a result.

Acceptance criteria:

- All relevant 409 variants invalidate the old confirmation and stale acknowledgement; conflict text remains visible before, during and after reload, including failed reload.
- Both draft and current replacement state are reconciled for local decisions; both active plan and approved history are reconciled for online selection.
- Reload success alone never enables the old Confirm. The runner explicitly returns to review, sees current consequences and opens a new confirmation before another POST.
- Lost response after committed approval/activation produces current-state recovery without a duplicate write. A missing draft does not become a fabricated successful rejection.
- Changed/missing candidates, late GETs and already-active targets cannot submit stale identities. Recovery, Back, Cancel and navigation issue no consequential writes.

Dependencies: F07.1–F07.2 and F06 read helpers with response-order protection. No new outcome/audit endpoint is assumed.

**F07.4 — Enforce action hierarchy and accessible transitions**

Scope: Demote competing Plan/history launchers; complete keyboard behavior across ready, pending, failure, rereview and success.

Acceptance criteria:

- Expanded creation plus stage controls, multiple expanded history entries, and each confirmation/recovery state have at most one filled primary action on the active surface.
- Dialog name, target, consequence, input/error association, status announcement, focus containment, Escape/Cancel and focus return work through the full journey.
- Resizing and actual 200% zoom preserve input/state, readable caveats, reachable recovery/exit controls and no page-level horizontal overflow.
- A removed launcher yields the documented useful focus fallback; no nested dialogs or focus movement on background refresh.

Dependencies: F07.2–F07.3; coordinate F06 primary-action ownership and retain F05's already verified responsive behavior.

**F07.5 — Regression evidence and handoff reconciliation**

Scope: Add behavior coverage for the reproduced approval failure and newly identified actual conflict/uncertain-outcome paths; run applicable checks and update evidence only after implementation.

Acceptance criteria:

- Local approve/reject and online activation journeys assert visible states, exact request bodies/counts, retained inputs, and no unintended writes.
- Focused checks cover Calendar consumers if modal behavior is shared; Plan stages and existing F06 recovery behavior remain intact.
- Ticket 09, affected GS rows and RR-08 cite actual results; shared F05/F06/F10 and unperformed human/assistive-technology/deployment work remain explicitly outstanding.

Dependencies: F07.1–F07.4 and isolated synthetic fixtures. Deliver in that order; F07.1 is the recommended first implementation slice.

### Validation plan — run during implementation, not this planning task

| Scenario | Required observations |
|---|---|
| First-plan approval, replacement approval, rejection, online activation | Named target and Home/Calendar consequence; exact existing request payload; no write before explicit Confirm; only validated results become success. |
| Delayed decision/activation, double click and Enter | Exactly one POST; dialog-local pending text; contained keyboard focus even when controls are disabled; no dismissal until resolution and exits restored afterward. |
| Approval/rejection/activation 503 or network failure | Error inside active dialog, no duplicate background decision alert, retained inputs/target, truthful uncertainty and supported read recovery. No automatic second POST. |
| Local revision mismatch returning `PLAN_ACTIVATION_REJECTED`, rejection `REVISION_CONFLICT`, online `CONFLICT`, and unknown HTTP 409 | All block the old confirmation; specific safe explanation where known; no string matching of raw human error messages or blind retry. |
| Conflict → delayed reload → failed reload → successful reload | Explanation persists across every state; only required GETs; last usable plan and draft input retained; next action is rereview, not immediate resubmit. |
| Active plan changes while proposal revision stays the same | Reload current replacement and comparison; new confirmation uses the newly reviewed replacement ID. Old confirmation cannot quietly acquire it. |
| History becomes stale during confirmation | Server stale-history requirement leads to refreshed warning/review and a fresh acknowledgement; no automatic acknowledgement or bypass. |
| Candidate changed, disappeared, already active, or another draft is latest | State accurately names the observed situation; no stale-target POST, automatic candidate substitution, fabricated rejection or unintended activation. |
| Lost response / malformed 2xx after commit; approval followed by publication failure | Authoritative exact-target reconciliation; no repeated decision/activation; current state reported without an unsupported context-publication or request-attribution claim. |
| Validated write success followed by history GET 503 | Confirmed changed state remains visible; history retry sends only GET; write success is not downgraded to an unsaved decision. |
| Slow older GET completes after a newer mutation/recovery | Old response cannot restore stale proposal/active state, clear recovery, or re-enable an invalid confirmation. |
| Cancel before dispatch, cancel after failure, cancel during recovery GET, rereview, navigation and reload | Draft/input and focus behavior follow the specified transitions; no mutation triggered by any of these actions. Full reload starts outside Confirm. |
| Keyboard and responsive states | 320, 767, 768, 1199, 1200 and 1440 CSS px; resize with pending/error/open dialogs and actual 200% zoom. Verify one primary action, inert background, 44px targets, focus restoration/fallback and readable scrollable content. |
| Local/online capability and shared consumers | No local proposal/context calls in online selection recovery; Calendar reason/revision/permissions and modal cancellation remain unchanged if shared code is touched. |

Use app-local unit tests for state transitions, status/code classification, schema handling and response ordering where they test consequential invariants. Use Playwright for the actual dialog, focus, retained-content and network behavior; source-string checks alone cannot establish F07. Prefer the F06-proposed `redesign-plan.spec.ts` for local failure/recovery journeys if it exists by implementation time, otherwise add it. Keep online activation tests in `online-dashboard.spec.ts`, which the current online configuration explicitly matches. Reuse deterministic isolated fixtures; do not submit test decisions against the athlete's working database.

Planned checks from the repository root:

- `npm test --workspace @racepredictor/web`
- `npm run typecheck --workspace @racepredictor/web` (the current lint script runs the same TypeScript check)
- `npm run test:e2e --workspace @racepredictor/web -- redesign-plan.spec.ts` if that spec is added, plus affected approval/rejection and shared Calendar journeys in `digital-coach.spec.ts`
- `npm run test:e2e:online --workspace @racepredictor/web -- online-dashboard.spec.ts`
- `npm run build --workspace @racepredictor/web`
- Core/DB checks only if implementation touches those boundaries; no schema or persistence change is expected.

Record exact scenarios, commands and results, and distinguish unrelated baseline failures. Reconcile earlier broad PASS claims rather than carrying them forward from source inspection. Automated browser evidence does not complete manual screen-reader/status-announcement checks, human comprehension, or deployment verification. Rerun the applicable design-intent review after implementation and report F07 separately from shared findings.

### Assumptions, risks and delivery notes

- **Confirmed requirements:** explicit consequential confirmation; local pending/error/recovery feedback; no silent write retry; preserved input/focus; durable conflict explanation; authoritative reread plus rereview; one filled primary action per active surface.
- **Implementation assumptions:** explicit recovery buttons and transfer to the existing Review/history surface are proposed interaction choices. Durability is within the in-page recovery journey; published context/imported drafts provide existing server persistence. No new browser persistence is required.
- **Open questions:** none block this plan. Existing APIs cannot necessarily prove a lost rejection response or completion of post-approval context publication. Keep those outcomes qualified; record a separately scoped contract/operations gap if implementation needs more than the existing reads can establish.
- **Trade-off:** a UI state helper and explicit rereview add a small amount of state, but prevent shared read/import feedback from unlocking or hiding consequential decisions. Reuse app-local behavior rather than refactoring all coaching pages or changing server concurrency semantics.
- **Reliability/performance:** targeted GETs run concurrently where independent and are bounded to explicit recovery attempts; no polling service, auto-retry loop or additional consequential background work. Guard late responses and preserve server authority when reads disagree.
- **Security/privacy/observability:** retain existing owner/session boundaries and safe return paths. Use safe task-level error copy and existing diagnostics; do not log proposal contents, context, private paths or raw response payloads. Test evidence records request class/outcome and counts using synthetic identities.
- **Migration/rollout/rollback:** no migration, backfill or new feature flag. Deliver through the existing web validation/release workflow; rollback only the F07 change set, preserving the substantial unrelated working-tree changes and all persisted decisions.
- **ADR:** not needed while preserving existing approval/control boundaries. Any proposal to add a write-retry protocol, outcome API or alter approval/publication atomicity requires separate scope and architectural review.
- **Skill invocation summary:** Architect used for requirements validation, state/API boundaries, failure analysis and testable execution slices. Read `docs/CONTEXT.md`, `docs/ARCHITECTURE.md`, the design contract/backlog, review/QA records and relevant source/contracts. `.codex/enforcement` is absent; `apps/web/AGENTS.md` requires reading relevant installed Next.js guidance before future code changes. This task edits the handoff plan only; it runs no implementation tests and makes no delivery-completion claim.

## F08 implementation and evidence — 14 September 2026

Implemented only the F08 slices below. This evidence does not close unrelated F01–F10 work, human comprehension, assistive-technology, deployment, or the known provider-cancellation limitation.

### Outcome and scope

A runner imports through the selected source, understands what the server actually accepted or queued, and can recover an affected assessment through Data Quality and Settings without losing the originating view. Returning after correction shows the current assessment or its remaining limitation; import or connection success alone never establishes that an assessment has been recomputed.

Binding references: Design Intent Contract UX2/UX6, N4, V3, I1–I2/I5, section 10, S1, A1–A5, T4–T5 and ALLOW3; Backlog Tickets 08 and 11, plus Ticket 12's connection-return criteria; the 13 September review's F08 finding; QA rows AI-F01–AI-F06, AI-A01/R01/S01/D01/X01/PW01, DC-F01–DC-F04, DC-A01/R01/S01/D01/X01/PW01 and RR-06.

- Preserve `/dashboard/data-quality`, Settings, Home and Training routes, compatible existing deep links, upload/dedupe behavior, provider authorization and backfill bounds, owner/session boundaries, timezone semantics and approved plans.
- F08 owns import state/result ownership, truthful recovery information, contextual entry and transport, Settings return actions, and restoration/revalidation of the originating assessment. F04 owns the broader Training list/detail lifecycle; coordinate the shared restoration seam without declaring F04 complete. F09 owns general Settings grouping, pairing, reminders and preference failures; limit Settings edits here to connection recovery and return context.
- Keep file upload in its currently supported execution profile; Strava requires the authenticated cloud capability. An unavailable provider must not obstruct local file import. Do not introduce cloud file persistence merely because a file control is visible.
- Exclude new providers, ingestion/recompute/job-status APIs, queue workers, automatic write retries, history edits, prediction changes, plan activation/adaptation, schema changes and a general navigation rewrite. Shared responsive/QA work supports F05/F10 but does not close them.

### Current implementation findings

Verified by source inspection of the current working tree; these are not new browser-test results.

| Area | Finding | Implementation implication |
|---|---|---|
| `DataQualityPage` in `apps/web/components/coaching/coaching-pages.tsx` | The conditional `source === "file" && !result` falls through to Strava controls after file success. | Branch on source first, then on that source's workflow state. File success cannot select or render provider actions. |
| File state/result | Radio changes clear the shared result. The file success/reused message is hidden once a result exists; result actions always emphasize return. | Give each source its own retained result and explicit transitions; keep reused/partial explanations visible and choose one appropriate next action. |
| Counts/status | Accepted falls back from `normalizedCount` to `stagedCount` to zero; absent status becomes completed. Any duplicates trigger correction copy. | Parse the existing response contract; staged is not normalized, unavailable is not zero, duplicates alone are not rejected data, and transport success is not domain completion. |
| Warnings | `parseWarnings` is rendered verbatim. The local service can append an analytics-refresh warning containing an underlying error message. | Render safe task-level explanations and supported structured facts; never expose raw exception text or private paths as routine warning copy. |
| Contextual navigation | Data Quality accepts a `returnTo` prefix and labels most destinations View Training. Training's Add training link has no context; Home's empty state supplies only `/dashboard`. | Add validated context at the launcher and restore the actual view, selection/disclosure, position and focus; label the real destination. |
| Settings connection path | Data Quality constructs a fixed `/dashboard/data-quality?source=strava` return and drops its own origin. `OnlineSyncSettings` forwards its return path to connect but has no explicit contextual exit. | Preserve the complete recovery destination through Settings and add an in-app return action even when no connection is made. |
| OAuth/backfill | Successful callback redirects to stored `returnTo`, adds `provider`/`connection`, and attempts `enqueueInitialBackfill`. Callback failure, including access denied, becomes an API error. | Connection can start existing automatic processing; do not promise that it never imports. Callback markers are not proof of current connection or ingestion. Explicitly address the failed-callback recovery gap below. |
| Existing schemas | `importUploadResponseSchema` supports uploaded/normalizing/completed/failed, optional normalized count and reused/analytics flags. Provider `returnTo` is same-origin relative and at most 500 characters. | Reuse core schemas and retain compatibility; do not invent a queued file status or carry an unbounded nested URL through OAuth. |

Supporting boundaries: `apps/web/lib/local-activity-import-service.ts`, upload and Strava route handlers, `packages/core/src/contracts/imports.ts`, `providers.ts`, `strava.ts`, and `packages/core/src/use-cases/strava-connection.ts`. Home readiness is currently an in-page disclosure with a selected prediction distance; restoring `/dashboard` alone does not restore that assessment. Relevant launchers live in `home-recent-training.tsx`, `dashboard-shell.tsx` and `activities-shell.tsx`.

### Architecture and state decisions

Keep orchestration and navigation metadata in the web app. Introduce small app-local import-state and recovery-context helpers, consumed by Data Quality, the relevant launchers and Settings. Reuse core schemas and existing service endpoints; no DB access or domain-contract duplication in components. Read relevant installed Next.js guidance under `apps/web/AGENTS.md` before future code changes.

**Source ownership.** Model selected source separately from file submission, file result, provider status, connection handoff and backfill acknowledgement. Preserve a last confirmed result beside a later failed attempt, clearly labeled as the earlier result. Switching sources changes only the visible workflow and restores that source's prior state on return; it neither clears the other source's outcome nor triggers upload/connect/backfill. An explicit Import another file/Correct file action starts file selection while retaining useful previous results for comparison.

Guard dispatch as well as disabling buttons, so rapid click/Enter sends one request. Prevent source changes during that source's pending write, but do not lock File behind an unrelated provider read. Use request generations or cancellation to stop late reads/responses from overwriting a newer attempt, another source, or a changed authenticated session. A status refresh cannot erase a backfill acknowledgement. Preserve an in-memory selected file on recoverable submission failure; browsers cannot restore a file picker across a full reload or OAuth round trip, so request reselection without claiming the file was retained.

**Result interpretation and recovery.** Treat outcome dimensions independently; reused can coexist with partial/duplicate/warning results. Use validated server fields and preserve actual counts rather than inferring arithmetic relationships between staged records, normalized activities and warnings.

| Observed evidence | Runner-facing consequence | Supported next action |
|---|---|---|
| Completed file, confirmed normalized count, no rejected records/warnings | State the accepted count and where the activities can be viewed; distinguish review/assessment freshness. | Return to the originating assessment, or View Training for a general import. Import another file is secondary. |
| Rejected records or partial result | Some source records were not added; show accepted, duplicate and rejected counts separately and safe validation guidance. | Correct the source file and explicitly upload again; accepted records remain viewable. Do not offer an in-app row editor. |
| Duplicate-only result | Existing records were not added again. Duplicates alone do not require correction. | View existing training or return; another upload is optional. |
| `reused: true` | This response describes an existing import/job. File counts belong to that prior import, not newly added activities in this attempt. | Inspect the existing outcome; retain any original rejection/warning information. For Strava, acknowledge an existing job without inferring its current execution state. |
| Warning with otherwise accepted records | Explain the supported limitation beside the affected result. If `analyticsRefreshed === false`, imported history can be available while the assessment remains older. | View history or refresh the assessment read; show correction only where the warning identifies an executable remedy. No re-upload merely to force analytics refresh. |
| Uploaded/normalizing file result | Staging/processing has not confirmed completed normalization. Label staged and normalized counts separately where supplied. | View Training/check supported status. Do not invent a job endpoint, elapsed progress or completion time. |
| Failed domain result, validation error, 503/network failure or malformed response | Name the affected import task. Distinguish known rejection from an unknown write outcome; never substitute completed or empty data. | Retain file choices and earlier results; offer explicit correction/retry where supported. For an uncertain outcome, allow checking Training before a deliberate re-import through existing dedupe. Never retry automatically. |
| Strava connected, backfill acknowledged (`jobId`, `reused`) | Connection and queued work are separate facts. Existing automatic processing may run; a manual 90-day request is bounded and may reuse a job. Neither proves activities/review/assessment completion. | View Training or supported status; keep the acknowledgement durable and demote the repeat-import action. |
| Provider disconnected/action required, unavailable or failed status read | Explain whether importing more Strava history needs a connection or whether status could not be checked. A failed read is not disconnection. | Settings connection/reconnection for authoritative connection issues; retry the status GET for read failure. |
| Assessment unavailable/stale or no executable correction | Explain what cannot yet be assessed and keep usable measured history visible. | Refresh an existing read, inspect relevant history, or return with an explicit no-action explanation. No promise of better readiness or prediction. |
| Successful issue check with no issues in that check's scope | State what was checked and when; no broader all-clear claim. | Return to the assessment. Never derive this state from no import result, an empty warning array alone, or a failed check. |

Warnings may include supported row numbers, field names or known reason categories when safe. Do not echo arbitrary server messages or source contents. Unknown warnings remain visibly counted with a generic limitation and honest recovery limits; do not invent their cause. No new server diagnostics endpoint is required.

Use one filled primary action for the active task: import during selection, supported correction for actionable partial failure, connection/retry when that is the blocker, and return/view once the task is accepted or queued. Keep alternative recovery and navigation secondary. Announce each meaningful transition once and keep durable status adjacent to its source; provider loading/errors must not become File feedback.

### Full safe return context

**Context contract, proposed app-local design.** Capture an allowlisted origin route with its supported query/hash, an origin kind (Home outlook/readiness, Training list/detail, or import), safe entity/assessment identity where available, selected prediction distance or activity, disclosure state, applied filters, loaded-page depth/cursors, scroll anchor/offset, and a semantic focus key. Include an issue category and recovery source when known. This is navigation metadata, not evidence that an issue is still present; verify claims from existing reads.

Use a bounded, versioned, per-tab `sessionStorage` record keyed by an opaque recovery ID for the richer context. Store metadata only: no activity payloads, assessment text, raw files, warnings, tokens, notes or private paths. Scope records to the current owner/session when available, expire them after a bounded interval (proposed two hours), clear on sign-out/identity change, and never restore another session's record. Use defensive parsing and graceful handling when storage is unavailable. Retain records through repeated correction attempts and Back/Forward; expiry and bounded eviction prevent accumulation.

Keep existing safe `returnTo` links compatible. New recovery links carry the compact recovery ID and, where it fits, a minimal safe parent fallback. Settings receives a Data Quality return path containing that ID and selected source; the OAuth request forwards this same compact path under the existing 500-character limit. Do not recursively nest the full origin URL at every hop or enlarge the core limit. If storage is missing/expired on another tab/device, retain the safe route fallback, explain that earlier view context is unavailable, and do not fabricate restoration.

Validate every entry point, including legacy `returnTo`: reject external/protocol-relative URLs, backslashes, malformed encoding, traversal to a disallowed path, lookalike `/dashboard-*` paths and excessive nesting/length. Resolve against the current origin and allow only actual supported dashboard destinations and known presentation parameters. Validate focus keys/IDs and map them to known elements; never execute query-derived selectors or arbitrary HTML. Keep source credentials and OAuth `state`/`code` out of recovery records and links. These checks supplement existing server validation, never replace it.

**Journey and restoration responsibilities:**

1. The launcher captures its current view before leaving and links directly to Data Quality with the relevant issue/source. Add contextual entry beside an actual affected Home/readiness claim, plus Training and import launchers; avoid inventing a data problem merely to expose a link.
2. Data Quality restores the context, identifies the affected task and practical consequence, and offers only an applicable recovery. General direct entry remains Add training with a truthful no-result state and an explicit Training parent.
3. Settings opens Connections and preserves the same recovery ID. Provide Return to import/recovery without requiring OAuth or a mutation. Carry context through connection success, cancellation/back navigation, status failure and existing sign-in recovery. Arrival itself never calls connect or manual backfill.
4. On a successful OAuth return, consume only safe navigation markers and reread authoritative provider status. Explain existing automatic processing separately from a manual import request. Connection success cannot clear the original data limitation or trigger a client-side repeat backfill.
5. After correction/acknowledgement, provide an accurately named Return to readiness, Return to Home, Return to session or Return to Training action. Restore the selected prediction/disclosure or Training selection/filters and loaded depth through the owning component. Re-fetch rows by saved query/cursors instead of persisting private row payloads. If an item/cursor is no longer valid, retain the valid filters and use an explicit nearest valid parent/focus fallback.
6. Revalidate only the relevant existing assessment/history/review reads on return. Restore position after content is ready and focus the originating control or a meaningful heading fallback. Keep prior usable assessment content labeled during refresh; a failed read remains a failed refresh. Use actual assessment identity/timestamps to establish recomputation; a later fetch time or queue acknowledgement is insufficient. Do not overwrite a newer assessment with a stored snapshot or auto-run prediction/approval writes.

Browser Back/Forward must follow the same restoration rules without writes. Support restoration even when OAuth navigation remounts the application; do not rely solely on component state or router scroll behavior. Coordinate Training loaded-page restoration with F04's eventual implementation. F08's return acceptance remains outstanding until that integration works, even if the URL itself is correct.

**Known callback limitation.** Current access-denied/expired-state errors return an API error rather than redirecting with trusted recovery metadata. Do not describe an automatic cancellation return as already supported or infer cancellation from arbitrary query text. The compatible baseline is to preserve the recovery record before leaving, explain the external return path, and restore Settings/Data Quality on browser Back with authoritative status and a qualified “connection not confirmed” state. Confirmed cancellation copy requires trusted evidence. If the binding cancellation journey requires a direct in-app callback error page/redirect, define a separately reviewed callback presentation change using the already validated, owner-scoped OAuth attempt destination; preserve JSON error contracts, state consumption, replay/expiry checks and authorization boundaries. Never redirect from an unvalidated callback parameter. Record this gap explicitly in F08 validation until the chosen supported path is demonstrated.

### Execution slices and acceptance criteria

Feature: F08.1 — Source-owned import state and outcomes
Description: Separate File and Strava rendering and retain validated outcomes with truthful counts and pending behavior.
Priority: High
Area: Data Quality import orchestration and app-local state helpers
Reason: Fixes the reproduced wrong-source action and establishes reliable result semantics for recovery.
Acceptance Criteria:
- File success with a connected, disconnected, delayed or failed Strava status keeps File selected and shows no Strava controls.
- Accepted, duplicate-only, rejected, partial, warning, reused, uploaded/normalizing and failed cases preserve their distinct evidence; missing normalized counts remain unavailable, not staged/zero.
- Rapid click/Enter causes one write; source changes and late responses cannot move an outcome to another source or clear it unexpectedly.
- Reused and backfill acknowledgements remain visible; an uncertain response never becomes a completed import or an automatic second request.
Dependencies:
- Existing import schema, provider/backfill response shapes and supported local/online capability boundaries.
Risks:
- Existing E2E upload stubs omit required `importId`/`stagedCount`; update fixtures to the actual contract instead of weakening validation.

Feature: F08.2 — Safe recovery context and Settings transport
Description: Capture bounded navigation metadata and carry it through Data Quality, Connections and the existing OAuth success return.
Priority: High
Area: Recovery-context helper, contextual launchers and OnlineSyncSettings
Reason: Prevents losing the affected assessment and avoids oversized or unsafe nested return paths.
Acceptance Criteria:
- Home/readiness and Training entries retain their specific selection/disclosure/filter context; legacy safe links and direct entry have accurate fallbacks.
- Settings can return without connecting; successful OAuth preserves the same recovery context and uses authoritative status without a new client import request.
- Invalid/expired/missing context and unavailable storage fail safely; the full provider return string stays within 500 characters.
- Back after an unsuccessful authorization restores context without reconnecting or claiming success; the callback presentation limitation is explicitly dispositioned, not hidden by a mocked success URL.
Dependencies:
- Existing same-origin provider return contract and owner/session handling; the F04 restoration seam for Training.
Risks:
- Per-tab storage cannot guarantee restoration on another device/tab; use safe parent fallback. Callback failure currently lacks a direct UI return.

Feature: F08.3 — Task-specific recovery and assessment return
Description: Explain each supported limitation and restore/revalidate the original assessment after a recovery attempt.
Priority: High
Area: Data Quality issue presentation and originating Home/Training view integration
Reason: Makes recovery useful without equating imported data with improved or recomputed predictions.
Acceptance Criteria:
- Affected task, practical consequence and one supported next action precede secondary diagnostics; arbitrary errors/paths/source text are not rendered.
- Duplicate-only results need no correction; rejected rows support explicit re-upload; provider failure supports status retry or connection as appropriate; queued/unavailable evidence has honest inspection or no-action guidance.
- Return restores the original assessment/view, loaded Training context, scroll and focus; missing entities use a labeled fallback.
- Return revalidation retains usable content on delay/failure, preserves real assessment age, and never claims no issues/recomputation from import success alone.
- Navigation, status retry and rereading produce no upload, connection, backfill, plan, schedule or prediction-command writes.
Dependencies:
- F08.1–F08.2 and existing assessment/history/status reads; coordinate F04 without absorbing its unrelated detail changes.
Risks:
- Not every limitation has a corrective API or per-job status read. Render supported limits; do not introduce a pretend Refresh/recompute operation.

Feature: F08.4 — Regression and recovery journey evidence
Description: Exercise actual File/Strava ownership, safe navigation and assessment restoration, then reconcile affected evidence records.
Priority: High
Area: Web unit/route tests, local/online Playwright and F08 handoff evidence
Reason: Existing broad PASS notes do not prove the reproduced branch and full recovery journey work.
Acceptance Criteria:
- Deterministic tests cover the matrix below with exact mutation counts and realistic schema-valid fixtures.
- Browser evidence verifies keyboard/focus, active-source controls, one primary action, actual 200% zoom and responsive recovery states.
- Affected AI/DC rows and RR-06 cite executed results; remaining callback/F04 integration, human comprehension, assistive-technology and deployment gaps stay explicit.
Dependencies:
- F08.1–F08.3 and isolated local/online fixtures; no live OAuth credentials or athlete database mutations for routine verification.
Risks:
- A mocked callback cannot prove real provider cancellation or deployed authentication behavior; distinguish fixture coverage from those outstanding checks.

### Validation plan — run during implementation, not this planning task

| Scenario | Required observations |
|---|---|
| Valid CSV/single-activity GPX with every provider read state | File remains selected after completion, file-owned results persist, no Strava controls or accidental backfill, one primary next action. |
| Partial, duplicate-only, reused-with-original-counts, warnings, zero normalized, missing normalized and analytics refresh failure | Exact supplied distinctions; no staging-as-accepted or replay-as-new claim; safe consequence and executable correction only. |
| Uploaded, normalizing, failed, malformed 2xx and missing required fields | No invented completed/queued file status or fake zero counts; prior result preserved; schema error and unknown write outcome have truthful recovery. |
| Missing/empty/unsupported/malformed/oversized file, delayed upload, 503/network/lost response | Local field feedback, retained selection where possible, guarded duplicate submission and no silent write retry; original result survives a failed replacement. |
| Source switches, provider refresh, late response after new attempt or sign-out | Each outcome remains source/attempt/session owned; no stale data leak or cross-source focus/status announcement. |
| New/reused manual backfill and successful connection with initial backfill success/failure | Queue acknowledgement remains durable; existing callback behavior preserved; connection is not mistaken for ingestion, and no extra client backfill is dispatched on return. |
| Home/readiness → Data Quality → Settings → OAuth success → recovery → assessment | Same selected distance/assessment disclosure and originating focus; task/consequence visible; bounded return path and current provider read. |
| Training filters/pages/selection → recovery → return; browser Back/Forward and reload | Restored valid filters, loaded depth, selected row/detail, position and focus; no unintended writes; missing row/cursor fallback is explicit. |
| Settings return without connection; denied/expired/replayed OAuth; expired sign-in | Safe context preserved where available, supported recovery shown, no fabricated cancellation/success or implicit reconnect. Exercise the actual handler path in route tests and record browser-return limitations. |
| Malicious/oversized/nested return URL, tampered/expired context, blocked storage, other session/tab | Safe parent fallback, no external redirect, no arbitrary focus selector, no cross-session restoration and no private payload/credential persistence. |
| Correction → delayed/failed assessment read → unchanged/changed assessment | Previous usable assessment remains labeled; successful reread is distinct from recomputation; no automatic prediction/plan write and no premature all-clear. |
| Keyboard, responsive and announcements | Check 320, 390, 767, 768, 1024, 1199, 1200 and 1440 CSS px, resize during pending/result/recovery and actual 200% zoom. Verify 44px targets, readable counts/caveats, no page overflow, meaningful focus and non-repeating statuses. |

Use app-local unit tests for result classification, transition ordering, URL validation and context serialization/expiry/session scope. Reuse `import-upload-route.test.ts` and `strava-connection.test.ts` for server-contract and OAuth invariants; use browser tests for rendered source ownership and complete restoration. Source-string assertions alone cannot establish this behavior.

Add the QA-proposed `redesign-import.spec.ts` and `redesign-data-quality.spec.ts` if absent. Keep online recovery tests in `online-dashboard.spec.ts`, or explicitly include new online specs in its configuration: the current online `testMatch` only includes `online-dashboard.spec.ts` and `redesign-coverage.spec.ts`. Preserve unrelated tests and update schema-incomplete import stubs deliberately.

Planned checks from the repository root:

- `npm test --workspace @racepredictor/web`
- `npm run typecheck --workspace @racepredictor/web` (current web lint uses the same TypeScript check)
- `npm run test:e2e --workspace @racepredictor/web -- redesign-import.spec.ts redesign-data-quality.spec.ts`, after adding those specs, plus affected existing import/Training journeys in `digital-coach.spec.ts`
- `npm run test:e2e:online --workspace @racepredictor/web -- online-dashboard.spec.ts`, plus any explicitly configured new online specs
- Applicable protected-return tests through `npm run test:e2e:auth --workspace @racepredictor/web` when authentication integration is touched
- `npm run build --workspace @racepredictor/web`
- Core/DB tests only if those boundaries are touched; no schema or persistence change is expected.

Record exact scenarios, commands, screenshots and results, separating baseline failures and mocked journeys from real integration evidence. After implementation, reconcile Tickets 08/11 and the affected Ticket 12 return criteria, AI/DC/RR-06 evidence, and rerun the design-intent review for F08. Do not carry forward earlier PASS labels or close all of F04/F05/F09/F10 through these checks.

### Implementation evidence — 14 September 2026

- **F08.1:** File and Strava now retain separate result state. Validated file responses are parsed through the existing import schema; normalized activity count is shown as unavailable when absent rather than staged or zero. Reuse, duplicate-only, rejected, warning, staged/processing and failed outcomes have distinct consequence/action text. The guarded file submit path prevents a rapid second dispatch; a File result never renders Strava controls.
- **F08.2:** Added a bounded, versioned per-tab recovery record with a two-hour expiry and allowlisted dashboard paths. It carries only presentation metadata (origin, activity/filter/depth plus opaque page cursors/disclosure, position and semantic focus key), not source data, warnings, tokens or raw paths. Training and Home launchers pass its opaque ID through Data Quality and Settings. Settings has a no-write return control and re-reads provider status after a confirmed OAuth marker.
- **F08.3 / F04 seam:** Training preserves a directly selected detail even when its surrounding list is empty/failed. A completed return re-reads saved filters, each saved loaded page and the selected detail, then restores position/focus after content is ready. It does not persist row payloads or issue prediction, plan, upload, backfill or connection writes. File/queue success explicitly says assessment recomputation is unconfirmed.
- **OAuth cancellation finding:** route test confirms that `access_denied` is still an owner-scoped `400 OAUTH_ACCESS_DENIED` API error. It is not and must not be represented as a success/cancellation redirect. Browser Back remains the supported compatible recovery; direct callback presentation requires separately reviewed scope.
- **Executed checks:** `npm run typecheck --workspace @racepredictor/web` PASS; `npm test --workspace @racepredictor/web` PASS (111 tests); local `f08-recovery.spec.ts` PASS (2); online `f08-recovery.spec.ts` PASS (2); online schema-valid partial-import regression PASS (1); `npm run build --workspace @racepredictor/web` PASS. The focused `digital-coach.spec.ts --grep=manual` run passed the revised import assertion, then stalled later in its unrelated approved-plan workflow and is explicitly not counted as a pass. These browser paths use intercepted, schema-valid synthetic fixtures and a 720px 200%-zoom viewport proxy; they do not prove a live Strava provider cancellation, real OAuth sign-in, actual browser zoom at 200%, deployment, screen-reader experience, or human comprehension.
- **F08 review verdict:** **Concern.** Executable F08 checks pass and the exact reproduced File → Strava, retained-file-result, and Training return failures are covered. Release remains blocked for direct cancellation presentation/recovery, 320px and actual browser-zoom/accessibility journeys, live-provider/deployment evidence, and an explicit product decision on durable cross-session recovery ownership.

### Separate F08 corrective review — 14 September 2026

| Acceptance area | Review result | Evidence / remaining condition |
|---|---|---|
| Source ownership and truthful outcomes | Pass in executable scope | Unit outcome matrix plus local/online File browser flow verify no Strava controls under File, single dispatch, retained prior result and distinct completed/processing/reuse/rejected/warning/duplicate messages. |
| Task-specific recovery and no false recomputation | Pass in executable scope | Import/queue result copy names the affected task, consequence and supported action; unit/browser assertions reject a review, readiness or prediction-complete implication. |
| Context transport and F04 restoration seam | Pass in executable scope | Local/online Training return re-reads saved filters, saved second page and selected detail; filter, focus and exact write-count assertions pass. Settings carries a no-write allowlisted return path. |
| Provider cancellation | Concern | Actual callback behavior is a safe `OAUTH_ACCESS_DENIED` API error, not a success redirect. Compatible Back recovery exists; direct provider-cancellation presentation still needs authorized product/API scope. |
| Responsive, keyboard and assistive validation | Concern | Browser exercises semantic focus and a 720px 200%-zoom proxy. Actual 200% zoom, 320px, screen reader/AT and comprehension validation are unperformed. |
| Contract, privacy and approval boundaries | Pass in code/test scope; concern for durable ownership | No API, approval, prediction, timezone or persistence contract changed; stored context excludes records, warnings, credentials and raw paths. It is same-tab session storage, not a durable owner-bound cross-session store; server reads/writes retain their existing authorization boundaries. |

### Product Assumptions

- No new product capability is needed for the principal source-ownership and successful recovery paths. The selected source and origin are presentation context; authoritative APIs determine outcomes and permissions.
- The per-tab recovery record, two-hour expiry and semantic focus keys are proposed implementation choices. Full restoration requires the same tab/session; safe direct-link fallback remains available otherwise.
- No authoritative general issue-check, forced recompute or per-import/job outcome endpoint was established in this inspection. Use existing scoped reads and explicitly label unsupported recovery; never invent those contracts.
- Direct browser recovery from failed OAuth is the known requirements gap. Preserve a compatible Back path and record whether it meets cancellation acceptance; any callback presentation/API change needs explicit scope review before implementation and cannot be silently bundled as a cosmetic fix.

### Prioritisation Summary

- Deliver F08.1 first, then F08.2 and F08.3, followed by F08.4 evidence. Confirm context transport and callback limitations before extending integration tests. Source ownership is independently testable; full Training restoration depends on a coordinated F04 seam.
- A small context helper adds bounded state but avoids changing routes or server return limits. Keep result data in existing authorized reads/in-page state rather than persisting private history for navigation.

### Recommended Next Item

F08.1 — Source-owned import state and outcomes. It fixes the exact reproduced File → Strava rendering failure and establishes the truthful result model needed for contextual recovery. Begin only after implementation is requested.

### Delivery and architectural notes

- **Reliability/performance:** issue only relevant existing reads on explicit recovery/return; bound restoration by recorded loaded depth and existing page sizes. Guard stale responses, avoid new polling loops and never replay writes automatically.
- **Security/privacy/observability:** retain server owner checks, same-origin OAuth state validation and raw-data boundaries. Use synthetic IDs and existing diagnostics for evidence; do not log files, warnings, recovery payloads, OAuth tokens or source text.
- **Migration/rollout/rollback:** no migration, backfill or new feature flag. Validate local and online capabilities separately; deliver through the existing web release workflow. Roll back only F08 changes and tolerate missing/version-mismatched recovery records while preserving imported data and unrelated working-tree changes.
- **ADR:** not needed for app-local source state and bounded navigation metadata. Revisit architectural scope if a durable cross-device recovery store, new outcome API or altered OAuth callback contract becomes necessary.
- **Skill invocation summary:** Product Owner and Architect used for requirements, bounded slices, acceptance criteria, state/API boundaries and recovery risks. Read repository context/architecture, design contract/backlog, review/QA records and relevant source/contracts. `.codex/enforcement` is absent; relevant web instructions were inspected. This task changes only this planning document, runs no implementation tests and makes no implementation-completion claim.

## F04 implementation plan — proposed, not implemented

Prepared 13 September 2026. This section plans **F04 only**. It does not authorize implementation, change application code or mark F04 resolved.

### Outcome and scope

A runner can inspect a selected activity even when Training history is empty, filtered out, loading or unavailable. Leaving detail or returning from another screen restores the launching view, including applied filters, loaded history, selection, reading position and keyboard focus. Optional record detail is available through clearly labeled disclosures.

Binding references: Design Intent Contract U3, UX3–UX6, N2–N5, C3–C6, section 8's Training/activity-detail rules, I1, section 10, A1–A6 and R1/R4/R6; Backlog Tickets 06–07 and relevant Ticket 13 checks; the 13 September review's F04 finding. Validation contributes to QA TT-F02/R01/X01/PW01, MN-F02/A01/R01/S01/D01/PW01 and RR-01/04/09/10/11/12; it does not close the unrelated trend or Calendar criteria in those rows.

- Preserve `/dashboard/activities`, `activityId`, existing safe return links and review anchors, local/server and online/client loading profiles, API contracts, date semantics and persisted review identity.
- F04 owns Training list/detail state, navigation capture/restoration, parent navigation and record disclosures. F08 owns Data Quality/Settings recovery transport; both use one app-local context seam. F03 retains ownership of review truthfulness across screens; F05/F10 retain broader responsive and release validation.
- Home and Calendar launchers are in scope only where they need an accurate return destination or launch-context capture. Preserve Calendar's existing embedded activity detail and dialog behavior.
- No schema migration, new endpoint, route map, analytics calculation, review generation, history mutation, approval change or navigation-framework replacement is required.

### Current implementation findings

Verified by source inspection of the current working tree. These are not new browser-test results; preserve the substantial existing changes in the affected files.

| Area | Finding | Implementation implication |
|---|---|---|
| `ActivitiesShell` rendering | The list's empty/error conditional wraps the browser and `ActivityDetailPanel`. A valid selected record can therefore disappear while `activityId` remains in the URL. | Render the list's resource state inside the list region; give selected detail an independent lifecycle and exit control. |
| List requests and pagination | `loadList` has no cancellation/generation guard. Refresh replaces loaded pages; pagination failure uses the same error/retry path as first-page failure. | Bind requests and cursors to an applied query; retain loaded pages and retry the failed operation rather than silently resetting to page one. |
| Filters | Draft/applied values live only in component state. The applied summary changes before the replacement read resolves, while older rows remain visible. | Keep requested filters distinct from the query that produced displayed rows; preserve input and avoid labeling older results as matches for an uncompleted query. |
| Selection/history | Detail reads already use an abort controller. Selection pushes a boolean history marker; `popstate` restores only `activityId`; no complete per-entry list context is recorded. | Retain the existing stale-detail protection and add coherent per-entry navigation/restoration metadata without replacing router-owned history fields. |
| Back/focus | `closeDetail` relies on the boolean marker or removes `activityId`; it leaves the prior selected record in state. Focus follows any successful detail load and uses a single selected-row ref. | Separate highlighted selection from whether detail is open. Restore only connected, visible targets and distinguish explicit navigation from background refresh. |
| Launchers | Home supplies `returnTo=/dashboard` and a review hash, but Training reads neither as a return/focus instruction. Calendar's activity link supplies the activity/review anchor without full date/session return context. | Consume validated launcher context and preserve existing links; do not assume every detail originated in the Training list. |
| Wide detail | `.detail-back-button` is hidden by default and shown only below 1200px. | Keep an explicit contextual exit or parent destination available at every width and in every selected-detail state. |
| `ActivityRecordContent` | Four primary metrics and `ActivityCoachReview` precede always-expanded telemetry, splits and route sections. Calendar reuses this component. | Convert the optional sections to sibling disclosures while preserving the summary, review and material caveats. Verify both consumers. |

Likely touchpoints: `apps/web/components/activities/activities-shell.tsx`, `activities.css`, `activity-coach-review.tsx` only for necessary focus/disclosure integration, `apps/web/lib/activities-api-client.ts`, the Training route, `home-recent-training.tsx`, Calendar's existing launcher in `coaching-pages.tsx`, and the F08 app-local recovery-context helper. Add small Training state/context helpers where pure transitions and validation improve clarity; do not move app navigation state into core or DB packages. Before future code changes, read the relevant installed Next.js guidance required by `apps/web/AGENTS.md`.

### Architecture and state decisions

**Independent resources.** Keep list pages, selected-record data and persisted review state separate. Selection must not depend on membership in the current list. A valid detail GET can render while the list fails; a detail failure must not clear usable rows. Review loading/failure must not hide recorded metrics.

List state records requested/applied filters, the query associated with visible rows, ordered loaded pages, each page's request cursor, the next cursor, request generation and operation status. Detail state records selected identity, visible/open state, loaded identity/data and request generation. Keep selection highlighting after returning to the list, but do not leave an active detail visible once a direct-entry parent action has closed it and removed its URL state.

| State or action | Required behavior |
|---|---|
| Selected ID with empty or failed list | Show that activity's independent loading, data or error surface and its return control. List absence/failure remains confined to the list region; below 1200px it is available after Back. |
| Valid activity excluded by current filters | Keep detail available; explain briefly that it is outside the displayed results when needed. Do not insert it into the filtered list or clear filters automatically. |
| Initial list/detail read | Show the relevant labeled placeholder. Never announce empty history or missing detail before the corresponding read resolves. |
| Refresh of the same query/activity | Retain usable data, its last successful read time and local refresh/error feedback. A background result must not move focus, reset reading position or reorder the inspected list. Reconcile changed ordering through an explicit refresh action. |
| Apply/Clear filters | Preserve the selected detail. Start a new query generation and pagination chain. During the read or failure, label retained rows with their previous query context; preserve attempted filter input for retry. On success, publish the new rows and matching summary together. |
| Load more failure | Keep all loaded pages, selection and position. Offer retry for that same cursor/query; prevent duplicate dispatch and append duplicate IDs only once. End-of-list comes from a successful response without `nextCursor`. |
| Detail 404, 503/network error or malformed response | Distinguish unavailable/missing record from recoverable load failure using existing response status/code. Never substitute another activity. Keep parent/return available and retry only the selected record where supported. |
| Authentication/authorization failure | Follow existing session recovery; do not retain or restore another session's private data. Failure is not empty history. |
| Late response or departure | Cancel/ignore obsolete list/detail work on query change, selection change, unmount and session change. A late response cannot append old-filter pages, reopen closed detail or override a newer selection. |

Use app-local error metadata if necessary: the current activity response reader validates local bare and online `{ data: ... }` envelopes but drops HTTP status/code on errors. Preserve both accepted envelope shapes and existing core schemas; render safe task-level explanations rather than arbitrary server exception text. No backend contract change is planned.

### Navigation, restoration and the F08 seam

**One context format.** Extend or reuse F08's proposed bounded, versioned, per-tab recovery record rather than creating an incompatible second store. F04 supplies a Training capture/restore adapter; F08 transports its opaque context ID through Data Quality and Settings. If F08 is not yet implemented, F04 can establish the shared format and Training adapter first, with the full recovery-chain acceptance remaining pending until integration.

Record only navigation metadata: origin route and supported query/hash, context/history-entry identity, selected and highlighted activity IDs, whether list or detail was active, draft and applied filter values plus displayed-query identity, Filters open state, loaded-page depth/cursor descriptors, optional-disclosure state scoped to the activity, list/document/detail scroll anchors and offsets, and semantic launcher/focus keys. Store the history entry's own view separately from its launcher so Back/Forward can restore each entry without a return loop.

Use the same proposed two-hour expiry and owner/session scoping as F08, with bounded record count/size and graceful handling of disabled storage. Do not persist activity payloads, reviews, telemetry, route coordinates, files, credentials or private source paths. Filter text is private user input: keep it only in this temporary scoped metadata, out of logs and newly generated shareable URLs. Clear records on sign-out/identity change; local and online records must not cross execution profiles. When an authenticated identity cannot be established, do not restore cached authenticated context until the existing session boundary validates it.

**History behavior.** Capture before navigation, using namespaced metadata merged with existing history state. Explicit row activation creates at most one detail entry; selecting the already-open activity and retrying do not create entries. Save current position/disclosures before selecting another activity or following another destination. Keep entries current through bounded scroll/state capture and page departure so browser Back also works without clicking an app launcher. `popstate`, restoration and refresh never push a new entry. Do not depend on the browser's back-forward cache or router scroll restoration alone.

Use browser Back for an app-created detail entry only when its immediate parent is known to be the intended launcher. Otherwise navigate to the validated explicit return destination; if none exists, expose **Back to Training** targeting `/dashboard/activities` with valid Training filter context where available and without detail/return-loop parameters. A direct link with missing, expired, malformed or foreign-session context remains usable and never navigates to an arbitrary previous external page. Safe legacy `returnTo` links remain supported, although they cannot restore view metadata that was never captured.

Validate routes, parameters, hashes and context IDs using F08's shared allowlist and length checks. Do not trust URL prefixes or raw DOM selectors. An explicit URL activity ID takes precedence over a stale stored selection. Resolve focus keys through known elements and accept only supported review anchors. Keep OAuth/session secrets out of stored context; preserve existing protected-return validation.

| Entry/return journey | Restoration contract |
|---|---|
| Training list → activity → app Back/browser Back | Restore exact applied filters, draft inputs, loaded pages, list scroll anchor/offset, selected-row cue and launcher focus. Preserve the record in memory when safe, with list/detail visibility matching the history entry. |
| Activity A → B → browser Back/Forward | Restore each entry's activity, detail position/disclosures and associated list context. Never create duplicate navigation entries while replaying history. |
| Training → Home/Plan/Settings → browser Back | Restore the saved Training entry after remount, including pages beyond the first. A fresh primary Training navigation without a return token remains a normal default entry. |
| Training list/detail → Add training/Data Quality → Settings → return | Capture using F04's adapter, transport using F08, then restore the originating list or detail. The return from recovery restores the detail's recovery launcher; a later detail Back still returns to its original parent. |
| Home View session → detail → return | Preserve the existing one-activation review link; restore Home's launching control and position. Label the contextual exit **Back to Home**. Honor the supported review anchor after that activity surface exists. |
| Calendar activity link → Training detail → return | Carry Calendar's existing date/session/view context and restore its launcher through the owning Calendar surface. Do not infer new calendar state or change permitted session actions. Embedded `ActivityRecordContent` stays inside the existing Calendar dialog. |
| Direct valid or missing activity link | Render the selected resource state independently of initial history; offer the explicit Training parent at compact, medium and wide widths. Do not claim full restoration without a valid saved context. |

**Restoring pages after remount.** Reuse authorized in-memory pages while the component survives. After reload/remount, refetch with the saved applied query using the existing 40-row page size and current cursor chain from page one, stopping at the recorded loaded depth or authoritative end. Saved cursors describe the prior page chain; do not blindly append pages fetched from stale cursors after a new first page. Deduplicate by activity ID and guard the restoration generation. Do not crawl additional history indefinitely to locate a removed anchor.

Restore only once the required rows and layout exist. Prefer the saved row anchor plus relative offset over an absolute scroll coordinate; record the independently scrolling list and document/detail positions because wide Training has its own list scroller. Focus with scroll suppression, then restore the relevant offsets. If history changed, use the nearest available recorded anchor or list heading, retain valid filters, and explain when earlier position could not be fully restored. A page-chain failure retains already restored pages and offers continuation retry; it must not silently report complete restoration. User scrolling, filtering or selecting while restoration is pending cancels obsolete automatic focus/scroll work.

**Focus and resizing.** Explicit row selection focuses the selected record heading; a supported review deep link focuses its review heading once available. Loading/error detail has a stable focusable heading and reachable exit. Background activity/review reads must not repeatedly focus headings. Returning prefers the connected visible launcher, then the selected/anchor row, then the Training list heading; external parents resolve their own semantic launcher keys. Below 1200px detail replaces the list; at 1200px and above list/detail may coexist. Resizing preserves selection, filters and disclosure state. Only relocate focus if the focused element would become hidden, and prevent a pending read from subsequently stealing it.

### Optional-detail disclosures

Keep identity, date, up to four core metrics with elapsed-time labeling, Coach's review, known comparison status and material limitations visible. Use three labeled sibling disclosures: **Additional telemetry**, **Splits** and **Route details**. Default them closed on a fresh activity visit; retain user choices for the same activity during navigation/return. A new activity must not inherit another record's disclosure state.

Prefer native `details`/`summary`, styled with existing tokens and 44×44 targets. Summaries can include supported signal/split counts or availability; unavailable sections retain a concise named explanation when opened. Route availability is not permission to manufacture a map. Keep existing units and missing-value semantics. Do not wrap the whole review or its caveats in another disclosure, nest disclosures, or add fetch/write behavior to expansion. Preserve Calendar's shared record composition, unique heading IDs and outer dialog focus containment.

### Execution slices and acceptance criteria

1. **F04.1 — Independent list and selected-detail lifecycle.** Restructure the browser regions; separate query/page, selected-record and review status; guard request ordering and operation-specific retry. Pass valid/missing detail against empty, filtered-empty, delayed and failed list fixtures; retain pages through refresh/load-more failures; never mislabel retained rows or substitute another record. This slice can be verified without F08.
2. **F04.2 — Training context capture and page restoration.** Define/reuse the shared F08 metadata format and implement Training capture, per-entry history and bounded page replay. Pass multi-page filtered list → detail → Back, remount/reload, A/B Back/Forward, failed-page retry and user-interrupted restoration. Verify real selection, row order/count, filter values, scroll container offsets and focused element, not merely the URL.
3. **F04.3 — Contextual exits and cross-screen returns.** Add visible all-width parent controls and consume supported Home/Calendar/legacy return context. Wire Training to F08's recovery seam; validate stale/missing/unsafe records and safe direct-entry fallback. Pass Home and Calendar launcher return, Training departure/remount, and the F08 recovery chain once its transport exists. No automatic import/review/plan/schedule writes are allowed during these navigation journeys.
4. **F04.4 — Optional evidence and responsive focus.** Add the three sibling disclosures and preserve core interpretation content. Verify fresh defaults, same-activity restoration, keyboard operation, missing evidence, shared Calendar rendering and resize across 1199/1200px during reads and open detail. Preserve the previously verified 320px filter bounds and 1024px Back/focus behavior.
5. **F04.5 — Regression evidence and handoff.** Add focused state/API helper tests and browser journeys below; update obsolete assertions that expect collapsed content to be visible before expansion. Record exact results and reconcile F04/Tickets 06–07 criteria only after implementation. Keep F03/F05/F08/F10 dependencies and unperformed checks explicit.

Sequence F04.1 → F04.2 → F04.3, then finish F04.4/F04.5. Disclosure work is independently testable once the detail boundary is stable. F08's full-chain return is an integration dependency, not a reason to postpone independent Training fixes. Recommended first implementation item, once requested: **F04.1**.

### Validation plan

Add a focused `apps/web/e2e/redesign-training.spec.ts` (proposed) and reusable contract-valid fixtures. Include it explicitly in the online Playwright `testMatch`, which currently includes only `online-dashboard.spec.ts` and `redesign-coverage.spec.ts`. Retain local coverage against the existing seeded local route; online request mocks alone do not verify local initial-data behavior.

- Reproduce the exact F04 failure: open detail, apply a no-match filter, assert the same record and return control remain; repeat with a failed list read and a fresh direct link against an empty list.
- Exercise selected detail success/loading/404/503/malformed response independently of list state, plus retained same-record refresh failure and independent review pending/error states.
- Use at least three 40-row pages with a selection beyond page one. Verify Apply/Clear, load-more failure/retry, no duplicate rows, out-of-order queries, remount/reload and browser Back/Forward restore context. Delay restoration, then interact, to prove late results do not reset the user's new position.
- Check missing/removed anchors, changed cursor chains, expired/corrupt/unavailable storage, unsafe return URLs and owner/session changes. Verify explicit parent fallback without false claims of full restoration or private payloads in storage.
- Test Home review-anchor entry, Calendar linked and embedded record entry, ordinary Training departures, and the F08 Training → Data Quality → Settings → return chain. Count relevant mutation requests and assert none are caused by reading, navigation, restoration, filters or disclosures; any explicit review retry remains separately user-triggered.
- Verify keyboard opening/closing of disclosures, connected visible return focus, no focus theft from refresh, all-width return controls and no nested disclosures. Update the existing online activity test to open Splits before asserting its empty explanation.
- Inspect 320, 390, 767, 768, 1024, 1199, 1200 and 1440 CSS-pixel widths, resize during loading/error/restoration, and actual 200% browser zoom. Retain QA's additional 375/414 checks where applicable. A viewport proxy is not actual zoom evidence. Assert no page overflow, hidden focus, clipped caveats or targets below 44×44; inspect reduced-motion and forced-colors behavior.

Planned commands from the repository root, after implementation and new spec/config work:

- `npm test --workspace @racepredictor/web`
- `npm run typecheck --workspace @racepredictor/web` (web lint currently runs this same TypeScript check)
- `npm run test:e2e --workspace @racepredictor/web -- redesign-training.spec.ts`, plus affected existing Training/Home/Calendar cases in `digital-coach.spec.ts`
- `npm run test:e2e:online --workspace @racepredictor/web -- redesign-training.spec.ts online-dashboard.spec.ts redesign-coverage.spec.ts`
- `npm run test:e2e:auth --workspace @racepredictor/web` if protected-return/session integration changes
- `npm run build --workspace @racepredictor/web`

Run applicable core/DB checks only if those boundaries unexpectedly change. Coordinate any existing Next test/build locks before executing suites; do not terminate unrelated processes or treat the earlier F07 lock report as a newly verified blocker. Record fixture versus integration coverage, baseline failures, screenshots and exact commands separately. Human comprehension, assistive-technology announcements and deployment checks remain outstanding until actually performed. No implementation tests are run by this planning task.

### Assumptions, risks and delivery notes

- **Assumptions:** Full view restoration is a same-tab, same-session promise while the bounded context remains valid. A copied link or expired record retains a safe parent and independent detail access. Two-hour retention follows F08's proposal; these are implementation choices, not existing shipped behavior.
- **Requirement limits:** Exact old rows/position cannot be guaranteed after underlying history changes or unavailable reads. Restore the authoritative available history with explicit partial/fallback feedback; never persist a private activity snapshot to simulate success. No additional product decision blocks the normal same-session paths.
- **Reliability/performance:** Cursor replay costs up to the previously loaded depth; use current query chains, cancellation and deduplication, with no additional polling or unbounded search. Storage and history metadata must not overwrite router state or collide across return chains.
- **Security/privacy:** Treat navigation metadata as untrusted and potentially sensitive. Reuse owner/session and safe-return boundaries; keep payloads and route geometry out of storage/logging, and never restore protected content based solely on a context ID.
- **Observability:** Use existing safe diagnostics and synthetic test IDs. Capture request counts, list generation, selected identity and focus/scroll outcomes in test evidence; do not log user filter text or stored context in production.
- **Rollout/rollback:** No migration, backfill or new feature flag is planned. Deliver through the existing web workflow after local/online validation; roll back only F04 presentation/state changes. Versioned context readers must tolerate missing or incompatible records so reverting either F04 or F08 leaves direct navigation usable.
- **ADR:** Not needed for bounded app-local navigation state. Reassess if implementation requires durable cross-device restoration, new persistence/API contracts or a global router replacement.
- **Skill invocation summary:** Architect used to validate requirements, map current boundaries, specify state/return contracts, sequence testable slices and identify restoration/privacy risks. Read repository context/architecture, web instructions, binding design contract, relevant backlog/QA/review sections, F08's planned seam and current Training/shared-record source. `.codex/enforcement` is absent. Only this planning document is changed; no finding is marked implemented or validated.

## F04 implementation and evidence — 14 September 2026

**Verdict: Concern.** All five F04 implementation slices are present and focused online/browser, unit, type and production-build checks pass. The exact empty-filter disappearance is reproduced and fixed. This is not a release-pass: actual 200% browser zoom, a full local profile journey, live Calendar launch/return, delayed/interrupted restoration, comprehensive breakpoint/resize and assistive-technology checks remain unperformed.

### Delivered F04 slices

- **F04.1 — Independent resources:** Training now renders list state inside its own region and keeps selected detail loading, 404, 503, malformed-response and retry states independent. A filtered-empty or failed list therefore cannot remove a selected record or its parent control. API read errors retain safe status/code classification without changing contracts.
- **F04.2 — Ordering and restoration:** list requests have generation/abort protection, pagination keeps loaded rows and retries the failed cursor, and browser history stores bounded view metadata. Same-tab Back/Forward restores applied and draft filters, cursor depth, selection, list scroll and visible focus; development effect replay is deferred before restoration reads so it cannot dispatch a duplicate cursor request.
- **F04.3 — Contextual exits:** all detail states expose a labeled parent at every width. Safe Home, Training and Calendar destinations are allowlisted through the shared F08 context adapter. Direct links safely fall back to Training; the F08 Training → Data Quality → selected-session return browser journey remains green.
- **F04.4 — Progressive detail:** four core metrics and the persisted review stay visible. Additional telemetry, Splits and Route details are labelled native disclosures, initially collapsed, unavailable-aware and activity-scoped; expanding them makes no API mutation. Calendar continues to consume the same shared record component.
- **F04.5 — Evidence and records:** added `redesign-training-detail.spec.ts`, included it in the online suite, extended safe-return unit coverage, and updated Tickets 06–07 plus only the QA rows with actual partial F04 evidence.

### Fresh F04 design-intent review

| Requirement | Status | Concrete evidence |
|---|---|---|
| Independent list/detail loading and errors | Pass in automated coverage | Online fixture opens a page-three record, then applies an empty filter and a 503 list result while the record and Back remain visible; direct 404/503/malformed detail fixtures do not substitute a record. |
| Safe ordering, pagination and restoration | Pass in automated coverage | Three-page online Back/Forward fixture verifies restored rows, selected row focus and open telemetry disclosure; F08 recovery test verifies one replayed cursor and no duplicate restoration read. |
| App/browser Back and contextual parents | Concern | Training Back/Forward and safe direct Home/Calendar labels pass; full live Calendar launch/return and interrupted/remount history-change journeys were not run. |
| Shared F08 context seam | Pass in automated coverage | F04 uses the versioned, bounded recovery record; Calendar is allowlisted, payloads remain absent, and existing F08 Training return passes online. Session/identity isolation remains governed by existing recovery/session boundaries but was not exercised end-to-end here. |
| Initially collapsed disclosures and visible interpretation | Pass in automated coverage | Browser fixture verifies closed disclosures initially and retained same-activity telemetry after Forward; review/core metrics remain outside disclosures. Shared Calendar composition is preserved by API/component usage but not browser-exercised. |
| Responsive, zoom and accessibility acceptance | Concern | CSS retains 44px controls and existing compact replacement layout; the in-app browser did not apply native zoom shortcuts (unchanged `innerWidth`/`devicePixelRatio`), so actual 200% zoom is explicitly unperformed. |

### Exact validation record

- PASS — `npm run typecheck --workspace @racepredictor/web`
- PASS — `npm test --workspace @racepredictor/web` (111/111)
- PASS — all three online `redesign-training-detail.spec.ts` cases reported green in the final focused run: empty/503 detail persistence and direct parents (2); three-page Back/Forward/focus/disclosure/no-write restoration (1). The Playwright cases completed before the managed server teardown hang noted below.
- PASS — both `f08-recovery.spec.ts` online cases reported green after verifying the recovery transport remains compatible; its managed server teardown has the same environment limitation.
- PASS — `npm run build --workspace @racepredictor/web`
- NOT RUN — full local Training F04 browser fixture (the focused fixture requires online client reads), delayed and user-interrupted restoration, failed load-more retry, live Calendar launcher/embedded-detail browser journey, stateful resize matrix, actual 200% desktop-browser zoom, screen-reader/switch-control, human comprehension and deployment checks.

The Playwright runner reports passing test cases before its managed Next dev-server teardown remains open in this environment; its test-case output is the recorded result and no unrelated process was terminated. The temporary manual dev server used solely for zoom verification was stopped.

## F09 implementation plan — proposed, not implemented

Prepared 14 September 2026. This section plans **F09 only**. No application code is changed, no implementation is authorized by this plan, and no finding or QA gate is marked complete.

### Outcome, requirements and scope

A runner can distinguish Strava connection, computer pairing, app preferences, external reminder setup and operational status. Each workflow reports what the server actually knows, offers supported recovery and exposes one filled primary action at its current stage. Preparing or copying reminder instructions never implies that an external task exists or delivery has been verified.

Binding references: Design Intent Contract N1–N2/N4, V3–V4, C1, Settings layout rule, I1–I6, section 10, S1, A1–A6 and R1–R2/R6; Redesign Implementation Backlog Ticket 12; the 13 September review's F09 finding. Validation also covers the QA matrix's contextual recovery and navigation rows and RR-01, RR-04, RR-06, RR-08–RR-12. The matrix has no dedicated Settings flow table; add attributable F09 evidence during implementation without treating those shared rows as wholly complete.

- Preserve `/dashboard/settings`, the existing local/online route selection, secondary navigation, authentication, owner scoping, API contracts, timezone semantics and all supported controls.
- Local scope: Preferences, Reminder handoff and Privacy. Online scope: Connections, Paired computer, Privacy and Operations. Explain mode availability beside relevant guidance; do not suggest local reminder configuration is available online.
- F09 owns Settings grouping, local preference/context read states, staged reminder actions and Settings submission guards. Preserve F08's safe return transport and F04's originating view metadata. Cross-flow verification remains shared with F05/F08/F10.
- Exclude new providers, actual external task creation or verification, new cloud reminder endpoints, background polling, authentication redesign, plan mutations and unrelated screen refactoring.

### Current implementation findings

Verified from the current working tree by source inspection; these are not fresh browser results.

| Area | Current behavior | Planned correction |
|---|---|---|
| Local `SettingsPage` in `coaching-pages.tsx` | Preference failure becomes “Using Phase 1 defaults until you save”; default enabled/time values and actions become available. Preference and context reads share `Promise.all`. | Independent resource states; unknown preferences never become editable fallback configuration. Retry only the failed resource. |
| Local context and saved status | Context failure is swallowed into a no-context message. A shared request state decides whether preferences appear saved. | Distinguish confirmed null context from failure, and last confirmed preferences from draft/save state. |
| Reminder controls | Generate and external confirmation are displayed together; generation has no pending guard. Save, generate and status writes can race. | Explicit stages and a shared mutation gate for these writes because all update the reminder record. |
| Reminder reference | Rehydration puts persisted `externalReference` into the task-reference input, including the generated artifact path for `prepared`. | Separate artifact reference, user-entered task reference and persisted external status; never treat an artifact path as user confirmation. |
| Online grouping | Connections contains Strava, pairing and credential copy; Devices contains only history. `operations` is visibly titled “Reminder handoff”. | Move pairing, credential and history into one Paired computer group; label Operations accurately. Preserve existing section keys. |
| Online reads | Session/devices determine completion of one shared load; provider/operations failures become null. Empty device data can look unpaired after an error; retry reloads unrelated resources. | Resource-specific loading/error/retry and successful-empty states, with the authenticated session as the write prerequisite. |
| Online submissions | Some buttons are disabled, but handlers lack comprehensive duplicate guards; revoke and refresh can run during other device operations. | Guard each mutation family and conflicting reads; keep independent workflows usable and stale reads from replacing newer results. |

Likely implementation surface: the two Settings components, `coaching-ui.css`, a small app-local Settings state module if useful, and the existing local/online E2E suites. Reuse `coaching-ui-state.ts`, core response schemas, `recovery-context.ts` and existing server services. Keep unrelated Plan and Training orchestration intact in the shared file.

### State, grouping and contract decisions

Keep UI orchestration in `apps/web`; `packages/core` remains the contract owner and `packages/db` remains the persistence owner. No schema, migration or backfill is planned.

**Groups and action ownership.** Expand only the selected group, using native keyboard-operable disclosures and persistent labels. Retain online `section=connections|devices|privacy|operations`; `devices` opens Paired computer, including enrollment and history. Local group links may accept only their supported group names. Unsupported sections get a safe default and a concise mode explanation when relevant. Switching groups performs no submission and retains safe in-page drafts and pending status.

Connections owns provider status, connect/reconnect, disconnect and bounded history import. Paired computer owns name entry, pair/replace, the one-time credential, sync status/history and revoke. Operations owns processing guardrails, usage signals and its own retry. Privacy stays informational. Demote secondary recovery, destructive and navigation controls; no group needs a filled action merely to fill space. In pairing, advance from Pair/Replace to Copy credential, making replacement secondary while the credential is displayed. Explain before replacement that it immediately revokes the previous computer; preserve explicit revoke/disconnect confirmation and accepted-data retention semantics.

**Independent resource state.** Preferences, context, authenticated session, provider status, devices and operations each distinguish initial loading, valid result, refresh with prior data, failed read with prior data, and failed read without data. Only a validated empty/null response supports absence. Validate against existing core schemas where supplied; do not coerce malformed success payloads into defaults or empty collections.

Keep prior authorized data visible on recoverable refresh failure with last successful check time and a local retry. Auth failures enter existing sign-in/access recovery and must not leave protected cached content visible. Guard request ordering with cancellation or generation IDs so late reads cannot overwrite saves, pairing or provider changes. Background reads do not reset dirty fields, scroll, focus or mutation feedback. Avoid new periodic polling and duplicate unchanged announcements.

| Existing endpoint / behavior | F09 treatment |
|---|---|
| `GET /api/v1/coaching/reminder-preferences` | A validated response is the authoritative baseline, including server defaults. Initial failure shows “Preferences could not be loaded” and Retry preferences; disable dependent edits/writes and suppress enabled/time/saved claims until resolved. |
| `PUT /api/v1/coaching/reminder-preferences` | Save the intended edited fields using the existing contract; preserve supported values not exposed by the form. Apply the returned preferences/status/reference, including nulls. Failure retains input and the prior confirmed baseline with explicit unsaved changes. |
| `GET /api/v1/coaching/context/current` | Valid `{ context: null }` means no published context. Failure means context could not be checked, with its own retry. Show returned artifact identity/metadata; do not invent a current path or silently publish context. Context failure need not block preference management. |
| `POST /api/v1/coaching/reminder-handoffs` | Use an empty request body after preferences have been explicitly saved and are clean/enabled. The existing optional fields trigger an implicit save; omit them so preparation cannot silently commit unsaved form edits. Treat this as a consequential write producing a versioned file and `prepared` status. |
| `PUT /api/v1/coaching/reminder-handoffs/status` | Preserve `{ externalStatus: scheduled | attention, externalReference }`. Scheduling confirmation requires explicit user action and a nonempty user-entered task reference. Apply server results only; neither copy nor navigation submits this request. |
| Online session, provider status, devices and operations GETs | Each supported section reports its own read result and retry. Unknown provider status is not disconnected; offer status recovery before connect/reconnect. Failed device reads are not “Not paired”; block pair/replace until the current device state is known. |
| Existing provider connect/disconnect/backfill and device POST/DELETE | Preserve request payloads, owner/session checks, bounded import parameters, queued/reused distinctions, revoke scope and one-time-token behavior. No new command endpoint or automatic write retry. |

Existing contract caveat: preference GET initializes defaults in persistence when none exist. Preserve that behavior and test it explicitly; do not promise that every GET is storage-write-free. Navigation/retry must cause **no client-issued preference PUT, handoff POST, status PUT, provider/device mutation or plan mutation**. Changing first-read initialization would be a separate contract/service decision.

### Reminder stages, restoration and pending behavior

Track last confirmed preferences, editable draft/dirty status, active stage, generated content/artifact reference, explicit task-reference input, external status and mutation outcome separately. Strings displayed to the runner must not double as state-machine values.

| Stage / entry | Primary action and transition | Truthful secondary behavior |
|---|---|---|
| Preferences unavailable | Retry preferences → authoritative result | No usable default form on failure. Context retry and Privacy remain independent. |
| Preferences editing | Save preferences → confirmed baseline | Saving is app configuration only. Dirty fields must be saved before preparation/confirmation; offer a secondary return to Preferences from the reminder group. |
| Ready to prepare: known, clean, enabled preferences | Prepare reminder handoff → prepared result | Show the saved time/timezone. Disabled preferences instead offer an explicit route to Preferences; never enable automatically. |
| Continue in Codex: freshly prepared content | Continue to confirmation → external confirmation stage | Show readable handoff and a secondary Copy action, with manual-copy fallback. Explain that the runner must create or update the recurring task in Codex and return with its ID/link. Advancing alone writes nothing. |
| Confirm external setup: persisted `prepared` or explicit continuation | Confirm scheduled externally → server-confirmed record | Require a task reference typed/pasted by the runner. Mark setup needs attention and Back remain secondary. Pending/error feedback stays in this stage; failure retains the reference and handoff. |
| Persisted scheduled / attention / disabled | Offer the relevant explicit next step only | Scheduled means recorded from user confirmation, with no delivery verification. Attention supports explicit re-preparation; disabled directs the runner to Preferences. Do not recreate anything automatically. |

- On reload, restore preferences and persisted external status independently of context availability. Prepared state can resume confirmation without regenerating a handoff. Its persisted reference is the artifact path, not a prefilled task reference. Show only the returned path/identity and acknowledge that handoff text is not available from this GET; a secondary explicit re-prepare action may produce a new artifact.
- Restore scheduled status and its recorded task reference as a summary. Never auto-confirm from stored values. Saving preferences resets the external status according to the existing service and invalidates the prior UI handoff/confirmation association. Explain that changing/disabling app preferences does not update or cancel a task already created in Codex.
- Clipboard success changes only copy feedback. Missing context or a failed context check remains visible beside the handoff instructions; preparation must not assert that a current context or active plan was verified. Reuse existing service behavior rather than inventing a context-required API restriction.
- Use one synchronous in-flight guard shared by preference save, preparation and external status mutation, plus separate provider and device mutation guards. Disable submitting and conflicting controls, including Enter/double-click paths. Use request-specific labels such as “Preparing…” or “Revoking…”, and restore controls after an authoritative failure.
- Prevent refresh/late responses from clearing a freshly issued credential or reverting device status. Keep credentials only in current component memory; never put them in URLs, logs or browser persistence. Successful credential copy is not evidence of local enrollment or first sync.
- On an ambiguous lost write response, report that completion is unknown and require an explicit authoritative status/device/preference reread before another attempt. Never silently replay pairing, preparation or imports. If a pairing credential response was lost, status can identify the device but cannot recover its one-time secret; explain the supported explicit replacement consequence.

### Contextual returns, accessibility and privacy

Preserve F08's allowlisted `returnTo`, opaque recovery ID and source context through Settings and the existing OAuth/sign-in routes. Do not rebuild an unrestricted return URL or serialize private data into it. A provider callback marker prompts an authoritative status read; the marker alone cannot establish connection, imported activities, readiness or recovery completion. Cancellation/failure retains a supported retry and the no-write return action. Expired/missing recovery records use the existing safe parent destination.

Keep group selection independent from the return destination; verify `section=connections` and `section=devices` directly as well as originating Data Quality journeys. Reuse current auth machinery; only make narrowly required integration changes if tests expose lost safe destinations. Do not weaken return-path validation to fix a deep link.

Stage changes initiated by the runner focus the stage heading; validation focuses the first invalid field. Errors are adjacent and associated with inputs, pending/success announcements are concise, and refresh does not move focus. Native confirmations retain their explicit cancellation semantics; if a custom dialog becomes necessary, use existing accessible dialog patterns with inert background and focus restoration. Verify 44px targets, keyboard operation, 320px reflow, all contract breakpoints, resizing during pending work and actual 200% browser zoom. Long artifact references and credential output must wrap or scroll within their own region without page overflow.

### Execution slices and acceptance criteria

1. **F09.1 — Truthful Settings reads and saved state.** Introduce independent validated resources and draft/baseline separation. Pass initial 503/network/malformed preference failures, retry to authoritative nondefault values, context null versus failure, saved values after failed refresh and dirty-input preservation. Online device/provider/operations failures remain local and never become empty/healthy/disconnected claims.
2. **F09.2 — Online groups and pairing workflow.** Move pairing/credential/history into Paired computer, relabel Operations and preserve section links. Pass exclusive group expansion, keyboard navigation, mode guidance, pair → copy → observed sync states, replacement/revocation scope and independent provider/device recovery. No connection group exposes a competing pairing primary action.
3. **F09.3 — Staged reminder setup and durable truth.** Implement saved-preference preparation, continuation, explicit confirmation and reload behavior. Pass all five persisted external statuses; server defaults versus failed reads; dirty/disabled prerequisites; clipboard failure; artifact-path/task-reference separation; preference changes after preparation/scheduling; exactly one filled action per active stage. No generated/copied result claims scheduling or delivery.
4. **F09.4 — Pending guards and ambiguous outcomes.** Apply family-specific guards to every Settings mutation and conflicting control. Delay each request and submit repeatedly by mouse and Enter; assert one request. Inject 503, validation failure and lost-response scenarios; preserve safe input, reread before retry where completion is unknown, and assert no silent write replay or unintended plan/activity changes.
5. **F09.5 — Return journeys and validation evidence.** Exercise local/online Settings, direct section links, Data Quality → Settings → OAuth/recovery → originating view, cancelled authorization, expired sign-in and unsafe/expired return context. Update obsolete labels and schema-incomplete fixtures, complete targeted responsive/keyboard checks, and record actual evidence and remaining shared gates.

Sequence F09.1 first; F09.2 and F09.3 build on its resource boundaries. Apply F09.4 guards as each workflow is changed, then close the slice with its full mutation matrix. Finish F09.5 against the integrated result. Each slice has its own behavioral acceptance checks; grouping alone cannot close F09.

### Validation plan — execute during implementation, not this planning task

- **Unit/state tests:** Cover transitions, draft preservation, read-versus-mutation outcome, stale response suppression, reference ownership, status labels and action eligibility. Extend existing reminder tests and add a focused Settings state test file only for extracted behavior, not tests that mirror JSX.
- **Route/service regressions:** Preserve the reminder contracts, first-read default initialization, save status reset, empty-body preparation, generated artifact reference and `scheduled: false`; verify status confirmation requires the explicit reference. Use existing `coaching-routes.test.ts`, core contract tests and local coaching tests. Assert app preference changes never activate/change a plan or operate an external task.
- **Browser coverage:** Update Settings cases in `digital-coach.spec.ts` and `online-dashboard.spec.ts`; use a focused F09 spec if that keeps the failure matrix isolated. Existing reduced fixtures must satisfy canonical schemas rather than weakening validation. Cover pending writes, malformed/503 reads, repeated submits, in-page errors, reload/resume, credential/copy failure and conflicting response order in both modes where applicable.
- **Return/auth coverage:** Reuse `f08-recovery.spec.ts`, recovery-context tests and the auth E2E configuration. Assert restored source, activity/filter/position/focus where a valid F04/F08 context exists; assert a useful safe fallback otherwise. Mocked OAuth tests establish application behavior only; actual provider and sign-in round trips need separate evidence.
- **Commands:** Run `npm test --workspace @racepredictor/web`, `npm run typecheck --workspace @racepredictor/web`, `npm run build --workspace @racepredictor/web`, and the relevant `test:e2e`, `test:e2e:online` and `test:e2e:auth` scripts with focused specs/filters. Include `npm test --workspace @racepredictor/core` and `npm run db:test:local-coaching` for reminder contract/service regression coverage. Resolve environment/test-server locks using the existing isolated-test approach without stopping unrelated processes.
- **Evidence:** Record exact commands, fixture mode, results and browser artifacts. Reconcile Ticket 12 and the QA matrix only to the coverage actually demonstrated; report F09 implementation separately from F05/F08/F10 and the handoff's eight design-review outputs. Keep unperformed human comprehension, assistive-technology, live external-provider and deployment checks explicitly outstanding.

### Assumptions, risks and delivery notes

- **Product assumptions:** Keep the current split between local reminder configuration and online sync management. Use Paired computer as the visible group label while retaining `devices` in URLs. Require a confirmed clean preference baseline before preparation. These are proposed implementation choices; no new product capability is assumed and no blocking product question remains for this bounded slice.
- **Main risks:** All local reminder writes share one persisted record; stale responses and concurrent actions can misstate external status. Preparation has filesystem and persistence effects, and lost pairing responses cannot reproduce secrets. Mitigate with resource ownership, mutation guards, explicit recovery and truthful limits rather than new retries or delivery claims.
- **Performance/security/observability:** Reuse current bounded reads and authenticated services, with no new workers or stores. Capture request counts and state/focus outcomes in synthetic tests. Never log handoff text, task references, credentials, vault paths or recovery payloads as new telemetry.
- **Rollout/rollback:** Deliver through the existing web workflow after the stated checks. Roll back F09 presentation/state changes without altering stored preferences, external tasks, connections or device credentials. No deployment or external-account mutation is part of this planning task.
- **ADR:** Not required for this app-local workflow/state repair. Reassess separately if implementation needs new handoff retrieval, cross-device draft persistence, external scheduling verification or changed initialization semantics.
- **Skill invocation summary:** Architect used for requirements validation, existing-contract review, state design, acceptance slices and risks. Read repository context/architecture, web `AGENTS.md`, binding design/backlog/review/QA sections and relevant Settings, recovery, reminder contract/service/route/test sources. `.codex/enforcement` is absent. This section records proposed work only.

## F01 implementation plan — proposed, not implemented

Prepared 15 September 2026. This section plans **F01 only**. It does not authorize implementation, change application code, or mark F01 or any QA finding resolved.

### Outcome and scope

A runner can read a concise, evidence-led explanation of the displayed current-fitness estimate, inspect the supplied drivers and correctly labeled trends, and distinguish an unknown target from confirmed target absence. The explanation must retain the estimate's uncertainty, timeframe and limits on target-race comparison.

Binding references: Design Intent Contract P1–P2, UX2, N3, V1–V2, L3, I1, accessibility and confidence/data rules; Redesign Implementation Backlog Tickets 04–05; the 13 September review's F01 finding; QA rows PR-F01–PR-F05, PR-A01, PR-R01, PR-S01, PR-D01, PR-X01, PR-PW01 and the applicable TT trend rows.

- Preserve local snapshot and online dashboard modes, existing prediction options, calculations, public contracts, routes, authorization and date/timezone semantics.
- F01 owns outlook reasoning, readiness evidence presentation, trend identity/period labeling and target-read states. Preserve Home's Race outlook → Recent training → Next action order; broader Home composition and review interpretation remain F02/F03 work.
- Reuse the existing Home readiness disclosure and safe recovery context. Make it directly addressable and restorable as required by Ticket 05; do not add a primary navigation destination.
- Exclude prediction/model changes, target compatibility calculations, invented confidence categories or probabilities, new analytics endpoints, database changes, automatic recomputation, and plan/goal writes.

### Current implementation findings

Verified through current working-tree source inspection only; no new browser or runtime validation is claimed.

| Area | Finding | Implementation implication |
|---|---|---|
| `dashboard-shell.tsx` | The outlook reason is generic. Readiness shows only `driverContributions[0].label`, describes it as the most visible signal, and omits contribution values. | Derive a bounded reason from supplied evidence; expose all available drivers without assuming array order represents importance. |
| `dashboard-view-model.ts` | Driver mapping retains key, label and contribution only; trend mapping drops the canonical `featureLabel`. | Preserve relevant canonical metadata through the app view model; do not redefine the API contracts. |
| Inline trend and `feature-trend-list.tsx` | Both assume weekly distance; the standalone component also assumes a last-12-weeks period. | Group and label series by actual feature and unit, with periods derived from supplied week-start dates. |
| `HomeReadinessContext` | A failed request sets `unavailable`, but rendering falls through to the same no-target text as a successful absent goal. Parsing accepts incomplete responses as absence. | Validate the existing Today envelope and distinguish loading, known target, confirmed null goal and read failure with retry. |
| `packages/core/src/contracts/dashboard.ts` | Drivers include signed `contributionPct`, direction and confidence; trends include key, label, value, unit and week start. There is no target-comparison result or prediction-specific driver association. | Preserve supplied values, but do not turn them into race success chances, causal time improvements or distance-specific explanations. |
| `packages/core/src/services/cloud-dashboard.ts` | Driver values are training heuristics; the finish estimate is calculated separately. Cloud trends use the last 12 populated weekly buckets, which need not be 12 consecutive calendar weeks. | Describe supplied training signals as context, not a decomposition of the finish estimate. Missing calendar weeks must not become zero or imply complete coverage. |
| Readiness navigation | The current disclosure has no addressable state. `recovery-context.ts` already retains `#readiness` and a readiness disclosure marker. | Use that existing anchor for direct entry and recovery restoration; avoid a competing URL convention. |

Supporting files: `apps/web/components/dashboard/online-dashboard-shell.tsx`, `driver-contribution-list.tsx`, `feature-trend-list.tsx`, `dashboard.css`, `apps/web/app/dashboard/page.tsx`, `apps/web/lib/local-dashboard-data-source.ts`, `dashboard-view-model.ts`, `recovery-context.ts`, and the Today schemas in `packages/core/src/contracts/coaching.ts`.

### Architecture, contracts and evidence rules

Keep presentation/state orchestration in `apps/web`, reuse core schemas, and leave persistence and calculations unchanged. Introduce a small app-local evidence presenter/state helper if it makes selection, grouping and read transitions independently testable. Components render the same prepared evidence for the compact outlook and readiness detail.

**Evidence ownership and interpretation**

1. Carry `featureLabel` through the view model. Retain driver direction and confidence where supplied and valid; do not replace absent metadata with invented defaults. Check real producer/fixture shapes before tightening the local snapshot reader, and explicitly handle older incomplete snapshots without silently relabeling them or weakening the public schema.
2. For the short reason, select the valid non-zero driver with the greatest absolute supplied contribution, with a stable key tie-break. Describe it as a supplied training signal, not the cause of the numerical finish time. If an opposing signal is available, retain a short counterpoint rather than implying unanimous support. Never infer importance from array position alone.
3. Proposed wording pattern: “The supplied training signals show [label] with a [positive/negative] contribution. These signals provide training context for the current-fitness estimate.” Use verified direction/sign consistently; conflicting metadata must not yield a directional conclusion. Do not infer whether an unfamiliar signal improves or worsens race performance.
4. If only neutral/zero drivers are supplied, say so without claiming improvement. If drivers are absent but a usable trend exists, give a dated measured fact from that series and explicitly state that its effect on the estimate is unavailable. If neither exists, say that the estimate has no supplied explanatory evidence; retain valid estimate values and caveats.
5. Show every available driver in a semantic list/table with its supplied label and signed contribution percentage. Explain that these are supplied signal contributions, not probabilities, percentages of finish-time improvement, or necessarily a total of 100%. Do not renormalize, clamp for display, or turn them into a readiness gauge. If a raw driver confidence value is displayed, label it as producer-supplied driver metadata with an unspecified calibration; it must not become confidence in the race estimate. Prefer omitting that raw number from runner-facing copy when its meaning is unsupported.
6. Evidence arrays belong to the overview payload, not individual prediction options. Changing the displayed distance updates the selected estimate, pace, range, model and generated time together, while shared evidence remains explicitly overview-level. Do not imply that a half-marathon-related signal becomes marathon-specific after a presentation change.

**Trend identity and period**

- Group by `featureKey` and `unit`; use the supplied label and preserve dates/values. Different units never share a numerical scale or become one series. If the same key/unit has inconsistent labels, expose the inconsistency or separate the labeled groups; do not silently choose a misleading title.
- Sort each series chronologically and label its actual first/last week-start dates and number of supplied weekly observations. Say “weeks starting …” rather than implying exact activity coverage. A single point is one observation, not an improving/declining trend.
- Retain gaps as missing observations. Do not insert zeros, interpolate, or claim “last 12 weeks” merely because 12 points arrived. Where the supplied period includes an unfinished week, qualify it without changing upstream week boundaries. Use existing date-only/timezone helpers; do not shift `weekStart` through browser-local conversion.
- Use feature-neutral caveats for arbitrary series: observed training data alone does not establish readiness, adherence or target-race performance. “Volume” applies only to supported volume features.
- Prefer a readable text list/table for this slice. If retaining bars, provide equivalent dates/values/units in text, separate scales, and honest negative/zero handling. Optional graphics must not be required to understand the evidence.
- Empty arrays mean no supplied evidence of that kind. Malformed series must be labeled unavailable, not zero or empty history. Preserve unrelated valid evidence when the response boundary permits partial rendering; a wholly invalid envelope remains a failed assessment read.

**Target and assessment read states**

| Resource / existing interface | Confirmed state | Error and recovery behavior |
|---|---|---|
| Local dashboard snapshot / online `GET /api/v1/dashboard/overview` | Existing success, empty and stale result semantics; estimate timestamp comes from `generatedAt`. | Network/HTTP/schema failures remain unavailable. Keep last valid data visibly qualified during recoverable refresh failure where already loaded. Retry only the affected read; do not synthesize a new estimate or use the browser's current time as its timestamp. |
| `GET /api/v1/coaching/today`, validated with `todayApiResponseSchema` | Valid non-null `data.goal` supplies target title/date/countdown. Valid `data.goal === null` confirms absence. | Loading is unresolved. Non-2xx, malformed JSON/envelope and invalid goal fields are failed reads, including 404 unless its absence meaning is explicitly documented. Show “Could not load your settled target” and a target-only retry. |
| Online freshness read | Existing sync metadata describes data freshness. | Its failure stays independent from prediction uncertainty and target existence. Never infer “fresh” from a failed check. |

Keep target state independent of analytics and Recent training/Next action. During target refresh, retain a previously confirmed target with a checking/failed-refresh qualification; only a later valid null goal clears it. Initial failure must never recommend settling a new target as though absence were known. Guard request generations/unmounts so older results cannot overwrite newer retry results. Follow existing authorization recovery and clear private retained data when session authority is lost.

The Today goal projection has title/date/countdown, but does not supply a structured comparison between that goal and the chosen prediction. Do not parse the title to infer race distance, target time or compatibility. Even matching-looking fixtures must continue to say that an on-track comparison is unavailable. Keep current-fitness meaning, low-to-high estimate range meaning, principal caveat and relevant stale status beside the estimate. Evidence observation dates, estimate generation time, race date and sync freshness are different facts; do not label one as another. If a model input period is not returned, state that its full period is unavailable rather than substituting the displayed trend's period.

**Readiness navigation and component boundaries**

- Keep `View readiness` as a single activation from Home. Opening it sets/restores `/dashboard#readiness`; direct anchor entry opens the same evidence with an explicit Back to Home control. Closing/Back removes only the readiness state and restores the launcher focus after an explicit action.
- Reuse the existing safe recovery context for readiness → Data Quality → Settings/recovery → Home. Restore the readiness disclosure, selected estimate where supported, position and focus. If the current allowlist cannot preserve the presentation selection, add only the bounded supported-distance value and its tests; reject unknown/unsafe values.
- Keep background refresh from moving focus or closing detail. Direct entry has a useful Home destination even without browser history. All navigation, retry, distance selection and evidence expansion are read-only with respect to goals, plans and prediction inputs.
- F01 owns this readiness entry/return path; F08 owns the general recovery mechanism. Preserve existing F04/F08 behavior and report any unresolved shared journey explicitly.

### Execution slices and acceptance criteria

Feature: F01.1 — Preserve and present supported evidence
Description: Extend the existing view model and add deterministic evidence selection/grouping using canonical metadata.
Priority: High
Area: Dashboard view model and app-local evidence presentation
Reason: Establishes a truthful shared basis for the compact reason and detail.
Acceptance Criteria:
- Feature labels, units, dates and signed driver values survive mapping unchanged; valid zero values remain values.
- Driver ordering does not determine the selected reason; neutral, mixed-sign, missing and inconsistent evidence have explicit bounded fallbacks.
- Mixed-feature/unit series, gaps, a single week and negative values never become mislabeled weekly distance or a fabricated complete period.
- Prediction values/options and upstream contracts/calculations are unchanged; incomplete legacy snapshots have an explicit tested disposition.
Dependencies:
- Current core dashboard contract, local/cloud producer shapes and existing snapshot fixtures.
Risks:
- Overstating heuristic contributions or rejecting existing snapshots through incidental validation changes.

Feature: F01.2 — Distinguish target absence from read failure
Description: Give target context validated independent read state and contextual retry.
Priority: High
Area: Home target context and dashboard resource state
Reason: Prevents a failed read from asserting that the runner has no settled target.
Acceptance Criteria:
- Valid target, valid null goal, pending response, 404/503, malformed response and network failure render distinct truthful states.
- Retried reads retain the last known target with qualification and ignore older responses; a valid null clears prior target data.
- Retry performs only the relevant GET and preserves loaded outlook/training content, selection and focus.
- No target title is parsed into a compatibility verdict, and failed reads do not offer a false no-target diagnosis.
Dependencies:
- Existing Today response schema and authenticated/local read paths.
Risks:
- Independent Today consumers or stale responses displaying inconsistent target state; use one target snapshot for the summary and its detail.

Feature: F01.3 — Evidence-led outlook and complete readiness detail
Description: Render the concise reason, all supplied drivers and correctly labeled trends with adjacent limitations.
Priority: High
Area: Dashboard outlook, driver list, trend list and supporting styles
Reason: Delivers the runner-facing F01 outcome from the shared evidence and state boundaries.
Acceptance Criteria:
- The default outlook includes one concise supported reason or explicit evidence-unavailable text, while preserving current-fitness, range, target-comparison and stale qualifications.
- Detail exposes every supplied valid driver and each distinct trend with labels, units, dated observations and coverage limitations.
- Distance selection updates all estimate fields together and retains the qualification that supplied drivers/trends are overview-level evidence.
- No invented confidence/causality, missing-as-zero metric, implied target compatibility, or replacement of uncertainty with freshness appears.
- Home retains its three ordered groups and compact outlook; optional detail does not introduce a KPI grid or a competing primary action.
Dependencies:
- F01.1 and F01.2; existing Home composition and shared styles.
Risks:
- Verbose evidence can overwhelm Home; keep detail optional and retain material caveats beside the compact claim.

Feature: F01.4 — Addressable readiness and recoverable return
Description: Connect the evidence disclosure to the existing readiness anchor and safe recovery context.
Priority: Medium
Area: Home disclosure/navigation and readiness recovery integration
Reason: Makes evidence reachable, shareable and recoverable without a new primary destination.
Acceptance Criteria:
- One activation, direct `/dashboard#readiness`, reload and browser Back/Forward expose the expected state without an extra nested disclosure.
- Explicit Back to Home restores launcher focus; recovery returns restore the valid disclosure, estimate selection, scroll and focus context.
- Unknown or expired return data uses the existing safe fallback and cannot redirect externally.
- Opening, closing, changing distance and returning produce no goal/plan/prediction-input mutation requests.
Dependencies:
- F01.3 and existing F08 recovery helpers; coordinate narrowly with their allowlist and restoration behavior.
Risks:
- Anchor updates can reset scroll or conflict with recovery restoration; test direct and contextual entry separately.

Feature: F01.5 — Regression matrix and honest completion evidence
Description: Validate the exact F01 failures in local/online modes and reconcile only demonstrated outcomes.
Priority: High
Area: Web unit/state tests, browser fixtures and implementation evidence
Reason: Source changes alone cannot demonstrate comprehension, truthful recovery or responsive behavior.
Acceptance Criteria:
- The matrix below passes with recorded commands/results and schema-valid fixtures; regressions are fixed within F01 scope.
- Keyboard, direct links, return restoration, 320px reflow and actual 200% zoom are checked with caveats visible.
- F01 slice statuses are recorded separately from F02/F03/F05/F08/F10 and remaining human/deployment checks.
Dependencies:
- F01.1–F01.4; isolated local/online test environments.
Risks:
- Existing uncommitted work, server/build locks or obsolete fixtures can obscure the result; record blockers without counting partial runs as passes.

### Validation plan — execute during implementation, not this planning task

| Coverage | Required cases and assertions |
|---|---|
| Presenter/view-model units | Permuted drivers; largest negative versus positive contribution; ties; all-neutral/empty/conflicting metadata; preserved labels; mixed units/features; missing weeks; single point; zero/negative values; incomplete metadata; deterministic period labels. Assert factual output, not JSX structure. |
| Target state | Valid non-null/null goal; pending, 404, 503, malformed and network failure; success → failed refresh → successful retry/null; out-of-order responses; authorization failure. Assert absence only from valid null and exact target retry request counts. |
| Estimate boundaries | No history/empty result; supported estimate with no explanatory evidence; stale result; failed overview; unknown input period; several prediction distances; absent/matching-looking/mismatching-looking target title. Assert no unsupported comparison or confidence score in every case. |
| Local and online browser | Home → readiness → evidence/trends → Back; direct anchor/reload/history; target-only retry; freshness failure independent of outlook; Data Quality/recovery return. Assert retained values, caveats, selected distance and no consequential writes. Use synthetic data and intercepted mutations rather than real goal/plan changes. |
| Accessibility/responsiveness | 320, 767, 768, 1199, 1200 and 1440 CSS pixels; resize with detail open; actual browser 200% zoom; keyboard disclosure/retry/Back, restored focus, semantic text alternatives and 44×44 controls. Verify no page-level overflow and no hidden material limitations. |
| Human acceptance | Ask a runner to explain the estimate, reason, target/timeframe and principal uncertainty without inferring a race-day forecast. Record actual observations; automated text assertions do not satisfy PR-F04 or the shared comprehension gate. |

Extend `apps/web/test/local-dashboard-data-source.test.ts` and add focused evidence/target-state tests where behavior is extracted. Use the QA matrix's proposed `apps/web/e2e/redesign-readiness.spec.ts` for the journey/failure fixtures, with local and online support, and update relevant assertions in `digital-coach.spec.ts` / `online-dashboard.spec.ts` only where F01 changes them. Preserve existing core `cloud-dashboard.test.ts` prediction regressions.

During implementation run web `lint`, `typecheck`, `test` and `build`, core `test`, plus the relevant focused `test:e2e` and `test:e2e:online` scripts (`npm run <script> --workspace @racepredictor/web`; `npm test --workspace @racepredictor/core`). Add the existing auth E2E checks if authorization/return behavior is touched. Record exact commands, fixture modes, results and browser artifacts. Use isolated server/output settings where needed; do not stop unrelated processes to bypass a lock.

Update Ticket 04/05 notes and the applicable PR/TT QA rows only after demonstrated validation. Retain unresolved F05/F08/F10 obligations and unperformed assistive-technology, human comprehension, live-provider and deployment checks. No test, build, deployment or application implementation is part of this planning change.

### Product assumptions, prioritisation and delivery notes

- **Product assumptions:** Keep the existing current-fitness estimate semantics and shared overview evidence. Greatest absolute non-zero contribution is a proposed selection rule for concise signal context, not a model explanation. Use `#readiness` because the current recovery contract already supports it. These are bounded proposed implementation choices; no blocking product question remains for this scope.
- **Prioritisation summary:** F01.1 and F01.2 establish evidence/read truthfulness first; F01.3 renders the result; F01.4 completes the required navigation; F01.5 closes the integrated validation. Add each slice's tests with that slice rather than postponing all coverage.
- **Recommended next item:** F01.1 — confirm producer semantics and preserve canonical evidence metadata before changing copy. Begin implementation only after a separate user request.
- **Performance/reliability:** Reuse bounded overview/Today reads and existing authenticated services. No extra model invocation, polling, analytics query or worker. Cache only in authorized in-memory UI state where needed; preserve independent sections during recoverable failures.
- **Security/observability:** Reuse safe recovery allowlists and existing error handling. Browser fixtures should capture request counts/state transitions; do not introduce logging of athlete history, goal text, private paths or recovery payloads.
- **Rollout/rollback:** Deliver through the existing web workflow after validation. Roll back the F01 view-model/presentation/state changes without changing persisted goals, plans, snapshots or prediction calculations. Recheck the current working tree before implementation because substantial unrelated work is present.
- **ADR:** Not required for an app-local evidence/state repair. A future calibrated confidence measure, target-comparison contract, per-distance attribution or changed evidence computation requires separate product/architecture work.
- **Skill invocation summary:** Architect and Product Owner used for requirements validation, contract/state design, prioritised slices and acceptance criteria. Read repository context/architecture, web `AGENTS.md`, binding design/backlog/review/QA sections and relevant dashboard/Today/recovery sources. `.codex/enforcement` is absent. This section is a proposed plan only.

## Completion report

After implementation and validation, rerun the design-intent review and return:

1. Overall verdict: Pass, Concern or Fail.
2. Design intent preserved.
3. Design drift found.
4. Missing states.
5. UX risks.
6. Required fixes before release.
7. Optional improvements for later.
8. Clear handoff for any remaining required issues.

Report each F01–F10 item's implementation and validation status separately. Do not claim release readiness solely from compilation, unit tests or source inspection.

## F01 implementation evidence — 15 September 2026

**Verdict: Concern.** F01.1–F01.4 are implemented and F01.5 has local/online synthetic browser, unit/state, type, lint, core-test, web-test, production-build and actual 200%-zoom evidence. This is not a redesign or release-pass claim: required human comprehension, assistive-technology, live-provider/authenticated deployment, and several specified estimate-comparison fixtures remain outstanding.

### Delivered slices

- **F01.1 — Pass:** `dashboard-view-model.ts` now preserves canonical driver direction/confidence and trend `featureLabel`, units, dates, signed values, including valid zero/negative values. `readiness-evidence.ts` deterministically selects the greatest absolute non-zero supplied contribution with stable key tie-breaking and bounded neutral/conflicting/no-evidence fallbacks. It groups trends by supplied key/unit/label, preserves gaps and reports factual week-start coverage. Incomplete legacy snapshots fail as unavailable rather than being silently relabeled.
- **F01.2 — Pass:** target context validates the existing Today envelope and has explicit loading, confirmed-target, confirmed-null-absence and failed-read states. HTTP 404/503, malformed JSON/envelope, network and authorization failures do not assert absence; a non-authority refresh failure retains the last confirmed target, while valid null clears it. The independent retry is guarded against stale responses and performs only the target GET.
- **F01.3 — Pass:** Home now gives a concise supplied-evidence reason without causality, probabilities, finish-time attribution, target parsing, or fabricated confidence. Optional readiness exposes every supplied driver as a signed contribution and every feature/unit-specific trend as an accessible text list with dates, values and coverage caveats. Estimate range, current-fitness meaning, stale/freshness separation and unsupported target-comparison language remain adjacent to the claim. Distance selection changes only the selected estimate display.
- **F01.4 — Pass:** `#readiness` is direct-loadable and reloadable. Home activation, explicit Back, browser Back/Forward, launcher focus restoration and bounded recovery selection state work without a primary-nav route or writes. The browser matrix exposed both history/focus and direct-recovery focus timing defects during this implementation; both were fixed and rerun.
- **F01.5 — Concern:** focused local and online synthetic browser journeys pass, including confirmed target absence, direct recovery restoration, 320/767/768/1199/1200/1440 CSS-pixel checks and actual 200% browser zoom inspection. The full required browser fixture set for compatible/incompatible/insufficient-history/failed-overview, manual assistive technology, runner comprehension, live provider/auth and deployment remains unperformed.

### Required design-review outputs

1. **Overall verdict:** Concern — the F01 implementation and automated/local evidence pass, but release-level human, assistive-technology, deployment and full scenario coverage are incomplete.
2. **Design intent preserved:** Home remains Race outlook → Recent training → Next action; readiness is optional and addressable, current-fitness and its low-to-high range are not a race-day forecast/probability, target comparison stays unavailable, evidence stays overview-level, and all presentation actions are read-only.
3. **Design drift found:** none intentional. A test-only isolated Next output directory option was added so F01 validation did not stop or reuse an unrelated dev server; it does not change normal production output.
4. **Missing states/evidence:** browser fixtures for compatible/incompatible/insufficient-history/failed-overview combinations, recovery-through-Data-Quality/Settings with selected distance, manual screen-reader/contrast/switch-control testing, human 30-second comprehension, live auth/provider and deployed smoke.
5. **UX risks:** untested human/AT and deployment paths can still reveal wording, focus, route or responsive issues. The feature deliberately does not infer target compatibility, so richer comparison needs separately approved contract/model work.
6. **Required fixes before release:** complete the remaining PR-F03/PR-S01/PR-A01/PR-PW01 and shared F02/F03/F05/F08/F10 matrices; perform human comprehension and assistive-technology checks; run authenticated deployed smoke without modifying real goals/plans.
7. **Optional improvements later:** support a structured target-comparison contract or calibrated estimate confidence only through separate product/architecture approval; do not derive either from goal text or supplied driver contributions.
8. **Handoff:** continue from `apps/web/e2e/redesign-readiness.spec.ts` and its local/online isolated configs. Keep synthetic fixtures, retain the no-write assertions, and treat F01 evidence as separate from overall release readiness.

### Exact validation record

- PASS — `node --experimental-strip-types --test test/readiness-evidence.test.ts test/target-context-state.test.ts test/local-dashboard-data-source.test.ts` in `apps/web` (10/10 after the stale-request guard test was added).
- PASS — `npm run typecheck --workspace @racepredictor/web`.
- PASS — `npm test --workspace @racepredictor/web` (123/123; existing synthetic diagnostic output is expected test coverage).
- PASS — `npm test --workspace @racepredictor/core` (90/90).
- PASS — `npm run lint --workspace @racepredictor/web`.
- PASS — `npm run build --workspace @racepredictor/web`; Prisma generation and Next production build completed and emitted `apps/web/.next/BUILD_ID`.
- PASS — `npx playwright test --config playwright.online.config.ts redesign-readiness.spec.ts --grep "readiness presents"`; `--grep "direct readiness"`; `--grep "only a schema"`; `--grep "safe readiness recovery"`; and `--grep "no horizontal overflow"` (one passing online Chromium test per focused run).
- PASS — `npx playwright test --config playwright.readiness.local.config.ts redesign-readiness.spec.ts --grep "readiness presents"`; `--grep "direct readiness"`; `--grep "only a schema"`; `--grep "safe readiness recovery"`; and `--grep "no horizontal overflow"` (one passing local Chromium test per focused run; the first run's `.last-run.json` records pass after the managed command window returned before its final reporter line).
- PASS — rendered local `http://127.0.0.1:3006/dashboard#readiness` inspected at actual browser 200% zoom (six Ctrl++ increments from browser default, then reset): overview, evidence heading, drivers, dated unit-labeled series, zero values and no-target-comparison caveat remained readable without visible horizontal clipping.
- PASS — `git diff --check` (no whitespace errors; existing line-ending warnings only).
- NOT RUN / outstanding — human comprehension, manual screen-reader/assistive technology/contrast, live provider/auth recovery, deployed smoke and all non-F01 redesign release gates.

## F09 implementation evidence — 14 September 2026

**Verdict: Concern.** F09 source, types and unit/service regressions are implemented and pass, but the required rendered browser failure matrix, auth return journey, 320px and actual 200% zoom checks did not complete. This is not a release-pass claim.

### Delivered slices

- **F09.1 — Concern:** schema-validated preference reads now establish the only editable baseline; a failed initial read is an explicit retry state, while context is independent. Pure state tests prove no fallback defaults and refresh retention. Controlled browser malformed/503 cases are outstanding.
- **F09.2 — Concern:** online Connections no longer contains pairing. Paired computer contains enrolment, one-time credential, history and revocation; Operations is accurately labeled and existing section keys remain. Independent provider/device/operations read retries and stale generations are implemented. Browser keyboard/direct-link/replacement evidence is outstanding.
- **F09.3 — Concern:** local reminders use clean preferences, empty-body preparation, explicit continuation and typed external confirmation. Artifact paths and task references are separate; prepared/copied is not scheduling. Persisted prepared/scheduled/attention/disabled handling is represented, but full five-status browser fixtures remain outstanding.
- **F09.4 — Concern:** local reminder mutations share a synchronous guard and online device mutations have a family guard. The focused pure-state test covers eligibility and reference ownership, but delayed mouse/Enter request-count and ambiguous-lost-write reread tests remain outstanding.
- **F09.5 — Concern:** safe `returnTo` and section parsing remain in both routes and existing E2E assertions were updated. Manual browser inspection on isolated local and online fixture servers confirms the local prepared reference separation, online independent provider/device failure/retry copy, and 320px Settings with no horizontal overflow. The managed Playwright run was stopped after it failed to complete cleanly; no return/auth or 200% zoom evidence is claimed.

### Required design-review outputs

1. **Overall verdict:** Concern.
2. **Design intent preserved:** Settings stays secondary; authoritative data is distinguished from unknown state; provider connection is separate from computer pairing; external work remains runner-confirmed only.
3. **Design drift found:** no intentional contract/API/auth/timezone or provider capability change.
4. **Missing states/evidence:** rendered malformed/503/network reads, all persisted reminder statuses, copy failure, delayed duplicate Enter/mouse submissions, lost write recovery, and stale response ordering.
5. **UX risks:** lack of browser evidence can still hide disclosure, focus, reflow or request-order regressions.
6. **Required fixes before release:** complete and fix local/online/auth browser matrices; test 320px/768/1199/1200/1440, actual 200% zoom, keyboard/focus/AT, expired/unsafe recovery context and live provider behavior.
7. **Optional improvements later:** a dedicated authoritative external-task-status API, only with separate product/API approval; current UI must not infer it.
8. **Handoff:** resume from the targeted Settings Playwright fixtures with schema-valid envelopes; retain F05/F08/F10 shared gates and do not claim deployment or live-provider verification.

### Exact validation record

- PASS — `npm run typecheck --workspace @racepredictor/web`.
- PASS — `npm test --workspace @racepredictor/web` (115/115; includes `settings-workflow-state.test.ts`).
- PASS — `npm test --workspace @racepredictor/core` (90/90).
- PASS — `npm run db:test:local-coaching` (7/7).
- PASS (limited manual browser) — isolated local Settings: prepared artifact path visible separately, external task input blank, confirmation disabled; isolated online Settings: Strava/device failed reads say unknown rather than disconnected/not paired and offer their own retries; at 320px local `scrollWidth === clientWidth` (305px).
- INCOMPLETE — focused local Settings Playwright command started its managed server and a long existing journey but did not complete cleanly; the runner processes it started were stopped. No result is counted.
- INCOMPLETE — `npm run build --workspace @racepredictor/web` compiled successfully and reached static page generation, but the captured command did not return a final completion line.
- NOT RUN — completed local/online/auth Settings Playwright matrix, manual 320px/200% zoom, assistive technology, human comprehension, live provider and deployment checks.

## F07 implementation evidence — 13 September 2026

**Verdict: Concern.** F07.1–F07.4 are implemented in the Plan client boundary and F07.5 has focused state coverage plus an online Playwright fixture. `npm run typecheck --workspace @racepredictor/web` and `npm test --workspace @racepredictor/web` pass (105 tests). Browser and production-build evidence remains blocked by pre-existing Next processes: an existing dev server at `127.0.0.1:3311` prevents the isolated online Playwright server from starting, and a separate Next build lock prevents `next build`. Those processes were not stopped because the working tree contains substantial concurrent work.

### Delivered F07 slices

- **F07.1 — Pass in automated state coverage.** `plan-confirmation-state.ts` binds the reviewed target/revision/replacement/expected-active identity, validates the existing response envelopes, classifies actual conflict codes and blocks incomplete snapshots before a POST.
- **F07.2 — Pass in code/type/unit evidence; browser pending journey outstanding.** The active confirmation remains mounted for pending, failure, success and history-refresh warning states; a synchronous ref guard prevents a duplicate handler dispatch. Success is not downgraded if history reload fails.
- **F07.3 — Pass in code/unit evidence; browser reconciliation journey outstanding.** Conflict and uncertain results remain dialog-local, invoke only authoritative GET reconciliation, qualify unknown rejection results, and require explicit rereview before another POST. Observed active state is not attributed to a lost response.
- **F07.4 — Concern.** Historical activation launchers are secondary and the confirmation owns the filled action. The dialog has a stable focusable surface, inert background, guarded Escape/Cancel, and connected fallback focus. Actual keyboard trapping, 320px/767px/768px/1199px/1200px/1440px and 200% zoom need the blocked browser run plus human review.
- **F07.5 — Concern.** Added `plan-confirmation-state.test.ts` and expanded `online-dashboard.spec.ts` with exact activation body/count and conflict→reload→rereview assertions. Local approval/rejection browser fixtures, lost-response browser fixtures, and the full local/online E2E matrix remain unperformed while Next is locked.

### Required design-intent review outputs

1. **Overall verdict:** Concern — unit/type evidence is green; required browser, responsive, zoom and human accessibility evidence is missing.
2. **Design intent preserved:** explicit consequential confirmation, server authority, immutable prescriptions, local/online boundaries, one active dialog, and no automatic write retry are preserved.
3. **Design drift found:** none in the reviewed F07 implementation.
4. **Missing states/evidence:** browser-verified local approval/rejection 503/lost-response, online lost-response, actual full responsive and 200% zoom states, and assistive-technology announcements.
5. **UX risks:** unexecuted browser tests may reveal a focus or reflow issue not visible to type/unit checks.
6. **Required fixes before release:** clear/coordinate the existing Next locks; run and fix the local/online Playwright matrix, responsive/zoom inspection and accessible-name/live-region checks.
7. **Optional improvements later:** add an authoritative decision-outcome endpoint only through separately approved API work; F07 does not infer it from existing reads.
8. **Handoff:** resume with the two blocked commands recorded below; do not mark F05, F06, F10, human comprehension, assistive-technology or deployment checks complete without their own evidence.

### Exact validation record

- PASS — `npm run typecheck --workspace @racepredictor/web`
- PASS — `npm test --workspace @racepredictor/web` (105/105; existing synthetic supplemental-data diagnostics are expected test output)
- BLOCKED — `npm run test:e2e:online --workspace @racepredictor/web -- online-dashboard.spec.ts`: existing Next dev server lock.
- BLOCKED — `npm run build --workspace @racepredictor/web`: existing Next build lock.
- NOT RUN — local Playwright F07 matrix, manual 320–1440 responsive checks, actual 200% zoom, screen reader/status-announcement review, human comprehension and deployment verification.

## F02 implementation plan — proposed, not implemented

Prepared 15 September 2026. This section plans **F02 only**. It does not authorize implementation, mark F02 resolved, or supersede the evidence recorded for other findings.

### Outcome, requirements and scope

A runner can scan Home in the stable order **Race outlook → Recent training → Next action**, understand the latest recorded session and its qualified interpretation, and reach the supporting review or today's schedule directly. The outlook remains compact; recent training carries the main explanation. Missing evidence produces an explicit limitation, never a stronger conclusion.

Binding references: [Design Intent Contract](../design/DESIGN_INTENT_CONTRACT.md) UX1–UX6, N3, V1, C2–C3, section 8, L1/L3, A1–A6 and R1–R3; [Backlog Ticket 04](../design/REDESIGN_IMPLEMENTATION_BACKLOG.md#ticket-04--done--replace-the-dashboard-composition-with-the-home-experience); the [13 September review](race-predictor-design-intent-review-2026-09-13.md) F02 finding; [Dashboard QA rows](race-predictor-redesign-qa-matrix.md#1-dashboard) DB-F01–DB-F06, DB-A01, DB-R01, DB-S01, DB-D01, DB-X01 and DB-PW01. Ticket 04's existing DONE label is not evidence that the later F02 finding is closed.

- Preserve `/dashboard`, the three persistent groups in DOM and visual order, local/online behavior, independent resource states, and existing navigation/recovery contracts.
- F02 owns Home hierarchy, concise faithful review presentation, adjacent caveats and explicit goal-impact availability. Preserve F01's supplied outlook reason, uncertainty semantics, target read/retry states, estimate selection and addressable readiness disclosure.
- Preserve F03's latest-activity identity, persisted review, queued/processing/retry/attention states, match qualifications and provenance. Exercise their Home integration here; broader Training/Calendar consistency remains F03.
- Preserve F04/F08 contextual returns and F06/F07 approved-plan authority. F05 owns the full application responsive/accessibility matrix; F10 owns aggregate release evidence. F02 still requires its own focused validation.
- No prediction or review generation changes, API/schema changes, database migrations, new polling, automatic review requests, plan adaptation, new navigation destination or additional Home panel. Application implementation is excluded from this planning task.

### Current implementation findings

These findings come from source inspection of the current working tree, not a new browser run. Existing unrelated edits must be preserved.

| Area | Current behavior | Planning consequence |
|---|---|---|
| `apps/web/components/dashboard/dashboard-shell.tsx` | The three groups already render in the required order. Readiness, prediction settings and data freshness are optional; F01 adds evidence-led copy and distinct target states. | Keep the composition and F01 logic. Adjust presentation without removing qualifications or recreating evidence logic. |
| `apps/web/components/dashboard/dashboard.css` | Outlook uses a bordered surface, 20px padding, a two-column inner layout and a value up to 3.25rem; recent training uses a 16px surface and several divided caveat paragraphs. | Reduce the outlook's oversized number and redundant spacing using existing design tokens; make the session takeaway the explanatory focus. Validate rendered hierarchy before claiming success. |
| `apps/web/components/dashboard/home-recent-training.tsx` | Fetches up to 40 activities, chooses the latest by `occurredAt`, then reads that activity's full review. Activity and review loading/failure are separate. | Keep the latest recorded session visible even when its review is pending or unavailable. Confirm list ordering with fixtures; never select from the latest-reviewed list. |
| Ready review summary | Renders headline, a 50-word assessment excerpt, a separate 30-word next-step excerpt, full comparison interpretation, every limitation and a generic advisory caveat. | The combined commentary is not actually bounded to 80 words or 2–3 sentences. Restructure the commentary as one coherent summary while retaining material qualifications separately. |
| `apps/web/components/activities/review-presentation.ts` | `reviewExcerpt` slices by words and appends an ellipsis, including mid-sentence. Shared status/match labels already preserve distinctions. | Add a narrowly scoped, testable Home presentation helper; do not change shared excerpt consumers without checking their behavior. Word or sentence counting alone cannot guarantee faithful meaning. |
| `packages/core/src/contracts/activity-review.ts` | Full review supplies headline, assessment, next step, comparison, limitations and evidence, but no dedicated short-summary or goal-impact field. | Use only supplied text. Do not infer goal progress from a match, headline, pace, target title or the current-fitness estimate. |
| Full session review | `activity-coach-review.tsx` displays plan version, complete text, limitations and evidence references; Home already links to its activity-specific review anchor. | Keep the same review identity/revision and one-activation link. Show relevant plan version beside Home's comparison; keep the complete evidence list available in that same full review. |
| Existing E2E | `redesign-coverage.spec.ts` has order/outlook checks, but its Home fixture uses empty activities and obsolete copy assertions. Local config excludes this file; online config explicitly lists accepted specs. | Add schema-valid ready and pending review fixtures and ensure new Home coverage is selected in both modes. Do not count a zero-test run as validation. |

### Presentation and evidence decisions

Keep orchestration in the existing web components. Introduce an app-local pure Home review presenter, for example `apps/web/lib/home-review-presentation.ts`, only for selecting source text and assembling display metadata. Consume the canonical review type and existing status/match labels. Do not introduce a second domain schema, a summarization service or persisted presentation data.

| Home group | Default visible content | Optional depth and action |
|---|---|---|
| Race outlook | Target/date or truthful target state; supported estimate labeled current fitness; one supplied reason; low-to-high range with its meaning; material target-comparison and freshness caveats. | Preserve View readiness, prediction settings and data freshness. Drivers/trends stay in readiness. All launch/retry controls remain secondary. |
| Recent training | Latest identity/date and measured facts; review status; faithful commentary; qualified execution-versus-plan interpretation; explicit goal-impact availability; all supplied material limitations. | One labeled full-session review link, retaining the activity id and Home return context. Full review retains complete assessment, advice and evidence. |
| Next action | Today's existing approved workout/rest and purpose, or truthful loading/absence/failure; a useful action if required. | Existing direct schedule/Plan/recovery links. Keep at most one filled primary action across Home; rest can have none. Review advice does not replace today's prescription. |

Compactness is achieved through hierarchy, grouping and removal of redundant labels/spacing. Use the shared type scale instead of the oversized estimate treatment. Keep normal text readable, maintain 44×44 controls, and avoid decorative nested cards, fixed heights, line clamps or hiding caveats. Do not enlarge recent training with filler or force all three groups above the fold. Expanded readiness may grow after an explicit user action; the compact criterion applies to default Home.

**Faithful commentary policy.** The normal target is 2–3 short sentences and no more than 80 words of commentary, counting the displayed review headline, assessment excerpt and any next-step text. Session identity/metrics and separately labeled comparison context, goal-impact availability and material limitations are outside this commentary budget; that separation must not become a way to move excess narrative into caveats.

1. Preserve source wording, negation, quantities, conditions and uncertainty. Use source-order, contiguous complete text units and label shortened material as an excerpt with full-review access. Never concatenate non-adjacent sentences into a new conclusion or paraphrase advice to meet the budget.
2. Prefer the complete supplied assessment when it already fits. Otherwise consider a complete opening paragraph or sentence group, retaining any qualification on which its meaning depends. Preserve the headline only with its qualifying context; do not feature an isolated positive headline that the assessment limits.
3. Sentence/paragraph boundaries help find candidates but do not establish semantic independence. When a safe short excerpt cannot be established, retain the complete relevant source passage and accept a documented length exception. Never cut at an arbitrary word count, discard a trailing condition, or use a keyword heuristic as proof that omitted text is immaterial. A long or unpunctuated source is an explicit fallback case.
4. Next-step advice is optional on Home when the safe assessment consumes the normal budget; the complete next step remains one activation away. When shown, preserve its full conditional meaning and label it as review advice. Advice necessary to qualify a displayed claim remains visible even if the budget is exceeded.
5. Display all supplied limitations intact beside the review they qualify. Preserve suggested/ambiguous/unplanned/no-match distinctions and full comparison interpretation; include supplied plan version rather than silently associating an old review with today's active version. Avoid repeating identical caveat text, but do not infer that two different limitations are equivalent.

**Goal implications.** The current contract does not provide a structured, validated goal-impact conclusion. Preserve any qualifying goal-related statement in the chosen source passage as attributed review commentary, without extracting a new verdict through text matching. Add a concise explicit availability statement: for example, **“Goal impact cannot be assessed from the available review evidence.”** For pending or failed reads, explain that review evidence is pending or could not be checked. Preserve the qualification that review advice does not change the approved prescription. A completed workout or confirmed plan match never becomes evidence of being on track, a finish-time improvement or a race probability. Adding a dedicated goal-impact contract would require a separate scope decision and is unnecessary for F02.

### State, navigation and component boundaries

- `DashboardShell` owns the stable Home composition and existing outlook/readiness behavior. Styling must not merge independent errors into a fourth alert panel or block training/Today content on analytics success.
- `HomeRecentTraining` owns activity selection and its review read. The presenter receives the matching activity/review and returns only display content and provenance. Keep response identity checks and prevent a late review response from appearing under a different activity; do not equate a failed read with no review requested.
- Keep `not_requested`, `queued`, `processing`, `retry_wait`, `attention`, ready-with-content, ready-without-content and read failure distinguishable through the existing labels/messages. If an older persisted review accompanies a pending refresh status, qualify it as earlier feedback rather than presenting the new review as complete. Preserve any supported same-activity prior content with a visible read warning; never retain another activity's commentary.
- Keep recorded metrics usable during review loading/failure. A genuine empty activity list offers the existing secondary Add training path; a failed list read retains the existing Training recovery path and never asserts that no training exists.
- Preserve `/dashboard#readiness`, the activity-specific full-review link and today's effective date/session destination. Reading, disclosure changes, navigation and return must trigger no review-generation, import, approval or schedule mutation. Background state changes must not steal focus or reset scroll.
- Reuse the existing safe recovery context when a touched launcher needs restoration. Do not introduce a parallel return format or cache private review text in browser storage. Keep authentication failures within existing session/privacy boundaries.

Existing interfaces remain unchanged: activity list GET, selected activity coach-review GET, dashboard overview GET and coaching Today GET, plus existing detail/navigation routes. No migrations, backfills or API version changes are needed. No extra network request is required to shorten text; maintain the existing independent read boundaries rather than broadening this into shared data-fetching infrastructure.

### Execution slices and acceptance criteria

Implement only after a separate user request. Add each slice's focused tests alongside that slice.

1. **F02.1 — Define and verify faithful Home commentary.** Add the pure presenter and adversarial fixtures for short/long supplied text, trailing caveats, conditional advice and ambiguous comparison. Normal safe content meets the 2–3 sentence/80-word target; unsafe truncation retains the relevant full text with a documented exception. All displayed review prose is traceable to the same persisted review. Missing structured goal evidence yields explicit unavailability. Depends on existing core contracts and shared presentation labels.
2. **F02.2 — Rebalance the three Home groups.** Integrate the presenter into Recent training and compact the existing outlook using shared tokens. Preserve F01's estimate/reason/range/target/freshness qualifications and every material review limit. The latest session is the main explanation, while the approved next action remains visible. Exactly three persistent groups remain in DOM and visual order; at most one filled primary action exists. Depends on F02.1 and the current F01 implementation.
3. **F02.3 — Preserve states and direct contextual access.** Exercise and narrowly fix Home integration for pending/failed reads, newest-pending versus older-ready activities, all match states and one-activation detail/schedule access. Preserve review identity/revision, plan-version meaning and F04/F08 restoration. Do not silently request reviews or change prescriptions. Depends on F02.2; report broader cross-screen defects to F03 instead of claiming that finding complete.
4. **F02.4 — Validate hierarchy and record evidence.** Run the focused local/online Home matrix, adjacent F01/F04 regressions and appropriate web checks. Inspect default, loading/error and long-caveat states at contract widths and actual 200% browser zoom. Record the runner comprehension observation separately from automated checks. Update only evidenced Ticket 04/QA/F02 claims; leave broader F03/F05/F10 and deployment obligations outstanding. Depends on F02.1–F02.3.

### Validation plan — execute during implementation, not this planning task

| Coverage | Required cases and assertions |
|---|---|
| Presenter behavior | Already concise assessment; headline plus advice exceeding the combined budget; long sentence; paragraph boundaries; decimals/abbreviations; negation or condition after the old 50/30-word cutoffs; qualification in a following sentence/paragraph; multiple limitations. Assert source fidelity, retained caveats, normal budget and explicit long-text fallback rather than exact JSX. |
| Evidence and identity | Confirmed, suggested, ambiguous, unplanned and none; missing plan version; older review plan version versus current plan; absent goal-impact field; no limitations supplied; review id/revision/evidence retained through the full-review link. Absence of limitations is not proof of certainty. |
| Review states | `not_requested`, queued, processing, retry wait, attention, ready, ready without content, malformed response, 503/network failure, delayed response and mismatched activity identity. Verify current status and useful facts, with no stronger conclusion from missing data. |
| Independent Home states | Complete data; no target/plan/activity; stale or failed outlook; failed target read; failed history; pending/failed review alongside an approved workout/rest. Hold responses independently to verify group order and unaffected content. Include a newer pending activity and an older ready review. |
| Navigation and authority | Pointer and keyboard Home → full latest review → Home, readiness → Back and today's effective schedule context. Verify the right record/date/session, launcher focus and scroll restoration. Intercept and count POST/PUT/PATCH/DELETE requests: these read/navigation journeys produce zero consequential writes. |
| Responsive and accessibility | 320, 767, 768, 1199, 1200 and 1440 CSS px; resize with readiness open and during delayed reads; actual 200% browser zoom. Inspect default hierarchy, 44×44 controls, logical headings, text status, contrast, visible focus, caveats and no page-level horizontal overflow. A viewport proxy does not count as actual zoom. |
| Human comprehension | After load, give a runner 30 seconds without opening detail to identify target/timeframe, supported outlook/reason/uncertainty, latest-session takeaway/limitation and next action. Record observed understanding and misunderstandings. Do not claim DB-F04 or screen-reader acceptance from source checks or automated text assertions. |

Proposed test locations: `apps/web/test/home-review-presentation.test.ts` and a focused `apps/web/e2e/redesign-home.spec.ts`; extend existing Home assertions in `redesign-coverage.spec.ts` where appropriate. Add the new spec to the online config's explicit `testMatch` and verify local discovery. Reuse schema-valid F01 readiness and activity-review fixtures; local server-rendered outlook fixtures must use the existing isolated local data/snapshot setup rather than relying solely on browser interception. Update only obsolete assertions affected by this work.

Planned commands after implementation and test discovery are in place:

- `npm run test --workspace @racepredictor/web`
- `npm run typecheck --workspace @racepredictor/web`
- `npm run lint --workspace @racepredictor/web`
- `npm run build --workspace @racepredictor/web`
- `npm run test:e2e --workspace @racepredictor/web -- redesign-home.spec.ts`
- `npm run test:e2e:online --workspace @racepredictor/web -- redesign-home.spec.ts redesign-coverage.spec.ts`
- Rerun affected readiness and Training return journeys using their existing local/online fixture configurations; add auth checks only if authentication or authorization handling is touched.

Record exact selected tests, counts, fixture modes, results and screenshot/trace paths. Use isolated test output/server settings, preserve unrelated processes and changes, and report lock/configuration failures as blockers rather than passing evidence. No tests, build, browser verification or deployment are performed by this planning change.

### Assumptions, risks and delivery notes

- **Confirmed requirements versus choices:** The stable three groups, truthful evidence, adjacent caveats and concise commentary are binding. The pure presenter, normal word-count convention and compact typography treatment are proposed implementation choices. The 80-word guidance permits fidelity exceptions; it is not a hard clipping rule. No blocking clarification is needed to plan the explicit goal-impact-unavailable path.
- **Primary risk:** A grammatically complete excerpt can still change meaning by omitting later context. Retain uncertain context and use adversarial review fixtures plus content review; compactness never overrides fidelity. If safe short summaries require new producer metadata, record that as separate future work.
- **Visual trade-off:** Long material limitations can make Recent training tall. Keep them readable and visible; assess compactness with both normal and long-content fixtures rather than specifying an arbitrary maximum height.
- **Integration risk:** The working tree contains substantial F01–F09 work. Keep edits local to F02 surfaces and regression-test touched shared helpers. Do not overwrite prior implementation or reinterpret old evidence as a fresh pass.
- **Performance, privacy and observability:** Bounded in-memory presentation only; no new model calls, polling, storage or analytics computation. Use existing request/error boundaries and synthetic fixture logs; do not log private review content or athlete context.
- **Rollout/rollback:** Deliver through the existing web workflow after implementation validation. Roll back only F02's presenter/integration/style changes if needed, preserving F01 and other work. No data migration, feature flag or new ADR is expected because contracts and authority boundaries stay intact.
- **Recommended next item:** F02.1, beginning with representative review fixtures and an agreed safe fallback. Implementation awaits a separate user request.
- **Skill invocation summary:** Architect used for requirements validation, component/data boundaries, execution slices and risks. Read repository context, architecture, relevant contracts, design sources, QA matrix and `apps/web/AGENTS.md`; `.codex/enforcement` is absent. Requirements are sufficient for this proposed plan; visual and human acceptance remain unperformed.

## F02 implementation evidence — 15 September 2026

**Verdict: Concern.** F02.1–F02.3 are implemented and focused local/online automated evidence is green. F02.4’s automated hierarchy, state, responsive-width and rendered desktop review work is complete; human comprehension, screen-reader/keyboard, true browser-level 200% zoom, approved-session Calendar return and deployment/authentication checks remain unperformed and are not release evidence.

### Delivered slices

- **F02.1 — Pass in presenter tests.** `home-review-presentation.ts` only displays supplied persisted-review text. Normal text stays whole; source that is over 80 words, has more than three sentences, or is unpunctuated is displayed as the complete passage with an explicit fidelity fallback. Tests cover short text, a trailing qualification, conditional advice, long text, unpunctuated text and distinct limitations. Advice that cannot fit remains absent on Home rather than clipped; full review is available in one activation.
- **F02.2 — Pass in local/online browser fixtures.** Home still has exactly Race outlook → Recent training → Next action in DOM/visual sequence. Outlook uses smaller shared-token spacing/value treatment; Recent training holds the explanation, comparison/plan version, goal-impact-unavailable statement, limitations and advisory-prescription caveat. F01 current-fitness, reason, uncertainty, target state, freshness and readiness disclosure remain intact.
- **F02.3 — Pass for exercised Home integration; wider F03 is open.** Fixtures prove newest-pending selection, every current persisted review status, all match qualifications, local review failure isolation, one-activation readiness/session access, full-review Home return/focus, and no POST/PUT/PATCH/DELETE requests. The return stores only safe metadata in session storage. A directly activated approved-session Calendar return from Home is still a specific open check.
- **F02.4 — Concern.** Long-caveat browser fixtures passed across 320/767/768/1199/1200/1440 CSS px with no document horizontal overflow. A rendered local Home desktop review confirmed readable compact outlook and visible three-group sequence. The available in-app browser could not expose a verifiable browser-level 200% zoom; this is not claimed as passed.

### Exact validation record

- PASS — `npm test --workspace @racepredictor/web` — 129/129 tests, including 6 `home-review-presentation.test.ts` cases.
- PASS — `npm run typecheck --workspace @racepredictor/web`.
- PASS — `npm run lint --workspace @racepredictor/web`.
- PASS — `npm run build --workspace @racepredictor/web`.
- PASS — discovery: `npx playwright test --config playwright.home.local.config.ts --list` and `npx playwright test --config playwright.online.config.ts --list redesign-home.spec.ts` — 15 cases each.
- PASS — `npx playwright test --config playwright.home.local.config.ts` — 15/15 Chromium cases; local dashboard snapshot (`e2e/home-local-fixture.ts`) plus intercepted activity/review/today reads.
- PASS — `npx playwright test --config playwright.online.config.ts redesign-home.spec.ts` — 15/15 Chromium cases; online overview/status/activity/review/today fixture responses.
- PASS — `npx playwright test --config playwright.readiness.local.config.ts` — 5/5; `npx playwright test --config playwright.online.config.ts redesign-readiness.spec.ts` — 5/5.
- PASS — `npx playwright test --config playwright.online.config.ts redesign-training-detail.spec.ts` — 3/3.
- PASS — focused post-fix local Home return/focus rerun and complete 15/15 local/online reruns. Generated isolated Next build artifacts are scoped beneath `apps/web/.next-e2e-*-digital-coach-*/`; successful runs produced no screenshots/traces.
- NOT RUN — unfamiliar-runner 30-second comprehension observation, screen-reader and manual keyboard flow, true browser-level 200% zoom, deployed/authenticated Home smoke, full no-goal/no-plan/no-activity/stale/failed-history state matrix, and approved-session Calendar return from Home.

## F03 implementation evidence — 16 September 2026

**Verdict: Concern.** Shared review loading and the exercised Home, Training and Calendar review journey are implemented and have passing local/online fixture evidence. The result does not certify real worker, accessibility, zoom or deployed-authentication behavior.

- `ActivityCoachReview` and Home use the same app-local reader and shared request-status labels/messages. It validates response activity identity, cancels superseded reads, retains only same-activity saved content during a recoverable refresh failure, clears retained content on 401/403, and ignores late reads after an explicit review-request acknowledgement.
- Full-detail content now keeps current request status separate from saved review content; it preserves match label, plan version, review revision, evidence references, limitations and the advisory-prescription boundary. Calendar continues to use the same `ActivityRecordContent` composition within its activity date dialog.
- PASS — `npm test --workspace @racepredictor/web` — 136/136.
- PASS — `npm run typecheck --workspace @racepredictor/web`; `npm run lint --workspace @racepredictor/web`; `npm run build --workspace @racepredictor/web`.
- PASS — `npx playwright test --config playwright.home.local.config.ts` and `npx playwright test --config playwright.online.config.ts redesign-home.spec.ts` — 15/15 in each fixture mode.
- PASS — focused `redesign-review-consistency.spec.ts` — 2/2 local and 2/2 online: identical persisted review revision, suggested match, evidence reference and zero writes across Home, Training and Calendar; saved Training review retained after a 503 refresh failure.
- PASS — `npx playwright test --config playwright.online.config.ts redesign-training-detail.spec.ts` — 3/3.
- NOT PASS / not counted — a standalone local `redesign-training-detail.spec.ts` run timed out waiting for the existing Load more activities control in two F04 cases. This did not affect the F03 fixture path and remains an adjacent local-fixture issue.
- NOT RUN — human comprehension, manual keyboard/screen-reader testing, actual browser-level 200% zoom, deployment/authenticated smoke, and complete Calendar status/match matrix.

## F05 implementation evidence — 16 September 2026

**Verdict: Concern.** F05's shared responsive and accessibility repairs are implemented, and focused local/online Chromium fixtures pass. This is not a release-pass claim: the active-workflow resize matrix, actual desktop-browser 200% zoom, assistive technology, software keyboard, comprehension and deployment checks remain outstanding.

- The skip link now targets the actual programmatically focusable main landmark on Home, Training, Plan, Calendar, Data Quality and Settings. The application shell uses its native complementary landmark rather than an invalid navigation role.
- Dialog keyboard handling now includes native disclosure summaries, removes hidden/disabled/inert controls from the Tab sequence, and focuses the dialog itself when no active control remains. Dialogs retain a single scroll surface with dynamic viewport height limits.
- Compact component rules align below 768px; Training filters stack in the compact range. Calendar forces Agenda below 1200px and restores the runner's chosen wide view after expansion. Long local failure details wrap rather than widening the document.
- PASS — `npm run typecheck --workspace @racepredictor/web`.
- PASS — `npm test --workspace @racepredictor/web` — 136/136.
- PASS — `npm run build --workspace @racepredictor/web`.
- PASS — `npx playwright test e2e/redesign-responsive.spec.ts e2e/redesign-accessibility.spec.ts --config playwright.config.ts` — 3/3 local Chromium cases. Covers all six routes at 320, 375, 390, 414, 767, 768, 1024, 1199, 1200 and 1440 CSS px; document overflow; 1199/1200 Calendar mode restoration; skip-link focus; and Home axe scan.
- PASS — `npx playwright test redesign-responsive.spec.ts redesign-accessibility.spec.ts --config playwright.online.config.ts` — 3/3 online Chromium cases after the corrected contrast rule.
- PASS — `npx playwright test e2e/digital-coach.spec.ts -g "Calendar recovers from errors" --config playwright.config.ts` — 1/1 local Chromium case, covering mobile error recovery, dialog focus containment, Escape and launcher-focus return.
- PASS — post-layout-cleanup `npx playwright test e2e/redesign-responsive.spec.ts --config playwright.config.ts` — 2/2 local Chromium cases after removing compact overflow clipping.
- NOT RUN / not claimed — real 200% desktop-browser zoom. The available in-app browser did not expose a changed, verifiable browser zoom state after the shortcut, so no viewport proxy is counted as evidence.
- NOT RUN — NVDA, switch control, software keyboard, manual contrast/reduced-motion/forced-colors review, pending-write/503/conflict/open-dialog/unsaved-form resize matrices, direct-link and full contextual-return workflow coverage, human comprehension, live-provider/authenticated deployment smoke and broader F10 regression evidence.

## F10 follow-up evidence — 17 September 2026

- **F07 Plan dialog focus:** PASS — `npx playwright test --config playwright.online.config.ts -g "online Plan keeps a conflict"` passed 1/1 in isolated Chromium. Conflict recovery now restores focus to `Approved plan version history` after the dialog unmounts.
- **F05 heading hierarchy:** PASS — `npx playwright test --config playwright.config.ts e2e/redesign-accessibility.spec.ts` passed 1/1 in isolated Chromium run `digital-coach-1789620400482-49584`; axe found no violations on the six initial redesigned routes.
- **Local runner:** added `npm run test:e2e:local`, which runs general local, seeded Home-local and seeded readiness-local sequentially with distinct run ids and non-destructive port preflight checks.
- **Still outstanding:** a complete final aggregate pass, online-fixture and owner-auth suites; browser-level 200% zoom; assistive-technology/software-keyboard and comprehension checks; live-provider OAuth; and deployed authenticated smoke. No deployment was performed.

## F10 implementation evidence — 16 September 2026

**Verdict: FAIL — release evidence is blocked.** F10 adds repeatable, isolated regression infrastructure and expands executable browser coverage without changing product APIs, schemas, persistence, permissions or prediction logic. It also reproduces two product defects; they remain failing tests rather than being skipped or weakened.

### Test infrastructure and coverage

- Every Playwright configuration now writes list output plus a machine-readable JSON report, screenshots and traces beneath its own `.local/e2e/<run-id>/` directory. The owner-auth configuration also receives an isolated Next output directory. Existing local fixture isolation continues to create separate database, snapshot, vault and exchange locations.
- `test-helpers.ts` records application API mutations and supports exact zero-write assertions. F04 training setup now deliberately applies filters before intercepted pagination, so focused tests do not depend on another test having populated client state. F08 waits on observable mocked initial reads instead of a fixed timeout and records the one intended upload.
- F01/F02: Home hierarchy, supplied estimate limitation, independent target failure, latest-activity identity and Home reading/navigation assertions are exercised in `redesign-coverage.spec.ts`, `redesign-home.spec.ts` and `redesign-readiness.spec.ts`.
- F03/F04: shared review identity and retained-error behavior, selected Training detail, filters, multi-page restore, disclosures and zero writes are exercised in `redesign-review-consistency.spec.ts` and `redesign-training-detail.spec.ts`.
- F05: every redesigned route is scanned with axe; responsive checks retain the 320/767/768/1199/1200 boundaries and assert Agenda-only compact Calendar controls.
- F06/F07/F08/F09: existing staged-plan, activation-conflict, recovery/import and Settings suites retain their server-authoritative state boundaries; F08 adds explicit upload request recording. The Plan conflict recovery now exposes the F07 focus-return defect below.

### Executed evidence

All commands were run from the shared dirty workspace at commit `000b38f` (163 `git status --short` entries when captured). Test artifacts remain under the run directory named by each configuration; reruns are preserved rather than overwritten.

- PASS — `npm run typecheck --workspace @racepredictor/web`; `npm run lint --workspace @racepredictor/web` (both currently invoke the same TypeScript check), `npm test --workspace @racepredictor/web` (136 pass), and `npm test --workspace @racepredictor/core` (90 pass).
- PASS — local database activities (2), coaching (7), analytics (1), pipeline (3), sync (15), direct local importer/activity-review invocation (8), and cloud database suite (66). `db:test:local-import` has no package script; its tests were run directly instead.
- PASS — `npm run build --workspace @racepredictor/web` after test servers stopped.
- PASS — `npx playwright test e2e/f08-recovery.spec.ts --config playwright.config.ts` (2); `npx playwright test --config playwright.auth.config.ts` (3); `npx playwright test --config playwright.home.local.config.ts` (15); `npx playwright test --config playwright.readiness.local.config.ts` (5); and focused `redesign-coverage.spec.ts` online rerun (4).
- HISTORICAL/SUPERSEDED — `npx playwright test --config playwright.online.config.ts` at `.local/e2e/digital-coach-1789590887700-47376/results/online.json`: 40 pass, 3 fail, exit 1. One failure was a stale Home assertion corrected by the passing focused rerun; the other two are retained product regressions. The final online rerun is recorded after this entry.
- FAIL — final `npx playwright test --config playwright.online.config.ts`: **41 pass, 2 fail, exit 1**. Artifacts: `.local/e2e/digital-coach-1789591347087-37984/results/online.json`; the only failures are the F07 focus-return and F05 heading-order regressions listed below.
- FAIL — final `npx playwright test --config playwright.config.ts`: **35 pass, 15 fail, exit 1**. Artifacts: `.local/e2e/digital-coach-1789591617160-37732/results/local.json`. Thirteen failures are legacy local fixture/assertion mismatches (including old Today naming, malformed plan fixtures, and unseeded/local read dependencies); they require fixture/test maintenance, not product changes. The two independently reproduced product failures in this mode are all-route heading order plus an F02 local-read state mismatch. No failure was skipped or marked expected.

### Reproduced product regressions

1. **F07 — Plan focus return: FAIL.** After conflict reconciliation and `Return to review`, focus does not land on `Approved plan version history`. The product calls that focus target, but dialog focus-restoration then wins. Regression: `online-dashboard.spec.ts` conflict test. Proposed owner: Plan/dialog implementation.
2. **F05/MN-A01 — heading order: FAIL.** Axe reports `heading-order` on Training, Plan, Data Quality and Settings; Home and Calendar are clean. Regression: `redesign-accessibility.spec.ts`. Proposed owner: page/component heading hierarchy.

### Outstanding release obligations

The following are not evidenced and remain explicitly outstanding: true browser-level 200% zoom; human comprehension; assistive technology and switch-control use; software keyboard; live OAuth/provider cancellation and persistence; authenticated deployed behavior; and deployed smoke verification. Viewport proxies, CSS scaling and device scale factors do not satisfy the browser-zoom requirement. F10 is an auditable coverage package, not release approval.

## F10 local validation follow-up — 23 September 2026

**Disposition: the five browser configurations pass independently; the aggregate command remains blocked during shutdown; release approval remains outstanding.** This entry supersedes the historical 16-pass/14-fail local report at `.local/e2e/digital-coach-1789620469572-37940/results/local.json` and the later 35-pass/15-fail and 41-pass/2-fail reports above, without deleting their artifacts. Checkout: commit `000b38f`, 167 changed/untracked entries at evidence capture; no commit or deployment.

The formerly failing manual journey passes on a fresh isolated SQLite repository. Its rerun found an F09 product defect: Settings sent capitalized display weekdays to an API that requires lowercase weekday values. `LocalSettingsPage.save` now sends lowercase values; the journey asserts the exact PUT payload and saved time/timezone after reload. Legacy test locators now open the Reminder handoff group, use the current Target outcome label, explicitly import the selected replacement proposal, check current approval copy, and close the success dialog before inspecting retired history. Focused run: `.local/e2e/digital-coach-1790194284253-34924/results/local.json` (1 pass, 0 fail/skip, exit 0).

| Exact command | Mode, fixture and viewport | Result / process exit | Artifact |
|---|---|---|---|
| `npx playwright test --config playwright.config.ts` from `apps/web` | Local Chromium, one worker, isolated real SQLite/snapshot/vault/exchange; 320–1440 CSS px | 30 pass, 0 fail/skip, exit 0 | `.local/e2e/digital-coach-1790195549819-32808/results/local.json` |
| `npx playwright test --config playwright.home.local.config.ts` from `apps/web` | Seeded Home snapshot, Chromium, one worker, contract CSS widths | 15 pass, 0 fail/skip, exit 0 | `.local/e2e/digital-coach-1790195044974-39964/results/home-local.json` |
| `npx playwright test --config playwright.readiness.local.config.ts` from `apps/web` | Seeded readiness snapshot, Chromium, one worker, contract CSS widths | 5 pass, 0 fail/skip, exit 0 | `.local/e2e/digital-coach-1790195115383-44760/results/readiness-local.json` |
| `npx playwright test --config playwright.online.config.ts` from `apps/web` | Online API fixtures, Chromium, one worker, responsive/all-route axe | 43 pass, 0 fail/skip, exit 0 | `.local/e2e/digital-coach-1790195153453-54824/results/online.json` |
| `npx playwright test --config playwright.auth.config.ts` from `apps/web` | Owner-auth fixtures, Chromium, one worker, including 390px sign-in | 3 pass, 0 fail/skip, exit 0 | `.local/e2e/digital-coach-1790195424107-38392/results/auth.json` |
| `npm test --workspace @racepredictor/web`; `npm test --workspace @racepredictor/core`; `npm run typecheck --workspace @racepredictor/web`; `npm run lint --workspace @racepredictor/web`; `npm run build --workspace @racepredictor/web` | Local unit/type/build; build after browser servers stopped | 136/136 and 90/90 unit pass; typecheck, lint and build exit 0 | `.local/evidence/f10-final-20260923-230931/` (one named log per command) |
| `npm run db:test:local-activities`, `db:test:local-import`, `db:test:local-coaching`, `db:test:local-analytics`, `db:test:local-pipeline`, `db:test:local-sync`, `db:test:cloud` with `--workspace @racepredictor/db`; `node --no-warnings --experimental-strip-types --test packages/db/test/local-activity-review.test.js` | Local persistence and cloud-adapter fixtures | 2, 5, 7, 1, 3, 15, 66 and 3 pass respectively; all exit 0, no fail/skip | `.local/evidence/f10-db-20260923-223209/` |
| `npm run test:e2e:local --workspace @racepredictor/web` | Sequential general/Home/readiness with unique fixture/report paths and port preflight | **Infrastructure FAIL:** general local displayed 30/30 passing but shutdown hung before JSON reporting or later configurations; interrupted, exit 1. Reproduced through Node, PowerShell-child and direct npm chaining, including a temporary direct-Next server launch that was then reverted. | `.local/e2e/aggregate-1790194438990-56736-0/`, `.local/e2e/aggregate-1790195853472-33544-0/`, `.local/e2e/aggregate-1790196381457-18796-0/`, `.local/e2e/aggregate-1790196809952-38216-0/`, `.local/e2e/digital-coach-1790197298478-33492/`, `.local/e2e/digital-coach-1790198063301-44376/`; no completed JSON from these attempts |

Configuration reassignment explains the count change without a lost case: the historical 50-case local suite (35 pass/15 fail) is now 30 general + 15 seeded Home + 5 seeded readiness. The earlier 30-case 16-pass/14-fail report is superseded by the clean direct 30-case run; online remains 43 cases. The aggregate shutdown is an open test-infrastructure defect, so the aggregate process-exit gate is not met. The earlier F05 heading-order and F07 conflict-focus defects are superseded by current initial-state all-route axe and conflict tests. Expanded-dialog/disclosure axe scans remain an automated coverage gap. `lint` and `typecheck` both run `tsc --project tsconfig.typecheck.json --noEmit`, so they are not independent lint evidence.

Human/live checklist (not performed): QA/accessibility should record real browser-controlled 200% zoom with visible zoom indicator, screenshots, overflow and focus; then separately exercise screen reader, switch control and software keyboard through all six routes and dialogs. Product/QA should ask an unfamiliar runner to explain outlook evidence, review limits and next action without prompting, recording the response. Owner/integration QA should exercise real OAuth cancellation/reconnection and provider persistence in a safe account, recording redirects and state without consequential plan changes. The release owner should run authenticated deployed navigation, anonymous access controls and deployment smoke with environment and revision recorded. CSS viewport proxies, device scale factor and compilation do not satisfy these gates; no live-account action or deployment occurred here.

## Release-readiness execution — 2026-09-24

**Automated verdict: PASS. Overall release verdict: NOT APPROVED pending human and live-environment gates.** The required local, online-fixture and owner-auth Playwright configurations now complete with clean process exits. Final unit, type/lint, database and production-build checks also pass. The previous 2026-09-23 aggregate shutdown report is superseded: on this Windows host, Playwright's child-server cleanup required the elevated local process rights used for the final aggregate run. No runner code change was needed for that environment limitation.

### Final F05 fixes

Expanded axe coverage exposed additional real heading-order defects. Plan-history workout titles now use level 3 beneath the level-2 history heading. Plan activation and Calendar detail, edit and amendment dialog titles use level 2; shared activity detail/review content accepts an internal heading level so Calendar's nested activity content steps down consistently. CSS preserves the existing text sizes. The Home local server snapshot now contains schema-valid 5K/10K prediction options so its actual prediction-settings disclosure renders. The shared axe helper reports violation IDs, impact, affected selectors and failure explanations. Initial pages, expanded disclosures across all six redesigned routes, the Home prediction disclosure, approved Plan history, Calendar detail/amendment and Plan conflict dialogs are scanned; all write-free disclosure journeys assert zero application API writes.

### Exact final evidence

Source under test: Windows workspace at base commit `0c5f5022b5b7cd600ade662b32907259f131c89c`, dirty source/E2E working tree (13 changed/untracked paths during final test execution, including temporary Next-generated `tsconfig.json` entries, later restored). The tests ran on the same tree before it was retained on branch `codex/release-readiness-2026-09-24`; no source commit was made for this follow-up. Playwright used Chromium, one worker, isolated per-run output; viewport cases include 320, 375, 390, 414, 767, 768, 1024, 1199, 1200 and 1440 CSS px. Final JSON reports show zero unexpected, flaky or skipped tests.

| Exact command | Fixture/mode | Result and artifact |
|---|---|---|
| `npm run test:e2e:local --workspace @racepredictor/web` | Aggregate sequential general local with isolated SQLite/snapshot/vault/exchange, dedicated seeded Home, dedicated seeded readiness; checked ports and stopped each local server. | Exit 0. General 32/32: `.local/e2e/digital-coach-1790232293317-20564/results/local.json`; Home 16/16: `.local/e2e/digital-coach-1790232594622-4140/results/home-local.json`; readiness 5/5: `.local/e2e/digital-coach-1790232664574-50012/results/readiness-local.json`. |
| `$env:RACEPREDICTOR_E2E_RUN_ID='release-readiness-20260924-online-final2'; npm run test:e2e:online` from `apps/web` | Online API fixture mode; responsive matrix, six route axe coverage, Plan and Calendar flows. | Exit 0; 44/44; `.local/e2e/release-readiness-20260924-online-final2/results/online.json`. |
| `$env:RACEPREDICTOR_E2E_RUN_ID='release-readiness-20260924-auth-final2'; npm run test:e2e:auth` from `apps/web` | Owner-auth test fixtures, protected redirects, 390px sign-in and anonymous fail-closed API checks. | Exit 0; 3/3; `.local/e2e/release-readiness-20260924-auth-final2/results/auth.json`. This is not deployed owner-auth evidence. |
| `npx playwright test --config playwright.online.config.ts --grep 'online Plan selects|online Calendar saves a reasoned amendment|online Plan keeps a conflict|F05 scans expanded disclosures'` from `apps/web` | Focused modal heading and all-route expanded-disclosure regressions. | Exit 0; 4/4; `.local/e2e/release-readiness-20260924-a11y-dialogs-final/results/online.json`. |
| `npm test --workspace @racepredictor/web`; `npm test --workspace @racepredictor/core` | Local unit tests on the final source tree. | 136/136 and 90/90, exit 0. `.local/evidence/release-readiness-20260924-final/web-unit.log`, `core-unit.log`. |
| `npm run typecheck --workspace @racepredictor/web`; `npm run lint --workspace @racepredictor/web` | Local TypeScript validation. | Both exit 0. `lint` runs the same `tsc --project tsconfig.typecheck.json --noEmit` command and is not independent lint evidence. Logs: `.local/evidence/release-readiness-20260924-final/web-typecheck.log`, `web-lint.log`. |
| `npm run db:test:local-activities`, `db:test:local-import`, `db:test:local-coaching`, `db:test:local-analytics`, `db:test:local-pipeline`, `db:test:local-sync`, `db:test:obsidian`, `node --no-warnings --experimental-strip-types --test packages/db/test/local-activity-review.test.js`, `db:test:cloud` with their recorded `--workspace @racepredictor/db` arguments | Local repository/import and cloud-adapter fixtures; no configured live database. | Respectively 2, 5, 7, 1, 3, 15, 1, 3 and 66 tests; all exit 0. Logs and exit summary: `.local/evidence/release-readiness-20260924-final/db-*.log`, `summary.csv`. |
| `npm run build --workspace @racepredictor/web` | Production Next build after Playwright servers stopped. | Exit 0; `.local/evidence/release-readiness-20260924-final/web-build.log`. |

`db:test:contracts` was not part of the required passing suite and remains environment-blocked: `DATABASE_URL` is unset; its earlier check failed fast before database access. Run it only after a non-production database is explicitly provisioned. The earlier 2026-09-24 local axe attempt retained its Plan-history `heading-order` screenshot and trace at `.local/e2e/digital-coach-1790230642401-23772/test-results/`; the first online pass retained Plan/Calendar dialog and missing-Plan-fixture traces under `.local/e2e/release-readiness-20260924-online-final/`. These are superseded by later passing runs, not removed. The final reruns have separate JSON paths and no retries.

### QA and live obligations

Automated route-level axe and responsive viewport checks are complete for the exercised cases. Ticket 13 and release approval remain **IN PROGRESS / NOT APPROVED** because no unfamiliar runner, screen reader, switch control, software keyboard, or verifiable browser-controlled 200% zoom check has been performed. Real OAuth cancellation/reconnection and provider persistence, authenticated deployed navigation, anonymous deployed access controls and deployment smoke are also outstanding. Viewport scaling is not browser zoom evidence. No live-account changes or deployment occurred during this work.

The final matrix totals have been recomputed from its 87 checklist rows. Partial accessibility rows remain `IN PROGRESS`; none was marked pass from axe alone. See the 2026-09-24 entry in `docs/progress/race-predictor-redesign-qa-matrix.md` and the Ticket 13 reconciliation in `docs/design/REDESIGN_IMPLEMENTATION_BACKLOG.md`.

## Owner-approved production release and F10 live follow-up — 2026-09-24

**Decision and outcome.** The owner explicitly completed release approval and authorized merge/deployment on 2026-09-24. `origin/main` was fetched and matched the validated local `main`; there were no merge conflicts. The redesign/release-readiness commit `65795f3675e8d16d65207ebbd6fb70393018a04a` was pushed and deployed first. An authenticated, read-only production walkthrough then reproduced three context-return defects: F04/F02 Home → Training detail lost its Home focus destination after a telemetry disclosure; F08 readiness → Data Quality had no return before an import; and F02 Home → Calendar browser Back left focus on the document. Each received a focused browser regression and a minimal product fix. The final hotfix branch `codex/live-home-return-focus-2026-09-24` was committed as `52a641f0f66bb3adf280782923a7431745d57eca`, fast-forward merged into `main`, and pushed to `origin/main`. The code-bearing Vercel production deployment `dpl_Ekouxiwoj7RoXVvPh3EtGXdZdy31` is READY at `https://racepedictor.vercel.app` and reports that exact SHA. The earlier READY deployment `dpl_GvCz4XkDEDgZngahiSthPuScW45v` and its evidence remain historical, superseded by the hotfix revision. A later documentation-only main commit can create another Vercel deployment without changing the tested application code.

The hotfix changes only Home/Training/Data Quality presentation and regression tests. It does not change public APIs, database schemas, migrations, prediction behavior or approval authority. The first two focused failures and their retained artifacts are `.local/e2e/live-return-focus-red/` and `.local/e2e/live-readiness-return-red/`; their matching green assertion runs are retained separately. The Calendar browser-Back red test exited 1 with screenshot/trace at `.local/e2e/live-calendar-return-red-20260924/`; its green rerun exited 0 at `.local/e2e/live-calendar-return-green-20260924/`. The complete final suites below supersede these focused runs. Earlier sandboxed focused processes that stalled while stopping a Next child were interrupted and are not counted as clean exits; the full suites used the Windows process rights needed for clean shutdown.

### Postdeployment automated evidence

All final checks ran after the READY production deployment on 2026-09-24 from the same Windows source commit `52a641f`, with a clean tracked working tree at start. Next temporarily rewrote tracked `next-env.d.ts`/`tsconfig.json` during isolated runs; those generated changes were restored, and the isolated build output was removed after the successful build. Chromium used one worker. Responsive browser coverage includes 320, 375, 390, 414, 767, 768, 1024, 1199, 1200 and 1440 CSS px. Every JSON report records zero unexpected failures, flakes and skips. The online Next development server emitted one closed-stream warning during rapid responsive navigation; that case passed and the process exited 0. It is not production runtime-error evidence.

| Exact command | Environment / fixture | Result, exit and artifact |
|---|---|---|
| `npm run test:e2e:local --workspace @racepredictor/web` from repo root | Sequential isolated local SQLite/snapshot/vault/exchange, dedicated seeded Home and readiness snapshots; Chromium, one worker; contract CSS widths | Exit 0: general 32/32 at `.local/e2e/digital-coach-1790241717867-19288/results/local.json`; Home 17/17 at `.local/e2e/digital-coach-1790241994115-51132/results/home-local.json`; readiness 6/6 at `.local/e2e/digital-coach-1790242066776-27856/results/readiness-local.json`. |
| `$env:RACEPREDICTOR_E2E_RUN_ID='live-postdeploy-online-20260924'; npm run test:e2e:online` from `apps/web` | Online API fixtures; Chromium, one worker; all six redesigned routes, expanded axe, dialogs, width boundaries, recovery and decision flows | Exit 0: 46/46; `.local/e2e/live-postdeploy-online-20260924/results/online.json`. |
| `$env:RACEPREDICTOR_E2E_RUN_ID='live-postdeploy-auth-20260924'; npm run test:e2e:auth` from `apps/web` | Owner-auth fixtures, protected redirects, compact sign-in, anonymous fail-closed API | Exit 0: 3/3; `.local/e2e/live-postdeploy-auth-20260924/results/auth.json`. Fixture auth is distinct from the live owner session below. |
| `npm test --workspace @racepredictor/web`; `npm test --workspace @racepredictor/core`; `npm run typecheck --workspace @racepredictor/web`; `npm run lint --workspace @racepredictor/web` | Local unit and TypeScript checks on the final source tree | Exit 0 each: web 136/136; core 90/90; typecheck/lint pass. `lint` invokes the same TypeScript check and is not independent lint evidence. `.local/evidence/live-postdeploy-20260924/{web-unit,core-unit,web-typecheck,web-lint}.log`. |
| `npm run db:test:local-activities`, `db:test:local-import`, `db:test:local-coaching`, `db:test:local-analytics`, `db:test:local-pipeline`, `db:test:local-sync`, `db:test:obsidian`, `db:test:cloud` with `--workspace @racepredictor/db`; `node --no-warnings --experimental-strip-types --test packages/db/test/local-activity-review.test.js` | Isolated local repository and cloud-adapter fixtures; no live database mutation | Exit 0 each: 2, 5, 7, 1, 3, 15, 1, 66 and direct activity-review 3 passes; `.local/evidence/live-postdeploy-20260924/db-*.log`. |
| `$env:RACEPREDICTOR_NEXT_DIST_DIR='.next-live-postdeploy-validation-20260924'; npm run build --workspace @racepredictor/web` | Production Next build after every Playwright server stopped | Exit 0; `.local/evidence/live-postdeploy-20260924/web-build.log`. |

The prior final predeployment checks on the same hotfix commit also exited 0 (55 local, 46 online, 3 auth; units/database/type/build) with separate artifacts under `.local/e2e/live-final-*`, `.local/e2e/digital-coach-1790238526411-1324/`, `.local/e2e/digital-coach-1790238811592-45600/`, `.local/e2e/digital-coach-1790238883779-49020/` and `.local/evidence/live-final-20260924/`. The count increase from the older 53-case local/44-case online evidence is two new Home/Calendar and readiness regression scenarios reassigned to seeded Home/readiness plus their online equivalents; no prior scenario was removed.

### Live production smoke and Product Owner walkthrough

Vercel's deployment record confirms READY, production alias and commit. Anonymous requests to `/dashboard` and a protected Training deep link returned 307 to `/login`; `/login` returned 200; `/api/v1/activities` returned 401; `/api/v1/auth/session` returned `authenticated:false`. Vercel grouped runtime errors in the checked one-hour window: none. In the existing authenticated owner session, an agent-led **read-only** walkthrough at 390 CSS px covered Home outlook/review/next action → latest Training detail and optional telemetry → Home return; Home readiness and supplied trend units/period → Data Quality before import → readiness return; keyboard Enter on Home's View session → approved Calendar detail → browser Back; Plan active/history; and Settings connection, pairing and operational disclosures. The three repaired returns restored their exact launchers' focus. The app showed one H1 and no document overflow on inspected 390px routes, Agenda at 1024px, Weeks at 1440px, and no browser console errors. Detailed observations are preserved at `.local/evidence/live-postdeploy-20260924/owner-journey.md`. No consequential live-account write was submitted merely to prove the flow.

**Evidence boundary.** Owner release approval is recorded; it does not convert unperformed checks into QA passes. Browser-controlled 200% zoom, screen-reader, switch-control and software-keyboard journeys; independent unfamiliar-runner comprehension; real OAuth cancellation/reconnection and provider persistence; and a deployed live write/confirmation exercise remain outstanding with QA/accessibility, Product/QA, integration QA and the release owner respectively. Settings still displays its operational reminder to revalidate provider-plan ceilings; that external limit review was not performed in this run. `DATABASE_URL` remains unset locally, so `db:test:contracts` was not run against a non-production database. The final release is live with these evidence limits explicitly retained in the QA matrix and Ticket 13 backlog.
