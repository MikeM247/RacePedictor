# ADR 0011: Settings owns milestone timeline membership

- Status: Accepted through the owner's implementation request
- Date: 26 October 2026

## Decision

Retain approved plan milestones and saved race achievements as source records. Add one `MilestoneTimelineState` JSON record per athlete, revisioned independently, containing removal groups and explicit target-to-achievement links. Keep source IDs stable across plan versions; additional IDs need explicit reconciliation. Names and distance alone never merge events.

Home and Settings use one core projection through `GET /api/v1/coaching/milestones`. Settings saves remove/restore/link/unlink commands immediately. Removing a reconciled row suppresses its linked representations; removing an unlinked target preserves separate achievements. Restoration reverses only the selected removal. The primary goal remains managed through Plan.

Race completion and target performance are separate. Existing strict date/distance/time rules determine target success. Explicit owner confirmation may reconcile a GPS-distance or date difference but cannot rewrite source facts or award an unsupported time target. Unknown facts remain absent. Planned additions and target date/time edits retain the existing full-plan approval process.

## Integrity and failure behavior

Commands require the management revision and a digest of the currently verified source records. Cloud source reads participate in the transaction; mutations are serializable. SQLite reserves its writer before loading sources and applying state. Stale, foreign, unavailable and malformed sources cannot change membership. Reads create no membership rows. Existing source APIs remain compatible.

The shared reader includes source availability and stable references. Refresh failures retain the last successful composed view with a warning. Initial failures show unavailable rather than falling back to unfiltered approved milestones. Ambiguous writes require an explicit reload before retrying. Logs record operation, revision and outcome without result facts or credentials.

## Migration and rollback

Apply `20261025190000_milestone_timeline_state` before enabling the new readers. The additive table has an athlete foreign key; no plan or result backfill runs on page load. Local SQLite creates its table only on the first explicit command.

Keep stored decisions during rollback. Retain compatible readers, or temporarily hide the timeline; rolling back to the old reader would resurrect removed targets. Old session-storage removal requests are notices only and cannot proceed to plan review.

The one-time owner-confirmed race repair is a separately verified operation: inspect source IDs/revisions and the active approval hash, dry-run the projection, then persist only the membership relationship. Do not commit private production record IDs or results into fixtures or migration SQL.
