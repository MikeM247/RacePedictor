# Weekly training numeric right-axis plan

Date: 2026-10-14 (Africa/Johannesburg)
Status: Implemented in the workspace. Verification is pending.

## Outcome

On `/dashboard/readiness`, replace the weekly training chart's “Relative trend” heading and “High / Low” labels with a numeric right-hand Y-axis for pace, elapsed time, or elevation gain. Keep the left-hand distance axis in kilometres. The right-hand ticks must describe the actual scale used to position the corresponding line.

## Current implementation

- `apps/web/components/dashboard/weekly-training-chart.tsx` draws the chart directly in SVG. Overlay checkboxes allow all eight combinations of pace, time, and elevation.
- `apps/web/lib/weekly-training-chart-model.ts` uses `relativeValues()` to independently map each overlay's observed minimum and maximum to 0–1. Constant values map to the middle. The component adds 12px padding above and below these lines.
- The right margin is only 30px, suitable for the current “High / Low” labels but insufficient for numeric labels.
- `metricText()` already formats exact values for the selected-week readout and accessible table.
- Validated weekly observations already contain pace in seconds/km, elapsed time in seconds, and elevation gain in metres. This is a presentation change using that existing data.

## Interaction decision to review

**Recommendation: one numeric right axis, with a metric selector when multiple overlays are enabled.** Pace, time, and elevation have different units, so one set of numbers can describe only one of them at a time.

| Enabled overlays | Right-axis behaviour |
| --- | --- |
| None | Distance-only chart; no right axis or axis selector. |
| One | Automatically show that metric's title, units, tick marks, and numeric tick labels. |
| Two or three | Keep all selected lines visible. Show a labelled “Right axis” select control containing only enabled, available metrics. The axis displays the chosen metric's scale. |

Use the matching metric colour and marker beside the axis title; the text must identify the metric independently of colour. Other lines retain their own numeric scales, but their values must be read through the selected-week details/table or by choosing that metric for the axis. Help text: “Right axis shows [metric]. Other lines use separate scales. Select a week for all values.”

When the first overlay is enabled, use it for the axis. Adding another overlay keeps the current axis selection. Removing the axis metric chooses the first remaining enabled metric in the existing Pace, Time, Elevation order. No overlays means no effective axis selection. Derive a valid effective selection during rendering so a data refresh cannot leave the axis referring to an unavailable metric.

The selector changes the displayed axis only: it must not change line positions, selected overlays, or the selected week. Persisting this preference across reloads is outside this change.

If simultaneous numeric scales for every enabled metric are required, revise this decision before implementation. That would require separately labelled right-axis columns and a different mobile layout. The recommended selector keeps one readable axis at phone widths while supporting all three metrics.

## Numeric scale architecture

Add a pure `overlayScale(weeks, key)` helper to `weekly-training-chart-model.ts`. Return `null` for an entirely unavailable metric; otherwise return a domain in source units, tick values in source units, and a normalization function. Calculate a scale for every enabled metric, including lines whose axis is not currently displayed.

Use the same domain and normalization for both line coordinates and axis coordinates:

`pixelY(value) = overlayBottom - normalize(value) * (overlayBottom - overlayTop)`

Initially preserve the component's existing inset: `overlayTop = top + 12`, `overlayBottom = bottom - 12`. Place the right-axis endpoints and ticks on those same bounds. The distance baseline and left-axis grid continue to use their existing bounds. This prevents axis labels from drifting from the plotted values.

Choose roughly 4–6 readable ticks on desktop and 3–4 on narrow screens. Tick density can change with width; the metric domain must remain stable across resizing and axis selection. Use ascending values upwards for all metrics. Pace remains lower = faster, with that explanation retained.

| Metric | Axis title | Tick format | Domain and step policy |
| --- | --- | --- | --- |
| Pace | Avg pace (min/km) | `4:30`, `5:00`, `5:30` | Padded observed range, rounded outward to useful second intervals such as 5, 10, 15, 30, 60, or larger steps. Keep the lower bound nonnegative. |
| Time | Elapsed time (h:mm) | `0:00`, `1:00`, `2:00` | Start at zero; round maximum upwards using readable minute/hour intervals. Duration formatting must allow totals above 24 hours. |
| Elevation | Elevation gain (m) | `0`, `200`, `400` | Start at zero; round maximum upwards with 1/2/5 × powers-of-ten steps. Use grouped numbers for large values. |

Example labels are illustrative, not fixed bounds. Select steps from the observed range and desired tick count. Use elapsed-time steps down to seconds for unusually small nonzero totals; include seconds in the title/labels when needed to avoid duplicate formatted labels. Never create tick labels by interpreting numeric seconds as decimal minutes or decimal hours.

For constant pace or a single available pace point, expand around the value using a sensible step instead of dividing by zero. For all-zero time/elevation, use a small positive fallback upper bound (one minute / one metre) so zero remains at the axis baseline. Missing values stay gaps; zero remains a real observation. Keep full precision for coordinates and round only formatted labels.

Add `axisTickText(key, value, step)` separately from `metricText()`. Axis labels should be compact; selected-week details and table cells should retain their existing exact formats. Ensure distinct tick values have distinct labels after formatting.

## Rendering and layout

1. Replace `relativeValues()` use in the SVG with the new scale model. Remove that helper once there are no remaining callers; update its existing tests to test numeric domains and mappings.
2. Replace “Relative trend”, “High”, and “Low” with the selected metric title, a right-axis rule, tick marks, and formatted labels. Render an identifiable axis group such as `data-right-axis="Pace"` for browser verification.
3. Reserve enough horizontal space for the widest formatted tick label and its tick mark/gap. Use measured label width or a conservative allowance based on label length and the chart font. Contain all labels within the SVG rather than relying on `overflow: visible`.
4. Keep the plot's reserved right gutter stable across checkbox and selector changes for the same data and container width. This preserves distance bar positions and hit targets. Do not change the distance domain, zero baseline, or vertical bar geometry.
5. Wrap the axis selector/title above the plot at phone widths, and reduce tick count before reducing label font size. Verify at 320, 390, 768, and 1440px. If the remaining plot is too narrow, keep a minimum useful plot width with horizontal scrolling inside the plot container; never force the whole page wider. Keep previous/next-week controls outside any scrolling viewport.
6. Update SVG description and help text to identify the selected numeric axis and explain the independent scales of other visible lines. Give the select a native accessible label and retain keyboard/touch selection, line markers, readout, and data table. Support forced-colour mode.

## Implementation sequence

1. Implement and unit-test the scale model and tick formatter in `apps/web/lib/weekly-training-chart-model.ts` and `apps/web/test/weekly-training-chart.test.ts`.
2. Integrate the model, effective axis selection, selector, numeric SVG axis, and accessibility copy in `apps/web/components/dashboard/weekly-training-chart.tsx`.
3. Update `apps/web/components/dashboard/weekly-training-chart.css` for axis labels, selector wrapping, and responsive containment.
4. Extend the existing weekly-chart scenarios in `apps/web/e2e/redesign-readiness.spec.ts`; reuse deterministic fixtures. Record desktop/mobile screenshots for single pace, single time, single elevation, and all overlays with each selected axis.
5. Run focused validation, then the web test suite and type check. Prepare the resulting change for review before any deployment.

## Verification and acceptance criteria

- Selecting each metric alone displays its numeric right axis and correct units; “Relative trend” and “High / Low” are absent.
- All eight checkbox combinations work. Multi-overlay mode can show the numeric axis for each enabled metric. Disabling the active axis metric or receiving unavailable data selects a valid fallback.
- A known value maps to the same Y-coordinate whether used by the line or the axis. Ticks bracket all finite observations. Axis selection changes labels/ticks without moving any line or bar.
- Scale tests cover pace minute rollover, time above 24h, short durations, large elevation, narrow ranges, constants, a single value, zeros, mixed gaps, and all-null input. Tick labels stay unique and mappings stay finite.
- Gaps remain unconnected, distance starts at zero, and legacy distance-only snapshots keep overlays disabled.
- Selected-week values and the data table retain exact source-unit formatting. Axis changes cause no API calls or application writes.
- Numeric tick labels are visible inside the SVG at the supported widths, including large values and maximum-length duration labels. Check SVG/text bounding boxes because page overflow tests alone cannot detect clipped labels.
- Existing keyboard/touch flows pass. Axe checks pass with multiple overlays at 320px and 1440px. Page width stays within the viewport.

Use `npm test --workspace @racepredictor/web` and `npm run lint --workspace @racepredictor/web`, plus the focused weekly-chart Playwright scenarios against the existing local and online test configurations. Tests and application changes are deferred until implementation.

## Scope and expected impact

Changes are confined to the chart presentation model, component, styles, and their tests. The API contract, weekly aggregation, database, and readiness/prediction calculations already supply the needed values. Numeric domains will intentionally move some lines compared with the old min/max trend display, particularly time/elevation with their zero-based scales. The units, axis title, and help text make that behaviour explicit.
