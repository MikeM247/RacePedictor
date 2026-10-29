# Orbit Voice — Requirements for Architecture

28 October 2026 · Revision 0.1 · Proposed product and design baseline

Owner: Product Owner. Audience: architecture, design, engineering and QA. Scope and value: [BRD](BRD.md). Visual and interaction detail: [UI/UX handoff](../../design/orbit-voice/UI_UX_HANDOFF.md).

## 1. Baseline and authority

Extend the existing authenticated online Orbit Coach at `/dashboard/coach`. Preserve the separate goal/milestone Home, current navigation and training workflows. Reuse current conversation persistence, training context, owner/athlete isolation, pending-turn recovery and generation checks.

Current sources:

- [Conversation boundary and latest Home/history amendments](../../adr/0010-v2-conversation-led-coach.md).
- [Archive, draft and permanent-deletion semantics](../../plans/COACH_CHAT_HISTORY.md).
- [Current screen contract](../../design/screens.md).
- [Approved Orbit visual direction](../../plans/V2_AI_COMPANION_DESIGN_HANDOFF.md); later route/navigation amendments take precedence over its older Home composition.

This package proposes voice after the approved text-only iteration. V1 means dictation; V1.1 means optional playback; live voice is discovery. Requirements and written UX rules govern behaviour; mockup text and sample data are illustrative. A conflict in this package must be resolved before implementation, rather than inferred from an image.

## 2. Required journeys

**J1 — Reflect:** select Last training → inspect activity label/date → record reflection → stop → review/edit transcript → add to draft → Send message → receive the ordinary saved contextual reply → View activity or View next session.

**J2 — Prepare:** select Next training → inspect effective session → dictate a question → review/edit/send → receive advice → View session. A conversational agreement does not alter the prescription.

**J3 — Recover:** deny microphone access, cancel, lose connection or receive an unusable transcript → preserve the pre-recording draft and selected context → retry where safe or type → send once.

**J4 — Listen, V1.1:** choose Listen on a saved current-chat coach reply → prepare audio → play → pause/resume or stop → retain the same visible message and links. Audio never starts automatically.

Existing Last/Next/General context selection is sufficient for V1. New entry points from activity or session detail may follow the existing contextual-navigation pattern but are not a V1 dependency.

## 3. Functional requirements — V1 dictation

| ID | Requirement and acceptance condition |
| --- | --- |
| OV-F01 | Add a labelled microphone action to the current composer only when online Coach and dictation capability are available. Text composition remains usable if speech is unsupported or unavailable. Explain an attempted voice failure locally without replacing the page. |
| OV-F02 | Before first capture, explain that audio is processed to create an editable transcript, who processes it, and that recording does not send a coaching message. Ask browser permission only after an explicit Record action. Denied permission offers understandable browser guidance and Type instead; do not repeatedly prompt. |
| OV-F03 | While capturing, show Recording, elapsed time, Stop recording and Cancel. Capture at most 120 seconds; at the limit stop the microphone and move to transcription with an explanation. No background/always-on recording. |
| OV-F04 | Preserve the existing typed draft independently of recording and transcription. Stopping captures audio for transcription; cancelling discards only the transient voice operation and restores the existing draft. Do not overwrite a draft with partial recognition. |
| OV-F05 | Show Transcribing and Cancel while awaiting recognition. Success presents an editable transcript clearly labelled Review before sending. Empty/silent/unusable results explain the problem and offer Record again or Type instead; never submit an empty message. |
| OV-F06 | From transcript review, Add to draft appends with a readable separator; Replace draft requires an explicit choice when text exists. Cancel preserves the original draft. Apply only to the current visible draft, including any edits since recording began. An empty draft may receive the transcript directly but remains unsent. Focus moves to the editable composer after insertion. |
| OV-F07 | Retain the existing 4,000-character total draft limit. If insertion would exceed it, keep both draft and review text and ask the athlete to shorten or explicitly replace. Never silently truncate a transcript or existing text. Enforce the send limit on the server too. |
| OV-F08 | Only explicit Send message creates a coaching turn, through existing validation/context/history and retry semantics. Speech-to-text completion and Add to draft never send. Failed transcription retries must not create chat messages; send retries must not duplicate turns or charges where controllable. |
| OV-F09 | Serialize microphone/transcription operations and prevent a second voice operation while one is active. A pending/sending chat turn or archive operation blocks new dictation and duplicate sends; explain why. Typing and safe training navigation follow existing Coach behaviour. |
| OV-F10 | Bind each voice operation to the authenticated athlete, current conversation generation, selected training context and operation identity. Changing topic/record, clearing chat, permanent deletion, logout or an externally changed generation cancels the voice operation and rejects its late result. Preserve pre-existing draft under archive rules; permanent deletion/logout follow existing privacy-clearing rules. Explain cancellation before fresh dictation. |
| OV-F11 | Stop microphone tracks and release temporary audio on Cancel, navigation away, page hiding, logout and terminal completion. Navigation, hiding and logout also invalidate pending voice work so late results cannot reappear. On backgrounding during capture, cancel rather than record silently; retain the pre-existing draft. A reviewed transcript already inserted into the draft follows existing draft persistence. No automatic recording restart. |
| OV-F12 | Permission, unsupported format/device, network, timeout, quota and provider errors have distinct actionable text. For an in-view failed transcription, offer an explicit retry using the bounded transient clip only while eligible; do not record again or retry indefinitely without an action. After disposal, offer Record again or Type instead. Text chat and training facts remain available subject to their own availability. |

## 4. Functional requirements — V1.1 spoken replies

| ID | Requirement and acceptance condition |
| --- | --- |
| OV-P01 | Add Listen only to eligible saved coach replies in the current generation. Speak the visible saved reply, with formatting removed and units pronounced appropriately. Do not generate new advice or an unshown summary for playback. User messages and archived conversations have no playback control in this release. |
| OV-P02 | Show Preparing audio, then Playing with Pause, Resume and Stop as applicable. Only one message plays at once; starting another stops the first. Playback requires an explicit action and never starts on reply arrival, reload or return navigation. |
| OV-P03 | Starting microphone capture stops playback. New message submission, changing selected context, leaving Coach, page hiding, logout, chat archival/deletion or loss of eligibility stops audio and rejects late results. No hidden audio, accidental replay or cross-generation reuse. |
| OV-P04 | Audio failure offers Retry audio without re-running coaching generation or changing the saved reply. The complete text and contextual links remain usable. No durable application audio files or playback history are required. |
| OV-P05 | Coach response design should put a concise recommendation and reason first, with necessary detail and cautions following. Do not remove material qualifications to shorten speech. Existing saved replies remain unchanged; the athlete can stop long playback. No voice-persona redesign or animated avatar is required. |

## 5. Quality, data and operational requirements

| ID | Requirement / proposed target |
| --- | --- |
| OV-N01 | Meet WCAG 2.2 AA for changed controls: keyboard operation, visible focus, text labels/status, 44px minimum primary touch targets, sufficient contrast and reduced-motion support. Waveforms and colour are supplemental. Announce state changes without repeatedly reading a timer; never require hearing to complete a task. |
| OV-N02 | Verify mobile at 390×844 and desktop at 1440×900, plus 320px reflow and 200% zoom. Keep composer, review, cancel and send reachable with keyboard open and safe-area navigation. Define a tested browser/device/codec matrix; unsupported cases retain text. Do not promise offline speech. |
| OV-N03 | Local recording/playback state changes should appear within 200ms. Proposed pilot target: p95 stop-to-editable-transcript ≤5s for a 30s clip, and p95 Listen-to-first-audio ≤3s for an already-saved reply, on a named supported device/network. Measure with at least 30 samples per target. Bound transcription waits to 20s and audio preparation to 15s, then expose recovery; do not extend the existing chat wait silently. Architecture validates feasibility and reports any target change. |
| OV-N04 | Apply existing owner-session, same-origin and athlete-scoping protections to speech operations. Keep long-lived provider credentials server-side. Validate actual audio type, size, duration and request limits; treat transcripts as user input, never instructions with elevated authority. Define short-lived authorization if any direct browser-provider transport is proposed. |
| OV-N05 | Raw input/output audio must not enter application DB, object storage, service-worker/disk caches, analytics, logs or backups. Hold audio only transiently for a bounded operation: dispose on completion/cancel/exit or within 5 minutes of capture/preparation start, whichever occurs first. Use private/no-store responses. A selected provider's unavoidable processing/retention must be documented and compatible with the privacy promise before release; do not imply client-side processing or zero provider retention without evidence. |
| OV-N06 | Unsent recognition text is transient until explicitly inserted into the existing draft; drafts follow current session-scoped rules. Sent transcripts are ordinary chat text under current archive/deletion controls. Persisted provider artifacts, if technically unavoidable, require a documented lifecycle/deletion design before adoption. No generated athlete memory or archived-history retrieval is introduced. |
| OV-N07 | Apply bounded per-athlete rate/usage limits and independent disable controls for dictation and playback. Speech rollback preserves current text chat, saved records and training tools. Capture content-free counts, timing, error category, byte/duration usage and estimated cost; never log audio, transcript, message text or training details. Minimize requests and do not refetch coaching context to synthesize a saved reply. |
| OV-N08 | Preserve evidence-bounded coaching and existing training authority. No recognition, voice prompt, reply or spoken confirmation may write wellbeing, mark completion, edit Calendar, approve a plan or publish notes. Refresh and revalidate app training context at ordinary send time. No claim of access to personal ChatGPT history, raw Second Brain notes, live sensors or unimplemented memory. |

## 6. UI change inventory

| Surface | Required change |
| --- | --- |
| Coach composer | Record affordance, bounded recording/transcription states, review/insert controls and recoverable errors; retain text/send and topic/context. |
| Current coach reply | V1.1 per-message playback controls and inline status; retain visible text and valid links. |
| First-use explanation | Compact accessible disclosure before the first recording; no new onboarding journey or microphone prompt on page load. |
| Coach history and Settings deletion | Preserve current semantics; invalidate transient voice operations when their scope is cleared. No new audio library or memory settings. |
| Home, Calendar, Readiness and plan | Existing destinations and behaviours; no redesign needed for V1. |

See the [designer handoff](../../design/orbit-voice/UI_UX_HANDOFF.md) for layout, exact state transitions, mockups and focus behaviour. Any mockups combining playback and dictation show the end-state composition; playback is separately scoped to V1.1.

## 7. Architecture deliverables and decisions

Architecture should produce a solution design and implementation plan against these IDs, including:

1. **Speech capability spike:** verify current STT/TTS API availability, provider retention/training use, accent/language and unit handling, supported codecs/mobile browsers, credential flow, stage latency, quotas and cost. Treat GPT-Live/delegation/OpenRouter audio claims from the [owner-supplied research](research/VOICE_RESEARCH_INPUT.md) as unverified candidates, not dependencies.
2. **Boundaries and contracts:** capture → speech processing → review/draft → existing chat → saved reply → optional synthesis; operation identity, cancellation, stale-result rejection, auth and payload constraints. Choose endpoints, transport and errors; product does not prescribe a specific vendor, framework or schema.
3. **Integration map:** current composer and history UI, existing chat handler/provider/context services, core contracts and repositories. Current chat generation uses `createOpenAIChatProvider`; configurable OpenRouter activity feedback must not be assumed to route interactive chat or speech. Avoid a second coaching engine.
4. **Lifecycle and resilience:** document transient buffers, proxy/upload handling, no-store controls, deletion/archival boundaries, concurrency across tabs and speech-provider cleanup. Define permitted retry behaviour and avoid surprise recharges.
5. **Capacity and cost:** choose supported audio formats/byte limits compatible with 120s, per-athlete budgets and alerts; estimate cost per successful dictation and playback. Establish an explicit numeric operating budget in the architecture plan before enabling the pilot; product has not set one from unverified prices.
6. **Delivery and verification:** V1 and V1.1 independently gated and rollbackable; browser test matrix, release evidence and requirements-to-test mapping. Prefer additive changes; justify any migration or persistent audio metadata.

**Deferred live-voice discovery output:** a recommendation comparing staged voice with realtime speech, tested interruption/turn-taking behaviour, continuity with the existing coach, mobile/background constraints, privacy and recurring cost. No live-call control belongs in V1 or V1.1.

## 8. Acceptance and release evidence

| Scenario | Required evidence | Trace |
| --- | --- | --- |
| Reflect and prepare | Both journeys use the selected real record/date, editable speech and explicit send; returning from a training view restores continuity. | OV-B01/02; F01–08; N08 |
| Draft and numeric correction | Start with typed text, dictate a pace/date, correct it, append or replace explicitly; cancel and over-limit variants preserve work. | OV-B03/04; F04–07 |
| Permission and failure | Denied/unsupported mic, silence, offline/provider failure, timeout and quota all lead to usable recovery with no unintended turn. | F02/05/12; N02/03 |
| Limits and lifecycle | At 120s capture stops; cancel, background, navigation and 5-minute expiry dispose audio; stale responses after topic/generation changes never apply. | F03/09–11; N05/06 |
| Concurrent chat and deletion | Pending turns, retry, archive, permanent deletion, another tab and logout cannot attach voice content to a wrong scope or recreate deleted content. | F08–11; N04/06/08 |
| Accessible responsive flow | Keyboard/screen-reader and named phone/browser checks cover recording, transcript editing, errors and navigation with zoom/keyboard. | N01/02 |
| Spoken reply, V1.1 | Saved text matches spoken content; pause/resume/stop, another reply, mic start, failure and archive all behave correctly; no autoplay. | OV-B05; P01–05 |
| Operations | Measured latency/cost/error samples, provider privacy evidence, enforced limits and tested disable/rollback; no content in telemetry or retained audio. | N03–07 |

V1 completion requires all V1 functional and shared quality requirements, the dictation pilot evidence in the BRD, and a traceable architecture decision for every unresolved implementation choice. V1.1 additionally requires all playback requirements and its own measured audio results. These are future implementation gates, not claims that this documentation task tested a working voice feature.
