# Milestone 8 Product Owner Acceptance

**Date:** 2026-08-12
**Decision:** Needs Review — sign-off withheld

Feature: Owner-authenticated production foundation
Description: Make the accepted RacePredictor release candidate available online to its owner on free-tier infrastructure without exposing credentials or cross-athlete data.
Priority: High
Area: Vercel, Neon, authentication, production operations
Reason: This unlocks the live Strava and local Second Brain journeys while preserving the existing product boundaries.
Acceptance Criteria:
- The deployed dashboard admits only the configured owner through a real GitHub session.
- The session resolves persisted athlete access rather than a global runtime default.
- Neon migrations and owner access provisioning succeed with no credential disclosure.
- Health and protected-route smoke tests pass after deployment.
Dependencies:
- None for the production foundation; all acceptance criteria above now have live evidence.
Risks:
- A missing or incorrect secret must fail closed rather than weaken access control.

Feature: Real Strava and private raw-storage smoke
Description: Prove that one real owner activity travels from Strava webhook/backfill through canonical storage, private R2 retention, analytics, and the online dashboard exactly once.
Priority: High
Area: Strava, Cloudflare R2, ingestion, dashboard
Reason: Automatic completed-workout delivery is the primary user outcome.
Acceptance Criteria:
- The owner connects Strava with activity-read permission only.
- A bounded real activity appears once with expected summary data.
- Raw provider objects remain private and pass checksum verification.
- Retry or duplicate delivery does not create a duplicate workout.
- A history import reserves conservative shared provider capacity before a network call, retains its checkpoint on a provider-window pause or recoverable failure, and resumes without re-listing completed work.
Dependencies:
- Production deployment and database migration.
Risks:
- The free-tier daily scheduler is a recovery mechanism, not a high-frequency worker; a large history import may continue on a later scheduled pass after a provider-window pause.

Feature: Live selected Second Brain sync
Description: Pair the local Windows agent and prove that the online dashboard receives only the approved structured context fields while Obsidian remains locally authoritative.
Priority: High
Area: Local sync agent, Obsidian, cloud snapshots
Reason: Online RacePredictor must be current without uploading the vault or arbitrary notes.
Acceptance Criteria:
- The local device pairs with a one-time credential protected by Windows DPAPI.
- Only explicitly selected `second-brain-context.v1` sections are published.
- Vault files, Markdown, backlinks, paths, and unrelated metadata never reach the cloud.
- Online freshness and offline/replay recovery are verified on the owner's machine.
Dependencies:
- Production deployment and owner login.
- Owner provides the local Obsidian vault path and confirms the initial structured sections.
Risks:
- An incorrect local path or field choice can prevent useful context without compromising vault privacy.

## Product assumptions

- The existing Vercel Hobby and newly provisioned Neon Free resources remain suitable for the initial single-athlete workload.
- No paid upgrade or automatic spend is authorised.
- The existing `racepedictor.vercel.app` address is acceptable for the first production release.

## Prioritisation summary

The owner-authenticated cloud foundation, private R2 write path, Strava connection, and bounded history-import journey are now live. The remaining production evidence is deliberately narrower: one automatic webhook delivery and one explicit selected-field local context publication. This preserves the boundary that the vault must never be scanned or uploaded implicitly.

## Recommended next item

Run the paired local agent's first pull, then publish an owner-chosen `second-brain-context.v1` payload. This is the next smallest live check because the computer is already paired but has not started a sync.

## Sign-off

Product Owner accepts the owner-authenticated production foundation and the bounded real Strava history-import slice: an owner connection completed, the import job completed once, structured workouts appeared online, and raw source retention remained server-side. Automated Product Owner acceptance also passes for pacing: provider work is reserved before I/O, safely deferred work keeps its durable checkpoint, and recoverable retries retain progress. The deployed pacing release passed an authenticated Settings/Activities smoke check. Overall M8 sign-off remains withheld until a live automatic webhook delivery, independent raw-integrity read, and the local selected-field journey pass; those checks are required for the promised always-available automatic and selected-context outcome.
