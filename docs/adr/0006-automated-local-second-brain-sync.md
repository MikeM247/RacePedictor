# ADR 0006: Automated local Second Brain publication and cloud projection

- **Status:** Accepted for implementation
- **Date:** 2026-08-28
- **Decision owners:** Product Owner and RacePredictor delivery team

## Context

The paired local device can already pull cloud changes and publish a manually supplied strict `second-brain-context.v1` JSON file. The owner needs ordinary local Obsidian changes to be published safely without making the vault, a local PostgreSQL database, or Obsidian notes the source of truth for plans, calendars, or activities.

Cloud plan/calendar/activity changes must also be available in the Second Brain without overwriting owner-authored note text. A network retry after a cloud snapshot has been accepted must replay the same immutable revision rather than construct a different payload.

## Decision

1. The only automatic local publication source is a fixed, vault-relative JSON document: `RacePredictor/second-brain-context.v1.json`. It contains only `selectedFields`, `context`, and optional logical source references. The agent never scans the vault or parses prose Markdown.
2. The local agent reads the configured source only on its bounded scheduled run or an explicit manual command. This is polling, not a real-time save hook; it is intentionally recoverable and does not require an Obsidian plugin.
3. Before any API call, the agent validates the source against the existing strict allow-list, canonicalizes it, and writes the exact immutable snapshot into a local SQLite outbox. The outbox preserves retries, ordering, and idempotency while offline.
   A semantic reversion (A → B → A) is a new monotonic revision because it changes the latest effective context; only an immediate no-op repetition is rejected.
4. The scheduled run pulls cloud changes first, then drains the local publication outbox. Pull failure and publication failure are independent, observable outcomes.
5. Cloud activities, approved plans, and effective calendar sessions are rendered only inside an atomic, managed span in `Dashboards/RacePredictor Cloud Sync.md`. Text outside the span remains byte-for-byte unchanged. Marker corruption fails closed rather than risking note overwrite.
6. This decision does not change authority: Obsidian owns selected qualitative source material; Neon owns activities, approved plans, effective calendars, revisions, and operational state. Local publication cannot mutate plans, goals, calendars, provider connections, or activities.

## Consequences

- The existing paired-device credential remains DPAPI-protected and the vault path/source JSON never cross the API boundary.
- Publication is normally current within the configured interval (default 15 minutes) and supports an explicit immediate run. It does not promise instantaneous syncing.
- A local SQLite migration and regression tests are required for the outbox, marker preservation, invalid-source rejection, replay, and plan/calendar projection.
- A future Obsidian plugin may trigger the same bounded local command after save, but it is not required for this delivery.

## Rollback

Disable the scheduled local command or revert it to pull-only. Pending local outbox records and accepted cloud snapshots remain intact; no cloud or user-authored note data is deleted.
