# Readiness weekly training chart — implementation plan

Date: 2026-10-13
Status: Implemented in the workspace. Verification and environment limits are recorded in [the QA report](../progress/readiness-weekly-training-qa-20261013.md).

## Outcome and scope

Replace the Readiness weekly-distance list with one responsive chart. Distance is always visible as vertical bars starting at 0 km. Pace, Time, and Elevation are independent checkboxes, initially unchecked; all eight combinations are supported. The two desktop charts in the UX board represent alternative states of this one component.

Keep the existing Readiness navigation, fitness estimate, estimate-distance selector, training signals, explanatory caveats, data-quality recovery flow, and freshness disclosure. Retain other supplied feature series below the chart rather than dropping them. Mobile uses the same component and data, with wrapped controls and a selected-week details panel. The visual board is a layout reference; sample overlay values must never enter production data.

Version one shows 12 calendar weeks, including the current week. The mockup's “12 weeks” label is static in this release; a date-range picker is a separate extension. Changing overlay selections is component state and performs no network request or application write. Reloading starts with distance only.

## Verified repository findings

- `apps/web/components/dashboard/readiness-shell.tsx`: `TrendEvidence` currently renders supplied points as lists, within the successful prediction-content branch.
- `apps/web/lib/readiness-evidence.ts`: groups generic series without assuming that all values are distances. Existing tests deliberately preserve negative generic observations and gaps.
- `packages/core/src/services/cloud-dashboard.ts`: produces distance only under `total_distance_km`; groups activities by UTC Monday; returns an empty assessment when it cannot produce all predictions.
- `packages/db/src/cloud/prisma-cloud-dashboard-repository.js`: selects at most 500 activities, without a sport filter, and only selects identity, timestamp, distance, and elapsed time. That bounded input cannot prove complete weekly totals.
- `packages/db/src/local-analytics.js`: groups by local Monday, already calculates elapsed time, distance-weighted pace, and elevation, but exports distance only under `weekly_distance_km`. It creates zero rows between the first and last activity weeks.
- `packages/db/prisma/schema.prisma`: Activity and WeeklyFeature already contain the underlying metrics. No database migration is expected for this feature.
- `apps/web/components/activities/activity-split-comparison.tsx`: uses responsive SVG and ResizeObserver, with no external chart library. Reuse that approach and shared visual tokens, but not its pace-specific axis assumptions.
- `packages/core/src/contracts/dashboard.ts`, `apps/web/lib/dashboard-view-model.ts`, and local/mock fixtures explicitly model the dashboard payload; all must be updated together.

## Data architecture

Use the existing authenticated `GET /api/v1/dashboard/overview` and local snapshot flow. Add an optional top-level `weeklyTraining` read result to every dashboard response variant, independent of prediction success. This lets observed training remain useful when the athlete has runs but insufficient history for a fitness estimate. Existing clients can ignore the additive field; old snapshots still load.

Proposed contract in `packages/core/src/contracts/weekly-training.ts`:

```ts
type WeeklyTrainingRead = {
  status: "ready" | "empty" | "unavailable";
  timezone: string;
  generatedAt: string;
  windowStart: string; // Monday, YYYY-MM-DD
  windowEnd: string;   // exclusive Monday after the final week
  weeks: Array<{
    weekStart: string;
    weekEndExclusive: string;
    isCurrentWeek: boolean;
    runCount: number | null;
    distanceM: number | null;
    elapsedTimeS: number | null;
    avgPaceSecPerKm: number | null;
    elevationGainM: number | null;
    coverage: "recorded" | "no_recorded_runs" | "unknown";
  }>;
};
```

Validate finite, nonnegative totals; pace is positive or null. Validate real calendar dates, Monday alignment, unique ascending weeks, and exactly 12 slots for a ready result. Empty/unavailable responses carry no invented observations. Keep numbers in source units until presentation; rounding happens in labels only. Derive TypeScript types from Zod where practical and update the existing manual dashboard type definitions as well.

Add a pure aggregator in `packages/core/src/services/weekly-training.ts` and use it from cloud and local export adapters. It receives scoped source records, an explicit timezone, the requested window, and an explicit clock value. It does not call a database or change prediction calculations.

### Metric definitions

| Display | Definition | Display unit |
| --- | --- | --- |
| Distance | Sum of recorded running distance | km, one decimal |
| Pace | Sum of each eligible activity's recorded average pace × distance, divided by eligible distance | min/km |
| Time | Sum of elapsed running time, including pauses | h/min; exact seconds available in details/table |
| Elevation | Sum of recorded elevation gain, not net elevation change | m |

Use running sports (`run`, `trail_run`, `treadmill_run`) consistently. Exclude deleted records and keep athlete ownership authoritative. Do not average activity paces without distance weighting or derive a missing pace from weekly totals. Do not infer elevation from distance. If a required metric is missing/invalid for a contributing run, mark that weekly metric unavailable rather than showing a partial aggregate as a full total. Zero-distance activities contribute valid time/elevation but do not enter pace weighting. A week without recorded runs can have zero totals and null pace only when the source read covers that week; label it “No recorded runs,” not verified inactivity.

Some existing import paths may encode missing elevation as zero. Trace that provenance during implementation: a stored zero is only as trustworthy as its source contract. If absence cannot be distinguished, document that limitation and avoid describing source coverage as complete; do not silently fabricate a new availability signal.

### Week boundaries and source adapters

- Resolve the athlete's configured timezone server-side, using the existing Africa/Johannesburg fallback when unavailable. Include the resolved timezone in the response; the browser does not regroup points after mount.
- A week is Monday 00:00 through the next Monday, exclusive, in that timezone. Assign an activity to its start-date week. Convert query boundaries to UTC using existing timezone utilities where available; cover DST transitions in tests.
- Use the current week plus the previous 11 calendar weeks, so missing weeks do not collapse the horizontal axis. Mark only the actual current week as “Current week · partial.” A historical last observation is not automatically partial.
- Cloud: add a separate bounded date-window read for chart inputs with sport and athlete filters, selecting pace and elevation too. Do not reuse the existing 500-row prediction slice. Fetch the complete window through pagination or a complete server aggregation; use deterministic ordering if paging. Keep the legacy prediction read/calculations unchanged.
- Local: normalize the equivalent source activity fields into the shared aggregator before writing `dashboard-overview.json`. Use the same timezone policy and 12-week window; audit local sport/deletion field mappings rather than assuming cloud field names.
- Snapshot freshness and record coverage are distinct. Old snapshots retain their recorded window and freshness warning until regenerated; do not extend them with fictional zero weeks.
- Build chart output before prediction-only early returns. Isolate optional chart-read failures so existing fitness estimates remain usable. Expose a chart-scoped unavailable state and retry through the existing dashboard read.

### Backward compatibility

When `weeklyTraining` is absent, adapt recognised distance series (`total_distance_km`, `weekly_distance_km`, and the existing fixture alias `distance`, with km units) into a distance-only chart. Preserve their observed date span and gaps, label the historical period, and disable overlays with an explanation. Do not reinterpret arbitrary labels as distance, merge competing duplicate series silently, or let a negative distance establish a negative chart axis. Invalid/ambiguous legacy values remain inspectable in the original evidence table with an unavailable-chart explanation. Keep unknown feature series visible through the existing generic evidence renderer. Explicit new payload errors must not be silently hidden by legacy fallback.

## Chart and interaction architecture

Add `apps/web/components/dashboard/weekly-training-chart.tsx`, a focused client component, and `weekly-training-chart.css`. Add `apps/web/lib/weekly-training-chart-model.ts` for presentation-only formatting, tick selection, domains, gap segmentation, and legacy adaptation. The chart receives validated data; it never fetches or recalculates training totals.

- Distance axis is always `[0, niceCeiling(maxDistance)]`, with a nonzero fallback ceiling for all-zero weeks. Toggling overlays cannot change bar heights or the distance domain. Values above the screenshot's 50 km range remain visible.
- Render cyan bars, a visible zero tick/baseline, chronological dates, and a hatched current-week bar. A true zero and an unavailable observation have distinct readouts and visual marks.
- Render selected overlays with purple circles/solid lines for pace, amber squares/dashes for time, and green triangles/dots for elevation. Use straight segments, with breaks at missing values; no smoothing or interpolation across gaps.
- Each overlay uses its own domain across the entire displayed window, independent of selected week and enabled controls. Normalize only for plotting: `(value - min) / (max - min)`. A constant series sits at the midpoint; one valid value is a marker without a connecting line. An all-null metric has a disabled checkbox and visible reason.
- The right axis says “Relative trend”; the nearby explanation says “Each line uses its own scale. Compare changes within a metric; select a week for exact values.” No shared numeric scale mixes km, min/km, hours, and metres.
- For pace, higher means a higher min/km value (slower), consistent with the relative high/low axis. Explicitly label “Lower pace = faster.” Do not borrow the race-split chart's inverted pace axis without changing the overlay explanation.
- Native checkbox controls support any subset of overlays, with a persistent distance legend. Avoid radio buttons or a chart-type switch. Keep focus on the changed control and the selected week unchanged.
- Desktop hover previews a week; click or keyboard activation pins it. Pointer exit returns to the pinned selection; Escape clears the pin. Keyboard arrows move through weeks, with Home/End support and visible focus.
- Mobile tap selects a week and shows its details below the plot. Provide Previous/Next week buttons with at least 44px targets: twelve plot columns alone cannot provide 44px targets on a narrow phone.
- Details show the week date, distance, selected overlay values, partial-week status, and unavailable labels. Selecting/deselecting a metric updates this same panel.
- “View weekly data” expands a semantic table with all four metric columns, dates, and availability notes. It provides exact values and a non-visual alternative. Keep narrow-screen scrolling within the table container if needed; the page itself must not overflow horizontally.

## Responsive layout and accessibility

Use the existing 960px Readiness content width initially. Allow the chart to use the card's full width, and adjust only Readiness-scoped spacing if needed. Desktop controls fit in a row; narrow layouts wrap into multiple rows. The mobile chart fits all 12 weeks, thinning date labels while preserving first/last labels. Show desktop bar labels only when they fit; exact values remain available through selection and the table.

Reuse existing CSS colour, surface, border, and typography tokens. SVG has an accessible title and description; the HTML interaction controls and data table carry the full semantics. Avoid announcing every pointer movement through a live region. Announce deliberate keyboard/tap selection concisely. Check focus order, touch selection, high contrast, colour-independent series identification, and reduced motion. No animation is required for version one.

Move the weekly chart section outside the prediction-success conditional while preserving the estimate's existing loading/error/empty messages. The chart has its own loading, ready, empty, unavailable, and stale presentation. Other evidence and recovery links retain their existing behavior.

## Implementation sequence

1. **Contract and calculations.** Add validated chart contract, timezone/window helpers, and pure aggregation. Lock metric definitions and edge cases with unit fixtures. Confirm existing import availability semantics.
2. **Cloud and local data.** Add complete chart-window read and local snapshot serialization. Thread the optional field through dashboard schemas, response variants, view model, mock source, and fixtures. Verify prediction outputs remain unchanged.
3. **Chart component.** Implement SVG bars, domains, multi-select overlays, week selection, details, and accessible table. Keep legacy adaptation separate from validated new data.
4. **Readiness integration.** Replace the distance list, preserve other feature series, add scoped styling and chart states, and verify estimate/recovery interactions.
5. **Verification and review.** Exercise real adapter paths with synthetic fixtures, run targeted checks and a production build, capture desktop/mobile screenshots for default and all-overlay states, and compare them with the UX board. Confirm any production-data discrepancy before release.

## Acceptance and verification

- Default state is distance-only, all bars start at 0 km, and all eight overlay combinations work without requests or writes.
- Screenshot fixture reproduces distances `[41.4, 27.4, 39.7, 39.6, 24.2, 29.4, 32.1, 34.3, 33.4, 31.9, 17.6, 5.1]` for weeks starting 27 Jul–12 Oct 2026, with the test clock fixed to 13 Oct. Synthetic overlay fixtures are clearly separated from real data.
- Aggregation tests cover unequal run distances for weighted pace, elapsed-time sums, elevation, missing/invalid data, zero-distance runs, empty weeks, deleted/non-running/foreign-athlete records, timezone boundaries, and DST.
- Domain tests cover all-zero distance, large values, constant/single-point overlays, null gaps, and unchanged geometry when controls toggle.
- Repository tests prove the entire chart window is read even when there are more than 500 activities, with correct ownership/sport/date filters. Cloud/local equivalent fixtures produce equivalent chart metrics.
- Compatibility tests cover both real distance keys, legacy snapshots, unrelated generic series, conflicting duplicates, invalid legacy distance, and chart data with an unavailable prediction.
- Extend `apps/web/e2e/redesign-readiness.spec.ts` and its fixture; preserve existing estimate selector, navigation, recovery, and caveat assertions. Add cloud/API-backed fixture coverage as well as local snapshots.
- Browser checks at 320, 390, 768, and 1440px: no page overflow, all weeks reachable, readable values, keyboard and touch selection, and checkbox/table accessibility with axe. Confirm no application writes.
- Run core tests, web tests/typecheck, affected database adapter/local analytics tests, focused Readiness Playwright checks, and the production build using the repository scripts. Consult the installed Next.js guides required by `apps/web/AGENTS.md` before application code changes.

Implementation verification is recorded in [the QA report](../progress/readiness-weekly-training-qa-20261013.md), with screenshots for desktop and mobile.

## Release and remaining tradeoffs

Deploy additive server/schema-reader support and the UI together through the normal application release. Regenerate local snapshots to enable overlays there; until then, old snapshots retain distance-only behavior. No data backfill, database migration, new chart dependency, or new public endpoint is planned. A UI rollback can restore the existing distance evidence list while retaining the additive response field.

The main design tradeoff is relative overlays: they compare each metric's shape over time, not magnitude across different metrics. That explanation and exact-value access are mandatory. “Time” is elapsed time, while pace uses recorded average pace; these values need not algebraically match when providers use moving-time pace. Explain the definitions in metric help text. Existing zero-filled import fields may limit claims about missing sensor data; resolve that provenance during the first implementation step.

## Implementation notes

The cloud adapter performs one uncapped, date-bounded chart query, padded by one UTC day at each boundary to cover all IANA offsets. The shared aggregator applies the exact local-date boundaries, including DST, and excludes future activities. This avoids a new timezone-conversion dependency while preserving complete weekly totals. The existing prediction query remains separate. Cloud timezone comes from the validated active plan with the established fallback; local timezone comes from the coaching profile.

The UI checks the actual current week after hydration before displaying partial-week labels, so saved historical snapshots retain their original dates without being called current. The local analytics clock is injectable for deterministic adapter tests. Garmin CSV import already coerces missing ascent to zero; the metric-help disclosure documents this limitation.
