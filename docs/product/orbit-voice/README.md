# Orbit Voice — Product and Architecture Handoff

Prepared 28 October 2026 · Revision 0.2 · Product requirements and implementation handoff

**Decision:** add reviewable dictation to the existing Orbit Coach first. Deliver optional spoken replies separately; investigate live conversation without committing it to these releases.

## Read in this order

1. [Concise BRD](BRD.md): business need, users, scope, value and success measures.
2. [Requirements](REQUIREMENTS.md): numbered behaviours, quality targets, acceptance and architecture deliverables.
3. [UI/UX designer handoff](../../design/orbit-voice/UI_UX_HANDOFF.md): flows, state rules, screen changes and visual assets.
4. [Software implementation plan](../../plans/ORBIT_VOICE_IMPLEMENTATION_PLAN.md): selected provider, contracts, architecture, limits, tests and release gates.

Optional background: [owner-supplied research](research/VOICE_RESEARCH_INPUT.md), retained as an unverified source rather than an architecture commitment.

The designer directory contains the desktop/mobile mockups, flow diagram and editable visual sources. Visuals illustrate the experience; written requirements and the implementation plan govern behaviour.

- [Desktop dictation review](../../design/orbit-voice/desktop-dictation.png).
- [Mobile recording, review and playback](../../design/orbit-voice/mobile-voice-states.png).
- [User flow](../../design/orbit-voice/user-flow.png).
- [Editable mockup source](../../design/orbit-voice/mockups.html).
- [Visual concept board](../../design/orbit-voice/concept-board.png), for style; the deterministic mockups and written requirements govern interaction.

## Architecture brief

Reuse the current online Coach conversation and training context. Keep speech capture/transcription, text coaching and optional synthesis as explicit capabilities. Carry operation scope, cancellation and recovery through the whole journey. Preserve current chat archives, deletion controls, athlete access, drafts and training approval boundaries.

The selected architecture uses OpenAI transcription and synthesis behind separate release switches, with an additive athlete-scoped cost ledger and same-origin Coach routes. Voice controls are implemented locally in the existing Coach. Both voice switches remain off by default; the database migration has not been applied, no live provider request was made, and provider account access, current pricing and retention terms still require verification before a pilot.

## Scope key

| Stage | Deliverable |
| --- | --- |
| V1 | Speak → editable transcript → draft → explicit send through current chat. |
| V1.1 | On-demand playback of saved current-chat coach replies. |
| Discovery | Live voice value, feasibility, interruption handling and economics. |

Baseline references and precedence are recorded in [Requirements §1](REQUIREMENTS.md#1-baseline-and-authority). Pilot and latency targets remain acceptance criteria to validate, not research findings. Application source and tests are in the RacePredictor repository; this package carries the product, design and software handoff.
