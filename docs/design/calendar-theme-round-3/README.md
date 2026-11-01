# Calendar options 07–09: weekly and whole-month totals

> **Selected:** the owner chose **08 · Month summary**. Continue with [the Product Owner BRD and packaged visuals](../../product/calendar-month-summary/BRD.md). Options 07/09 remain comparison history; architecture/implementation are pending.

1 November 2026 · Design previews using sample data; application UI is unchanged.

The three layouts the owner liked now each have a **whole-month totals section directly below the final week**, before selected-day details. Every option retains the dark dashboard palette, Arial font, shared menu appearance, full month, weekday headings and weekly totals. The month summary keeps all facts visible on phones, including duration.

| Option | Monthly summary | Desktop | Mobile |
|---|---|---|---|
| **07 · Month ledger** | Compact aligned footer beside a month heading, below the calendar with right-hand weekly totals. | [Preview](option-7-1440.png) | [Preview](option-7-390.png) |
| **08 · Month summary** | Full-width planned/recorded summary beneath the month with weekly ribbons. | [Preview](option-8-1440.png) | [Preview](option-8-390.png) |
| **09 · Month cards** | Two dark summary panels beneath the month of weekly cards. | [Preview](option-9-1440.png) | [Preview](option-9-390.png) |

[Interactive preview](index.html): select 07, 08 or 09 at the top. Previous/next changes the entire month and its totals. Today returns to the fixed sample date of 1 November 2026. If local HTML is blocked, serve this directory with `python -m http.server 8765 --bind 127.0.0.1`.

## Totals

Planned and recorded distance, duration and counts are separate. Weekly totals cover all Monday–Sunday dates, including adjacent-month dates. Monthly totals include **only dates within the selected month**, never the sum of full boundary weeks. Sample November totals are 185 km, 22h 55m and 21 planned sessions; 10 km, 59m 23s and one recorded activity. The October 27 sample activity is excluded from November but remains in its week summary. Recorded totals are available facts, not completion/adherence scores; the fixture's month is not a forecast of future recorded activity.

In production, use saved-timezone date boundaries, effective approved prescriptions and canonical activities. Unknown distance or duration must produce an explicit incomplete/unavailable aggregate rather than silently becoming zero. The standalone fixture contains complete illustrative values and makes no network/database calls.

## Preview verification

[Measurements](verification.json) record Chromium checks at 320, 390, 768, 1024 and 1440px for all three options. Checks cover full-month rows, one total per week, dark body background, seven weekday columns, 44px date targets, no horizontal overflow, the exact monthly fixture values and changed footer on month navigation. Existing sample date selection, dialogs, Escape/focus return, Today and mobile menu checks are retained. This is standalone design verification, not production integration or full accessibility certification.

[Shared contract and monthly-total semantics](../APP_THEME_AND_CALENDAR.md).
