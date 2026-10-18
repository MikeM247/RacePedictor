# Home: greeting and daily check-in over the photograph

18 October 2026 · Implemented

## Intended result

Bring Home closer to the original design attached to the request: the photograph begins close to the top of the main content, behind the greeting, date, daily check-in and goal text. The greeting and date sit at the upper left; a quieter, smaller check-in pill sits at the upper right. Keep the existing visual rhythm, content alignment, navigation, journey and lower cards.

Interpretation: “text behind the image” means the photograph is the background and readable, interactive text appears over it, as clarified by the request's placement of the greeting and check-in over the image. The attachment provides visual direction; its sample names, dates and results are not application data.

This is the first amendment to the current Road to Comrades UI. The photo treatment applies to the Home hero and its header; the existing journey and lower content retain their layout.

## Current implementation

- `apps/web/components/dashboard/dashboard-shell.tsx` previously rendered `HomeDate` and `DailyWellbeingCheckIn` in a separate toolbar before the Home content.
- `apps/web/components/dashboard/home-goal-context.tsx` owns the photograph, appearance preference, contrast overlay, goal content and journey. The image currently starts below the separate toolbar.
- `apps/web/components/dashboard/road-to-comrades.css` supplies the final Home-specific toolbar, hero and check-in styles, including mobile overrides. Toolbar top padding and content top padding currently contribute separate vertical bands.
- `apps/web/components/coaching/daily-wellbeing-check-in.tsx` already supplies a modal trigger with unsaved, saved and skipped labels, plus loading and retry states.
- The existing [desktop capture](references/road-to-comrades/desktop.png) confirms the separate header band. This plan is based on source and saved review images; the live deployed dashboard could not be inspected through the available web tool.

## Layout specification

| Element | Desktop | Mobile |
| --- | --- | --- |
| Photo position | Start near the top of the main column, with a proposed 8–12 px top inset and the existing horizontal page gutters. Remove the separate header band. | Start immediately below the existing mobile navigation/header with a proposed 8 px inset; preserve current side gutters and rounded corners. |
| Greeting and date | Upper left inside the photo; date directly below the greeting. | Same placement and hierarchy, with responsive type and wrapping. |
| Daily check-in | Upper right inside the photo, aligned with the greeting. | Upper right where it fits; wrap onto a second row inside the photo at narrow widths. |
| Goal content | Below the header, retaining the current goal, target, date and footer hierarchy and generous separation. | Below the header with sufficient separation for wrapped titles and check-in labels. |
| Journey and cards | Preserve current arrangement and spacing below the hero. | Preserve current responsive journey and stacked cards. |

Use an explicit row gap between the hero header and goal content, initially about 32 px on desktop and 24 px on mobile, then compare against the reference. Retain the current hero height as the initial budget and let content increase it when needed. The new header consumes space within that budget rather than automatically adding the old toolbar height. Avoid fixed heights that clip content.

Keep the current image crop as the starting point. Tune desktop and mobile focal positions separately so the runners remain visible and the new header remains readable. Retain the dark gradient and extend its protection to the top of the image. Check both the default photograph and bright uploaded backgrounds. A translucent dark check-in surface provides local contrast without a heavy border or prominent shadow.

## Check-in treatment

- Aim for an approximately 30–32 px visible pill with tighter horizontal padding, a smaller status icon, a subtle border and readable text (approximately 12 px desktop and 11–12 px mobile).
- Keep the interactive button target at least 44 × 44 px. Draw the smaller pill within that target using an inset background layer; the hit area and keyboard focus indicator remain full size.
- Retain the existing daily, saved/edit and skipped/edit states and their accessible names. Loading and retry content must also sit within the hero header and wrap cleanly.
- Reuse the existing modal and persistence behavior, including Save, Skip, Edit, date rollover, timezone handling, conflicts, Escape and return focus.

## Component approach

1. Add an optional `header` presentation slot (`ReactNode`) to `HomeGoalContext` and render it as a semantic header inside `.road-hero`, above `.road-hero-content`.
2. Build that header in `DashboardShell` using the existing `HomeDate` and keyed `DailyWellbeingCheckIn` instances. Pass it into the slot and remove the standalone toolbar from this Home layout.
3. Keep date, refresh and timezone ownership in `DashboardShell`. Keep appearance loading, image fallback, goal fetching and journey ownership in `HomeGoalContext`. Render the header in loading, empty and error states as well as the ready state.
4. Use normal grid/flex flow for the header and goal content. Use positioned layers only for the decorative photograph and shade. Avoid absolute coordinates for text and avoid negative margins to pull the photo behind an external toolbar.
5. Scope new styling to the Home hero in `road-to-comrades.css`; reconcile obsolete Home toolbar rules so desktop and mobile overrides do not reintroduce the blank band. Leave shared toolbar behavior on other dashboard pages intact.
6. Only adjust check-in markup if needed for the smaller visible pill. Keep its native dialog behavior and stable component identity during refreshes; moving its trigger inside the hero must not clip the dialog or reset an open form.

Retain one `dashboard-page-title` H1 for the greeting and the existing goal H2. All text stays live HTML; no text is baked into the photograph. This change requires no API, schema, authentication or persistence changes.

## Implementation sequence

1. Introduce the hero header slot and move the existing header content into it.
2. Adjust top spacing, internal rows, image shade and compact check-in presentation.
3. Apply mobile wrapping and verify the image crop against the attachment's visual intent.
4. Run focused verification and capture desktop and mobile screenshots for review.

## Acceptance and verification

- The image begins near the top of the main content; there is no separate greeting/check-in band above it.
- Greeting, date, check-in and goal content visibly share the same photographic background on desktop and mobile.
- The check-in looks smaller and quieter while remaining easy to tap and keyboard accessible.
- Header items and goal text never overlap, truncate essential labels or cause horizontal page scrolling. Check 320, 390, 768, 1280 and 1440 px widths, long goal names, the longest check-in state and 200% zoom.
- Text remains readable over the default and bright custom backgrounds; verify text contrast, focus visibility and the preserved image fallback.
- Reuse the existing `road-to-comrades.spec.ts` and Home accessibility coverage to verify opening, saving, skipping, editing, reload, focus return and no additional page-load writes. Extend existing coverage only where the changed layout creates a meaningful gap.
- Run the web typecheck and focused browser/accessibility checks after implementation. Capture the default desktop/mobile hero and an open mobile check-in dialog.
- Confirm the journey, lower cards, navigation and appearance settings continue to work with the same data and interactions.

The hero header slot, tighter top spacing, responsive wrapping, photo shade and smaller check-in pill are implemented. The existing date rollover browser assertion now targets the hero header. A Sunday-specific week-boundary fixture and a collapsed-instructions expectation in the mobile journey were corrected; the run-at-06:30 scenario now freezes its browser clock before the workout. Verification: `npm run test:cloud` passes (20 core, 79 database and 166 web tests, plus TypeScript). Home browser tests pass 29/29; Readiness passes 10 with 2 existing skips; online passes 82 with 1 existing skip; owner-auth passes 3/3. The 63-case default local browser run passed 62 cases; its two corrected journey cases passed on focused reruns. `git diff --check` passes.
