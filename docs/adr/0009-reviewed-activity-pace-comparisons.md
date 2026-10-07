# ADR 0009: Reviewed activity pace comparisons

Status: Accepted for implementation, 2026-10-06.

## Context

Activity splits need to show actual pace against the race or workout prescription reviewed by the athlete. Prescriptions are prose, may include ranges or effort guidance, and may belong to a retired plan. Selecting today's active plan or automatically interpreting prose would misrepresent historical intent.

## Decision

Store approved comparison blocks in a separate append-only ActivityPaceComparison record. The paired-device workflow explicitly selects an activity, approved plan and session. It may select a specific amendment revision; otherwise it uses the original approved prescription. Codex prepares blocks, the owner reviews them, and an approval artifact seals the exact content with SHA-256. Publishing verifies the source snapshot, activity fingerprint, expected activity/comparison revisions and active device inside a serializable transaction. Repeated identical artifacts are idempotent; changed or concurrent artifacts require another review.

The snapshot contains plan identity/version/approval hash, session identity/revision, title and prescription. Replacing the active plan does not rewrite this snapshot. Changes to recorded split index, distance or pace make the comparison stale. The read model then withholds numeric overlays while keeping actual bars available.

Shared browser-safe pace formatting and comparison logic drive one responsive component used by Calendar and Training. The component renders SVG bars and per-split target markers; no chart dependency or runtime AI call is required. Publication and hashing remain server-side. Numeric exact, approximate, range, and nonnumeric effort blocks are distinct types. Missing coverage remains explicitly unplanned.

## Consequences

- Plan/proposal contracts, hashes, completion matching and provider ingestion are unchanged.
- A chart appears for every imported run with split data. Approved targets require a separate reviewed publication.
- Historical corrections append a new revision. There is no in-app pace editor or automatic plan matching.
- PostgreSQL is the publication authority. SQLite caches accepted receipts for local viewing when the CLI is configured with RACEPREDICTOR_DATABASE_PATH; another device does not automatically receive that cache in this version.
- The saved hash is an integrity check, not proof of human approval by itself. The existing trusted paired-device workflow and explicit owner review remain the approval boundary.
- Roll back overlays/publication with RACEPREDICTOR_PACE_COMPARISONS_ENABLED=false. Actual split charts remain available.

Implementation, release steps and exact commands: [Activity split comparison](../plans/ACTIVITY_SPLIT_COMPARISON.md).
