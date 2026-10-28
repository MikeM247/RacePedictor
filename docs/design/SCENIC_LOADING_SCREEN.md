# Scenic loading screen — 27 October 2026

## Approved behavior

The shared startup state displays only the existing `road-to-comrades-v2.webp` photograph. It covers the viewport without stretching, borders, text, logo, controls, spinner, or a readability overlay. The original asset is reused; the generated UX comparison is not an application asset.

At widths of 1100px and above, the photograph uses `object-position: 50% 30%`; below 1100px it uses `67% 30%`. `object-fit: cover` retains the original aspect ratio and crops the scene. The road and sun remain visible at the reviewed desktop and mobile sizes. Home's own composition is unchanged.

The container retains the accessible status name `Loading Race Predictor`; the decorative image has empty alternative text. The existing Readiness parent hides its underlying content while loading. The root route fallback wraps the route subtree rather than adding an independently timed overlay.

## Implementation boundaries

`StartupSplash` owns the image presentation and scoped CSS. Next Image preloads the original local WebP using the Next 16 `preload` API. A client error handler hides a failed image so the browser's broken-image icon does not obscure the navy `#071725` fallback. The component is still rendered on the server before hydration; Next replays image errors on hydration.

The root loading boundary and existing Readiness startup continue to reuse this component. Ready and error transitions remain controlled by their current owners. No artificial delay, animation, new Home data gate, appearance API dependency, database migration, or public API change is introduced. The splash uses the default scene even when Home has a saved custom background.

Browser/OS-owned installed-app launch screens and manifest icons are unchanged. A cold network can briefly show the navy background before the asset arrives. A failed image before hydration is hidden once the client error handler is attached; it does not block page readiness.

## Isolated local validation

Branch: `codex/scenic-loading-screen`, based on `origin/main` at `7e26aa7`. No changes from the dirty primary checkout or concurrent feature worktrees were included. No hosted deployment or merge is part of this change.

The online Playwright configuration accepts optional `RACEPREDICTOR_E2E_ONLINE_PORT`, defaulting to 3312. This is a test-runner setting, not a production environment requirement. Port 3320 avoids an existing local server. The existing fixture mode and unreachable synthetic database URL remain in effect.

From the repository root, use PowerShell:

```powershell
$env:RACEPREDICTOR_E2E_ONLINE_PORT = '3320'
$env:RACEPREDICTOR_E2E_RUN_ID = 'scenic-loading-review'
npm run typecheck --workspace @racepredictor/web
npm test --workspace @racepredictor/web
npm run test:e2e:online --workspace @racepredictor/web -- online-dashboard.spec.ts redesign-home.spec.ts --grep 'scenic startup|shared fallback|recoverable service error|Home contains only|Home reflows without clipping'
npm run build --workspace @racepredictor/web
```

The browser suite holds synthetic responses to capture 1440×900, 390×844, 320×568, and 844×390 views; exercises the 1099/1100 breakpoint; checks text-free viewport coverage and hidden navigation; and verifies warm-cache, stalled-image, failed-image, and recoverable API-error behavior. A JavaScript-disabled Readiness request verifies server rendering of the shared fallback. The root `app/loading.tsx` wrapper is also reviewed to confirm it returns that same component without a client-only mount gate. Home regression checks cover content, responsive overflow, and accessibility.

Screenshots and machine-readable results are stored under `.local/e2e/<run-id>/`. No production demonstration route is added.

### QA evidence

- Web typechecking passed, and all 193 web tests passed.
- The final production build passed after the failed-image fix.
- `scenic-loading-verified`: 9/9 startup/recovery Playwright cases passed in Chromium, including all four viewport sizes, breakpoint resizing, real warm-cache reuse, no-hydration rendering, stalled/failed images, and service-error recovery.
- `scenic-loading-final`: both selected Home regression cases passed (content and responsive/accessibility checks). Earlier startup assertions in that exploratory run were corrected: Next's image error replay normalizes `src` to an absolute URL, HTTP routing disables cache, and a ready Home response is not guaranteed to display a route fallback.
- Visual inspection confirmed the road and sun at all four requested sizes. The failed-image case initially exposed a browser broken-image glyph; hiding the failed image and asserting its hidden state corrected it.
- Repository guidance: `apps/web/AGENTS.md` and bundled Next Image/loading documentation were read. No repository enforcement directory was present. Change scope is presentation, its tests, optional test-port selection, and design documentation.

QA result: **PASS for local owner review**. Merge and production release remain pending owner instruction. No claim is made about browser/OS-owned installed-app launch artwork.

## Release and rollback

Leave the branch unmerged for owner review. A later explicit instruction is required to merge or deploy. Rollback is an isolated commit revert; no data or schema recovery is needed.
