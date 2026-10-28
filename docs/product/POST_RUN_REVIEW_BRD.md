# Post-run review in ORBIT — business requirements

Date: 28 October 2026  
Owner: Product Owner  
Status: Proposed product and design handoff for review; application implementation is not included.  
Companions: [UX specification](../design/POST_RUN_REVIEW_UX.md) · [Interactive prototype](../design/post-run-review/index.html)

## 1. Business need and outcome

When the athlete opens Coach after a new run, ORBIT should already know which run was completed, explain what the recorded evidence shows, and ask how it felt. The athlete should not have to identify the workout, request an analysis, or repeat feedback already supplied.

The result is one durable review per activity: recorded workout facts, a clearly labelled AI assessment, the athlete's own structured reflection, and a supported coaching takeaway. The review remains available in activity detail after the prompt disappears.

The supplied Strava screenshot is a visual reference for a prominent takeaway, supporting explanation and simple action. Its sample workout, heart-rate interpretations, historical comparisons and button text are not requirements or verified facts about this athlete.

## 2. Request and proposed interpretations

| Source | Requirement / decision |
| --- | --- |
| Explicit request | Begin Coach with feedback about a new completed run, then ask for the athlete's feedback, including RPE. |
| Explicit request | Ask before clearing an existing conversation for the latest run/race review. |
| Explicit request | Offer once on login; remove the outstanding invitation once feedback is given. |
| Proposed interpretation | Login establishes eligibility; the offer appears when Coach is opened. Home does not open Coach or show a modal automatically. |
| Proposed interpretation | “Once” means at most one automatic run-review offer per authenticated login, across tabs. Deferring allows another offer on a later login until completed. |
| Proposed interpretation | “Clear” follows the approved save-and-start-fresh behaviour. Ask permission, archive the complete discussion, and retain access in Previous chats. |
| Proposed interpretation | Completed feedback permanently suppresses automatic offers for that activity, independently of chat history. Manual reading and editing remain available. |
| Proposed interpretation | Runs include road, trail and treadmill runs. A race uses the same core flow, with an optional race-specific reflection. |

These are reviewable defaults, not a claim of additional owner approval. This proposal extends V2's existing reflection journey with an explicit athlete-submitted form; it does not replace the current screen contract or silently change the existing locally approved AI athlete-feedback artifact.

## 3. Scope

**MVP:** authenticated online Coach at `/dashboard/coach`; completed-run detection using canonical activities; review-first arrival; existing-chat choice; structured feedback; explicit save; completion suppression; manual resume/edit; useful pending/error states; mobile and desktop layouts; accessibility; private product telemetry.

Reuse the existing asynchronous activity-review service, saved conversations, current training facts and authoritative plan. The same published review must appear in Coach and activity detail. Feedback saving must remain possible while the AI provider is unavailable.

**Excluded:** automatic plan changes, diagnoses, new fitness/readiness scores, new recording or Strava integration work, automatic daily wellbeing writes, automatic extraction of form answers from free text, push/email notifications, weekly reviews, and a broad Home/Calendar redesign. This delivery creates design artifacts only.

## 4. User journey

1. A completed run synchronises into the canonical activity history.
2. On the first eligible Coach opening during a login, select the latest unreviewed eligible run and atomically reserve the login's automatic offer.
3. If the active discussion has messages, ask: “Save this chat and start a run review?” Offer **Save chat & start review**, **Review in this chat**, and **Not now**. Never archive on arrival.
4. Show the run identity, recorded facts and existing current AI assessment. If the assessment is pending, show the facts and the truthful pending state instead.
5. Ask “How did this run feel?” Collect RPE and a discomfort/pain check, with honest unable/skip answers; offer optional context.
6. The athlete selects **Save feedback**. Validate and persist the form before confirming success. Mark that activity's reflection complete in the same durable operation.
7. Remove the open invitation/form, retain a compact saved summary, and allow normal conversation. ORBIT can incorporate the saved feedback into a follow-up. A failed AI follow-up does not undo completion.
8. Later Coach visits resume normal conversation/preparation. Activity detail offers **View run review** and **Edit your feedback**, both manual actions.

## 5. Functional requirements

| ID | Priority | Requirement |
| --- | --- | --- |
| BR-01 | Must | Select only an accessible, non-deleted, completed canonical running activity. Deduplicate the same workout imported from multiple sources before eligibility. Never infer completion of a planned workout from its presence. |
| BR-02 | Must | Order by workout occurrence timestamp, not sync time or AI publication time. Use the athlete's saved timezone for dates; default to Africa/Johannesburg. Resolve exact timestamp ties deterministically by canonical ID. |
| BR-03 | Must | At feature activation, establish an athlete-specific occurrence-time baseline. Proactively offer runs occurring after activation only; older activities remain manually reviewable. Historical backfill does not create an automatic review backlog. |
| BR-04 | Must | Among eligible activities newer than the baseline, offer the latest with no completed reflection. If an explicitly deferred older review exists, a newer run takes priority on a later login. Never cycle through older runs automatically in one login. |
| BR-05 | Must | Use a durable login-session offer record, shared across tabs. Token refresh, navigation, browser reload and daily date rollover do not create a new login. A fresh authenticated login creates a new offer allowance. |
| BR-06 | Must | Allow one automatic offer per login. Rendering the chat-choice prompt or run-review opening consumes that allowance. No candidate means no consumption. Manual run selection is outside this allowance. |
| BR-07 | Must | Offer only on Coach entry. A run arriving while Coach is open may expose a quiet **New run available** action; never interrupt typing, switch context or steal focus. The next Coach entry can use an unused allowance. |
| BR-08 | Must | Persist the offered activity identity. Refreshing or a newer sync must not switch the run underneath an open review. Let the athlete deliberately select another run. |
| BR-09 | Must | Ask before archiving a non-empty active discussion; allow the athlete to keep it and review inline. Preserve the draft and complete saved discussion, including unloaded messages. An empty chat needs no confirmation. |
| BR-10 | Must | Show a concise AI headline, explanation, one next step and material evidence limitations. Identify the run and distinguish AI interpretation, recorded data and athlete-reported data. Do not infer RPE from pace/heart rate or call the run recovery effort without supporting evidence. |
| BR-11 | Must | Collect the fields in section 6 through an explicitly submitted form. Generic chat messages or viewing the AI review do not constitute completed feedback. |
| BR-12 | Must | Save feedback against athlete + canonical activity ID with revision and idempotent request identity. Commit completion and feedback atomically. Deduplicate retries and reject conflicting updates without overwriting them silently. |
| BR-13 | Must | Once saved, suppress that activity's automatic offer across logins, devices and chat generations. AI regeneration, review reads, feedback edits, chat archival and chat-history deletion do not reset completion. |
| BR-14 | Must | Keep completed feedback visible and editable in activity detail; show the same revision in Coach. Clearing chat does not delete activity feedback. Explicit feedback deletion is separate, with no automatic re-prompt unless the athlete explicitly chooses to reopen the review. |
| BR-15 | Must | Pending/missing/stale AI review must not block the athlete form. Never show an old review as current after an activity revision; label any retained earlier review. Queue an assessment through the existing service where enabled. |
| BR-16 | Must | Preserve unsaved form inputs for return within the authorised login. Restore them only on manual resume after the allowance was used. Clear private in-memory/session drafts on logout or authentication failure. Durable saved feedback survives logout. |
| BR-17 | Must | Treat save failure as incomplete: retain entries, show an adjacent error and retry the same request. On unknown network outcome, reconcile with the server before resubmitting. Confirm saved status only from the authoritative response. |
| BR-18 | Must | Support normal conversation after save without requiring an AI follow-up to succeed. Refresh response context against both activity and feedback revisions; discard stale AI results. |
| BR-19 | Must | Respect existing Coach UI and AI-generation switches independently. Offer/form follow the Coach UI gate; generation-off still permits facts, saved review reads and feedback saving. Local mode retains existing tools without implying online Coach availability. |
| BR-20 | Should | For long runs or races, offer optional fueling, hydration and event-execution questions. Do not force a long survey for every short run. |

## 6. Athlete feedback and tracking

| Field | Capture / validation | Requirement and purpose |
| --- | --- | --- |
| Session RPE | Integer 1–10, no default; alternative **I can't rate it** records null with an explicit reason | Required answer. Whole-run perceived effort, not the hardest moment. Never substitute plan RPE or a device score. |
| Discomfort / pain | None / Discomfort / Pain / Prefer not to say; no default | Required answer, including the skip option. Allows an honest check without assuming absence of symptoms. |
| Symptom detail | Body area, optional severity 0–10, affected running yes/no/unsure, optional note | Conditional optional fields after Discomfort/Pain. Symptom severity is distinct from RPE. |
| Energy afterwards | Fresh / Okay / Drained / Skip | Optional session-specific context; does not overwrite the daily wellbeing record. |
| Effort versus expectation | Easier / As expected / Harder / Unsure | Optional; useful when there is no confirmed plan association. |
| Athlete note | Plain text, maximum 1,000 characters | Optional: “What should ORBIT know?” Capture breathing, legs, terrain, weather, interruptions or emotional context in the athlete's words. |
| Fuel / fluid experience | No issues / Not enough / Stomach issues / Unsure + optional note | Optional progressive disclosure for races or moving duration ≥75 minutes. Absence means unknown. |
| Race execution | What went well / What to change, each optional ≤1,000 characters | Only when the activity is explicitly classified as a race; never infer race status from pace. |

RPE anchors: 1 very light; 2–3 easy; 4–5 moderate; 6–7 hard; 8–9 very hard; 10 maximum. Save accepts **I can't rate it** and **Prefer not to say** as intentional completed answers. Partial drafts do not count as a completed review.

Record distance, moving/elapsed duration, pace basis, elevation and available heart rate from the canonical activity instead of asking the athlete again. Preserve provenance. Only use weather, HR zones, weekly records or 30-day comparisons if those inputs and comparison windows exist. Missing values remain unknown.

A pain answer prompts a calm, visible acknowledgement and appropriate conservative advice. Avoid diagnosis or automatic training changes. Urgent symptoms volunteered by the athlete require immediate appropriate guidance rather than routine encouragement; no extra medical questionnaire is required by this feature.

## 7. State and frequency rules

Activity reflection state: **not started → draft → completed**; **deferred** means the athlete chose Not now, not that feedback was supplied. Review-generation state is separate: queued, processing, ready, retry wait or attention.

Login offer state: **available → reserved → shown/consumed**. Reservations need an expiring, fenced lease so abandoned loads can recover. A successful rendering acknowledgement consumes the allowance; an uncertain rendering is suppressed for the rest of that login to preserve at-most-once behaviour. A failed load before presentation may safely release the reservation. A retry of the same offer is not a new offer.

| Situation | Automatic behaviour | Manual behaviour |
| --- | --- | --- |
| New run, unused login allowance | Offer at Coach entry | Review another run if desired |
| Not now, close, Back or leave after presentation | No further interruption this login | Resume from selected run/activity detail |
| New login, latest run still unanswered | Offer once again | Resume saved draft where authorised |
| Completed reflection | Never re-offer that run | Read or edit |
| New run after a completed reflection | Eligible on next entry if this login has an unused allowance; otherwise next login | Review immediately from new-run action |
| Several new runs | Offer newest only; no stacked dialogs | Select another explicitly |
| Late import of old run | No automatic offer if before baseline; never displace a newer selected run | Review from history |
| Same run on two tabs/devices | One login allowance per login; completion suppresses every device | Reconcile saved version before editing |
| Chat cleared or deleted | Completion is unchanged | Activity review remains accessible |

Independent authenticated device logins may each have an allowance before completion. Once feedback is committed, revalidate before displaying on any device and dismiss stale invitations. Two devices cannot be guaranteed never to have shown the same activity before either saves; completion and conflict handling must remain correct.

## 8. Existing product fit and delivery gaps

| Existing capability | Reuse / required extension |
| --- | --- |
| Activity Coach review service and published review contracts | Reuse facts, assessment, limits and current status. Add explicit feedback revision to any follow-up context/fingerprint. |
| `actualPerceivedEffort` comparison field | Populate from the saved athlete-submitted RPE when available; do not fabricate values for earlier reviews. |
| `ActivityAthleteFeedback` | Currently a model-generated, locally approved artifact with model/hash metadata. Create a distinct athlete-submitted reflection contract/store; do not relabel a generated summary as direct athlete input. |
| Coach generation-local reflection markers | Insufficient for completion across cleared chats. Add durable activity-scoped completion and login-scoped offer state. |
| Conversation archive operation | Reuse complete-generation archival, expected state and request replay; then explicitly select the activity. A stale archive conflict must not clear another tab's newer messages. |
| Existing conversation-only write boundary | Extend only with the explicit feedback form endpoint. The model itself gains no write tools or automatic extraction privileges. |
| Daily wellbeing / journal | Read if relevant; never duplicate or overwrite as a side effect of saving a run reflection. |

Architecture must define schemas, migration/backfill, retention, endpoint names, actor checks, idempotency and revisions before implementation. Chat feedback is a deliberate new structured write, not something the current chat service already supports.

## 9. Non-functional requirements

- Authenticate and authorise every read and mutation to the owning athlete; preserve same-origin checks and private/no-store responses. Keep notes and symptoms out of URLs, ordinary logs and telemetry.
- Meet WCAG 2.2 AA: keyboard operability, fieldset/legend form groups, explicit labels/errors, visible focus, non-colour selection and status cues, touch targets ≥44px, contrast ≥4.5:1 for ordinary text.
- Verify at 390×844, 1440×900, 320px width and 200% text zoom. Long reviews, keyboard and material evidence limits must scroll without hiding controls behind navigation.
- Render recorded facts without waiting for AI generation. Distinguish saving feedback from generating a follow-up. Preserve successful feedback through model/service failures.
- Apply existing account data retention/deletion policy. Chat deletion excludes activity reflection; full athlete/account deletion includes it. Define authorised feedback deletion and explicit reopen semantics before release.

## 10. Acceptance scenarios

| ID | Given / when | Expected outcome |
| --- | --- | --- |
| AC-01 | New eligible run; empty chat; first Coach entry | Correct run and facts precede the feedback invitation; one offer is recorded. |
| AC-02 | Existing non-empty chat | Choice appears before archive. Cancel preserves transcript/draft; archive saves complete history; inline choice keeps it. |
| AC-03 | Offer deferred; refresh/reopen Coach/token refresh | No repeated automatic prompt in that login; manual resume works. |
| AC-04 | Deferred activity; genuinely new login | One offer may appear if that activity remains the newest unreviewed eligible run. |
| AC-05 | RPE and discomfort untouched | Inline errors prevent save; no false success or completion. Explicit unable/skip answers are accepted. |
| AC-06 | Valid feedback successfully saved | Invitation disappears, summary remains, and completion prevents offers on later logins/devices. |
| AC-07 | Chat archived/deleted or AI review regenerated after AC-06 | Completed activity remains suppressed; activity feedback remains readable. |
| AC-08 | AI review pending, stale, failed or generation disabled | Truthful state; facts and feedback form remain usable; no invented analysis. |
| AC-09 | Save times out, retry duplicates, or concurrent edit | Entries retained; authoritative reconciliation/idempotency prevents duplicate feedback; conflict offers refresh and preserves draft. |
| AC-10 | AI fails after feedback commit | “Feedback saved” remains true; follow-up can be retried without another form submission. |
| AC-11 | New run synchronises while typing | No interruption/context switch. Quiet manual action; automatic allowance rules remain intact. |
| AC-12 | Multiple runs, old imports, duplicates and timezone boundary | Correct canonical run selected by occurrence time; no historical activation flood or stacked offers. |
| AC-13 | Activity deleted or its facts revised while form open | Deleted target cannot save; preserve note for recovery. Revision change requires review of updated facts before saving; no silent reassignment. |
| AC-14 | Same login in two tabs | Only one automatic offer is claimed; save updates/dismisses stale invitation in the other tab without losing its draft silently. |
| AC-15 | Logout/authentication fails | Private content/drafts hidden/cleared; no further mutations until authorised. |
| AC-16 | Manual feedback edit / explicit feedback deletion | Edit retains completion. Deletion alone does not trigger an automatic review; reopening is explicit. |
| AC-17 | Pain reported / RPE unavailable | Calm appropriate guidance; no diagnosis or automatic plan change. Missing RPE remains unknown. |
| AC-18 | Phone, keyboard, screen reader, zoom and long text | All steps usable; dialog focus restored; errors announced; no horizontal overflow or covered actions. |

These are implementation acceptance requirements. The prototype validates layout and simulated interactions only; it cannot prove API, persistence, cross-tab or AI behaviour.

## 11. Measurement and release criteria

Track content-free events: eligible offer shown, deferred, form opened, save succeeded/failed, follow-up ready/failed, manual edit. Use opaque activity references, login references and outcome codes; exclude RPE, symptom answers and free text from product analytics.

Measures: completion rate per unique offered activity, median time from form open to saved feedback, save failure rate, duplicate-offer rate within a login, and completed-activity re-prompt rate. The last two have a release requirement of zero in acceptance scenarios; establish broader adoption/latency targets from pilot evidence. Add a manual pilot question: “Did ORBIT understand your run and how it felt?”

Release after the architecture delta is reviewed, migration/rollback is prepared, the acceptance scenarios pass against the named online runtime, and the product owner reviews the end-to-end pilot. Keep automatic offers independently disableable while retaining saved feedback and manual access.

## 12. Product backlog and handoff

| Story | Deliverable | Acceptance |
| --- | --- | --- |
| PR-01 | Activity-scoped reflection, completion and login-offer contracts/persistence | AC-03–07, 09, 14–16 |
| PR-02 | Eligibility resolver and concurrency-safe entry offer | AC-01, 03–04, 11–14 |
| PR-03 | Existing-chat choice using archive or inline review | AC-02, 07, 14 |
| PR-04 | Review-first Coach layout and shared review presentation | AC-01, 08, 12, 18 |
| PR-05 | Accessible athlete form, explicit save, manual edit/resume | AC-05–06, 09, 13, 15–18 |
| PR-06 | Feedback-aware follow-up with revision fencing and recovery | AC-08, 10, 17 |
| PR-07 | Full acceptance verification, private analytics and pilot | All scenarios; no claims based on mock screens alone |

Review focus: confirm the proposed per-login deferral rule, archive wording, required RPE/discomfort answers with opt-outs, and activation baseline. The prototype makes these choices concrete; they are not blockers to reviewing the design.

References: [V2 reflection journey](V2_FIRST_ITERATION.md) · [Current Coach boundary and amendments](../adr/0010-v2-conversation-led-coach.md) · [Saved discussions](../plans/COACH_CHAT_HISTORY.md) · [Approved ORBIT visual handoff](../plans/V2_AI_COMPANION_DESIGN_HANDOFF.md)
