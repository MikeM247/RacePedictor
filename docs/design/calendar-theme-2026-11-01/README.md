# Calendar theme options

> **Rejected by owner.** Retained for history. Use [replacement dark month concepts with weekly totals](../calendar-theme-round-2/README.md).

1 November 2026 · Standalone design proposals, using illustrative data.

Open [the interactive preview](index.html), then use the three review controls at the top. Each option supports date selection, previous/next, Today and sample session/activity dialogs. The review controls and explanatory preview dialogs are not product UI.

If your browser blocks local HTML files, serve this directory with `python -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/`.

| Option | Desktop | Mobile |
|---|---|---|
| **01 · Month canvas — recommended** | [Desktop preview](option-1-1440.png) | [Mobile preview](option-1-390.png) |
| **02 · Week focus** | [Desktop preview](option-2-1440.png) | [Mobile preview](option-2-390.png) |
| **03 · Month + focus** | [Desktop preview](option-3-1440.png) | [Mobile preview](option-3-390.png) |

Shared visual rules, proposed implementation, scope and acceptance: [App theme and Calendar contract](../APP_THEME_AND_CALENDAR.md).

## Preview verification

Chromium/Playwright checked each option at 320, 390, 768, 1024 and 1440px: **15 layout checks passed**, with seven weekday headings, date targets at least 44px wide, no page-level horizontal overflow and no JavaScript page errors. At every size, date selection, previous/next navigation, Today, opening a session preview, Escape dismissal and return focus passed. Mobile menu opening/Escape also passed. Measurements are saved in [verification.json](verification.json).

The six screenshots show the tested 1440px and 390px layouts. A full-page phone screenshot captures fixed bottom navigation at its original viewport position; content beneath it remains reachable by normal scrolling with bottom padding.

These checks validate the standalone previews only. They do not validate production data, every production state, screen-reader experience, contrast compliance, physical devices, native browser zoom or application regression. Full app quality gates remain required during implementation. No application code, feature flag, database, API or deployment changed.
