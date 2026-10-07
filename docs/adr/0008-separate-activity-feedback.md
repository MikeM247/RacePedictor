# ADR 0008: Separate Cloud Coach and Local Athlete Feedback

**Status:** Accepted and implemented in `codex/separate-activity-feedback`
**Date:** 2026-10-01

## Decision

Completed activities expose two independent feedback streams. AI coach feedback is generated online from canonical activity metrics and the applicable approved workout plan. It excludes athlete reflections, Second Brain prose, descriptions, previous reviews and subjective effort. AI athlete feedback is created during a local Codex conversation and published only as an owner-approved artifact through the paired-device boundary.

Coach work is durable and athlete-scoped. Canonical Strava changes enqueue a revision-fenced request, and the server worker claims, calls the OpenAI Responses API with strict structured output, validates the result, and publishes an immutable review revision. Import success does not depend on OpenAI availability. Existing mixed reviews remain readable as `legacy_combined` history.

The browser never receives the OpenAI key and never sends personal conversation content to the coach worker. Coach feedback cannot alter plans, calendar state, completion state or predictions. Athlete feedback cannot overwrite coach feedback.

## Consequences

- Activity pages can show coach processing state and the exact missing-athlete-feedback message independently.
- The existing local coach writer is no longer invoked by `sync-and-publish`.
- A server-side `OPENAI_API_KEY` and model configuration are required for automatic coach generation.
- Activity revisions and artifact hashes protect against stale or replayed athlete publications.
- Online CSV/GPX upload normalization uses the existing bounded parsers behind an authenticated R2 upload-initiate/complete boundary. The direct path preserves the 15 MiB limit and private immutable raw content; the multipart endpoint remains as a small-upload development compatibility path.

## Operational policy

Use `store: false` for independent Responses API requests. Retry transient provider failures through the durable request state; configuration and authentication failures require attention. Preserve the last valid coach review while a newer revision is pending. Disable new claiming/generation/publication to roll back without deleting activities or saved feedback.

## Athlete-authored journal extension (2026-10-06)

The activity page now has a separate, editable athlete journal record (`ActivityReflection`) and Home has an optional daily recovery record (`DailyWellbeingCheckIn`). These records use additive owner-scoped APIs and revision checks. They are never merged into `ActivityAthleteFeedback`, do not enqueue online coach generation, and do not alter predictions, completion, plans, or calendar state. Paired-device feedback context may read the records as explicitly athlete-authored observations; missing answers remain missing.
