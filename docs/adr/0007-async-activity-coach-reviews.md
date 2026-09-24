# ADR 0007: Asynchronous Activity Coach Reviews

**Status:** Accepted and implemented  
**Date:** 2026-09-09

## Decision

RacePredictor generates activity feedback asynchronously on the paired local Windows device. The job reads the local activity and approved-plan projection plus explicitly selected structured Second Brain context, sends that bounded context to the OpenAI Responses API, validates a strict review contract, and publishes the review through athlete-scoped device endpoints. The web application displays the stored result and never calls OpenAI directly.

The review is explanatory coaching feedback. It cannot mark a workout complete, alter a plan, activate a plan, or create a prescription. Plan matching is suggested only when exactly one active planned workout falls on the activity's local date; missing or ambiguous evidence is shown as a limitation.

## Consequences

- A new review can be queued immediately while generation waits for the local scheduled job.
- The web app remains useful when the local device or OpenAI is unavailable; it shows the current request state and preserves the activity record.
- Device claim/publish leases protect athlete scope and prevent a browser from publishing an AI artifact.
- The local job requires `OPENAI_API_KEY`; a missing key becomes an actionable `attention` state.
- Production needs the new Prisma migration before review routes can persist requests or results.

## Rejected alternatives

- Direct browser-to-OpenAI generation would expose the API key boundary and make the activity page dependent on AI availability.
- Automatic plan adaptation would exceed the accepted Phase 1 coaching authority boundary.
