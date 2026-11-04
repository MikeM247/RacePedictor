# ADR 0013: Progressive ORBIT dictation

**Status:** Accepted for phased implementation  
**Date:** 2 November 2026  
**Plan:** [Progressive dictation implementation tracker](../plans/ORBIT_PROGRESSIVE_DICTATION_IMPLEMENTATION_PLAN.md)

## Context

The current Coach offers reviewable microphone dictation as one upload capped at two minutes. A useful race reflection may take ten to fifteen minutes. Raising the duration on the existing WAV request would exceed the hosting request-body limit and leave the athlete waiting for one transcription response.

## Decision

Add progressive dictation as a separate, disabled-by-default capability. Keep legacy single-request dictation limits intact while progressive sessions use bounded WAV chunks and authenticated same-origin session APIs. Show ordered transcription as it completes; only explicit insertion changes the draft, and only the existing Send action creates a coaching turn.

Use content-free session metadata and the existing athlete-scoped usage ledger. Never persist raw audio or uninserted transcript text. Keep the existing US$5 monthly voice allowance; treat the proposed US$0.35 session reservation as provisional until provider prices are verified.

Raise the shared Coach user-message and draft limit to 30,000 characters. Preserve the complete current message and coaching instructions when building the prompt, removing older history first. Validate model token capacity before enabling progressive dictation.

## Consequences

- Delivery is phased: long-message baseline, session API and accounting, capture and review UI, then full mocked end-to-end verification.
- Progressive request, session and transcript limits are distinct from legacy dictation limits.
- The progressive switch stays off until mock verification passes; live activation also requires provider price, retention, timestamp quality, device and latency evidence.
- Mock provider tests verify application behavior, not real speech recognition quality or provider billing.
