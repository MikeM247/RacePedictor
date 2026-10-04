# Home / Calendar implementation and verification

4 October 2026 · Branch `codex/home-calendar-redesign` · local review handoff

> The later approved logo-only navigation and compact month/day-dialog story supersedes the original week/agenda presentation. Current changes and verification are documented in [the mobile month handoff](CALENDAR_MOBILE_MONTH_IMPLEMENTATION.md). The original check counts and screenshots below record the initial redesign gate; the follow-up has a separate baseline and review patch.

## Task Summary

Implemented the subsequently authorized P01–P06 presentation and first-release automated verification from [the approved execution plan](HOME_CALENDAR_REDESIGN_EXECUTION_PLAN.md). Home and Calendar are the two primary destinations. Secondary Settings exposes Plan management, history/import and recovery in both local and online layouts. Existing routes, authentication, approved prescriptions, effective schedules and feedback authority remain intact.

P07–P09 remain gated. This implementation does not add narrative sidecars, adherence scoring, session matching, completion tracking or race-day analytics. Missing milestone purpose/outcome and compatible progress assessments are stated plainly. No deployment, production publication, schema migration, backfill or owner data mutation was performed.

## Approach and Code Changes

- Home reads the approved goal explanation and source-compatible plan rationale; plan ID/version, approval hash and goal ID/revision must agree. Long approved explanations stay complete in disclosures. The goal and milestone show concise target lines; adherence and performance remain separate, evidence-preserving unavailable statements.
- Today retains the effective prescription, purpose, material cautions, warnings and amended state, with access to the original prescription and all history in Calendar. Latest activity remains the newest record, independently of review availability. A short saved assessment retains every material limitation and unconfirmed-match qualification. Long or incomplete reviews produce a neutral full-review link rather than a truncated conclusion.
- Calendar projects planned and recorded arrays independently. Month cells show both categories and an accurate hidden count, including days containing only one category. The desktop selected-day pane and compact day dialog expose every record separately. Sharing a date never proves a match or completion. The full existing details retain telemetry, splits, route availability, coach/athlete/legacy feedback, approved source, effective values and adjustment history.
- Desktop uses a 180px navigation rail (160px at intermediate widths). Calendar uses month plus selected-day pane from 1200px; narrower widths use the same month grid with distance/duration summaries and a date-specific full day dialog. The logo has no duplicate app-name text. Phone uses the real logo, a 64px header and fixed Home/Calendar navigation. Summary prose stays 16px, supporting facts 14px, and controls at least 44px.
- Repaired record-local retry, focus when a deep-linked session arrives asynchronously, sticky activity details obscuring another record's Retry control, and initial saved-timezone date resolution when the date changes within the same month. Source-only effective-session fallback disables unverified edit controls while retaining reads.

Primary implementation files: `components/dashboard/{dashboard-navigation,dashboard-shell,home-goal-context,home-recent-training,training-tools}`, `components/coaching/{coaching-pages,calendar-day-summary,today-coaching-card}`, `components/sync/online-sync-settings`, scoped dashboard/coaching CSS, and pure display helpers `lib/{home-summary,calendar-display}` under `apps/web`.

## Actual fit and visual evidence

Controlled online fixtures, Chromium, fixed clock **2026-10-03 08:00 UTC**, saved timezone **Africa/Johannesburg**. Approved goal/plan identities are deliberately compatible; two planned and two recorded sessions share a date. Screenshots contain fixture data, not the owner's live training. Measures below are unscrolled CSS pixels. Phone usable bottom excludes the fixed bottom navigation.

| Viewport | Usable bottom | Goal + milestone card bottom | Today card bottom | Latest card bottom | Actual fit |
|---|---:|---:|---:|---:|---|
| 320×844 | 763 | 618 | 862 | 1266 | Narrow reflow needs scrolling; text and limits stay complete |
| 390×844 | 763 | 564 | 758 | 1120 | Whole normal Goal and Today cards/actions fit above navigation |
| 768×900 | 900 | 527 | 748 | 1070 | Goal and Today fit; latest complete review scrolls |
| 1024×900 | 900 | 530 | 751 | 1029 | Goal and Today fit; latest complete review scrolls |
| 1440×900 | 900 | 366 | 587 | 866 | All three normal summaries/actions fit |

The common-state tests require the 390px whole Goal/Today fit and 1440px all-group fit. They also assert readable type/line height, complete unclipped prose, concise summaries, at least 24px separation between groups, correct milestone placement, no horizontal overflow and access past fixed navigation. Positive coordinates alone are not a fit check.

Long approved explanations remain complete in native disclosures. Expanded long explanations, long review evidence in full detail, long titles, warnings and 320px reflow may require vertical scrolling. The normal 390px fixture's latest activity also scrolls; it is a short summary with its conditions and limits, not a full review. No requirement is satisfied by clipping text or shrinking body prose.

Current evidence root: `.local/e2e/home-calendar-redesign-20261004-final/`. Each `companion-home-WIDTHxHEIGHT.json` has the exact geometry, text sizes, word counts, touch-target heights and fit flags; adjacent `-viewport.png` and `-full.png` files show the measured page. Latest Calendar evidence root: `.local/e2e/home-calendar-redesign-20261004-calendar-evidence/`, with `companion-calendar-desktop-viewport.png`, `companion-calendar-mobile-viewport.png` and corresponding full-page files. This bounded recapture resets scroll before screenshots, preventing retained sticky scroll positions from distorting the full-page image. Earlier failing run directories are retained for diagnosis and are not passing release evidence.

Latest screenshots:

- [Desktop Home](../../.local/e2e/home-calendar-redesign-20261004-final/companion-home-1440x900-viewport.png)
- [Phone Home](../../.local/e2e/home-calendar-redesign-20261004-final/companion-home-390x844-viewport.png)
- [Desktop Calendar](../../.local/e2e/home-calendar-redesign-20261004-calendar-evidence/companion-calendar-desktop-viewport.png)
- [Phone Calendar](../../.local/e2e/home-calendar-redesign-20261004-calendar-evidence/companion-calendar-mobile-viewport.png)
- [All mixed records in desktop Calendar](../../.local/e2e/home-calendar-redesign-20261004-calendar-evidence/companion-calendar-desktop.png)
- [All mixed records in phone Calendar](../../.local/e2e/home-calendar-redesign-20261004-calendar-evidence/companion-calendar-mobile.png)

## QA Result

PASS for the authorized local presentation and automated gate. Release remains Needs Review until final owner visual/comprehension acceptance. Deployment is separately authorized.

## Acceptance Criteria Check

| Criterion | Evidence | Result |
|---|---|---|
| Two primary destinations; secondary tools remain accessible in both runtimes | Navigation unit checks; responsive route scans; online Settings tool-link regression | Implemented |
| Three concise Home groups; supported why/how; separate truthful progress gaps | Companion/Home fixtures; source-identity helper tests; actual fit JSON/screenshots | Implemented |
| No stronger conclusion from shortening a saved review | Complete-conditions/limitations helper tests; long-review fallback and full-detail checks | Implemented |
| Both categories and multiple same-day records remain independently openable | Two + two, three planned-only, three activity-only, rest/skipped/moved fixtures; deep link and focus checks | Implemented |
| Full details, original/effective/history, feedback and guarded actions preserved | Local/online amendment, conflict/range guards, past skip, review consistency and Training detail checks | Implemented |
| Saved timezone, loading/error/retry and readable compact layouts | Midnight same-month regression, unavailable activities, record-local retry, route width scans, axe and keyboard checks | Implemented |
| Missing analytical capability is not represented as delivered | Explicit unavailable assessments; no contract/schema change in this slice | Implemented |
| Final owner visual/comprehension acceptance | Review the supplied screenshots and retained data gaps | Pending owner review |

## Issues Found

Open implementation defects: none found in the scoped verification. Release acceptance remains pending as identified above.

Resolved during validation: invalid progress definition-list markup; record focus being overridden/missed; sticky record details intercepting Retry; missing management links in online Settings; same-month initial timezone resolution leaving Calendar loading. Older browser assertions were updated for day selection followed by record opening, Home's safe neutral summaries, full-detail status wording and the existing initiation-plus-upload protocol. Full-detail qualifications and write-count/identity guards remain asserted.

The final build initially encountered a Windows Prisma DLL rename lock while local fixture servers were running. After stopping the verified task-owned servers, the full production build script passed. No migration or deployment command ran.

## Validation Summary

- Web unit/integration tests: **148 passed**, `npm test --workspace @racepredictor/web`.
- Typecheck: passed, `npm run typecheck --workspace @racepredictor/web`.
- Lint/types: passed, `npm run lint --workspace @racepredictor/web`; the same TypeScript engine, not a separate linter.
- Build: final stable-source production build **passed**, `npm run build --workspace @racepredictor/web` (Prisma generation plus Next production build; no migrations).
- Online fixture regression: **40 passed**, zero skipped/flaky/unexpected, final stable-source run `home-calendar-redesign-20261004-final`. Separate long approved narrative disclosure check: **1 passed** at 320/390/768/1440px (`home-calendar-redesign-20261004-long-content`). Bounded Calendar capture refresh: **2 passed**, `home-calendar-redesign-20261004-calendar-evidence`; these repeat functional checks only to correct screenshot evidence.
- Online management regression: **8 passed** (Activities, queued import/error, Plan selection/conflict protection, Calendar amendment/past skip, Settings connections/pairing/revocation). All mutations were intercepted fixtures.
- Local Calendar: **4 relevant journeys passed across targeted final runs** (deep link/stale context, complete recorded details, error recovery/conflicting/out-of-range moves and reasoned amendment/source preservation).
- Local Home readiness accessibility: **1 passed**, exit code 0 (`home-calendar-redesign-20261004-local-home`).
- Owner-auth fixture: **3 passed**, exit code 0 (`home-calendar-redesign-20261004-auth`): redirect, phone sign-in, APIs fail closed. No live OAuth sign-in was performed. Windows fixture teardown was released by stopping only task-owned servers after assertions completed.

Playwright uses disposable fixture roots under `.local/e2e/`. `RACEPREDICTOR_E2E_REUSE_SERVER=1` permits explicitly reusing the task's already-started compatible fixture server on 3311 or 3312; the default remains no reuse. Do not use this option against a live server or a server running a different data source. Auth/local-readiness share 3313 and must not run concurrently. Home-local fixture uses 3314.

## Regression / Risk Review

Checked: existing routes and primary selection, both Settings variants, authenticated read boundaries, activity pagination/filter/detail recovery, independent feedback states and manual refresh failure, no-write reads, original/effective/history fidelity, guarded session changes, keyboard/focus return, responsive widths 320/375/390/414/767/768/1024/1199/1200/1440, 200% effective reflow, current-fitness disclosures, and saved-zone calendar date boundaries.

Residual risk: fixture verification cannot prove live owner data availability or production provisioning. Real milestone purpose/outcome, authoritative adherence and compatible race-day assessment remain unavailable. Final owner comprehension review and subsequent deployment are outstanding release activities, not supplied analytical capabilities.

## Docs Sync and Delivery State

| Document | Resolution |
|---|---|
| `docs/PRODUCT.md` | Updated presentation amendment |
| `docs/ARCHITECTURE.md` | N/A — helpers remain in the existing presentation layer; no new domain/service boundary |
| `docs/API_CONTRACT.md` | N/A for this slice — existing endpoints/DTOs unchanged; prior unrelated edits preserved |
| `docs/DB_SCHEMA.md` | N/A for this slice — no persistence changes; prior unrelated edits preserved |
| `docs/UI_UX_SPEC.md` | Updated authority amendment |
| `docs/UI_GUIDELINES.md` | Updated typography, responsive hierarchy and measured-fit policy |
| `docs/CODEX_WORKFLOW.md` | N/A — no lifecycle/process changes |
| `docs/ROADMAP.md` | Updated P01–P06 and first-release verification tracking |
| Design contract, Home change document, screens, execution plan | Updated amendments/cross-reference; historical design/planning retained |

The branch began with unrelated feedback/import/backend/schema/logo edits. Those edits are preserved. Shared files were backed up before redesign work under `C:/Users/Mike/AppData/Local/Temp/racepredictor-home-calendar-baseline-20261003`. The task-only review patch at `.local/review/home-calendar-redesign/implementation.patch` and its manifest distinguish the redesign from that execution baseline. Shared-file deltas use the saved originals; other task-owned files use HEAD or an empty new-file baseline. This is a review patch for the actual execution base, not a claim that the unrelated dirty work is committed or deployable. No broad commit or reset is used to absorb/discard unrelated work.

The patch contains **36 task-owned file deltas** and passes a reverse-application dry check against the final working tree. The shared backend read handler is byte-identical to its saved baseline. Only task-generated Next type references and test-directory includes were cleaned; `next-env.d.ts` and `tsconfig.json` match HEAD again. Task-owned fixture servers were stopped after their checks completed; retained screenshots, JSON reports and diagnostic artifacts were not deleted. Implementation remains uncommitted so unrelated dirty dependencies are not silently folded into a release commit. A coherent integration commit/PR against the preserved feedback/import execution base remains a release handoff step.

## Recommendation and Next Steps

Proceed to local review. Human Decision Required for final release acceptance; deployment remains separately authorized.

Automated local QA is complete. Review the supplied local artifacts. Owner final visual/comprehension acceptance precedes release; publishing remains separately authorized. Optional enrichment requires P07 decisions before P08/P09 implementation. Presentation rollback should revert the task-only presentation patch against the same execution baseline, preserving pre-existing feedback work and all owner adjustments.
