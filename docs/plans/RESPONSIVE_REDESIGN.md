# Consistent responsive redesign

26 October 2026 · Owner-approved plan · implementation on `codex/responsive-redesign`, based on refreshed `origin/main` at `7e26aa7`.

## Product and UX contract

One shared application shell serves Home, feature-gated Coach, Calendar, Readiness and Settings. Plan, Training and Data Quality remain supporting destinations. Below 768px, use a 56px top bar with hamburger, page/Orbit identity and brand Home shortcut. The drawer is at most 280px and leaves at least 48px of scrim. No bottom navigation or compensating spacer remains. At 768px and above, use a 64px icon rail by default and a remembered, explicit 180px expanded mode. Icons have accessible names, tooltips, focus and selected states. Settings is separated beneath primary links.

Light semantic surfaces, shared controls, 16px body/input text and 44px action targets apply across pages. Standard content uses 16px compact/24px wide gutters and a 1280px maximum. The scenic Home composition retains live goal data, Orbit, milestones and user-selected background behavior. Its width measurements adapt to rail changes. Do not reintroduce retired analytics widgets.

Coach uses Orbit identity in the shared header, one 44px context/actions toolbar, the transcript and a 64px baseline composer. Remove Current focus, duplicate identity/title cards, race-plan banners and outer chat margins on every screen size. Full Reflect/Prepare/Ask context, record actions and the training-approval explanation live in the context sheet. History, clear-chat and optional wellbeing are in the actions sheet. Clear chat confirms saving the discussion and starting a new one; existing request identity, archive generations, readonly history, retry and cross-tab behavior remain authoritative. Permanent deletion remains in Settings.

The textarea grows to a bounded multiline height, retains its 4,000-character limit and existing send conventions, and never receives focus simply on touch entry. Messages follow the latest response only when the user is already following the bottom; otherwise an explicit Latest message control is available. Defaults budget 476px for messages at 360×640 and 680px at 390×844 before insets, composer growth or material feedback. Larger text may reflow rather than being clipped.

## Screen hierarchy

| Screen | Content order and retained workflows |
|---|---|
| Home | Scenic greeting/approved goal and Orbit, then complete live milestone overview; custom appearance and milestone controls remain. |
| Coach | Compact context toolbar, transcript and composer; context/history/check-in in adaptive sheets. |
| Calendar | Compact month controls, Monday-first month, supporting totals/timezone; selected-day sidebar at 1200px, Day details below. Recorded activities open directly. |
| Readiness | Current-fitness estimate and limits, weekly training chart, supplied signals/trends and freshness/recovery. No new scores or assessments. |
| Settings | Task-oriented section index on wide screens, one-column disclosures on phones. Runtime-specific settings and all explicit saves remain mounted. |
| Plan | Active approved plan, weekly prescription, deliberately opened proposal workflow, version history. Preserve local/online capability differences. |
| Training | Add training, filters/count, aligned responsive activity rows and pagination. Document scrolling replaces the nested list scroller. |
| Data Quality | Contextual return, source selection, source inputs, validation/results and next action; queued work remains distinct from successful import. |
| Details/login | Shared light surfaces and readable controls. Detail Back/title and one scroller remain; login retains owner GitHub authentication without app navigation. |

## Architecture and compatibility

ApplicationShell lives beneath the existing feature provider in the server dashboard layout. It owns navigation, the page H1, header and one `dashboard-main-content` landmark. Page wrappers preserve styling/recovery hooks without introducing nested main landmarks or duplicate headings. The existing Coach controller publishes only its truthful status to the shell; no server secrets or domain orchestration move into the shell.

Normal pages retain document-scroll recovery. Coach owns its transcript region and recalculates available height from visualViewport/header measurements. The old bottom-navigation subtraction is removed. Menu preference storage is optional; drawer state is transient. Existing athlete-scoped `racepredictor.coach.v2.` keys are unchanged.

NativeModal and the existing modal keyboard hook share reference-counted background isolation and scroll locking. Native overlay ownership prevents simultaneous drawer/sheet layers, explicit return targets replace Home-specific fallbacks, and Plan/Calendar no longer target a navigation element directly. Existing activity-detail nesting remains supported.

No API contracts, database schema, migrations, auth behavior, training-plan mutations or provider settings are introduced by navigation or visual filters. See ADR 0012.

## Delivery and validation

Implementation covers shared foundation, Coach, Home/Calendar, supporting screens, login, documentation and browser regression updates. Required checks are web unit tests, TypeScript/lint, production build and relevant local/online/Coach/auth/milestone browser suites. Native iOS Safari and Android Chrome keyboard/safe-area acceptance and authenticated hosted-preview validation must be recorded separately when available; desktop viewport simulations are not represented as physical-device evidence.

Detailed executed evidence and remaining limits are recorded in `docs/progress/responsive-redesign-validation.md`. Release uses a preview review before production promotion; rollback restores the prior frontend release without data rollback.

## Documentation synchronization

Updated: CONTEXT, PRODUCT, ARCHITECTURE, UI_UX_SPEC, UI_GUIDELINES, ROADMAP, design/screens, DESIGN_INTENT_CONTRACT and progress/validation, with this handoff and ADR 0012. API_CONTRACT and DB_SCHEMA are N/A because contracts/storage are unchanged. CODEX_WORKFLOW is N/A because delivery process is unchanged.
