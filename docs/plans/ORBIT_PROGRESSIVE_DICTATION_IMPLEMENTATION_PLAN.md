# ORBIT progressive dictation — phased implementation plan

Created: 2 November 2026  
Status: Phases 1–3 implemented and verified in the workspace; Phase 4 automated staging checks passed; manual release gates remain open. Live activation remains gated.  
Goal: Reviewable dictation of up to 15 minutes, delivered as one ordinary Coach message.

This plan extends the [existing voice implementation plan](ORBIT_VOICE_IMPLEMENTATION_PLAN.md). Product sources are the [voice requirements](../product/orbit-voice/REQUIREMENTS.md) and [business requirements](../product/orbit-voice/BRD.md). The progressive limits and recovery behavior below supersede the older two-minute and 4,000-character requirements for the new feature.

## Progress tracker

Implement in order. Each phase is a separate reviewable change; complete its gate before starting the next phase. Add verification evidence and a commit or PR reference when marking a phase complete. Existing partial edits do not count as completion.

| Phase | Status | Commit / PR | Verification evidence |
| --- | --- | --- | --- |
| 1 — Stable baseline and long messages | Complete | Current workspace | 30,000-character contracts, repository persistence/history and chat replay; progressive flag default-off; voice handler/environment tests; prompt-budget tests; web typecheck |
| 2 — Session APIs, accounting and mocked provider | Verified in workspace | Current workspace; commit pending | Real PostgreSQL handler/repository test passes, including two independent Prisma clients racing for one session, chunk completion/replay, budget release and content-free metadata. All migrations apply to disposable PostgreSQL. |
| 3 — Progressive capture, review and recovery | Verified in workspace | Current workspace; commit pending | Eleven deterministic controller tests plus browser tests for 900 seconds, pause/resume, review editing, explicit insertion/replacement, permission cancellation and retry recovery preserving edits. |
| 4 — Application verification and release preparation | Automated staging candidate verified; manual gates pending | Current workspace; commit pending | All automated suites pass: 147 core, 165 database, 236 web and 181 browser checks, plus the four database integration scripts, TypeScript and production build. Real HTTP/PostgreSQL dictation and 30,000-character send/replay/history journey passes. See [staging verification](../ORBIT_STAGING_VERIFICATION.md). |
| Live-provider activation gate | Pending; separate from mocked verification | — | — |

## Target behavior and architecture

The athlete can dictate up to **15 minutes of captured speech**, see recognized text appear while speaking, stop to review and edit it, then send **one coaching message**.

Use the existing AudioWorklet, short WAV uploads, server-side transcription and current Coach conversation. Keep dictation text separate from the typed draft until the athlete explicitly inserts it.

| Item | Decision |
| --- | --- |
| Captured speech | 900 seconds; warn at 840 seconds |
| Session lifetime | 30 minutes, including pauses |
| Message length | 30,000 characters |
| Audio format | 16 kHz mono signed PCM in canonical WAV |
| Audio chunks | Close at a pause after 15 seconds; force closure at 30 seconds |
| Boundary context | Up to one second of preceding audio |
| Maximum request | 31 seconds / 992,044 bytes |
| Original chunks | At most 90 per session |
| Pending audio | At most 90 seconds, including active and in-flight audio |
| Temporary audio lifetime | Three minutes from its first captured sample |
| Provider concurrency | One request per athlete |
| Deadlines | Provider 60 seconds; route 75 seconds; browser 90 seconds |
| Recovery | Within the open page; no recording or uninserted transcript survives refresh |
| Monthly voice allowance | US$5, shared with playback |
| Provisional session reservation | US$0.35, subject to verified provider billing before live activation |

All phases use a separate progressive-dictation flag, **off by default**. Existing text chat and short dictation must continue working while implementation proceeds. Live spoken conversation, background recording, offline dictation and refresh-proof recovery are outside this release.

## Phase 1 — Repair the baseline and finish long-message support

**Deliverable:** A stable application that accepts and preserves long text messages, with progressive dictation still disabled.

- [ ] Reconcile the existing partial edits. Separate legacy recording limits from progressive session and chunk limits; do not replace a two-minute recording limit with a 31-second chunk limit.
- [ ] Apply the shared 30,000-character limit to composition, transcript insertion, server validation, saved-message responses and history.
- [ ] Complete the 256 KiB prompt-budget change. Preserve instructions and the full current message; remove oldest history first. Validate capacity against the configured model rather than treating a byte limit as proof of token capacity.
- [ ] Keep the assistant's existing reply limits independent of the longer user-message limit.
- [ ] Add the progressive feature flag and a backward-compatible capabilities field. Unavailable progressive capability falls back to existing behavior.
- [ ] Update the product requirements and add an architecture decision describing the phased rollout.

### Completion gate

- [ ] Long-message contract tests pass.
- [ ] Persistence and history tests pass, including a 30,000-character message through send and reload without truncation.
- [ ] Prompt-budget tests pass.
- [ ] Existing voice regression tests pass.
- [ ] The existing capabilities endpoint parses successfully.
- [ ] Record verification evidence and commit or PR in the tracker.

No database migration or live provider call is required for this phase.

## Phase 2 — Implement session APIs, accounting and mocked provider integration

**Deliverable:** A tested backend that processes ordered chunks securely, before connecting microphone capture.

### Interfaces

All paths below are under `/api/v1/coaching/voice`.

| Endpoint | Purpose |
| --- | --- |
| `POST /dictation-sessions` | Create an authorized session and reserve allowance |
| `POST /dictation-sessions/:id/chunks` | Validate and transcribe an identified chunk attempt |
| `POST /dictation-sessions/:id/heartbeat` | Renew the visible session's lease |
| `POST /dictation-sessions/:id/close` | Close or cancel and settle unused allowance |

### Implementation

- [x] Add an additive migration for content-free session and attempt metadata: athlete, conversation binding, state, timing, chunk admissions and allowance accounting. Store no audio or transcript.
- [x] Bind sessions to conversation generation, sequence, topic, selected record and context identity. Reject stale or unauthorized work before provider dispatch and before returning an applicable result.
- [x] Use a 90-second renewable session lease and a 100-second attempt lease. Enforce provider concurrency independently so session expiry cannot admit overlapping provider work.
- [x] Admit at most 90 original chunks and one explicit retry per chunk. Repeated attempt IDs never dispatch another provider request.
- [x] Request word timestamps from `whisper-1`. Return chunk-relative timing for client assembly using session coordinates.
- [x] Keep the existing US$5 allowance. Reserve US$0.35 per session provisionally, with duration-based accounting including overlap and retries. Release unused funds; conservatively account for dispatched requests with uncertain outcomes.
- [x] Pin reservations to their admission month. Apply session-start limits of six per minute and 60 per day separately from the 12-per-minute chunk-submission limit. Keep playback limits unchanged.
- [x] Put the mock behind test dependency injection. Production configuration must not accidentally select it.
- [x] Use private/no-store responses and prevent content-bearing request and response logging.

### Completion gate

Exercise the real handlers and repository against a disposable PostgreSQL database with a mocked provider.

- [x] Complete the handler/repository run against a disposable PostgreSQL database.
- [x] Tenant isolation and authorization tests pass.
- [x] Duplicate-attempt and concurrent-session tests pass.
- [x] Expiry, cancellation, retry and limit tests pass.
- [x] Budget-settlement and month-rollover tests pass.
- [x] Verify stored metadata contains no audio or transcript.
- [ ] Record verification evidence and commit or PR in the tracker.

Do not apply migrations to the shared or production database during these tests.

## Phase 3 — Implement progressive capture, review and recovery

**Deliverable:** The complete athlete flow, connected to the session APIs.

- [x] Extract capture and queue management from the current component into a testable controller.
- [x] Split AudioWorklet samples into bounded chunks; serialize uploads while capture continues. Maintain chunk order and sample-based timing.
- [x] Translate provider timestamps into session coordinates and exclude overlap words by their midpoint. Flag uncertain or missing sections for review; never silently remove them.
- [x] Pause capture when the pending-audio queue fills or transcription fails. Stop microphone tracks on Pause; Resume always requires an explicit action.
- [x] Display progressive text separately from the typed draft. After Stop, settle pending work and make the combined transcript editable.
- [x] Provide Add to draft, Replace draft and Discard dictation. Append with a paragraph separator; replacement requires an explicit choice when text exists. Only Send creates a coaching turn.
- [x] Preserve over-limit review text for editing without truncation.
- [x] Offer one explicit retry while failed audio remains eligible. Explain possible additional cost after a lost response. Expired audio becomes a visible gap requiring correction or acknowledged omission.
- [x] On hiding or screen lock, stop capture, abort pending work and dispose audio. Preserve completed recognition text in memory for review if the conversation remains valid.
- [x] On context changes, archival, deletion or logout, invalidate the session and reject late results according to existing privacy rules.
- [x] Renew the session heartbeat every 30 seconds while the page is visible. Enforce the captured-speech cap and total session lifetime.

### Completion gate

- [x] Deterministic controller tests cover a simulated 900 seconds of samples.
- [x] Browser/component flows cover pause/resume, review and insertion; deterministic controller tests cover queue pressure, retry expiry and ordered assembly.
- [x] Cancellation and review-editing tests pass, including late microphone permission and retries after review edits.
- [x] Existing typed drafts remain intact until explicit insertion or replacement (review text is separate; insertion is explicit).
- [x] Controller tests verify audio disposal, expiry, cancellation of late session creation and rejection of late successful chunk responses after backgrounding; browser tests verify microphone tracks stop on Pause and cancellation.
- [x] Record verification evidence: controller (900-second capture, queue ceiling, retry/expiry, omission acknowledgement and cancellation), progressive route timing/overlap, WAV bounds, web TypeScript check, and core/database voice tests passed on 2026-11-02. On 2026-11-03, PostgreSQL-backed handler/repository concurrency, all core/database/web tests and all configured browser suites passed after fixes; see the staging evidence below.
- [ ] Commit or PR in the tracker.

## Phase 4 — Verify the complete application and prepare release

**Deliverable:** Reviewable implementation with browser evidence and documented release prerequisites.

- [x] Run Playwright through the actual UI, session routes, disposable database and chat-send path. Mock only the external transcription and chat providers.
- [ ] Test 10- and 15-minute sample streams, chunk boundaries, silence, slow responses, disconnection, lost responses, exhausted credit and concurrent tabs.
- [x] Verify one reviewed transcript creates one saved coaching turn.
- [x] Verify 30,000-character messages remain readable in current chat and history.
- [ ] Check keyboard and screen-reader behavior, mobile layout, permission denial, backgrounding, deletion and logout.
- [x] Use accelerated sample-driven tests for duration limits. Keep real-time soak checks separate.
- [x] Run relevant core, database and web tests, TypeScript checks and the production build.
- [x] Record failures and fixes before declaring completion.
- [ ] Demonstrate rollback by disabling progressive dictation without losing text chat, saved messages or usage metadata.
- [ ] Record verification evidence and commit or PR in the tracker.

### Completion gate

- [x] Mocked end-to-end tests pass.
- [x] Relevant automated checks pass.
- [ ] Rollback is demonstrated.
- [x] Progressive dictation remains disabled by default.
- [x] The implementation is ready for review, with live-provider prerequisites listed explicitly.

## Live-provider activation gate

Mock tests establish application behavior. They do not establish speech recognition quality, actual provider cost, retention terms or real-device latency.

- [ ] Verify provider pricing and billing increments against the provisional reservation assumptions.
- [ ] Verify applicable retention and data-control terms and update the disclosure.
- [ ] Verify provider word timestamps and boundary recognition quality with running terminology, paces, units and repeated phrases.
- [ ] Perform real 10- and 15-minute recordings on Android Chrome, desktop Chrome and iOS Safari.
- [ ] Measure at least 30 samples on named devices and networks for each latency target: p95 chunk-closure-to-visible-text at most 10 seconds; first text within 40 seconds; p95 Stop-to-review at most 15 seconds under healthy connectivity.
- [ ] Complete at least nine of 10 representative journeys without assistance, with no lost typed drafts, unintended sends or cross-conversation results.
- [ ] Record the live evidence and activation decision before enabling the owner pilot.

Keep the feature disabled until live evidence is recorded. Rollback disables progressive recording without deleting saved messages or reversing the additive migration.

## Tracking notes

| Date | Phase / item | Outcome, evidence or blocker |
| --- | --- | --- |
| 2026-11-02 | Plan created | Four phases agreed as the implementation roadmap. |
| 2026-11-02 | Phase 1 complete | Legacy dictation limits remain 120 seconds / 3,840,044 bytes / 20-second wait. Added independent progressive feature switch defaulting off, shared 30,000-character chat/history/draft contract, 256 KiB prompt budget, product requirement amendments and ADR 0013. Core suite (26 tests), targeted environment/voice/prompt/replay tests, chat repository persistence/history test and web typecheck pass. |
| 2026-11-02 | Phase 2 implementation | Added additive content-free session metadata migration, scoped session and chunk-attempt repository, create/chunk/heartbeat/close APIs, duration-based provisional reservations, renewable leases, separate rate windows, retry/idempotency limits, per-chunk word-timestamp transcription and a test-only injected provider seam. Handler, repository, provider, schema and disposable PGlite migration tests pass; web typecheck passes. Completion gate remains open until the handler and repository run together against disposable PostgreSQL; `COACH_VOICE_TEST_DATABASE_URL` is not configured here. |
| 2026-11-03 | Test database configured | Added ignored `packages/db/.env.test.local`, local-only PostgreSQL 17 Docker Compose configuration, guarded setup/migration command and `npm run db:test:voice`. All 25 migrations applied to disposable `racepredictor_voice_test` on loopback port 55432. All eight voice repository tests pass with zero skips, including separate Prisma-client concurrency. Full progressive handler/repository integration remains a separate gate. See [setup instructions](../COACH_VOICE_TEST_DATABASE.md). |
| 2026-11-03 | Staging verification iteration | Corrected session generation/sequence mapping found by real PostgreSQL integration, browser fetch binding, asynchronous cancellation, expired-session fencing, exact word boundaries, retry/edit preservation and duplicate insertion. All 26 Coach browser tests and five authentication browser tests pass. Full staging verification is being rerun sequentially after fixture updates and a concurrent-run memory failure. |
| 2026-11-03 | Automated staging candidate verified | Full sequential run `2026-11-03T04-00-09-869Z` passed: 147 core, 165 database, 236 web, TypeScript, production build and 181 browser tests; three mode-specific browser skips run in their corresponding configurations. Four additional database integration scripts passed in `2026-11-03T04-01-54-599Z`. Fixed missing athlete seed fixtures and pinned the migration gate's direct connection to its disposable schema. Real UI/HTTP/PostgreSQL dictation and 30,000-character send, replay, reload and history flow passes with synthetic audio and external providers mocked. Final database/unit/typecheck/build rerun `2026-11-03T16-05-03-008Z` also passed after restoring the disposable container. No remote deployment/migration or live activation performed. Manual device/accessibility, deployed smoke and rollback evidence remain open. See [verification guide](../ORBIT_STAGING_VERIFICATION.md). |
