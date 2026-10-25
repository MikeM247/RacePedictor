# ADR 0010: V2 conversation-led Coach boundary

> **25 October 2026 product-owner amendment:** Coach remains a separate V2 destination at `/dashboard/coach`; it no longer replaces the Home landing page. `/dashboard` is the minimal goal-and-milestone Home with the revised Talk to Orbit artwork entry. The Coach UI switch gates its navigation, launcher, and route; the generation switch continues to gate only chat replies. See the updated [V2 implementation plan](../plans/V2_FIRST_ITERATION_ARCHITECTURE_IMPLEMENTATION_PLAN.md) and [screen contract](../design/screens.md).

- Status: Accepted
- Date: 22 October 2026
- Deciders: Product Owner and architecture implementation
- Related: [V2 first-iteration architecture](../plans/V2_FIRST_ITERATION_ARCHITECTURE_IMPLEMENTATION_PLAN.md), [approved Coach design](../plans/V2_AI_COMPANION_DESIGN_HANDOFF.md)

## Context

The approved V2 first iteration makes ORBIT a distinct conversation destination linked from the retained Home page. Coach starts with a conversation about the last activity or next effective session and then links into the existing Calendar, activity detail, and race-plan views. Home continues to present the approved goal, scenic running journey, complete read-only milestones, and a Coach entry. The application already owns authoritative training state, explicit plan approval, effective session amendments, activity review generation, wellbeing records, authenticated cloud composition, and a server-side OpenAI integration.

An interactive conversation needs durable messages and failure recovery, but it must not create a second training authority or make browser/device credentials equivalent to an owner session.

## Decision

Implement one ongoing, athlete-scoped conversation in the authenticated online application. The existing server-side OpenAI integration calls the Responses API with `gpt-5-mini` by default, low reasoning effort, `store: false`, no tools, a 60-second timeout and a complete reply. Conversation persistence is additive and retained until the athlete explicitly clears it.

Core owns strict contracts and shared next-session selection. Existing repositories provide approved/effective plan context, activities, published reviews and wellbeing. The server constructs a bounded, timezone-aware context and a semantic fingerprint before generation, then revalidates it before publishing the reply. Context change fails the turn safely. The provider returns plain text only; the application constructs validated activity/session/plan links.

Database turns use a durable lease, deduplicated client identity, a per-athlete quota reservation, and a fenced completion. A provider call occurs outside the transaction. Clearing history deletes conversation messages/turn snapshots/reflection markers and increments the generation atomically, so an in-flight reply cannot recreate cleared content. Content-free usage counters remain.

Two server-controlled switches independently gate the Coach entry UI and generation. Both default off. In online mode, the UI switch controls the Coach navigation item, Home launcher, and `/dashboard/coach`; local mode keeps Home/tools and omits Coach. Direct Coach navigation returns Home when the UI is unavailable. History read and deletion remain possible while generation is paused. Home contains no Today, latest activity, plan link, milestone management action, check-in, or chat composer; milestone management stays in Settings.

## Consequences

- The first iteration delivers genuine multi-turn reflection/preparation and reload persistence without a queue, background worker, vector database, or generated memory.
- Every turn reuses current training services. Chat cannot mutate or approve plans, schedule sessions, mark completion, write wellbeing, or publish to Second Brain.
- Session-scoped drafts and opaque recovery context preserve the browser journey; message content never enters URLs.
- Owner-session checks, same-origin mutation checks, athlete-scoped DB constraints and false-by-default flags bound exposure.
- The product pays per-request latency because replies are complete rather than streamed. Stale provider results are discarded through context/lease fencing.
- Neon deployment and live-provider release smoke remain operational release gates; accepting this ADR does not perform either deployment.

## Alternatives considered

- **Local chat in iteration one:** rejected because the product owner selected online-first release.
- **Provider tools that can edit training:** rejected because existing approval and reasoned mutation workflows remain authoritative.
- **One-off stateless requests:** rejected because the athlete needs a resumable multi-turn conversation.
- **Streaming, queues or background workers:** deferred; durable synchronous turns fit the bounded pilot and simplify release operations.
- **Vector memory or Second Brain ingestion:** deferred to keep context explicit, bounded, refreshable and privacy-limited.
