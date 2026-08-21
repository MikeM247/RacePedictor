# Milestone 1 Evidence — Cloud Strava and Second Brain Sync

**Milestone:** M1 — decisions, boundaries, architecture, backlog, and test strategy  
**Date:** 2026-08-10  
**Status:** Accepted

## Delivered scope

- Product outcome, MVP, exclusions, 21 implementation-ready stories, acceptance criteria, dependencies, risks, and M1–M8 gates.
- Accepted architecture decision for Vercel, Neon, private R2, Strava-first ingestion, local SQLite projection, and local Obsidian authority.
- Provider-neutral ports and athlete-scoped authentication, persistence, job, object, device, change-feed, and snapshot boundaries.
- Strict `second-brain-context.v1` privacy contract:
  - only explicitly selected availability, training preferences, constraints, wellbeing check-ins, and activity reflections;
  - exact nested field, enum, range, and cardinality allow-list;
  - no arbitrary text, goals, prescriptions, note/vault identity, paths, attachments, secrets, or raw provider data;
  - immutable revision/hash rules and 64 KiB request limit;
  - local validation and independent cloud revalidation.
- Continuous automated QA strategy, two-athlete isolation model, synthetic fixture catalogue, failure/replay/recovery matrix, critical browser journeys, and formal Product Owner evidence rules.
- Visual milestone tracker and aligned architecture, API, schema, roadmap, UX, screen, context, and progress source documents.

## Requirement evidence

| Requirement | Evidence | Result |
|---|---|---|
| Strava first; Garmin excluded | ADR 0003, backlog scope/exclusions, roadmap | Pass |
| Other athletes later without re-architecture | `ActorContext`, `User/Athlete/AthleteAccess`, athlete-scoped ports/models/tests | Pass |
| Raw data in cloud storage | Private R2 decision and `RawObject` metadata boundary | Pass |
| Online dashboard independent of local Obsidian | Cloud-authoritative topology and separate freshness model | Pass |
| Only selected structured Second Brain fields | Exact strict v1 allow-list and prohibited-data rules | Pass |
| Free-tier only | Vercel Hobby, Neon Free, R2 free-tier recovery/guardrail plan | Pass |
| Authentication requested only when needed | Credential-free M1–M7, fail-closed production seam, owner-dependent M8 | Pass |
| Automated QA and product testing throughout | Test pyramid, milestone gates, fixtures, browser journeys, evidence template | Pass |
| Product Owner sign-off before completion | Per-milestone gate plus formal M7 and production M8 decision | Pass |

## Automated QA evidence

The pre-cloud regression baseline was executed before feature implementation:

| Check | Result |
|---|---|
| Core contract/domain tests | 15/15 pass |
| Web route/view-model tests | 22/22 pass |
| Web typecheck | Pass |
| Local activity pipeline tests | 3/3 pass |
| Local coaching tests | 6/6 pass |
| Documentation/diff whitespace check after M1 integration | Pass; repository line-ending notices only |

Cloud-specific executable suites are intentionally implemented from M2 with the contract and adapter code. Their required coverage is fixed by the M1 strategy and cannot be waived at later gates.

## Product testing

- Walked the end-to-end conceptual journey from Strava event to durable receipt, private raw retention, canonical activity, online dashboard, local change feed, and selected context snapshot.
- Confirmed the online dashboard does not depend on the local computer.
- Confirmed activity freshness, Second Brain snapshot freshness, and local-device freshness are independent.
- Confirmed no ingestion, sync, or context-publication path can approve, activate, replace, or adapt a plan.
- Confirmed the one-athlete UI has no athlete switcher or future-scope controls.

## Risks and controls

| Risk | M1 control | Later proof |
|---|---|---|
| Free-tier delay/cold starts | Durable jobs, reconciliation, honest status; no SLA promise | M6 fault/guardrail tests; M8 live smoke |
| Provider/API differences | Provider adapter and synthetic Strava contract fixtures | M3 adapter tests; M8 real OAuth/webhook smoke |
| Cross-athlete disclosure | Athlete scope at every port and record; two-athlete test default | M2–M6 isolation tests; M8 denial smoke |
| Vault/privacy leakage | Closed no-free-text v1 schema and validation at both edges | M2/M5 privacy and redaction suites |
| Dirty pre-existing worktree | Isolated `codex/cloud-strava-sync` branch; additive, targeted edits | Diff review at every milestone |

## Gate decision

Product Owner decision: **PASS — Milestone 1 accepted; Milestone 2 may begin.**

The independent review passed UR-01 through UR-16 and all six M1 backlog gates with no M1 release blocker. Non-blocking risks RG-01 through RG-06 have mandatory later gates. See `docs/product/CLOUD_STRAVA_SYNC_M1_ACCEPTANCE.md`.
