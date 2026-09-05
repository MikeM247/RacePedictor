# ADR 0005: Reasoned future-session amendments

- **Status:** Accepted
- **Date:** 2026-08-13
- **Decision owners:** Product Owner and RacePredictor delivery team
- **Related:** `0002-digital-coach-control-boundaries.md`, `0004-approved-plan-selection.md`

## Context

The athlete needs to change future steps in an active training plan when availability, recovery, or circumstances change. RacePredictor already permits auditable reschedule, skip, and restore actions locally, but their reasons are optional, prescription fields cannot be amended, the deployed cloud Calendar is read-only, and the generated AI context does not contain adjustment reasons.

Directly updating an approved plan would erase the distinction between the prescription that was explicitly approved and the athlete's later working choice. Requiring a new complete plan proposal for every single-session change would preserve version semantics but make routine self-management unnecessarily heavy.

## Decision

RacePredictor represents a manual change to a future session as an append-only amendment overlay:

- the approved plan, approved workout, approval metadata, and content hash remain immutable;
- a session is eligible for an amendment, reschedule, or restore only when its effective local date is after the athlete's current local date in the saved plan timezone; a session before the athlete's current local date may only be recorded as skipped;
- title, purpose, prescription, duration, distance, RPE, start time, cautions, effective date, and skipped/upcoming state may be overridden within existing workout invariants;
- session identity, kind, prescribed date, plan range, weekly structure, and goal remain immutable and require the normal proposal-and-approval workflow to change;
- every amend, reschedule, skip, and restore command requires a trimmed reason of 1 to 500 characters;
- each command records the actor, timestamp, reason, changed-field allow-list, exact before/after state, expected revision, and resulting revision; a past-session skip may change only status and is not a completion/review signal;
- Calendar and Today derive a current working session from the approved prescription plus ordered amendments and expose both states clearly;
- the authenticated cloud store is authoritative for online changes, and equivalent local behavior remains available in local mode;
- paired-device credentials cannot author amendments;
- structured amendment history is included in a versioned coaching review artifact for later AI review, but no AI may automatically apply, approve, or activate a change.

The existing optional-reason calendar endpoint remains compatible for legacy clients. The application uses a new additive amendment command whose reason is mandatory.

## API

`POST /api/v1/coaching/calendar/sessions/:sessionId/amendments`

The request supplies `expectedRevision`, an idempotency key, a required reason, an operation, and an allow-listed change object. The response returns the effective session and the persisted amendment.

`GET /api/v1/coaching/calendar/sessions/:sessionId/amendments`

The owner-only history response is ordered, bounded, and contains only the structured amendment audit for that active-plan session.

Calendar and Today responses evolve additively with prescribed/effective state, amendment presence, and the latest amendment. Existing top-level session fields continue to represent the effective state during compatibility transition.

## AI Review Boundary

Amendment reasons do not enter `second-brain-context.v1`, whose selected-field and no-arbitrary-text boundary remains unchanged. RacePredictor publishes a dedicated, versioned coaching review context containing the active approved-plan identity/content hash, prescribed and effective future sessions, amendment identities/revisions, reasons, changed fields, before/after values, actor kind, and timestamps. Its deterministic content hash changes whenever an amendment changes.

The UI states that the history is available for later AI review. It never claims that review has happened or that an AI will automatically adapt the plan.

## Consequences

The athlete can make practical future-session changes and correct a missed past-session record without losing approval provenance. Calendar, Today, local sync, cloud reads, and later AI review gain a shared effective-session model and optimistic concurrency boundary.

This introduces a two-state model—approved and effective—that must remain explicit in contracts and UI. Amendment reasons may contain sensitive personal or health context, so they are owner-scoped, length-bounded, HTML-escaped, excluded from routine logs/metrics, and never exposed through public status surfaces.

## Rollout and Rollback

The schema and contracts are additive. Production rollout creates and backfills cloud session projections, enables dual-read fallback, then enables owner mutation and UI after QA and Product Owner acceptance. Rollback disables new amendment writes and the edit UI while retaining the append-only records and serving the latest safe effective state; no destructive down-migration is required.
