# Rolling calendar and Activity record — architecture and execution plan

Status: proposed, not implemented. Prepared 2026-09-08 with the architect skill after the [UX design](../design/CALENDAR_ROLLING_WINDOW_UX.md).

## Problem Framing

- Goals: replace week-navigation buttons with a rolling four-week calendar; open full Activity records from Calendar; show only the active plan's applicable sessions.
- Constraints: existing Next.js application, local and authenticated cloud modes, additive `/api/v1` contracts, immutable approved prescriptions, reasoned edits, athlete-scoped data access, existing visual conventions.
- Confirmed: current week first on normal entry; bidirectional navigation; four weeks; future plan details; past Activity record before plan details; currently active plan only for past runs (explicit follow-up confirmation); planning only at this stage.
- Assumptions: Monday remains week start; scrolling up means earlier dates; explicit deep links override normal initial date; today uses actual-first when an activity exists; active-only filtering applies to all Calendar representations.
- Open questions: none blocking this proposal. The user resolved past context as the currently active plan only; historical association is outside this change.

## Requirements Check

- Multiple plans must not produce multiple versions in Calendar. Preserve all sessions from the single active plan on a date.
- Use the full canonical Activity record, not the calendar summary DTO, for run information.
- Four consecutive Monday–Sunday weeks constitute the settled window. Phone Agenda can scroll within those weeks; it does not need to fit 28 days on one screen.
- Source history within an active session remains accessible. Hiding retired versions does not delete approvals, prescriptions, revisions, or audit records.
- Failure and successful absence are distinct. No activity/session matching, completion inference, or automatic adaptation is introduced.
- Acceptance criteria below resolve rapid-input, timezone, deep-link, no-plan, and multi-run gaps in the spoken request. These are proposed design choices, not independently confirmed product requests.

## Architecture Overview

### Current system, verified from the working tree

| Boundary | Current responsibility and relevant finding |
|---|---|
| `apps/web/app/dashboard/calendar/page.tsx` | Supplies optional date/session deep-link inputs to CalendarPage. |
| `apps/web/components/coaching/coaching-pages.tsx` | CalendarPage owns range loading, views, edits, dialogs, summaries, and historical cards. It currently fetches calendar, active plan, and Today on every range load. |
| `apps/web/lib/coaching-ui-state.ts` | `calendarWindowRange` starts one week before the selected week. Calendar activity views have only summary metrics. |
| `apps/web/components/activities/activities-shell.tsx` | Contains full Activity detail presentation and abortable detail fetch behavior. Detail headings currently use fixed IDs. |
| `apps/web/lib/activities-api-client.ts` | Validates full activity API responses against shared contracts. |
| `apps/web/app/api/v1/coaching/calendar/route.ts` | Local Calendar combines active effective sessions, retired-plan sessions, and date-localized activity summaries. |
| `apps/web/lib/server/cloud-read-handlers.ts` | Cloud Calendar combines the same categories. History enumeration supplies timezone. Supplemental activity failures can currently become empty arrays. |
| `packages/core/src/contracts/coaching.ts` | Owns strict calendar query/response contracts; `historicalSessions` and `activities` default to empty arrays. |

Existing ADR 0004 already establishes the active plan as the Calendar source. No new database entity is required for the proposed interpretation.

### Key decisions

1. Use a controlled four-week window rather than an ever-growing list. This meets the explicit visible-window requirement and bounds rendering/memory. Keep gesture handling separate from dates/data loading so it can be tested independently.
2. Extract reusable Activity record content inside `apps/web/components/activities`; retain page-specific wrappers and fetch orchestration. This maintains parity without importing the entire Activities shell or duplicating its display logic.
3. Load full activity details on demand from the existing activity-detail endpoint. Keep splits and telemetry out of calendar range payloads.
4. Request active-only Calendar data explicitly through an additive query option. Retain the existing history response field and default behavior for compatibility; do not redefine all existing consumers silently.
5. Surface read completeness explicitly. Silent supplemental failure cannot support truthful “No run recorded” states.

## Component Design

| Proposed component/responsibility | Dependencies and interactions | Failure handling |
|---|---|---|
| Calendar window controller | Date helpers, input adapter, range reader; owns committed start date, pending direction, request generation, and four-week rows. | Keep committed range on error; discard superseded responses; allow bounded retry. |
| Week/Agenda presentation | Same four-week projection, grouped by local date; summaries and information launchers only. | Four skeleton weeks initially; visible read-status indicators for partial data. |
| Calendar day information dialog | Selected local date, active sessions, activity IDs; one ordered body with records then plan context. | Record-specific loading/errors; focus trap and return; background input disabled. |
| Shared Activity record content | Existing ActivityDetail contract and formatters; reusable stable sections with unique heading IDs. | Preserve current missing telemetry/splits/route messages; accept no fabricated values. |
| Activity detail loader | Existing API parser; abortable request keyed by activity ID; request-local stale-response protection. | Close/change selection aborts pending work; per-record retry; no stale record under a new date. |
| Existing session detail/actions | Effective prescription, approved original, amendments, existing reasoned command endpoints. | Existing revision-conflict/reload behavior; never retry edits against unseen values. |

### Rolling-window state and input

- Initialize with Monday of today after resolving the saved timezone, or Monday of a validated explicit deep-link date. Use civil-date arithmetic rather than adding 24 hours to local timestamps.
- The committed range is start through start + 27 days. A step proposes start ± 7 days. Fetch the proposed four-week range, then replace rows/header atomically only when validated data is available.
- Keep four committed rows while loading. A pending range is data only, not extra rendered week rows. Initially use a full 28-day range read per accepted step; defer adjacent-week caching until measurements justify its extra consistency complexity.
- Normalize wheel delta modes and distinguish vertical intent; coalesce momentum into one step per deliberate gesture. Touch direction follows native earlier/later scrolling. Use the same transition command for keyboard Page Up/Page Down.
- Keep at most one pending navigation intent. New direction cancels/supersedes obsolete work; late responses cannot commit. Do not build an unbounded queue during a slow network. Subsequent deliberate gestures after a settled transition can continue browsing.
- Scope listeners to the calendar region. Preserve zoom and horizontal gestures; do not bind global wheel handlers. When content overflows vertically, consume ordinary reading scroll first and navigate at the boundary. The dialog owns its own native scroll and must never move the calendar underneath it.
- Track deep-link handling once per incoming link, not per range render. Clear or preserve selected detail intentionally; navigation cannot resurrect a dismissed dialog. Dialog-open state prevents background rolling.
- Resolve active plan/Today context on entry and on meaningful invalidation, not three independent reads for every gesture. Revalidate on page focus, relevant successful edits, and active-plan changes. Do not force a browsed window back to today at midnight.

## Data Model

- Existing entities: active/retired approved plans, effective calendar sessions, immutable source sessions and amendments, canonical Activity and split/route data.
- Same local date is a presentation grouping, not a persisted Activity-to-session relationship.
- Use effective date for active sessions. Retired sessions are excluded in the requested view. Never fall back to the most recent retired plan if no active plan exists.
- Proposed transient state: committed range, range read metadata, selected date, per-activity detail request state. No database migration, backfill, activity matching table, or new sync event.
- Cache, if later added, must include athlete scope, timezone, active-plan identity/revision, and date range; invalidate on relevant changes. The initial implementation needs no persistent browser cache.

## API Contracts

### Calendar range — existing GET `/api/v1/coaching/calendar`

- Existing inputs `from` and `to` retain inclusive civil-date semantics and current validation.
- Add optional `includeHistorical` with explicit string values `true`/`false`; omission preserves today's behavior. Avoid generic truthiness coercion of the string `false`.
- New Calendar sends `includeHistorical=false`. Both local and cloud implementations return `historicalSessions: []` and skip retired-plan enumeration on that path; active sessions and recorded runs remain available even without a plan.
- Preserve existing response fields. Add optional read metadata with resolved timezone, nullable active-plan ID/revision, and separate session/activity read states. Recommended states: sessions `effective`, `approved_source_fallback`, or `unavailable`; activities `complete` or `unavailable`. Define the exact named schema in core during the contract story and document it in `API_CONTRACT.md` before consumption.
- The new server always supplies metadata for the new path. Older fixtures/responses without metadata are treated as completeness unknown, not a confirmed empty history when the UI lacks evidence.
- Resolve timezone through existing active-plan/profile services rather than listing retired plans. Use the same resolved timezone for range activity grouping and client today classification.
- Guard active-plan coherence: read active identity/revision before and after assembling the projection. If it changes during the request, retry the read once or return a recoverable unavailable result; do not mix sessions from one plan with another plan's metadata. This is read retry only, not automatic mutation retry.
- Effective-session fallback remains visibly labelled as approved source. Activity read failures must retain known session data and report unavailable activity state, not merely return empty activities with success semantics.
- Maintain owner/athlete scoping, local-mode routing, and existing authorization/error envelopes. Do not accept athlete identity supplied by the browser.
- Strict Zod contracts mean additive fields require coordinated changes to schema, handlers, parsers, and fixtures; preserve compatibility with existing callers and validate both query modes.

### Activity detail — existing GET `/api/v1/activities/:activityId`

- Reuse existing contract, authorization, split/telemetry fields, and response parser unchanged.
- Fetch only after information is opened. For multiple runs use bounded parallel loading (at most two requests concurrently) and independent record states. Clear dialog-scoped data on close; no unbounded detail cache.
- Missing/forbidden/unavailable details use the existing safe error behavior and an inline retry where appropriate. No new route is required.

### Mutations

No new commands or changed permissions. Preserve reason, expected revision, immutable source, date constraints, owner scope, and conflict feedback for existing calendar edits.

## Non-Functional Requirements

- Performance/scalability: 28 day cells and four week rows after every settled desktop transition; one bounded range request per accepted step; no plan-history query on the active-only path; zero full-detail fetches before opening information. Server-side activity paging remains bounded by the requested date interval.
- Reliability: retain last successful range; abort/discard stale reads; separate read errors; avoid reset flashes and automatic scroll loops; no completion claims from date coincidence.
- Accessibility: region-scoped keyboard navigation, visible focus, one polite range announcement per commit, unique record heading IDs, modal focus/return and background lock, reduced motion, native scrolling within long records.
- Security/privacy: existing scoped repositories and route security; no direct browser database reads; no activity payloads, tokens, or private note content in new logs.
- Observability: reuse safe request/error reporting for failed range/detail reads. During verification inspect request counts, retained rows, and stale-response handling. No new analytics or monitoring service is needed.

## Execution Plan

Implementation begins only in a later user-authorized task. Stories are ordered; each has a reviewable acceptance boundary.

| Story | Scope | Acceptance criteria | Depends on |
|---|---|---|---|
| C1 — Active-only, truthful calendar reads | Core query/metadata contract; local/cloud range handlers; timezone/coherence handling; API documentation. | Omitted query preserves compatibility; false excludes history without querying retired versions; no-plan runs still appear; activity outage differs from empty; plan switch cannot mix identities; athlete scope remains enforced. | Authorization to implement |
| C2 — Shared Activity record | Extract record content from Activities with unique IDs and contextual wrappers. | Activities retains all existing sections/values and list/detail return behavior; the content can render twice without duplicate IDs; no visual or formatting regression. | None; independently testable |
| C3 — Rolling four-week Calendar | Window controller, input handling, loading states, current-week-first dates, Weeks and Agenda. | No previous/today/next buttons; exact sample ranges from UX; four settled weeks; both directions work via wheel/trackpad/touch/keyboard; slow/error/racing requests preserve coherent range; deep links and timezone boundaries work. | C1 |
| C4 — Calendar information composition | Full detail loading; date-based ordering; active-only context once; loading/error/empty states; existing actions. | Past/today actual-first; future active-plan-only; multiple runs all have full records; multiple active sessions remain; no historical cards/counts; source/amendment history and permitted edits still work; dialog scrolling never rolls Calendar. | C1, C2, C3 |
| C5 — Integrated validation and design adoption | Targeted browser journeys, responsive/visual checks, required repository gates, final documentation. | Local and online fixtures pass; Activity record parity verified; no inferred completion; existing edit/activation/deep-link flows preserved; adopted screens/UX specs and progress records updated. | C3, C4 |

Likely implementation seams are the files in the current-system table plus new focused app-local calendar/detail components and tests. Do not expand the existing all-pages component with another large block of scrolling and record-loading logic.

## Risks and Trade-offs

- **Gesture-driven viewport versus native infinite list:** exact four-row retention needs controlled input and explicit keyboard access. Prefer that bounded approach for the stated requirement; validate real trackpad/touch behavior rather than relying only on synthetic wheel events.
- **Active-only versus historically accurate plan context:** current-active filtering can leave an old run without a plan section, even when a retired version once covered it. Display that absence honestly; a different choice requires revisiting associations, not restoring all versions.
- **Shared detail extraction:** Activities CSS, fixed heading IDs, and page-specific Back actions can leak into Calendar. Separate content from wrapper; scope styles and generate unique IDs.
- **Current working-tree overlap:** Calendar, Activities-adjacent styles, schemas, handlers, and tests already include in-progress changes. Re-inspect before implementing and preserve unrelated work.
- **API additions:** metadata adds some contract work but is necessary for reliable empty states and timezone/plan coherence. Keep the existing endpoint and defaults rather than adding a parallel calendar API.

## Validation

- Date/window tests: Monday/Sunday, month/year/leap boundaries, saved timezone versus browser timezone, current-week-first, ±7 day steps, exactly 28 distinct dates, explicit valid/invalid links.
- API tests in existing core/web suites: both modes and query defaults, active plus retired overlaps, no active plan, rescheduled sessions, activity paging/local-date boundaries, source fallback, unavailable activity feed, mid-read plan change, authorization.
- Browser tests: rapid alternating gestures with reversed response order; failed step then retry; many steps without row/cache growth; keyboard focus across replacement; short-height native reading scroll; wheel/trackpad/touch intent and zoom preservation; reduced motion; dialog open/close and no background navigation.
- Information tests: full metric/split/route parity with Activities; null optional metrics; run without plan; plan without run; today before/after recorded activity; multiple runs and active sessions; independent detail failures; no retired content/counts; no completion inference.
- Regressions: existing Activity browser selection/filters/mobile return, Plan activation, future amend/reschedule/skip/restore, past skip, current-day read-only, stale revision handling, and Today session deep link.
- Extend relevant `apps/web/test/coaching-ui-state.test.ts`, `cloud-read-handlers.test.ts`, activity API/client coverage, `apps/web/e2e/digital-coach.spec.ts`, and `online-dashboard.spec.ts`. Replace tests that currently require retired plans in Calendar; retain backend history-compatibility tests.
- Run lint/typecheck and tests for touched projects, affected local/online browser suites, and the application build under repository rules. Read the installed Next.js guides as required by `apps/web/AGENTS.md` before writing code. Browser/visual checks occur during implementation; none are claimed for this planning task.
- Rollout: land/deploy compatible server contract support before or together with the new client. No migration. Rollback the Calendar presentation/controller while retaining additive server support; if reverting shared record content, retain Activities parity. No new feature-flag infrastructure is warranted for this bounded change.
- ADR needed: no new ADR under current-active-only interpretation; ADR 0004 already covers active-plan selection. Revisit if the user requests historical matching or a persisted relationship.

## Skill Invocation Summary

- Skills: ux-ui-designer first, architect second.
- Scope: source inspection, UX specification, architecture, implementable stories and acceptance strategy only.
- Requirements validated: confirmed requirements mapped; past-plan clarification resolved as currently active only; remaining interaction assumptions are explicit.
- Sources read: `docs/CONTEXT.md`, `docs/design/screens.md`, `docs/UI_UX_SPEC.md`, `docs/UI_GUIDELINES.md`, relevant `docs/ARCHITECTURE.md` sections, ADR 0004, `apps/web/AGENTS.md`, current source/contracts/tests.
- Additional architecture/ADR enforcement files: `.codex/enforcement/architecture.md` and `.codex/enforcement/adr.md` are absent in this checkout; no root/docs AGENTS files were discovered.
- Key risks: gesture usability, historical interpretation, stale responses, silent read degradation, timezone/plan coherence, shared-record regression, and overlap with existing edits.
