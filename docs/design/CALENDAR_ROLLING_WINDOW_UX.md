# Rolling calendar and activity information — UX proposal

Status: design only; implementation has not started. Prepared 2026-09-08 using the ux-ui-designer skill, before the accompanying architecture plan.

References: [screen source of truth](screens.md), [shared UX specification](../UI_UX_SPEC.md), [visual guidelines](../UI_GUIDELINES.md), [implementation plan](../plans/CALENDAR_ROLLING_WINDOW_IMPLEMENTATION_PLAN.md).

## User Flow

1. Open `/dashboard/calendar`. The first row is the Monday–Sunday week containing today in the saved calendar timezone; the following three weeks appear beneath it.
2. Scroll toward later dates to replace the first week with the next week at the bottom. Scroll toward earlier dates to insert the preceding week at the top and remove the last week. Each settled window contains exactly four consecutive weeks.
3. Select a day's existing circular information control. Future dates show the active plan's details. Past dates show full Activity records first, followed by that date's active-plan details in the same scrollable panel.
4. Close the panel and return to the same calendar window and information control.

Success: browse dates without week-navigation buttons, inspect a run without visiting Activities, and see one source of planned training without duplicate retired versions.

## Screen Breakdown

### Calendar — `/dashboard/calendar`

Keep the existing dark matte surfaces, restrained borders, type hierarchy, cyan focus treatment, compact daily summaries, Monday-first layout, and Weeks/Agenda choice. Remove Previous week, Today, and Next week buttons. Keep today's date marker; it is a date indicator rather than navigation.

The compact header contains the visible date range, timezone, and view choice. A short helper says: “Scroll to browse weeks · Page Up / Page Down when focused”. Do not introduce another navigation toolbar or a new Today button.

Illustrative structure (not a screenshot; dates assume today is 8 September 2026):

```text
Calendar                     7 Sep–4 Oct 2026 · Africa/Johannesburg
Scroll to browse weeks                         [Weeks] [Agenda]
             Mon      Tue      Wed      Thu      Fri      Sat      Sun
Week 7 Sep   [day]    [Today]   [day]    [day]    [day]    [day]    [day]
Week 14 Sep  [day]    [day]     [day]    [day]    [day]    [day]    [day]
Week 21 Sep  [day]    [day]     [day]    [day]    [day]    [day]    [day]
Week 28 Sep  [day]    [day]     [day]    [day]    [day]    [day]    [day]
```

| Navigation | Weeks shown, by Monday start date |
|---|---|
| Initial | 7 Sep, 14 Sep, 21 Sep, 28 Sep |
| One week earlier | 31 Aug, 7 Sep, 14 Sep, 21 Sep |
| One week later from initial | 14 Sep, 21 Sep, 28 Sep, 5 Oct |

Day summaries count only visible recorded runs and active-plan sessions. Remove historical-plan cues and counts. Retired versions remain available on Plan, outside Calendar.

### Information panel — within Calendar

Reuse the existing dialog pattern with a sticky date/title/Close header, a comfortably wide desktop body (approximately 860–960 px maximum), and one vertical scroll area. On compact screens it occupies the available viewport with a small outer margin. Lock background scrolling while open.

| Selected date/state | Content order |
|---|---|
| Future, active session exists | Active plan session details |
| Future, no active session | “No session scheduled in the active plan for this date.” |
| Past, recorded run exists | Full Activity record, then active-plan details for the date |
| Past, no recorded run | “No run recorded”, then active-plan details if present |
| Today, recorded run exists | Same order as a past recorded run |
| Today, no recorded run | Active plan details or unscheduled state |
| No active plan | Activity records where applicable, then “No active plan.” |

Past-run panel structure:

```text
8 September 2026 · Run details                              [Close]
Activity record
  Run title and timestamp
  Run at a glance: distance, elapsed time, average pace, elevation
  Additional telemetry, when supplied
  Splits
  Route availability
──────────────────────────────────────────────────────────────────
Active plan · session scheduled for this date
  Title, type, purpose, prescription, duration/distance, effort/time
  Cautions, effective date and status
  Approved source and schedule changes (expandable when applicable)
```

The Activity record must have the same fields, values, formatting, missing-data treatment, and section order as Activities. Reuse its presentation rather than designing a second abbreviated record. “Back to activities” belongs only on Activities; Calendar uses its own Close control. Do not imply a map exists: the current Activity record displays route availability.

The plan section sits naturally below the records; it is not a separate tab. Show its title and prescription expanded. Existing original-prescription and amendment history may use progressive disclosure. These are changes within the active plan, not a list of historical plan versions.

## Key Interactions

- Treat Weeks as a rolling four-row viewport. A deliberate vertical wheel/trackpad gesture or vertical touch swipe advances one week at a time. Scrolling up means earlier calendar dates. Do not load automatically merely because the calendar is visible.
- Coalesce gesture momentum so one gesture cannot skip many weeks. Keep the current four rows visible while the incoming range loads; commit all four rows and the header together. Optional short motion must respect reduced-motion preferences and must not expose a fifth populated row.
- Respond to gestures only within the calendar. Never intercept browser zoom, horizontal scrolling, form input, or dialog scrolling. In short viewports, ordinary scrolling first reveals the current window's content; navigation occurs at its leading/trailing boundary. Users must still be able to leave the region using keyboard focus or scroll outside it.
- A focusable, labelled calendar region supports Page Up/Page Down to move one week. Apply these shortcuts only to the region itself, not every descendant. Tab reaches each information control; show a visible focus indicator and announce the new date range once after it settles.
- Keep the existing information icon recognizable; its accessible name is “View details for [date]”. Each visible day has one entry point. Multiple active sessions on a date are all shown; “one active plan” does not mean “one session”.
- With multiple recorded runs, render each full Activity record in time order, then show the active-plan section once. Load each record independently, without pairing the first run arbitrarily with a plan session.
- Opening, switching date, or selecting another record resets the information panel to its beginning. Closing restores the launching control; if it no longer exists, focus the calendar region.
- Keep existing future-session edits and their reason/confirmation flow. Today remains read-only. The existing permitted past-session skip action remains available. Opening information performs no mutation.
- Preserve explicit date/session deep links: an explicit valid date places its week first and an explicit session opens its details. A normal visit starts at the current week. Merely scrolling must not repeatedly reopen a linked session.

## Edge Cases

- **Loading:** four initial skeleton rows; during navigation keep the old window and show a discreet loading indicator. Do not clear the entire calendar on each week step.
- **Navigation error:** preserve the last successful range and show “Could not load more weeks” with Retry. Do not advance dates on failure.
- **Activity detail error:** leave the dialog and plan section usable; show a retry within the failed record. Never substitute the short summary as if it were the full record.
- **Unavailable activity feed:** say records could not be loaded. Reserve “No run recorded” for a successful empty result.
- **Empty weeks:** still render all dates and allow browsing in either direction, including outside the active plan's range.
- **Retired plan only:** show no active-plan session for that date. Do not silently substitute retired versions.
- **Rescheduled session:** use the effective date for placement; original date and approved source remain visible within its details.
- **Calendar timezone/midnight:** resolve timezone before choosing the initial week. Recompute today when the date changes; do not forcibly move a window the user has already browsed.
- **Compact screens:** retain Agenda as the default below the existing readability breakpoint. Group its content chronologically into the same four weeks, including empty-week labels. Native scrolling reads agenda content; reaching an edge and continuing the gesture rolls the week window. Four weeks are loaded, although all their entries need not fit simultaneously on a phone.

## UX Risks

- Scroll navigation is less discoverable than buttons. Mitigate with the concise helper, visible changing date range, keyboard equivalents, and testing with wheel, trackpad, and touch.
- Four desktop rows can be cramped on short screens. Keep summaries concise, avoid shrinking readable text, and allow in-window reading scroll or Agenda instead of clipping essential controls.
- A same-date plan is context, not proof that a run completed a particular prescription. Use “Session scheduled for this date”; add a small explanatory note without introducing completion/adherence scoring.
- The user explicitly confirmed that past runs use the currently active plan only. Consequently, an old run can have no applicable plan context even when a retired version once covered that date. Explain that absence clearly instead of showing historical versions.

## Handoff Notes

- This proposal changes Calendar and reuses Activity record presentation. It does not redesign Activities, Plan history, or the design system.
- Aesthetic review should check desktop four-row density, short desktop height, the compact Agenda alternative, information-panel hierarchy, and visible keyboard focus.
- Validate against the working tree, which already contains unrelated and overlapping edits; do not overwrite them.
- Update `docs/design/screens.md` and `docs/UI_UX_SPEC.md` to the adopted behavior during implementation. This proposal remains explicitly separate from the currently implemented specification.
- No implementation code, database change, or deployment is part of this planning deliverable.
