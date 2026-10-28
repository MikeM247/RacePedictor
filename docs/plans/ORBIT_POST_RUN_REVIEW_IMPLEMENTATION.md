# ORBIT post-run review — implementation and verification handoff

28 October 2026 · Feature branch: `codex/orbit-post-run-review` · Draft implementation, not merge-ready

Product and UX authority: [BRD](../product/POST_RUN_REVIEW_BRD.md) · [UX specification](../design/POST_RUN_REVIEW_UX.md) · [interactive design prototype](../design/post-run-review/index.html).

## Implemented

The feature extends the existing `ActivityReflection` rather than the generated `ActivityAthleteFeedback` artifact. `activity-reflection.v2` reuses the existing overall RPE and expectation fields, adds the required post-run answers and conditional details, keeps v1 readable, and preserves the journal-only answers and section reflections. An upgraded record rejects a legacy v1 write instead of silently dropping v2 answers. An athlete/activity-scoped database transaction protects v2 save, legacy writes, delete and reopen; the successful save writes the reflection, completion/suppression and content-free idempotency receipt together. Deletion retains suppression; explicit reopen clears it. Existing non-empty reflections receive suppression during the additive backfill without inferred v2 answers or completion.

Four durable records separate the automatic offer allowance, activity completion, login/tab offer reservation and mutation replay. First eligible Coach entry establishes the activation baseline; eligibility queries canonical activities rather than the capped Coach context page. The newest eligible run is pinned by exact activity ID. A 60-second reservation does not authorize rendering; a successful presentation consume does. Authentication creates a server-side UUID at fresh GitHub owner sign-in and retains it through refresh. The identifier is projected only through trusted actor resolution and removed from the public session response.

Coach uses an explicit existing-chat choice before archiving and selects the run only after archive success. A shared reflection form and saved summary are used in Coach and activity detail; other sports retain the optional journal. Browser drafts are scoped by opaque auth scope and activity, and cross-tab messages contain no answer content. Stale state preserves the draft. Saved feedback can create a separate Coach follow-up tied to the committed reflection revision. The assistant receives a read-only committed snapshot, and a labelled structured receipt distinguishes saved athlete feedback from text the athlete typed. Existing quotas, turn leases and generation fencing are reused. Published activity assessments remain immutable; new assessment evidence includes athlete-reported RPE, and publication validates the exact activity/reflection revisions captured before generation.

Automatic offers are controlled by `RACEPREDICTOR_COACH_RUN_REVIEW_AUTO_ENABLED`, default `false`. The feature Preview migration path only runs for the exact feature branch and Vercel Preview environment and requires dedicated pooled/direct TLS database URLs and validated endpoint hosts. It never falls back to integration-injected production URLs. Strava ingestion and Second Brain sync must remain disabled in the feature Preview.

## Local checks

Latest completed local checks at handoff:

- Core tests: **23 passed**.
- Web TypeScript typecheck: **passed**.
- Web tests: **49/49 passed** with `RACEPREDICTOR_CLOUD_MODE=disabled`; web typecheck passed; optimized production build passed and includes the offer reservation, presentation, outcome, reflection, and follow-up routes.
- Cloud DB tests: **24/25 passed**. The failure is the existing `activity-pace-comparison-cli.test.js` process test (expects `/artifact changed/` on stdout, but emits no stdout); it is unrelated to this feature and also failed before these changes. The new DB repository tests and migration preservation test pass.
- Prisma schema validation and Prisma client generation passed.
- Browser Playwright suite, real PostgreSQL concurrency, hosted preview migration, screenshots, owner sign-in, and real AI follow-up remain unverified.

The Playwright invocation was rejected by automatic approval review because it could not verify that its destination was the authorized isolated preview rather than shared or production infrastructure. Do not route around that rejection. Run the browser suite only after the dedicated Preview URL and database have been independently verified and approved for the test.

## Preview provisioning and release gates

No isolated Neon project or feature Vercel Preview has been provisioned by this implementation handoff. Do not use the existing `work` staging endpoint or the existing production Neon project. Provision a new empty Neon test project/database, apply the complete migration chain, use synthetic fixtures only, and configure the feature's stable Preview origin and its own OAuth callback credentials. Keep ingestion and Second Brain sync disabled. After verifying isolation, enable `RACEPREDICTOR_COACH_RUN_REVIEW_AUTO_ENABLED` only on this Preview to exercise automatic-offer acceptance; keep other environments disabled until rollout approval. Set a 14-day review/expiry reminder and renew only while testing continues. A platform-enforced expiry has not been configured by this code.

Before product-owner review, the preview operator must record: verified Vercel branch/environment and deployment URL; verified Neon project/endpoint host and empty synthetic-data fixture provenance; migration result; isolated OAuth login; local DB/web test results; real PostgreSQL concurrency results; browser/a11y screenshots at the BRD viewports; and one successful AI follow-up. Disable automatic offers outside the isolated Preview until product-owner acceptance. Merge and production rollout are separate user decisions.

Rollback disables automatic offers and restores the previous application deployment. Retain the additive schema, saved reflections, completion/suppression and audit receipts; never reverse migrations or delete athlete-authored feedback as rollback.

## BRD acceptance matrix (AC-01–AC-18)

Code paths and local tests are implemented, but no hosted/browser acceptance result is claimed. Each item below remains a preview acceptance gate; local unit evidence is noted to show where coverage exists.

| ID | Implementation / local evidence | Release status |
| --- | --- | --- |
| AC-01 | Newest eligible run selection, pinned activity context, review-first Coach state; repository and context tests | Preview/browser verification pending |
| AC-02 | Save/archive, review-in-chat and defer choices; archive-before-select handling | Preview/browser verification pending |
| AC-03 | Per-login consumed/deferred state plus manual resume; offer repository tests | Real PostgreSQL and reload verification pending |
| AC-04 | Fresh login identity plus candidate re-evaluation on next login | OAuth and real PostgreSQL verification pending |
| AC-05 | Required RPE/unable and discomfort/opt-out schema; contract/form validation tests | Keyboard/screen-reader verification pending |
| AC-06 | Atomic reflection + completion + suppression save and compact saved state | Real PostgreSQL transaction test pending |
| AC-07 | Durable activity-scoped completion independent of chat history; migration/backfill tests | Hosted migration verification pending |
| AC-08 | Pending assessment does not block feedback; immutable old reviews labelled | Preview review-state verification pending |
| AC-09 | Request UUID receipts, revision checks and uncertain-outcome reconciliation | PostgreSQL concurrency and browser timeout verification pending |
| AC-10 | Follow-up failure/retry is separate from saved feedback; revision-scoped unique turn | Real provider verification pending |
| AC-11 | Candidate refresh does not switch an active selection; manual action remains available | Two-session browser verification pending |
| AC-12 | Newest candidate ordered by occurrence time and canonical ID; activation baseline | Timezone/duplicate fixture verification pending |
| AC-13 | Activity/reflection revision validation and stale-draft retention | Concurrent-device browser verification pending |
| AC-14 | Login offer uniqueness and content-free cross-tab notification | Concurrent PostgreSQL/two-tab verification pending |
| AC-15 | Trusted actor projection, public-session identifier stripping, auth-loss draft clearing | Hosted OAuth/logout verification pending |
| AC-16 | Explicit delete retains suppression; reopen clears it; mutation tests | PostgreSQL lifecycle verification pending |
| AC-17 | Unknown RPE remains unknown; saved feedback is advice context only | AI output review on real provider pending |
| AC-18 | Responsive form/dialog/focus styling and a mocked browser scenario added | Playwright, screenshots, axe/keyboard/zoom checks pending |

## Docs-sync checklist

| `docs/CODEX_WORKFLOW.md` item | Status | Evidence |
| --- | --- | --- |
| `docs/CONTEXT.md` | Updated | Scope, default-off rollout, and constraints |
| `docs/PRODUCT.md` | Updated | Coach behavior and completion outcome |
| `docs/ARCHITECTURE.md` | Updated | Contracts/repositories/auth/UI/AI boundaries |
| `docs/API_CONTRACT.md` | Updated | New endpoints and reflection v2 behavior |
| `docs/DB_SCHEMA.md` | Updated | Additive records, uniqueness and migration policy |
| `docs/UI_UX_SPEC.md` | Updated | Review-first flow, drafts, revalidation and saved state |
| `docs/UI_GUIDELINES.md` | Updated | Visual hierarchy, form semantics and responsive rules |
| `docs/CODEX_WORKFLOW.md` | N/A | Story lifecycle and merge policy are unchanged; the required status is recorded here. |
| `docs/ROADMAP.md` | Updated | Implementation state and preview/acceptance gates |

## Branch and merge checklist

- Design inputs were committed first on the isolated feature branch.
- Application changes and tests remain on that branch.
- Keep the PR draft until local checks, isolated hosted preview evidence, documentation drift review and product-owner acceptance are complete.
- Do not merge automatically. Production deployment is a separate release step after merge.
