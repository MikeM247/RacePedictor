# Race Predictor redesign retrospective

13 September 2026 · Based on the recorded redesign, implementation and review cycles through the 13 September review.

**The design direction was clear, and several improvements worked. The main delivery failure was treating implementation activity and technical checks as stronger evidence of a finished user experience than they were.** Requirements for states, navigation, action priority and recovery existed, but were not consistently demonstrated before completion claims were made. Repeated broad repair passes consequently left parts of F01–F10 open.

This retrospective examines the delivery process. It does not perform a new product review, close defects, or assess any subsequent Astra implementation. The latest recorded release verdict remains **Fail — rework required**. Observations below are supported by project records; causal explanations are identified as interpretations where the records cannot establish them directly.

## What worked

| What worked | Evidence | What to retain |
|---|---|---|
| A clear, binding product contract | The contract specifies the runner's questions, three Home groups, three primary destinations, one primary action per active step, truthful uncertainty and explicit approval boundaries. | Keep a short authoritative contract. Resolve implementation choices against it rather than the old UI. |
| A concrete backlog and QA matrix | Tickets include acceptance criteria and test cases. The matrix already calls for failed reads, pending reviews, partial imports, conflicts, contextual return and responsive checks. | Keep traceability from requirement to implementation to evidence. The missing part was enforcement, not another set of requirements. |
| Stable product boundaries | Reviewed flows retain explicit plan approval and advisory commentary. Current-fitness estimates are qualified rather than presented as unsupported race-date guarantees or probabilities. | Preserve domain authority and truthful limitations during visual changes. |
| Structural simplification | Home / Training / Plan navigation, Calendar under Plan and Home's three-group order survived the redesign. | Build around the runner's purpose and reduce default choices. |
| Targeted browser investigation | Controlled probes exposed no-plan handling, file-success source switching, modal errors and disappearing activity detail. Screenshots and actual focus/control measurements made these findings concrete. | Use failure fixtures and complete interactions early, alongside source inspection. |
| Some repairs held under fresh checks | On 13 September, queued Home review displayed correctly; 320px filters stayed within bounds; 1024px Training Back restored row focus; Calendar's information target measured 44×44px with an inert dialog background. | Preserve these as regression cases. Do not reopen verified behavior merely because its larger F item remains incomplete. |
| Technical validation provided a useful baseline | A previous 96-test unit run and production build passed; current typechecking passed during the 13 September review. | Retain these checks for their actual scope. They establish technical properties, not overall UX acceptance. |
| Reviews eventually corrected optimistic reporting | Later reports superseded the implementation-only claim that only verification remained. The Astra handoff preserves stable F identifiers and concrete work. | Correct the record promptly and keep a single clearly identified current verdict. |

Sources: [contract](../design/DESIGN_INTENT_CONTRACT.md), [backlog](../design/REDESIGN_IMPLEMENTATION_BACKLOG.md), [QA matrix](race-predictor-redesign-qa-matrix.md), [13 September review](race-predictor-design-intent-review-2026-09-13.md).

## What did not work

### 1. “Implemented” and “verified” became blurred

The 12 September implementation re-review said the remaining requirements were verification evidence rather than known product drift, although amended browser cases had not run. Subsequent browser checks found concrete product failures. The QA matrix also marked first-plan/stage and source/return criteria PASS while later evidence contradicted those outcomes.

The issue was not that typechecking or unit tests were unhelpful. Their results were used to support claims outside their demonstrated scope. A source branch that retains an active plan in state does not prove that the JSX still displays it. A list of stage labels does not prove that every stage is reachable.

**Prevention:** separate implementation status from validation status. Use “Implemented — awaiting verification” until the exact acceptance behavior passes. Attach evidence to the claim, not merely to the ticket.

### 2. Repairs targeted local symptoms without covering the full state transition

Several persistent errors were related failures within the same requirement, rather than an identical line of code remaining untouched.

| Finding | Recorded progression | What the progression reveals | Preventive check |
|---|---|---|---|
| F03: review state | Missing summaries initially implied pending; later they implied no request. The activity-specific endpoint finally allowed the queued case to pass. | An absent summary cannot establish the underlying request state. Copy changes could not fix a data-selection problem. | Fixture every supported review status using the actual response schema; keep missing/error distinct. |
| F06: active plan | Failure originally became no plan. Later, errors were explicit, but normal `404 NOT_FOUND` caused an early return before draft/history reads. Prior data was kept in state but hidden in rendering. | The state model did not fully distinguish normal absence, independent reads and stale-but-usable content. | Test no plan plus saved draft; failed active read plus available history; refresh failure after a loaded plan. |
| F07: confirmation | Focus/inert/pending behavior improved, but an approval error remained outside the modal. | Making the background correctly inert exposed that actionable feedback belonged to the wrong interaction surface. | Submit a controlled failure while the dialog is active; assert visible/announced error, focus, retry and cancel within it. |
| F08: import | File/source ownership improved for selection and pending work, but a completed file result selected the Strava render branch. | The happy path was not followed through to its final screen. | After success, assert selected source, visible controls, result meaning and the single next action. |
| F04: activity detail | Delayed-list selection and medium-width Back improved, but an empty filter result still removed detail and Back. | Detail rendering remained coupled to the surrounding list state. | Open detail, then make the list empty or fail; verify the record and return path remain usable. |
| F05: responsive controls | Detail replacement moved to the contract's breakpoint before Back visibility followed; narrow date-field defects also needed a later pass. | Related controls used inconsistent layout assumptions. | Exercise the whole interaction on both sides of each breakpoint, not just page overflow. |

These mechanisms are supported by the [original review](race-predictor-design-intent-review-2026-09-12.md), [re-review](race-predictor-design-intent-rereview-2026-09-12.md), [post-fix review](race-predictor-design-intent-postfix-review-2026-09-12.md), and [13 September review](race-predictor-design-intent-review-2026-09-13.md).

### 3. Visible components stood in for finished workflows

Plan had stage labels without a complete staged interaction. Settings had one expanded group but multiple competing workflows within that group. Data Quality had source controls without complete affected-task and return-context recovery. Readiness displayed a driver label and feature points without fully explaining their identities and meaning.

**Interpretation:** delivery checks emphasized whether requested UI elements existed more than whether the runner could complete the intended task. This is a process inference from the recurring defects, not a claim about an implementer's intentions.

**Prevention:** define acceptance as actions and outcomes: “Publish context, leave, return, resume, import, review, confirm,” rather than “show five stages.” Define “one primary action” on each rendered state, including completion and failure.

### 4. Verification was deferred and fragmented

The records include a broad E2E run with 14 passes and 5 failures, narrower reruns, unexecuted amended specifications and useful ad hoc browser probes. These are different evidence sets. A focused pass cannot automatically clear failures in a different journey or environment.

Some assertions had become obsolete, including removed confidence wording and a mobile Weeks control intentionally hidden by the redesign. One initial activity-detail probe used an incomplete fixture; its timeout was correctly excluded as a product defect after correction. These examples show why failure classification matters in both directions.

**Prevention:** classify each failure as product, fixture, obsolete expectation or environment, with evidence. Fix invalid fixtures without weakening the contract. Promote confirmed browser reproductions into maintained regression tests.

### 5. The test environment was not consistently reproducible

Earlier checks encountered server/port problems. During the later review, directly invoking Next's default development command selected Turbopack and failed against the repository's webpack configuration. The repository's `npm run dev` already specifies webpack; explicitly using webpack resolved that attempt. Local and online fixtures also differ, and browser API mocks do not necessarily replace server-rendered initial data.

These are verification workflow issues. They explain failed attempts, but they do not justify an optimistic product verdict while behavioral checks are unavailable.

**Prevention:** use one documented command per local/online test mode; verify the server's mode and fixture identity before testing; isolate ports, output and test data per run; shut down only processes owned by that run. Capture logs and explicit environment information with results.

### 6. Broad scope and competing status records made closure harder

The workspace contains redesign changes alongside coaching, review, sync, API and database work. That is an observed attribution risk, not proof that unrelated work caused the UX defects. Multiple review files, backlog completion notes and matrix statuses also required supersession notices to establish the current truth.

The conversation repeatedly requested completion and then another review. Some implementation improved, but the user still had to request continuation and eventually a separate handoff. Assistant delivery contributed to this: broad completion language and repeated review cycles did not reliably produce closure of each required behavior.

**Prevention:** implement bounded slices with a reproducible before/after case and an identifiable checkpoint. Keep one current defect register; historical reviews remain evidence, not competing status authorities. A scope change or interruption should leave explicit implemented/verified/remaining status, never imply the whole batch is complete.

### 7. Product comprehension remained an unclosed gate

The contract calls for a runner to understand the outlook, latest-session meaning, material caveat and next action. The latest record still lacks the required comprehension observation. Screenshots show hierarchy and clipping; automated assertions show behavior; neither establishes what a runner actually understood.

**Prevention:** schedule the comprehension check when the first complete Home slice exists, then repeat after material copy or hierarchy changes. Record what the tester understood without prompting them with the intended answer.

## Why the errors persisted

The strongest supported explanation is a weak closure loop:

1. A broad finding described several related behaviors.
2. An implementation pass changed some of them.
3. Source inspection or technical checks supported a broad completion statement.
4. Uncovered combinations remained: empty plus selected detail, file success plus connected provider, normal absence plus saved draft, error plus active modal.
5. A later journey review rediscovered the unfinished requirement.

The recurring defects were largely at boundaries between state, data and interaction ownership. They did not require more decorative design direction. They required explicit state contracts and validation of the runner's full task.

The records do **not** establish that one model caused the problem or that changing from Luna to Astra will resolve it. Model choice may affect execution, but cannot replace bounded scope, faithful fixtures, evidence-based closure and an independent review pass. Nor do the records support blaming user steering or an individual contributor for the entire outcome.

## Changes to adopt for the next implementation cycle

Owners below are proposed roles, not assignments already made or approvals already granted.

| Priority / timing | Action | Proposed owner | Observable completion criterion |
|---|---|---|---|
| P0 — before the next fix | Establish one current F01–F10 register with separately tracked acceptance cases, implementation status and validation status. | Delivery owner | Every open item has a reproduction, expected result, evidence link and next action. |
| P0 — first slice | Convert the no-plan, modal-503, file-success and empty-list/detail probes into maintained regression cases. | Implementer + QA | Each test fails for the known defect and passes after its targeted fix. |
| P0 — each stateful slice | Write a short state/transition table including independent data sources, prior content and exit behavior. | Implementer | Empty, error, pending, success and conflict transitions have explicit UI outcomes. |
| P0 — each fix | Complete one coherent journey before starting another broad polish pass. | Implementer | Before/after evidence exists for all acceptance cases in that slice. |
| P0 — before closure | Run a separate review pass against the contract and attempted failure cases. A second person or agent is optional; distinct verification is mandatory. | QA/reviewer | Reviewer can reproduce the result without relying on the implementer's narrative. |
| P0 — before release | Resolve failing checks; explicitly record blocked or unperformed checks and any authorized exception. | Delivery owner | No unqualified PASS contains known failed mandatory criteria or missing required evidence. |
| P1 — with fixture work | Use contract-valid fixture factories and explicit local/online modes. | Test owner | Fixtures validate against DTO schemas; test startup confirms the intended mode. |
| P1 — with affected UI work | Consolidate shared return-context, dialog-status, action-priority and breakpoint behavior where it reduces repeated defects. | UI implementer | Regression tests cover all consumers; avoid a speculative rewrite of unrelated code. |
| P1 — first complete Home slice | Run the required comprehension observation and focused accessibility checks. | UX/QA with a runner | Record observed interpretation, keyboard/assistive behavior and resulting defects. |
| P1 — every validation run | Record revision/checkpoint, working-tree scope, command, environment, fixture, viewport and result. | Test runner | Another reviewer can repeat the run and distinguish historical results from current evidence. |

## A practical delivery loop

Use the no-plan defect as the first example:

1. **Reproduce:** active-plan endpoint returns documented `404 NOT_FOUND`; latest proposal contains a saved draft.
2. **Specify:** show no active plan, load the draft and history independently, and provide one resume action. A service failure must have different copy and recovery.
3. **Implement:** repair request classification and rendering ownership without changing plan authority.
4. **Verify neighboring cases:** active plan, no plan/no draft, failed active read, failed draft read, and refresh failure after a plan is visible.
5. **Review the journey:** open the draft by keyboard, verify the current stage and action priority, leave and resume, and confirm reading has not activated anything.
6. **Close only the proven cases:** update evidence and status together. Proceed to the next slice with a stable checkpoint.

Apply the same loop to approval failure, import completion and selected-detail persistence. After a defect recurs, stop making another broad patch: identify the missed transition, add the reproducer and verify that transition first.

## Definition of done for future redesign slices

- The runner's task completes from entry through outcome, recovery and return where applicable.
- Every applicable contract criterion has direct evidence; existing technical checks pass for the change's scope.
- Important states are distinct and truthful; independent reads do not remove useful unrelated content.
- The active surface has appropriate action priority, visible material caveats and usable keyboard behavior.
- Relevant compact/medium/wide boundaries pass, including active detail or dialog states.
- Regression tests cover the exact repaired failure and meaningful adjacent cases.
- Evidence identifies the tested version/environment; unperformed human or deployment checks remain explicit.
- The backlog, defect register and current review agree on what is complete.

Avoid requiring every possible test for every small change. Use targeted coverage for each slice, followed by the full required release checks once the combined implementation is stable. Repeatedly running unrelated suites cannot substitute for a missing journey assertion.

## How to tell whether the process improves

Track these from the next slice; the current records do not support a reliable numeric baseline:

- **Reopened defects:** count findings marked verified that recur; record the missed acceptance case.
- **Evidence completeness:** every closed mandatory criterion has a reproducible passing result.
- **Unresolved failures at handoff:** list every failed or blocked check; target zero unexplained failures.
- **Time to reproducible browser evidence:** distinguish environment setup time from product repair time.
- **Comprehension outcome:** can the runner identify the assessment, limitation and next action without prompting?

## Recommended next action and delivery confidence

Use the [Astra implementation handoff](race-predictor-astra-implementation-handoff.md) with the closure rules above. Start with the normal no-plan/saved-draft journey, then approval failure, file-result ownership and independent Training detail. These provide concrete, high-value proofs before returning to broader hierarchy and copy work.

**Confidence in the diagnosis: high** for the observed completion/evidence mismatch and repeated state-boundary defects. **Confidence in release readiness: low** until the required fixes and remaining checks are demonstrated. This retrospective changes no product code or release status; no new build or browser test was needed for this documentation-only analysis.

## Evidence references

- [Design Intent Contract](../design/DESIGN_INTENT_CONTRACT.md): product purpose, state truthfulness, interaction ownership and release requirements.
- [Implementation Backlog](../design/REDESIGN_IMPLEMENTATION_BACKLOG.md): acceptance criteria, completion notes and verification sequencing.
- [QA Matrix](race-predictor-redesign-qa-matrix.md): PASS/IN PROGRESS claims, recorded test counts and uncompleted release checks.
- [Original 12 September review](race-predictor-design-intent-review-2026-09-12.md): initial F01–F10 findings.
- [12 September re-review](race-predictor-design-intent-rereview-2026-09-12.md): historical implementation claims and supersession notice.
- [Post-fix review](race-predictor-design-intent-postfix-review-2026-09-12.md): remaining product defects after claimed repairs.
- [13 September review](race-predictor-design-intent-review-2026-09-13.md): fresh narrow passes, reproduced blockers and validation limits.
- [Web package scripts](../../apps/web/package.json) and [online Playwright configuration](../../apps/web/playwright.online.config.ts): webpack command and fixture-server setup.
