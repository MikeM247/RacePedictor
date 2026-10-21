# Milestone management QA — 21 October 2026

## QA Result

PASS for local feature validation and source review. Hosted preview/release: Needs Review because the automatic Vercel preview could not provision its resources. Production deployment and live owner acceptance are separate.

## Acceptance Criteria Check

| Criterion | Evidence | Result |
|---|---|---|
| One discoverable manager from Home and Settings | Local creation/Home journey and existing Road to Comrades management regressions | PASS |
| Confirmed historical creation; absent unknown facts; persistence after reload | Real SQLite/API browser creation, direct saved-record inspection and Home projection | PASS |
| Assign/change/unlink running activities, preserving the milestone name and checked official facts | Browser lifecycle through real scoped history PUT; selected fixture activity ownership is verified by the API | PASS |
| Remove only the named history record after confirmation | Browser cancel/confirm/reload; original recorded activity remains retrievable from the real local API | PASS |
| Explicit owner confirmation and no page-load/cancel writes | Browser disabled-save and request recording assertions | PASS |
| Failed save preserves input; 409 requires explicit reload/review | Browser simulated 503 plus real concurrent-revision conflict; confirmation reset on reload | PASS |
| Target success remains distinct from saved result/PB classification | Browser missed→matching result; existing core tests cover wrong identity/date/distance, strict under/equality, snapshot history and correction | PASS |
| Planned changes preserve current approved data | Local browser add/removal/replacement flows assert no API writes and retained approved rows | PASS |
| Complete request survives navigation/reload and is portable | Browser handoff/reload/download parsed against request v1 schema, including primary goal and full proposed milestone list | PASS |
| Stale/malformed/foreign handoffs blocked | Browser stale base and corrupted JSON recovery; core exact transformation/base checks and athlete-keyed storage tests | PASS |
| Plan changes during editing never silently rebase | Browser target form retains input and rejects a refreshed plan revision | PASS |
| Validation uses existing target boundaries | Core count/ID/date/goal/time tests; browser field-specific duplicate-date and invalid-time messages | PASS |
| Local/online planning boundary preserved | Online fixture browser offers copy/download for paired planning and no online plan-creation action | PASS |
| Mobile, keyboard, focus and accessibility | 1440/390/320px list checks, 320px modal check, axe scans, Escape/focus return and screenshots | PASS |
| Configured athlete scope for activity evidence | Two-athlete local adapter regression plus real local-browser source-retention check | PASS |

## Issues Found

No outstanding application defects were found in the validated scope. The automatic Vercel preview for application commit `11cecb1` reported `BUILD_FAILED` / `Resource provisioning failed` (deployment `dpl_DdBXn7dZefSoXNbYDaQVV2MpcGKW`). The deployment-events API returned no build logs. This does not establish an application compilation failure; hosted preview validation remains unavailable until provisioning succeeds. The existing main deployment was still Ready when inspected. [Preview failure](https://vercel.com/mikes-projects-bc95b7f5/racepedictor/DdBXn7dZefSoXNbYDaQVV2MpcGKW).

During local validation, row-action button backgrounds were corrected for contrast. Local list/detail activity reads were aligned with configured milestone-write athlete scope. Initial process-sandbox filesystem failures were resolved by rerunning isolated validation outside that sandbox; no application workaround was added for them.

## Validation Summary

- Build: PASS — `npm run build --workspace @racepredictor/web` (Next production compilation, TypeScript, route generation and tracing).
- Lint / Types: PASS — `npm run typecheck --workspace @racepredictor/web`; the repository's lint command is this TypeScript gate.
- Core: PASS — `npm test --workspace @racepredictor/core`, 122/122.
- Web: PASS — `npm test --workspace @racepredictor/web`, 169/169, including existing history/scoping/approval route and persistence tests.
- Milestone local browser acceptance: PASS — `playwright test --config playwright.milestones.local.config.ts`, 11/11 Chromium tests.
- Milestone online handoff: PASS — `playwright test --config playwright.milestones.online.config.ts`, 1/1.
- Existing Home/Road regression: PASS — `playwright test --config playwright.road.local.config.ts`, 6/6.
- Later focused prepared-request recovery checks: PASS, 3/3; these repeat existing cases and are not added to the distinct 18-browser-test count.
- Static diff/React review: PASS. Shared native modal and semantic controls retained; fetches aborted/obsolete pages ignored; writes use refs against duplicate submission; no new dependency or secret; contracts remain in core; DB queries stay in existing adapters.

Reproduce both milestone browser modes with `npm run test:e2e:milestones --workspace @racepredictor/web`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if a locally installed Chrome is needed. Tests use their own `.local/e2e/<run-id>` fixtures and separate local servers (3314 and 3312). The general local config excludes these mode-specific specs so they are not accidentally run with incompatible fixtures.

Local evidence is under `.local/milestone-qa/` and `.local/e2e/`: run IDs `milestones-acceptance-20261021` (11 local cases), `milestones-online-20261021` and `milestones-road-20261021`. Initial failed-run traces remain local for diagnosis. Runtime data, generated Next config changes and unrelated refreshed Home reference screenshots are excluded from the commit.

## Regression / Risk Review

- Checked: current main baseline `a8597e1`; main was fetched again before publishing and had not advanced. Existing Home, check-in and background behaviour passed; primary navigation and approval/persistence routes are retained.
- Residual risk: hosted preview provisioning failed as recorded above; live preview behaviour is not verified. A prepared change is stored in this tab only and can be lost on closing it. It is explicitly labelled and downloadable. Live authenticated production services were not mutated; online validation uses the existing fixture mode plus unchanged API authorization/persistence tests.
- No DB migrations or environment additions. Local activity list/detail now honour the existing configured athlete, retaining `athlete_001` when unset.

## DevOps Summary

- Objective: deliver an isolated, reviewable milestone-management branch.
- Target environment: local fixtures and production-build validation; feature branch for review.
- Repository: `codex/milestone-management`, based on `main` at `a8597e1`; no force push, merge or production promotion.
- Environment / Secrets: existing settings only; no values printed or committed. `RACEPREDICTOR_ATHLETE_ID` is reused for consistent local activity scope.
- Database: existing SQLite/PostgreSQL record formats; no schema migration or backfill.
- Pipeline / CI-CD: no `.github/workflows` directory exists in this checkout. Existing Vercel Git integration attempted the branch preview and failed resource provisioning; this change adds no pipeline or deployment configuration.
- Deployment plan: normal branch review, then the repository's existing release process if the owner chooses. No deployment was invoked as part of implementation.
- Rollback: revert the feature commit. Existing history remains compatible; discard/close affects only unapproved tab-local requests.

## Recommendation

Proceed to source/UX review in draft PR #59. Resolve or successfully retry hosted-preview provisioning before treating hosted preview validation as passed. Merge and release remain separate from implementation.
