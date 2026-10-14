# Readiness weekly training chart QA

Date: 2026-10-14 (Africa/Johannesburg)

## Result

Implemented the weekly training chart across the local snapshot and authenticated cloud overview paths. The chart starts at 0 km, plots a fixed 12-week calendar window, and supports any combination of pace, elapsed time and elevation overlays. Desktop and mobile use the same selected-week details, with keyboard and touch input. Overlay values in the preview below are synthetic and never read from the user's fitness data.

## Validation

- Core tests passed: `npm test --workspace @racepredictor/core` (19 tests).
- Web tests passed: `npm test --workspace @racepredictor/web` (39 tests at the time of run).
- Type check passed: `npm run lint --workspace @racepredictor/web`.
- Focused weekly and adapter tests passed for shared aggregation, legacy adaptation, 501 cloud activities, local snapshot serialization, missing metrics and prediction-independent chart results.
- Browser checks passed: 10 focused readiness tests in Chromium, plus 4 targeted local and API compatibility checks. These cover all 8 overlay combinations, unchanged bar geometry and zero baseline, keyboard selection, touch selection, data table, prior snapshots, the local overview endpoint, unavailable metrics and chart errors with an available fitness estimate.
- Axe checks passed at 320px and 1440px. Page overflow checks passed at 320px, 390px, 768px and 1440px.
- The optimized Next.js production build completed successfully.
- `git diff --check` passed.

## Previews

These use the deterministic 2026-10-13 wireframe fixture. Distances reproduce the supplied screenshot. Pace, elapsed time and elevation are illustrative only.

| | Distance only | All overlays |
| --- | --- | --- |
| Desktop | [desktop default](../plans/references/readiness-weekly-training/desktop-default.png) | [desktop overlays](../plans/references/readiness-weekly-training/desktop-overlays.png) |
| Mobile | [mobile default](../plans/references/readiness-weekly-training/mobile-default.png) | [mobile overlays](../plans/references/readiness-weekly-training/mobile-overlays.png) |

## Environment limit

Prisma client regeneration could not fetch its engine checksum: `binaries.prisma.sh` returned HTTP 403 under the managed network policy. No engine-download bypass was used. The optimized Next.js production build and TypeScript checks passed with the existing generated client. Regenerate Prisma in the normal build environment before a release if its generated client is stale there.

Garmin CSV imports currently store a missing ascent field as zero. The metric-help disclosure describes elevation as recorded gain and calls out the source-data limitation.
