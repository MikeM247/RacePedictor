# Coach panel fit and saved discussions

25 October 2026 · Approved owner request · Implementation on `codex/coach-chat-history`.

## Behavior

Coach sizes its panel from the available visual viewport, page offset, and mobile navigation. The transcript absorbs remaining space and scrolls independently. The composer, send control, training links, and approval-boundary footer stay outside the transcript. Textarea resizing is bounded. When controls cannot fit at small heights or enlarged text, the panel grows and the page remains scrollable. The optional wellbeing section follows the panel.

**Clear chat** offers two choices. **Save and start new** archives the discussion, carries the unsent draft forward, and starts an empty generation. **Clear without saving** permanently deletes only the active generation and clears the unsent draft; all previously saved chats remain available. Both reset the topic to Ask ORBIT and clear selected training record/reflection markers. **Previous chats** opens a paginated, read-only viewer. Saved discussions do not enter the new generation's AI history. Authoritative training context continues to be refreshed normally.

## Persistence and concurrency

`CoachConversationArchive` records athlete, conversation, generation, unique request identity, first-message timestamp, archive timestamp, final sequence, and an 80-character title derived from the first user message. All message/turn rows remain in place; archival never copies a browser-loaded transcript. A transaction locks the conversation, checks expected generation/sequence, creates metadata, abandons processing turns and invalidates leases, then advances generation. Existing completion fencing rejects late provider replies. Replaying the same archive request returns the same archive; competing state returns 409. Empty discussions create no archive.

Permanent deletion in Settings removes every generation's messages, turns, context snapshots, archive metadata, and reflection markers. Content-free usage counters remain. Deletion is distinct from archival and requires the existing confirmation dialog, now explicitly describing current and previous discussions.

Discard uses a separate, owner-scoped transaction that locks the conversation, verifies expected generation/sequence, deletes turns and cascading messages for that generation only, clears reflection markers, and advances the generation even when the conversation is empty. Older generations and archives are untouched. Generation advancement fences late replies and stale sends. A stale request returns 409; the UI refreshes and asks the owner to choose again. Other tabs refresh without losing their independent drafts.

## Interfaces

- `POST /api/v1/coaching/chat/conversation/archive`: `{expectedGeneration, expectedSequence, requestId}`; returns `{archive, conversation}` in the normal data envelope. `archive` is null for an empty discussion. Replay returns the archive and the latest active state.
- `POST /api/v1/coaching/chat/conversation/discard`: `{expectedGeneration, expectedSequence}`; deletes only the active generation and returns the next empty conversation state. It creates no archive and uses no schema migration.
- `GET /api/v1/coaching/chat/history?before=<generation>`: up to 20 summaries, newest generation first, plus nullable `nextBefore`.
- `GET /api/v1/coaching/chat/history/:archiveId?before=<sequence>`: up to 40 messages in chronological order, archive summary, `hasOlder`, and `oldestSequence`.
- Existing `DELETE /api/v1/coaching/chat/conversation` permanently deletes active and archived history, retaining its expected-state request and generation/sequence response.

Core owns strict contracts; DB owns persistence; web handlers enforce owner-session and athlete scope. Mutations require same origin. Routes use private/no-store responses and remain available when generation is paused. Logs contain request identity, generation and outcome, never message text or titles.

Browser request epochs and generation checks reject stale reads and responses. Same-athlete broadcast events refresh other tabs and close stale history viewers; both save and discard preserve other tabs' unsent drafts. Focus refresh recovers missed updates. Archive retries reuse their request identity; discard retries reuse their original expected state. On state conflict, the UI requires a fresh explicit choice.

## Validation and release

Regression coverage includes complete transcripts beyond one page, pending/late replies, duplicate identities, concurrent clears and discards, rollback, tenant isolation, permanent deletion, API validation/authentication, migration constraints, desktop viewport bounds, bounded drafts, save/discard failures, draft removal, and read-only history. Run web/core/DB tests, web lint/typecheck/build and the Coach Playwright suite.

Apply `20261025180000_coach_conversation_archives` before deploying the updated Coach UI. Existing active discussions need no backfill; deleted discussions cannot be recovered. Existing Coach UI/generation switches remain authoritative. Rollback to the prior UI/server preserves the additive table and retained messages; do not reverse the migration or delete archives as a rollback step.
