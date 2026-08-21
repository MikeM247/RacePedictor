# Phase 1 Digital Coach Screens

This is the Phase 1 screen and state source of truth. `docs/UI_UX_SPEC.md` defines shared UX behavior and `docs/UI_GUIDELINES.md` defines visual rules.

## Navigation and Routes

| Label | Route | Purpose |
|---|---|---|
| Today | `/dashboard` | Today's purpose, workout/rest state, and next action |
| Plan | `/dashboard/plan` | Proposal import, review/approval, active plan, and versions |
| Calendar | `/dashboard/calendar` | Approved routine and auditable reschedule/skip/restore actions |
| Activities | `/dashboard/activities` | Manual import entry, history, and activity detail |
| Data Quality | `/dashboard/data-quality` | Import status, warnings, duplicates, and rejections |
| Settings | `/dashboard/settings` | Timezone, units, reminder preference, exchange path, and Codex handoff |

The former Overview purpose evolves into Today. Planning conversation is launched or continued in Codex/Second Brain; Phase 1 has no embedded chat screen.

## Screen Requirements

### Today

- Show local date/timezone, active goal, target countdown when applicable, and active plan version.
- Show today's session title, intent, prescription, estimated duration, status, and link to calendar; show an intentional rest-day treatment when none is scheduled.
- Place the approved workout or rest state before healthy infrastructure/freshness detail. Show concise current-week calendar context without implying that imported activities completed planned sessions.
- Show deterministic motivational context from the approved plan. Codex supplies the AI-written recurring reminder outside the app.
- Distinguish: no plan, rest day, upcoming, skipped, missed/unconfirmed, loading, stale, and error.
- Do not infer completion from an unmatched imported activity. Trustworthy activity-to-session matching and post-run review are an explicit Phase 2 gap.
- Primary no-plan action: generate coaching context and plan with Codex. Never imply automatic review/adaptation.

### Plan

- Make the active approved plan the page's primary focus. Start a first or replacement plan from a prominent **Create a plan with Codex** button on this page; opening it reveals the context-publish and proposal-import workflow without changing the active plan.
- Show the active goal and immutable plan version, date range, weekly rhythm, assumptions, and sessions.
- Show date progress and group sessions by explicitly supplied calendar week. Do not infer named training phases or completion from dates or imported activity history.
- Default new routine inputs to Sunday as the preferred long-run day; existing approved routines keep their saved preference.
- Import a supported proposal explicitly; never scan/activate silently.
- Surface a newer persisted proposed draft from the active-plan panel without expanding the creation workflow; **Review saved draft** opens the persisted proposal without requiring the source file again. Superseded or withdrawn drafts remain hidden.
- Draft review shows history-fingerprint freshness, all material fields, and differences from the active version.
- Provide explicit Approve and Reject actions. Approval uses a confirmation dialog; leaving the screen changes nothing.
- Show past approved versions read-only. Material edits create a new draft.

### Calendar

- Default to week view with agenda alternative; today and local timezone remain visible.
- Session cards show type, title, intent, prescription, duration, and effective status/date.
- Week cells use concise session summaries; selecting a session reveals its full effective/source detail, cautions, and history in context. Agenda becomes the default when seven columns cannot remain readable.
- Reschedule, skip, and restore require confirmation and have keyboard-accessible alternatives to drag-and-drop.
- Warn before confirmation about same-day collisions and dates outside the plan range; an out-of-range move cannot be confirmed.
- Preserve and expose the original prescribed date plus adjustment history.

### Activities and Data Quality

- Activities provides explicit CSV or GPX file selection; GPX accepts one activity per file.
- Import result exposes accepted, duplicate, rejected, and warning counts with recoverable detail.
- All normalized history remains browseable; re-import is idempotent.
- Preserve the activity list and filters while selected activity details load. Compact layouts provide an explicit return to the selected list row.
- Data Quality identifies whether the user should correct/re-upload, retry normalization, or take no action.

### Settings

- Timezone defaults to `Africa/Johannesburg`; daily reminder defaults to enabled at 06:30 local time. Both are configurable.
- Show local Second Brain coaching-exchange configuration without exposing private content unnecessarily.
- Generate/copy a versioned Codex recurring-reminder handoff.
- Display app preference status separately from handoff status and persisted external automation status (`not_configured`, `prepared`, `scheduled`, `attention`, or `disabled`). A prepared handoff is visibly not scheduled until the user confirms external setup.
- Disabling reminders does not remove Today or change the plan.

## Shared States and Interaction Rules

- Every data screen has loading, empty, error, and stale states; errors preserve safe retry/navigation paths.
- Destructive or state-changing actions show their target and result before confirmation.
- Dates use saved IANA timezone semantics, not browser locale or a fixed offset.
- Desktop is primary. Tablet collapses navigation; mobile stacks content and preserves Today, approval, calendar alternatives, import, and settings actions.
- All controls are keyboard reachable, focus is visible, status is announced to assistive technology, and color is never the sole state cue.
- Private file paths and note bodies are not echoed in routine UI or error telemetry.

## Critical Phase 1 Journey

1. Import CSV or one-activity GPX and inspect validation results.
2. Generate current coaching context and continue planning in Codex.
3. Import the returned structured proposal as a draft.
4. Review freshness and content, then explicitly approve.
5. Reschedule or skip a session and verify the prescription remains unchanged.
6. Open Today and understand the session and purpose.
7. Configure 06:30 reminder preference and generate the Codex handoff with clearly separate statuses.

This journey is the minimum browser-automation and Product Owner acceptance path.

## Phase 2 Exclusions in the UI

- No Garmin account-connect or automatic sync controls.
- No automatic post-run review, adaptation, or apply-recommendation action.
- No inferred completed-session state until imported activities can be matched to prescriptions reliably.
- No autonomous plan activation, in-app AI chat, or app-owned push-delivery promise.

## Approved Cloud Phase Screen Addendum

The Phase 1 exclusions above still prohibit Garmin and automatic coaching adaptation. The approved cloud programme adds Strava and synchronization controls without adding a new top-level route:

- **Today:** separate workout freshness, Second Brain snapshot freshness, and local-device state; the page continues to work when the local agent is off.
- **Activities:** automatic Strava activities share the canonical timeline with manual history and show safe provenance/processing state.
- **Data Quality:** durable ingestion/retry/reconciliation state and supported recovery action.
- **Settings:** authenticated owner session, Strava connect/status/disconnect, and one local sync-device pair/status/revoke flow.

Only snapshot section names, revision, and age are displayed for Second Brain sync. Vault content, note identity, paths, arbitrary text, tokens, raw payloads, and multi-athlete controls are absent.
