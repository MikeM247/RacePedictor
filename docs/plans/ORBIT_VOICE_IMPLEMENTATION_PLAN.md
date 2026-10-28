# Orbit Voice — Implementation Plan

28 October 2026 · Product Owner authorization: dictation and optional reply playback

Product inputs: [voice requirements](../product/orbit-voice/REQUIREMENTS.md), [business requirements](../product/orbit-voice/BRD.md) and [UI/UX handoff](../design/orbit-voice/UI_UX_HANDOFF.md).

## Implementation status

Local source, additive migration, Coach UI, provider adapters and automated unit/handler tests are implemented. Both voice release switches default off. This work did not apply the migration, send live audio to OpenAI, verify project access/pricing/retention terms, or run the named-device pilot. Complete those release gates before enabling a pilot.

## Delivery

V1 adds reviewable dictation to the authenticated `/dashboard/coach` conversation. V1.1 adds on-demand playback for saved coach replies. Live conversation remains discovery. Preserve the separate Home, current training links and the explicit training-change workflows.

The owner selected OpenAI speech with the transcription model `whisper-1`, speech model `tts-1` and voice `onyx`. The proposed application allowance is US$5 per athlete per UTC month, excluding existing text chat, tax and hosting. These models and a release switch remain server-configured. Feature flags default off. Before enabling speech, verify account model access, current prices, applicable provider data retention and measured latency against the N03 limits. Do not silently substitute another provider or model.

## Architecture decisions

- Capture mono 16 kHz signed PCM as canonical WAV with a same-origin `AudioWorklet`. A 120-second capture is 3,840,044 bytes, under Vercel’s 4.5 MB request limit. No MediaRecorder, browser speech recognition or FFmpeg fallback.
- Add authenticated, same-origin `/api/v1/coaching/voice/capabilities`, `/transcriptions` and `/speech` handlers. Keep binary audio out of JSON and use raw WAV requests. Speech responses are uncached `audio/mpeg`.
- Send English audio only to OpenAI; send no athlete, workout or conversation context to transcription. Synthesis reads the exact saved assistant message. Deterministically split its complete normalized text into ordered ≤1,200-character chunks; never summarize or truncate it.
- Store no audio, generated clips, unsent transcripts, message text, selected record or content hash in speech persistence/telemetry.
- Add athlete-scoped `CoachVoiceUsageBucket` and content-free `CoachVoiceAttempt` models. Serialize admissions per athlete across instances. Enforce six provider attempts/minute, 60/day and the US$5/month admission allowance before every OpenAI request. Reserve conservative ceilings: US$0.01 per started transcription minute and US$30 per million synthesis characters.
- Stop microphone/playback, invalidate pending work and discard transient audio on cancellation, context/generation change, navigation/page hiding and logout. Reject stale responses. Explicit Send continues through the existing chat request and idempotency path.
- Add false-by-default `RACEPREDICTOR_COACH_DICTATION_ENABLED` and `RACEPREDICTOR_COACH_PLAYBACK_ENABLED` flags. Dictation also requires existing Coach UI/chat flags and the server OpenAI key. Playback requires Coach UI and its own flag.

## Implementation sequence

1. **Capture and privacy gate:** verify model access/prices, retention terms, account access, WAV transcription and MP3 synthesis. Implement no live provider request until the gate is recorded.
2. **Contracts and persistence:** add strict voice request/response contracts, usage/attempt schema and additive Prisma migration. Implement the transactional allowance/rate ledger, operation dedupe, lease and content-free outcomes.
3. **Server services:** add capability projection; bounded WAV validation and timeouts; injectable transcription/synthesis providers; generation/sequence/context checks; current-message scoping for playback; private/no-store audio responses.
4. **Dictation UI:** implement the worklet, disclosure, permission handling, recording/transcribing/review/failure states and insertion into the current draft. Preserve typed edits, make append/replace explicit, reject overflow without truncation and require Send for every chat turn.
5. **V1 pilot:** test supported desktop browsers, iOS Safari and Android Chrome; deploy with dictation only; record performance, operation cost and owner task results.
6. **Playback:** implement a single opt-in audio player, deterministic formatting/unit cleanup, sequential reply chunks, pause/resume/stop and audio retry without generating another coach reply.
7. **Release evidence:** independently verify V1 and V1.1, map requirements to tests, record operational cost/latency and confirm disable/rollback.

## Boundaries and limits

- Canonical WAV: exactly 16,000 Hz, mono, PCM16 little-endian with a 44-byte RIFF/WAVE header. Accept 0.5–120 seconds and at most 3,840,044 bytes. Validate actual bytes, not client duration or `Content-Length` alone. Detect all-zero PCM before dispatch.
- Transcription: client 20-second deadline, server provider deadline 18 seconds, maximum reply content 16,000 characters in transient memory, then discard on insertion/cancel/exit or five minutes. Silence/invalid output returns an actionable recoverable error.
- Synthesis: at most 1,200 UTF-16 characters per request and 7,200 normalized source characters per saved reply (six sequential provider calls fit the six-attempt/minute limit). Preserve punctuation and meaning while removing presentation-only formatting; never speak link destinations or stored training context. Generate one chunk at a time and retain it only until playback stops or five minutes from preparation.
- Serialize operations with a 30-second leased database attempt; never hold a database transaction open over provider I/O. Duplicate IDs never reissue a provider request. Charge/reserve before dispatch; do not refund uncertain failures.
- Keep minute/day/month usage buckets in UTC. The cap is a server-side admission allowance at conservative provider-rate ceilings; disclose that it excludes tax and hosting.
- Persist only operation ID, kind, model, input units, reserved micro-USD, state/timestamps, latency and safe outcome. No feature creates a migration tied to conversation content.
- Before first microphone capture disclose the selected provider and link its data controls. Do not claim zero provider retention without evidence. If terms/access/prices exceed the fixed reservation assumptions, keep that feature disabled and report the blocker.

## Verification and rollout

Unit-test RIFF metadata, malformed/oversized/short/silent audio, exact 120-second limit, sample counts for 44.1/48 kHz input, chunk reconstruction, unit cleanup, allowance arithmetic, time windows, concurrent reservations, operation dedupe and stale leases. Route-test owner-session/same-origin checks, audio cancellation, provider failure/timeouts and stale generation/sequence. E2E-test typed draft changed during capture, append/replace/discard, >4,000-character recovery, no implicit send, 120-second stop, denied permissions, background/navigation cancellation, cross-tab archive/delete and every playback state. Check no content/audio in DB rows or logs.

Run core, web and cloud DB suites, web typecheck/build and Coach Playwright. Run the V1 migration on a non-production Neon branch or the existing guarded staging pipeline before a pilot; use a direct database URL for migration. Never apply migrations or enable flags in production as part of local implementation.

Collect ≥30 samples per latency measure. Acceptance targets: control feedback ≤200 ms; p95 stop-to-editable transcript ≤5 seconds on a 30-second clip; p95 first playback audio ≤3 seconds for a saved reply on a named device/network. Pilot V1 with the owner (≥9/10 representative tasks without help and voluntary use on three training days). Playback is a separate release and must pass its own privacy, cost and latency checks.

Disable the feature-specific flag to roll back. Preserve the additive schema, content-free usage records, coaching history and text Coach. Do not clear chats or reverse a migration for rollback.
