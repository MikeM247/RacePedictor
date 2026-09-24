# Race Predictor App Inventory

## 1. Route map

### User-facing routes

| Route | Screen | Notes |
|---|---|---|
| `/` | Landing/redirect entry | Minimal app entry page. |
| `/login` | Sign-in | Uses dedicated sign-in CSS and branding. |
| `/dashboard` | Today | Current workout/rest state, active plan context, predictions, analytics, and freshness. |
| `/dashboard/plan` | Plan | Goal setup, Codex context handoff, proposal JSON import, draft review, approval/rejection, plan history. |
| `/dashboard/calendar` | Calendar | Four-week rolling calendar, activity/session details, schedule amendments, skip/restore actions. |
| `/dashboard/activities` | Activities | Activity history, filters, pagination, selected activity details, splits, route availability, coach review. |
| `/dashboard/data-quality` | Data Quality | Manual CSV/GPX upload and import validation results. |
| `/dashboard/settings` | Settings | Local preferences, reminders, Codex handoff; online mode adds Strava and device-sync controls. |

### Supporting API route areas

- `/api/v1/dashboard/overview`
- `/api/v1/activities`
- `/api/v1/imports/upload`
- `/api/v1/coaching/*`
- `/api/v1/providers/strava/*`
- `/api/v1/sync/*`
- `/api/v1/second-brain-context/*`
- `/api/v1/operations/status`
- `/api/v1/auth/session`

There is no dedicated user-facing `/performance`, `/predictions`, `/goals`, or `/training-data` route.

## 2. Screen/page list

- Login
- Today
- Plan
- Calendar
- Activities
- Data Quality
- Settings
- Online Settings variant

Today currently combines active coaching/session state, latest activity feedback, race prediction snapshot, training signal summaries, data pipeline/import progress, and online freshness status.

## 3. Key components

### Global/dashboard shell

- `DashboardNavigation`
- `DashboardShell`
- `OnlineDashboardShell`
- Dashboard toolbar/status area
- Skip link and route-aware navigation state

### Today/dashboard components

- `TodayCoachingCard`
- `LatestActivityFeedback`
- `KpiCard`
- `FeatureTrendList`
- `DriverContributionList`
- `ImportProgressPanel`
- `OnlineStatusPanel`
- `PanelCard`

### Activities

- `ActivitiesShell`
- Activity filter/list and pagination controls
- Activity detail panel
- `ActivityRecordContent`
- `ActivityCoachReview`

### Coaching

- `ActivePlanOverview`
- Plan creation/context publishing form
- Proposal JSON import/review UI
- Plan approval/rejection confirmation dialog
- Calendar week/session views
- Calendar detail dialog
- Session amendment/reschedule/skip/restore controls
- Settings and reminder controls

## 4. Main user flows

1. Sign in and open Today.
2. Import historical training data through Data Quality.
3. Browse imported activities and inspect detail, splits, route availability, and coach feedback.
4. Define a goal and training preferences on Plan.
5. Publish coaching context to Codex/Second Brain.
6. Import a returned structured plan proposal as a draft.
7. Review freshness, goal, sessions, assumptions, and differences.
8. Explicitly approve or reject the draft.
9. View the active plan on Today, Plan, and Calendar.
10. Amend, reschedule, skip, or restore permitted future calendar sessions.
11. Configure timezone/reminders and generate the Codex handoff.
12. In online mode, connect Strava, optionally backfill the last 90 days, and monitor sync/device status.

## 5. Data entry points

| Data | Entry point | Current behavior |
|---|---|---|
| CSV activity history | Data Quality upload | Bounded CSV import with accepted, duplicate, rejected, and warning results. |
| GPX activity | Data Quality upload | One activity per GPX file. |
| Strava activities | Settings in online mode | OAuth connection plus optional 90-day backfill; ongoing completed-workout ingestion. |
| Race/training goal | Plan | Goal title, target date, target distance, rationale/“why”. |
| Training availability | Plan | Selected available weekdays; Sunday is preferred long-run day for new routines. |
| Plan proposal | Plan | Explicit `.json` file import from Codex; imported as inactive draft. |
| Predictions | Today | Selected race distance controls the displayed prediction snapshot when multiple options exist. No dedicated prediction form/page. |
| Training data | CSV/GPX, Strava, local sync pipeline | Feeds activity history and analytics; imported activities do not automatically mark planned sessions complete. |
| Reminder preferences | Settings | Timezone, reminder enabled state, reminder time, and handoff configuration. |
| Calendar changes | Calendar | Reason-required future-session amendments, reschedule, skip, restore where permitted. |
| Second Brain context | Plan/online Settings | Structured context publication; private note bodies and paths are not shown. |

## 6. Current navigation structure

Desktop uses a persistent left rail with:

1. Today — `/dashboard`
2. Plan — `/dashboard/plan`
3. Calendar — `/dashboard/calendar`
4. Activities — `/dashboard/activities`
5. Data Quality — `/dashboard/data-quality`
6. Settings — `/dashboard/settings`

Navigation is implemented in `DashboardNavigation` with `usePathname()` and `aria-current`. The rail includes Race Predictor branding, “Night Ops” labeling, numbered links, and an owner-control boundary message.

There is no separate global athlete selector. The application is single-athlete.

## 7. Existing visual patterns

- Dark “Night Ops” telemetry-inspired theme.
- Deep navy page and navigation surfaces.
- Matte bordered panels with modest corner radii.
- Cyan primary interaction/accent.
- Violet categorisation.
- Lime success/actual state.
- Amber stale/warning state.
- Red error/destructive state.
- Left navigation rail with sticky positioning.
- Page-specific toolbar/header inside content.
- Dense desktop-first layouts.
- Cards, definition lists, tables/lists, segmented controls, dialogs, and expandable details.
- Inline status chips and state panels.
- Responsive collapse to stacked layouts and agenda-style calendar behavior.
- Strong keyboard focus outlines and skip-link support.
- Minimal animation and reduced-motion handling.

## 8. Obvious UX inconsistencies

- Documentation contains conflicting navigation models: current implementation uses Today, Plan, Calendar, Activities, Data Quality, Settings, while older guideline sections still reference Overview and Performance.
- Today mixes coaching, prediction analytics, training signals, import status, and infrastructure freshness, creating a broad information hierarchy.
- Data import is located under Data Quality, while Activities links users there with an “Import activities” action; there is no dedicated import destination.
- Settings has materially different content in local and online modes. Online mode replaces the local Settings page rather than clearly extending it.
- Page headers/toolbars are not fully uniform across Today, Activities, coaching pages, and online Settings.
- Status terminology differs across surfaces, including “success,” “healthy,” “ready,” “active,” “draft,” “stale,” and “action required.”
- Some pages use local inline state panels while others rely more heavily on component-specific states.
- Prediction selection is embedded in Today rather than exposed as a distinct race-goal or prediction workflow.
- Calendar is structurally complex: rolling grid, agenda fallback, dialogs, activity records, plan context, and amendment controls all coexist.
- Navigation is shared, but page shell implementations are split across dashboard, activities, coaching, and sync components.

## 9. Technical areas likely affected by a redesign

- Next.js route/page composition under `apps/web/app`.
- Shared dashboard/coaching shell and navigation components.
- Cross-page toolbar, filter, status, and page-state patterns.
- Dashboard, activities, coaching, calendar, and sync CSS.
- Today/dashboard view models and data-source composition.
- Client-side fetching and loading/error/stale behavior.
- Activity import UI and `/api/v1/imports/upload`.
- Activity list/detail contracts and API clients.
- Coaching plan, goal, proposal, approval, and calendar amendment flows.
- Strava connection/backfill/status surfaces.
- Local/cloud mode switching via `online-ui-mode`.
- Accessibility behavior for dialogs, focus management, keyboard navigation, and responsive calendar interactions.
- Route-level end-to-end tests and component/page tests.
- Shared design tokens in `globals.css`.
- Potential extraction of reusable panel, state, form, drawer, toolbar, and status components.
- Existing product/UI documentation, especially the older Overview/Performance references.

## Handoff summary

The current product is a desktop-first six-route training/coaching workspace centered on Today, with manual CSV/GPX imports, optional Strava ingestion, goal-driven Codex planning, explicit plan approval, calendar auditing, activity inspection, and data-quality monitoring. The redesign should preserve owner-controlled planning, explicit imports/approvals, independent freshness states, and the existing single-athlete model. The main structural opportunity is to unify the multiple page shells, toolbar/status patterns, state handling, and import/prediction information architecture.
