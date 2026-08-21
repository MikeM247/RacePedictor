# Product Owner Acceptance: Reasoned Future-Session Editing

- **Decision:** Accepted for production launch
- **Date:** 2026-08-13
- **Product owner:** RacePredictor product owner
- **Story:** `FUTURE_PLAN_SESSION_EDITING.md`
- **Architecture decision:** `../adr/0005-reasoned-future-session-amendments.md`

## Outcome Review

The delivered feature satisfies the intended product outcome: an athlete can adapt a future training session from RacePredictor without rewriting the approved plan, and every change carries a durable explanation that is available for later AI coaching review.

The accepted interaction is intentionally centred in Calendar. Today shows the resulting effective session and its approved source but does not introduce a competing edit flow. Only sessions after the athlete's current date in the saved plan timezone are eligible.

## Accepted Scope

- Edit title, purpose, prescription, duration, optional distance, optional RPE, optional start time, and cautions.
- Reschedule, skip, and restore remain explicit operations.
- Require a trimmed reason of 1–500 characters and at least one material change before submission.
- Preserve the approved source prescription and apply append-only amendment overlays.
- Show effective values, approved values, and readable reason history in Calendar and Today.
- Publish an owner-scoped, versioned coaching-review artifact with a deterministic content hash for later AI review.
- Reject past/current-day, inactive-plan, foreign-athlete, stale-revision, and competing-write attempts safely.
- Support signed-in cloud use and the equivalent local coaching workflow.

## Product Acceptance Evidence

- Independent QA release gate: PASS.
- Core tests: 86/86.
- Web tests: 85/85.
- Cloud/database tests: 61/61, including all migrations and a genuine two-writer conflict.
- Local coaching tests: 7/7.
- Additional local database regression tests: 19/19.
- Browser journeys: 12/12 local, 3/3 authentication, 7/7 online.
- Production build and type checks: PASS.
- Dependency audit: zero vulnerabilities.
- Desktop, 390px mobile, and keyboard dialog journeys: PASS.

## Product Language Review

The UI says that reasons are saved and available for later AI review. It does not claim that an AI has already reviewed a change, and it does not automatically adapt or approve another plan.

## Launch Decision

Approved to apply the additive production migration, deploy the application, and run authenticated production smoke tests. Rollback may disable amendment writes and the edit UI while retaining append-only history; no destructive down-migration is required.

The Vercel release build applies pending Prisma migrations before compiling the application so the additive session-projection tables are present before new application traffic is served.
