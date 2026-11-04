# Progressive dictation interaction specification

This specification describes the implemented Coach composer flow. The phased
[implementation plan](../../plans/ORBIT_PROGRESSIVE_DICTATION_IMPLEMENTATION_PLAN.md)
remains the source for architecture, limits and activation gates.

## Entry and capture

When progressive dictation is enabled, **Start dictation** appears beside the
ordinary typed composer. On the first progressive use in the page session, show
the disclosure even if the athlete previously accepted legacy dictation. Explain
chunk transcription, provider data controls, foreground-only capture and loss of
uninserted dictation on refresh or page closure.

The microphone permission/start state offers Cancel. A cancelled permission or
session-start response must not activate the microphone later. Recording shows
captured time, volume, progress, Pause, Stop and review, and Cancel. Warn at 14
minutes; stop at 15 minutes or the 90-section ceiling. Pauses do not advance
captured time. The server's 30-minute session lifetime remains authoritative.

Pause stops microphone tracks and flushes the final captured samples. Resume is
explicit and reacquires microphone access. Queue pressure or a failed section
pauses capture. Network interruption of a heartbeat preserves eligible temporary
audio; an authoritative invalid-session response ends capture and opens review.

## Transcript and review

Completed sections appear in capture order separately from the typed draft.
Neither transcription nor Stop sends a coaching turn. Stop settles pending work
and opens an editable combined transcript. Ordinary Send remains disabled during
capture, pause and review.

Review provides:

- **Add to draft**: append with a paragraph separator; retain existing draft text.
- **Replace draft**: show an explicit confirmation when a draft exists.
- **Discard dictation**: release audio and reservation without changing the draft.

The shared message limit is 30,000 characters. Review text can exceed it and
remains editable; insertion is blocked until it fits. Never truncate it. If the
combined draft plus transcript exceeds the limit, keep both and explain that the
athlete can edit or explicitly replace the draft.

Insertion is consumed once even if activated repeatedly. It does not wait for a
network closure acknowledgement. Only ordinary Send creates a saved coaching
turn and refreshes training context through the normal chat path.

## Failures, retries and gaps

A failed section shows its captured interval, an explanation and, while eligible,
**Retry chunk**. Show the possible additional voice-allowance cost before the
athlete chooses Retry. There is one explicit retry; no automatic provider retry.
Temporary audio expires into a visible gap.

Before insertion, resolve every gap by retrying, correcting its words in review
and choosing **I corrected this section**, or choosing **Acknowledge omission**.
Correction confirmation is offered after the athlete edits the review.

While a retry is running, the review field is temporarily read-only. If the
review already has edits and the retry succeeds, preserve those edits and show
the recovered section's words separately. Require **Confirm included in review**
after the athlete incorporates them. Block insertion until confirmation. This
prevents arriving results from replacing edits or disappearing silently.

## Visibility, invalidation and access

Hiding or locking stops capture, aborts pending work and discards audio. Preserve
completed text and review edits in memory for the same valid conversation. A
backgrounded retry must not leave review read-only or allow a late result to
reappear. Context changes, archival, deletion and logout invalidate the session.

Typed drafts retain their existing storage behavior. Uninserted dictation is
not persisted. Disclosure acceptance stores only a progressive-specific consent
marker under the existing voice-disclosure namespace.

All controls use buttons with accessible names; elapsed time avoids continuous
screen-reader announcements. Review has an explicit textarea label, a character
count and actionable error messages. Discard returns focus to Start dictation;
insertion returns focus to the ordinary message composer. Mobile controls wrap,
and review text stays scrollable without discarding content.
