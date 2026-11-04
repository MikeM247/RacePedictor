# Milestone completion, result reconciliation and race-result recognition

1 November 2026 · Africa/Johannesburg · Product requirements for architecture planning

Status: proposed product plan based on the owner's reported Oldies and Verulam experience and requested confirmation flow. This is an input to the architect's implementation plan; application changes and live record repairs have not been performed.

## 1. Outcome and delivery order

When an athlete records a race result, the application should connect it to the intended planned milestone, show one completed race with the original target and achieved result, and advance Home to the next eligible goal. An automatic review dialog should help the athlete confirm a likely match when they first return after a race or when a result becomes available. The same reconciliation must remain available from the milestone itself.

Deliver correctness first, then proactive usability. Phase 1 must work independently of the automatic dialog. Do not make a visual redesign a prerequisite for fixing completion.

This plan extends the [milestone Home BRD](BRD.md) and the existing Settings-owned milestone management described in [ADR 0011](../../adr/0011-settings-owned-milestone-timeline.md). Preserve its distinction between approved targets, saved results and membership relationships. The new automatic surface proposes a relationship; the athlete confirms the change. Architecture should document any amendments to the existing ADR, particularly official-result assessment and the new confirmation entry point.

## 2. Current behaviour and evidence

Source inspection establishes:

- Planned targets, confirmed achievements and timeline links are distinct records. A saved achievement is not necessarily linked to a planned target.
- Automatic composition requires a recognised target ID or alias and matching race facts. Explicit same-race linking can reconcile identity despite different facts.
- Numeric target assessment requires matching race dates, official distances within one metre and an elapsed result. A confirmed identity link alone does not establish target success.
- Selecting an activity currently copies measured activity distance and elapsed time into the result editor. The athlete must review these as official-result facts; a GPS distance can leave assessment unresolved.
- Home chooses its next goal from unresolved current/future targets. An uncombined same-day target therefore remains eligible even when its achievement is already visible.
- A PB or user-confirmed achievement can coexist with an unassessed planned target. Those are different facts, but the presentation does not explain the unresolved assessment adequately.

The screenshots show Oldies twice: a completed 59:23 result and a separate Sub-60 target still promoted on 1 November 2026. Verulam shows a completed 2:02:09 result with a PB badge and an unassessed target. The exact stored-link or source-fact cause has not been verified against live records. Verulam's original target outcome cannot be inferred from the screenshot.

Relevant implementation areas:

- `packages/core/src/services/milestone-timeline.ts`: composition, linking and performance assessment.
- `packages/core/src/services/home-milestones.ts`: next-goal selection and status labels.
- `packages/core/src/services/race-journey.ts`: target extraction and time comparison.
- `apps/web/components/dashboard/milestone-achievement-editor.tsx`: result capture and activity selection.
- `apps/web/components/dashboard/milestone-manager.tsx`: manual link/unlink and result management.
- `apps/web/lib/server/race-history.ts`: trusted target snapshots and result persistence.

Existing focused tests were attempted during the evaluation but could not execute because the workspace lacked `zod`. No passing runtime verification is claimed.

## 3. Required product model

| Dimension | Required meaning |
| --- | --- |
| Race identity | The saved result belongs to this exact event edition and milestone. |
| Completion | A confirmed result establishes that the race was completed, independently of whether the time target was met. |
| Target outcome | Achieved, missed, not set, or unable to assess with a specific reason. |
| Personal best | A separate explicitly confirmed claim; do not infer it from an incomplete activity history. |
| Review status | A proposed match awaits confirmation, is deferred/rejected, or has been confirmed. It is distinct from race completion. |

Use one visible milestone after reconciliation, preserving source identities and the approved target snapshot. Show event/date, official distance where known, result, original target, outcome and PB where supported. Keep the race image attached through reconciliation and honour existing explicit image-conflict choices.

Do not silently replace missing official facts with planned facts. Distinguish recorded GPS distance from official race distance, and activity elapsed/moving time from the athlete-confirmed result time. A GPS discrepancy must not prevent proposing or confirming race identity. If official facts remain insufficient, complete the confirmed race but explain why its numeric target cannot yet be assessed.

Preserve existing strict semantics: a Sub-60 target requires less than 60:00; exactly 60:00 misses it. Inclusive targets may allow equality. Architecture should make this criterion explicit and preserve historical semantics rather than depending only on editable display text.

## 4. Evaluation triggers and eligibility

Evaluate only the signed-in athlete's verified approved milestones, saved achievements, recorded running activities and existing decisions.

| Trigger or condition | Required behaviour |
| --- | --- |
| First successful authenticated application load after sign-in, including return after several days | Evaluate unresolved milestones dated today or earlier in the athlete's timezone once required data is available. This is not limited to the account's first-ever login. |
| Result saved/edited or activity sync completes while the app is open | Re-evaluate affected milestones without requiring logout or reload. |
| App returns to focus or the athlete's local date changes | Refresh and re-evaluate; suppress unchanged prompts using persisted review decisions. |
| Race date arrives but no usable result exists | Keep race-day context; offer Record result. Do not congratulate, mark complete, or declare the target missed. |
| Race date passes without a usable result | Show Result pending with Record result / Align result. Absence of a recorded activity is not evidence of failure. |
| Historical unresolved race/result discovered on a later visit | Include it in review; do not impose a cutoff that silently loses overdue milestones. |
| Required reads unavailable or stale | Retain verified content, explain inability to check and offer Retry. Do not treat unavailable evidence as an empty history. |

Use the athlete's saved timezone, initially Africa/Johannesburg, rather than the server's date. Exclude future results, deleted activities, unrelated sports, removed milestones and superseded targets. A final goal may use this result-confirmation flow; changing its target remains a Plan action.

## 5. Matching policy

MC-01: A result explicitly selected from the milestone inherits that milestone's identity in the confirmation flow. The athlete should not need to find and link it a second time.

MC-02: An existing stable event/target identity plus matching local event date is the strongest candidate. If event identity is absent, normalised event name, local date and plausible race distance can support a suggested match. Different names may represent the same race, but a generic run title or matching distance/date alone is insufficient for a confident event match.

MC-03: When exactly one credible event/date match exists, preselect that milestone and result. Propose completion and the supported target comparison automatically, then ask for confirmation before writing a new relationship or result. The primary action must name the intended outcome.

MC-04: Multiple plausible results, multiple event distances, conflicting existing links or differing dates require review. Do not choose silently. Show the candidate facts and let the athlete select/correct them. Expose missing official facts before confirmation.

MC-05: Saved results take precedence over creating new achievements from their linked activities. Avoid offering the same imported activity again under a different record ID. Do not generate duplicate records merely because provider titles differ.

MC-06: Respect explicit unlinks and rejected candidates. Do not automatically propose the unchanged rejected pair again. Manual reconsideration remains available. Materially changed evidence may become reviewable with an explanation of what changed.

## 6. Automatic recognition dialog

Present a responsive, accessible dialog after authenticated data loads and any existing blocking flow finishes. Prefer a dialog over a full-screen splash so Home remains recognisable. Never interrupt an unsaved form or another active dialog. Queue pending reviews; show one at a time with a count and a Review remaining action.

For a unique credible match, show:

> Congratulations — your recorded result is under your target.
>
> SA Home Loans Oldies 10 km · 1 November 2026  
> Target: Sub-60 · Recorded result: 59:23  
> 37 seconds under target  
> Confirm this result belongs to this milestone.
>
> **Confirm result and complete milestone**

This is a preview awaiting confirmation, not a claim that a write has already succeeded. Use this example only when verified result facts support it; screenshots are not seed data.

Other supported copy:

- Missed numeric target: “You completed the race. Your recorded result was [difference] outside your target.” Show both times. Use supportive language; do not describe the runner as having failed.
- Completed but unassessable: “We found a result for this milestone. Confirm the race and review the official result.” Explain the specific missing/conflicting fact rather than asserting a missed target.
- No numeric target: acknowledge the recorded finish without inventing a time achievement.

Provide secondary actions: **Review or correct result**, **Choose a different activity/result**, **Not this race**, and **Later**. Editing should preserve entered values. Where image choices conflict, resolve them before completing the save rather than silently replacing an image.

On confirmation, persist the result if needed and its milestone relationship as one coherent user action; revalidate current sources before committing. Display success only after a verified save, then refresh Home, Settings and All milestones from the same composed state. Double-clicks, retries and a second device must not create duplicates. Stale or ambiguous outcomes require reload/review rather than an unverified success message.

Confirmed or already fully reconciled milestones do not repeatedly ask for confirmation on later logins. Closing or choosing Later saves a deferred review decision: retain a non-blocking Review milestone result action, and do not automatically reopen the unchanged dialog on subsequent visits. Not this race rejects that specific pair without deleting either source or marking the milestone failed. Persist decisions per athlete across devices; do not depend solely on browser storage. New material evidence can make a deferred review eligible again.

Keyboard focus enters the dialog, stays within it, and returns to the initiating location on close. Escape behaves as Later. Screen readers announce its title and preview status. Support phone widths and long event names without clipped controls. Do not use colour alone for outcomes.

## 7. Manual alignment from the milestone

Every unresolved milestone detail, reachable from Home, All milestones and Settings, must offer **Record or align result**. Keep Settings as the canonical manager; reuse its underlying result/link workflow rather than creating a competing ledger.

1. Open the exact milestone, retaining its ID and original criteria.
2. Present suggested existing results first, with date/distance/time and any mismatch explanations.
3. Allow selecting a recorded activity or entering an official result if no saved result is appropriate.
4. Preview completion, target comparison and any PB claim separately.
5. Confirm once, save coherently, and display the single completed milestone.
6. Allow correcting an official result or changing/unlinking its association later, with a preview of the consequences for completion and next-goal selection.

The automatic dialog and manual flow must use the same validation and outcome rules. Recording historical facts or reconciling a result must not initiate a training-plan approval process. Editing an approved target continues through existing Plan controls.

## 8. Delivery phases and exit gates

### Phase 1 — Make completion correct

1. Reproduce the Oldies duplicate and Verulam unresolved-outcome cases with synthetic fixtures. Inspect actual records read-only when implementing any owner-specific repair; do not assume their stored cause.
2. Establish a shared result/target identity and assessment contract, preserving original target criteria and distinguishing GPS facts from official result facts.
3. Make Record result from a milestone and Link existing achievement save a reliable relationship and render one completed entry. Cover met, missed and unresolved targets independently of PB claims.
4. Refresh every milestone surface and advance Home immediately after verified completion, including on race day.
5. Provide the direct Record or align result action and actionable assessment explanations using existing UI components.
6. Prepare a preview of existing-record reconciliation, preserve results/images and support undo/unlink. Avoid creating links as a side effect of page reads.

Exit gate: the manual end-to-end flow works and persists across reload/devices. Oldies 59:23 against a verified Sub-60 10 km target becomes one completed, achieved milestone, with the next eligible goal selected. Verulam remains one completed result with PB where confirmed and an honestly assessed target or a specific outstanding issue.

### Phase 2 — Add proactive recognition and confirmation

1. Implement candidate evaluation at the specified triggers.
2. Add persisted review, deferral and rejection decisions with deduplication and source-change handling.
3. Add the confirmation dialog with the intended milestone preselected and clear outcome preview.
4. Reuse Phase 1 commands for confirmation, correction and manual fallback.
5. Validate delayed sync, return-after-race, multiple candidates, concurrent devices and interrupted saves.

Exit gate: the first eligible signed-in visit or newly observed result produces one appropriate review; confirmation completes the intended milestone; unchanged confirmed/deferred/rejected reviews do not repeatedly interrupt.

### Phase 3 — Refine usability and release

1. Polish celebration/supportive copy, result comparison, focus handling, responsive layout and multi-result review.
2. Verify image continuity, discoverability of unresolved reviews and consistent status across every surface.
3. Run complete browser → API → persistence → refreshed-view checks in supported local and cloud modes using synthetic records.
4. Roll out with the manual flow available independently. Disabling automatic recognition must preserve confirmed relationships and review decisions.

Exit gate: no duplicate visible race, unsupported success claim, repeated prompt or stale next-goal card in the release scenarios below. Record any remaining limits explicitly.

## 9. Release acceptance scenarios

| ID | Scenario | Expected result |
| --- | --- | --- |
| AC-01 | Same-day Oldies event/date match, official 10 km result 59:23, strict Sub-60 target | Preselected review; confirmation yields one completed milestone, target achieved by 37 seconds, and next-goal advancement. |
| AC-02 | First return several days after the race | The unresolved matching result is still offered for review. |
| AC-03 | Result arrives through sync while Home is open | Evaluation occurs without signing in again; dialog waits for a safe interruption point. |
| AC-04 | Race date reached/passed with no result | Race day / Result pending; no invented completion or missed-target claim. |
| AC-05 | Strict Sub-60 result exactly 60:00 or slower | Completed race, target missed; equality is not achieved. |
| AC-06 | Verulam PB result with a GPS/official-distance discrepancy | Identity can be confirmed; PB preserved; official facts can be reviewed; no unsupported numeric award. |
| AC-07 | Two plausible activities or multiple distance editions | Athlete chooses; no automatic link or incorrect congratulations. |
| AC-08 | Athlete records result directly from milestone | One confirmation produces one completed entry; no additional linking task. |
| AC-09 | Confirm, Later, Escape, and Not this race, then return on another device | Each persisted decision is respected; manual review remains available where relevant. |
| AC-10 | Double-click, retried request, stale plan/result or concurrent confirmation | No duplicate result/link; stale facts trigger review; unknown save outcome is not reported as success. |
| AC-11 | Renamed event, explicit unlink, removed milestone, rejected pair or superseded target | Stable identity and saved choices respected; no silent recreation or repeated unchanged suggestion. |
| AC-12 | Data unavailable, future/deleted activity, unrelated sport, Johannesburg/UTC date boundary | Honest partial state; only eligible local-date evidence considered. |
| AC-13 | Result corrected or association undone | Completion, assessment, imagery and next-goal selection update consistently without losing source facts. |
| AC-14 | Final goal completed / no upcoming target remains | Final completion handled truthfully; honest completion/empty state rather than a stale upcoming race. |
| AC-15 | Keyboard, screen reader and narrow phone viewport | Dialog and manual fallback are operable, labelled and unclipped. |

## 10. Architect handoff requirements

The architecture implementation plan should map every MC and AC requirement to components, commands, data changes and verification. It must specify:

- Authoritative sources, stable event/edition identity, target snapshots and explicit strict/inclusive comparison semantics.
- How official-result facts coexist with imported activity metrics and legacy records without rewriting evidence.
- The shared projection and commands used by Home, Settings, All milestones and the new dialog, including final-goal completion.
- Candidate selection, ambiguity handling, trigger integration, refresh lifecycle and bounded/paginated historical evaluation that does not lose overdue milestones.
- Durable review states, source-version identity, rejection/deferral semantics and cross-device concurrency.
- A coherent save boundary for result + relationship + resolved review, idempotency and ambiguous-response recovery.
- Existing-data audit and reconciliation preview, migration/backfill boundaries, image preservation and rollback.
- Relevant ADR amendments, phased work packages, dependencies and precise acceptance gates.
- End-to-end verification in supported local/cloud persistence paths, access isolation and test fixtures independent of private production IDs.
- Minimal diagnostic events for candidate detection, prompt shown, confirm/defer/reject, conflict and next-goal refresh. Measure duplicate entries and repeated prompts without logging private result content unnecessarily.

Success means an athlete can recognise the proposed race, confirm once, see exactly what was achieved, and continue toward the next goal without managing links in multiple places.
