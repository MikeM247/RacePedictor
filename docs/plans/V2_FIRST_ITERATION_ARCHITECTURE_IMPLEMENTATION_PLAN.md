# V2 First Iteration Architecture — Reflect and Prepare

Date: 22 October 2026\
Status: Recovered on `work`; preview Coach migration and integrated release validation remain\
Product scope: [V2 first iteration](../product/V2_FIRST_ITERATION.md)\
Approved interface: [AI Companion design handoff](V2_AI_COMPANION_DESIGN_HANDOFF.md)\
Decision record: [ADR 0010](../adr/0010-v2-conversation-led-coach.md)

## Outcome

The first V2 release makes `/dashboard` a conversation-led Coach experience on the authenticated online site. ORBIT offers a deterministic opening based on the latest activity or next effective session, answers free-text questions through the existing server-side OpenAI integration, and retains a single athlete conversation until the athlete clears it. Calendar, activity detail, Readiness, and the existing race plan remain their own destinations. The interface preserves the Coach topic, selected record, draft, and transcript position when the athlete returns.

The local Home and tools remain available. Chat is not exposed to device/internal credentials, does not publish conversation data to sync or Second Brain, and has no structured training mutation tools.

## Confirmed implementation decisions

- Runtime: authenticated online site first; local routes return unavailable and local Home remains unchanged.
- Provider: existing OpenAI integration through a server-only Responses API adapter.
- Model default: `gpt-5-mini`, low reasoning effort, `store: false`, no tools, complete text replies, 3,000 output-token ceiling.
- Conversation: one ongoing conversation per athlete; history is kept until explicit deletion in Settings.
- Release switches: `RACEPREDICTOR_COACH_UI_ENABLED=false` and `RACEPREDICTOR_COACH_CHAT_ENABLED=false` by default. The former selects the online Coach entry UI; the latter independently gates generation while history reads/deletion remain available.
- OpenAI key absence disables sending in the UI; a generation request that has already been accepted is durably marked failed with a safe recovery state.
- Model output is plain text. The application builds all URLs and actions from validated current training references.

## Component boundaries

| Layer | Implemented responsibility |
| --- | --- |
| `packages/core` | Strict Coach DTOs, message/request schemas, and the framework-independent effective next-session resolver. |
| `apps/web` client | Responsive Coach layout, transcript/composer, topic and record selection, session-scoped draft, pending/retry states, optional wellbeing form, and contextual return state. No DB access. |
| `apps/web` routes/services | Authenticated owner-session boundary, same-origin mutation checks, 32 KiB body bound, API envelopes, context assembly/fingerprints, provider calls and failure handling. |
| `packages/db` | Athlete-scoped conversation/message/turn/usage repositories and atomic lifecycle/concurrency operations. |
| Existing services | Approved plan/goal, effective session, activity facts, current published review, wellbeing, Calendar, Readiness and activity detail. |

The existing Today UI and Coach context both call `resolveCoachUpNext`; UI components do not independently infer whether an activity completed a session. Display advancement never records adherence or completion.

## Request flow

```mermaid
sequenceDiagram
  actor Athlete
  participant UI as Coach interface
  participant Route as Authenticated route
  participant Context as Context service
  participant DB as Athlete-scoped repositories
  participant AI as OpenAI Responses API
  Athlete->>UI: Open, choose topic, send message
  UI->>Route: GET context + conversation
  Route->>Context: Resolve current goal/session/activity/wellbeing
  Context->>DB: Read authoritative records and conversation marker
  DB-->>UI: Validated context, actions, saved transcript
  UI->>Route: POST turn with generation, sequence, record and fingerprint
  Route->>Context: Refresh and verify fingerprint
  Route->>DB: Lock, deduplicate, reserve quota, save athlete message and lease
  DB-->>Route: Commit durable processing turn
  Route->>AI: Complete response request (no tools, store false)
  AI-->>Route: Complete text + usage metadata
  Route->>Context: Revalidate material context
  Route->>DB: Fence lease and atomically save reply or safe failure
  Route-->>UI: Complete reply or durable failed turn
  UI->>Route: Poll conversation every 3 seconds while visible and processing
```

No database transaction is held during provider generation. A repeated client turn identity with identical content replays the existing result; changed content conflicts. Only one live turn is allowed per conversation. The 90-second lease, 60-second provider timeout and request fencing prevent late replies from being published after a retry or history clear. A lost response is reconciled from conversation state.

## Context and opening policy

The server assembles the active approved plan identity/version/hash, linked goal, effective selected session/revision/purpose/prescription/cautions, latest activity by occurrence time, a current published review with provenance/limitations, today's saved wellbeing answers, and at most ten activity summaries from 28 days. The provider receives only this structured allow-list and the last twenty completed messages. GPS routes, raw provider bodies, credentials, private Second Brain content, and unrelated records are excluded.

Saved plan timezone is used, falling back to `Africa/Johannesburg`. A semantic SHA-256 fingerprint includes the local date, source states, relevant identities/revisions and selected context, but not fetch timestamps. It is refreshed on entry/focus/return/date rollover and immediately before generation; a changed fingerprint prevents publication of stale advice.

The initial Coach opening is local and deterministic: explicit recovery state first; otherwise an unreflected latest activity; otherwise next effective training or prescribed recovery; otherwise general guidance. Same-day ambiguity asks the athlete to choose. The user message only advances the reflection marker when explicitly sent with a reflection topic and selected activity; no journal entry or workout association is created.

## Persistence and API

The additive migration adds `CoachConversation`, `CoachTurn`, `CoachMessage`, and `CoachUsageBucket`. Athlete identity participates in repository predicates and relational constraints. The database enforces sequence uniqueness, one assistant response per turn, client-turn idempotency per generation, bounded topic/state values, and separate athlete usage buckets. Snapshots are retained with turns until clear-history; chat tables are absent from sync and Second Brain relations.

All routes use `private, no-store`, strict core Zod contracts, and the existing envelope:

| Route | Result |
| --- | --- |
| `GET /api/v1/coaching/chat/context` | Current context, source state, deterministic opening, fingerprint, and application-built action references. |
| `GET /api/v1/coaching/chat/conversation?before={sequence}` | Latest forty messages, generation/sequence, pagination state, and current turn. |
| `POST /api/v1/coaching/chat/turns` | Persist one athlete message and request its complete reply. |
| `POST /api/v1/coaching/chat/turns/{turnId}/retry` | Retry the latest failed/expired turn with an expected attempt and new retry identity. |
| `DELETE /api/v1/coaching/chat/conversation` | Clear chat content and reflection markers transactionally, increment generation, retain content-free usage buckets. |

Athlete messages are limited to 4,000 characters, replies to 8,000, request bodies to 32 KiB, and assembled prompts to 48 KiB. Prompt trimming removes oldest prior messages first; essential selected-session cautions remain intact. Default quotas are six attempts/minute and sixty/UTC day per athlete, counting explicit retries. Failures and logs retain safe codes and provider metadata but not message/prompt text.

## Interface and continuity

The dark RacePredictor shell contains a compact goal strip and a light glacier conversation surface. Coach, Calendar and Readiness remain primary navigation; Settings is secondary. ORBIT's small static avatar is derived from the approved character sheet and falls back to an initials mark. Real accessible controls, not the design board, form the page. Topic choice and selected record remain explicit. The existing wellbeing form is mounted only after the athlete opens the check-in.

Coach-to-record navigation creates an opaque, two-hour recovery context in tab-local session storage. It carries topic, record identity, transcript anchor/scroll position and focus information; message text never enters the URL. Ordinary links and modifier-clicks retain the recovery link. The activity, calendar and plan views can return to Coach; the client refreshes current training facts and transcript on return.

Drafts are held in `sessionStorage` scoped by athlete. Logout clears Coach keys when the client next observes the unauthenticated session; successful history deletion clears the keys and notifies another Coach tab. The conversation itself is server-persisted and does not depend on browser storage.

## Rollout and rollback

1. Use the isolated Neon branch configured for Vercel Preview / Git branch `work`. The application validates and uses `RACEPREDICTOR_V2_DATABASE_URL` and `RACEPREDICTOR_V2_DATABASE_URL_UNPOOLED`, preserving the isolation fix in `bb513f12997de123018165b0b93b468b52b2703f`. Standard integration-injected database variables are not authoritative for this preview. Vercel Preview builds skip migrations.
2. Deploy static avatar derivatives and configure `OPENAI_API_KEY`, `RACEPREDICTOR_COACH_MODEL`, and both false-by-default feature flags.
3. Run automated tests with an injected provider; use synthetic training data for one deliberately bounded live preview smoke test.
4. Enable the UI for the online owner, then enable generation separately. Observe content-free latency, failures, lease expiry, duplicate suppression, context conflicts, quotas and usage.
5. Roll back by disabling chat generation, then disabling the Coach UI to restore the existing Home composition. Retain schema/history; do not reset the database.

## Historical release environment check — 23 October 2026

The Vercel project `racepedictor` has no custom staging environment. Its single `DATABASE_URL` and `DATABASE_URL_UNPOOLED` entries target both Preview and Production, so a normal Preview build would use the same database as Production. `OPENAI_API_KEY` is configured for Production only. The Neon project-connector lookup returned a 404, and no custom Vercel environments are configured. No Vercel environment values were decrypted or displayed, and no external database or provider operation was run.

This check predates the isolated infrastructure subsequently configured by the owner. Its shared-variable finding must not be used to override the dedicated V2 connection variables added in `bb513f1`. The Vercel build scripts skip migrations for Preview. Production builds retain the existing migration step; production deployment is outside this recovery task.

## Recovery and verification — 25 October 2026

The original local implementation, product/design documents, approved artwork, and migration were present and preserved in recovery stash `19bb7c8cb19643f72ad4bc0461e3a648640a0fda`. Local `work` was fast-forwarded to remote `bb513f1`, then the recovered changes were reapplied without conflicts. All four files introduced by the two preview-infrastructure commits remain unchanged. The explicit cloud test command now includes `preview-database-configuration.test.js` alongside the Coach repository tests.

Provider review fixed timeout coverage through response-body consumption, rejected failed/missing completion statuses and malformed output shapes, and retained all text parts. Synthetic provider tests exercise those cases without live requests.

Current checks:

- Combined gate: `RACEPREDICTOR_CLOUD_MODE=disabled npm run test:cloud` passes with executor permissions: 126 core tests, 89 database tests, 177 web tests, and the web TypeScript/lint gate (392 tests total).
- Core: all 126 tests across 22 files pass.
- Web: all 177 tests across 45 files pass with `RACEPREDICTOR_CLOUD_MODE=disabled`; tests that verify authentication enable cloud mode explicitly. The first unisolated run inherited cloud mode and returned 401 in four existing local-route tests; the isolated run resolves those failures.
- Database: all 89 tests across 19 files pass, including all-migration replay on populated PGlite fixtures, Coach tenant/uniqueness constraints, repository lifecycle tests, and the preserved preview-isolation tests. The initial sandboxed run lost captured child-process stderr in an existing CLI test; rerunning with executor permissions resolves that failure without changing the test.
- Web typecheck, Prisma schema validation, and `VERCEL_ENV=preview npm run vercel-build --workspace @racepredictor/web` pass. The build generates Prisma Client and compiles Next.js without applying migrations.
- Coach Chromium browser suite: 2/2 pass, including reflection display/send, reload/draft restoration, exact activity navigation and return, failed-reply retry without duplicate athlete messages, 320 px reflow, a 640 CSS-pixel layout check, and axe accessibility audit. These are synthetic browser journeys with intercepted chat APIs; they do not establish browser-to-database/provider integration.

### Required chat migration

`packages/db/prisma/migrations/20261022120000_v2_coach_conversations/migration.sql` adds `coach_conversations`, `coach_turns`, `coach_messages`, and `coach_usage_buckets` with athlete-scoped constraints. No training-data backfill is required. Confirm the isolated database's existing schema and Prisma migration ledger before applying it; a schema-only branch may need its already-present migrations baselined rather than replayed.

Prisma CLI does not use the application datasource override. Only inside the verified Preview / `work` environment, validate the dedicated connection pair with `readPreviewDatabaseOverride`, then map `DATABASE_URL` to `RACEPREDICTOR_V2_DATABASE_URL` and `DATABASE_URL_UNPOOLED` to `RACEPREDICTOR_V2_DATABASE_URL_UNPOOLED` for migration status/deploy commands. Do not use integration-injected defaults. This recovery task does not execute those commands against a remote database.

### Remaining release evidence

- Verify the migration ledger and apply the pending Coach migration to the isolated preview.
- Exercise authenticated deployed Coach routes with synthetic activity/approved-session data, real persistence/reload, follow-up messages, retries/lost-response reconciliation, history deletion during generation, and record-return continuity. Existing repository tests use a transaction-capable fake; concurrent Prisma operations need real isolated Postgres coverage.
- Known route limitation: new-turn and retry handlers validate current context before persistence-layer replay detection. A duplicate POST after a material context change can therefore return 409 rather than its saved result. Conversation reload remains available for reconciliation; strict replay semantics require a targeted route fix and integration coverage before pilot release.
- Run one bounded request through the actual Coach adapter/model in Preview. The preserved `scripts/verify-v2-preview.cjs` is a separate empty-database/owner/connectivity health smoke and expects zero activities; it does not exercise Coach turns or the Coach model settings. Run it before introducing synthetic training records if still needed.
- Complete actual 200% browser zoom, mobile keyboard/composer, image fallback, long transcript/no-forced-scroll, and owner-authenticated Calendar/Plan/Readiness regression coverage. Prior browser runs found an obsolete goal fixture expectation, an interrupted alternate-host OAuth navigation, and a legacy F08 upload-initiation mock gap; those broader suites were not rerun during recovery.

Both Coach switches remain false by default: `RACEPREDICTOR_COACH_UI_ENABLED` and `RACEPREDICTOR_COACH_CHAT_ENABLED`. Infrastructure provisioning is reported complete by the owner; live configuration and provider/database health are not re-certified by these local checks. No Production deployment, external database write, or live provider call is performed as part of this source recovery.
