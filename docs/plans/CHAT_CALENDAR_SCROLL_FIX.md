# Chat and Calendar scroll recovery

Chat now budgets navigation and conversation within the visible viewport. Its
transcript remains independently scrollable; when a short viewport or expanded
errors leave insufficient room for the controls and a 96px transcript, the panel
itself scrolls. The shared theme reserves the measured bottom navigation height,
including safe-area padding. A CSS viewport clamp prevents the previous height
from overflowing during resize before the visual-viewport observer runs.

Calendar remains a document-scrolling page. Modal consumers share a body scroll
lock: the first acquisition captures the original inline overflow and priority,
and the last release restores them. Releases are idempotent and independent of
overlay cleanup order. Calendar's Escape, focus restoration and inert handling
remain in place.

## Reproduce and verify

From the repository root:

```sh
npm ci
npm run db:generate
npm run lint --workspace @racepredictor/web
npm test --workspace @racepredictor/web
npm run test:e2e:viewport-scroll --workspace @racepredictor/web
npm run test:e2e:coach:online --workspace @racepredictor/web
```

The viewport suite starts isolated fixture servers on ports 3320 and 3321 with
the shared theme explicitly disabled/enabled. API responses, including failed
sends, are intercepted; the servers use an unreachable synthetic database URL.
It covers desktop/tablet/phone/landscape, long drafts and errors, wheel input,
Chromium touch gestures, keyboard-sized visual viewports, detail transitions,
history unmounting and Home → Chat → Calendar navigation. The shared project also
runs the existing Calendar month-summary journeys. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using a system Chromium installation.

## Validation on 6 November 2026

- Production build and TypeScript checks passed.
- All 18 viewport/Calendar browser cases and 27 existing Coach cases passed
  across the suite runs and targeted reruns after corrections.
- All six scroll-lock unit cases passed.
- The complete web unit suite passed 57 of 58 test files. The existing route
  inventory assertion expects 99 routes, while both HEAD and the working tree
  contain 98. No routes were changed by this fix.

Physical iOS and Android checks remain necessary: focus the composer, expand and
dismiss the keyboard, rotate the device, scroll long messages and errors, and
open/close Calendar details. Confirm that browser chrome and safe-area insets do
not hide controls. Chromium gesture and viewport emulation do not replace those
device checks.

No API, schema, training-data, feature-flag default or deployment changes are
part of this fix.
