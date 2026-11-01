# Revised Calendar designs: dark full month with weekly totals

> The owner likes these three layouts. [Options 07–09](../calendar-theme-round-3/README.md) extend them with whole-month totals at the bottom.

1 November 2026 · Options 04–06 replace the rejected first-round designs. Standalone design previews with illustrative data; production UI is unchanged.

All three use the dashboard's explicit deep navy background (`#08141e`), dark panels (`#10232f`), readable pale text, Arial font and consistent menus. Every option shows the entire month, Monday–Sunday headings and a total for every week. No option is a one-week view.

| Option | Design | Desktop | Mobile |
|---|---|---|---|
| **04 · Totals column** | Dedicated weekly totals aligned to the right of every row; totals move below each row on phones. | [Preview](option-4-1440.png) | [Preview](option-4-390.png) |
| **05 · Weekly ribbons** | Continuous full-month grid with planned/recorded totals beneath every week. | [Preview](option-5-1440.png) | [Preview](option-5-390.png) |
| **06 · Week cards** | Full month organized into individual dark weekly cards, each carrying its own totals. | [Preview](option-6-1440.png) | [Preview](option-6-390.png) |

[Interactive preview](index.html): choose 04, 05 or 06 at the top. All support month previous/next, Today, date selection and sample detail dialogs. Review controls are not product UI. If local HTML is blocked, serve this directory with `python -m http.server 8765 --bind 127.0.0.1`.

## Weekly totals

Planned and recorded kilometres remain separate, with separate durations on wide screens. Every total covers the complete displayed Monday–Sunday week, including adjacent-month days. All figures are synthetic examples. Recorded totals do not claim a prescription is complete. Unknown production prescription distance must not silently become zero. At phone widths, the compact weekly strip shows both distance totals without removing weekday columns; implementation must expose the full duration summary in details.

## Verification

See [browser measurements](verification.json). Chromium/Playwright verifies each option at 320, 390, 768, 1024 and 1440px: full-month rows, one summary per week, seven weekday headings, explicit dark body background, no horizontal overflow and minimum 44px date targets. Interaction checks cover date selection, previous/next month, Today, detail dialog/Escape/focus restoration and mobile menu. These checks validate standalone concepts, not production integration or complete accessibility compliance.

[Shared visual contract and updated requirements](../APP_THEME_AND_CALENDAR.md).
