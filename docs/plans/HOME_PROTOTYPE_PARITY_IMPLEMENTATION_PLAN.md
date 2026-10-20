# Home prototype parity — implementation plan

Date: 19 October 2026. Status: implemented with review fixes on `feat/home-prototype-parity`; deployed to staging and awaiting owner visual acceptance.

## Outcome and design authority

Make Home closely match the attached Road to Comrades desktop and phone prototype: matching typography, more visible sunrise and sky, an independent milestone panel floating over the photograph, and a continuous Achieved → Now → Ahead journey with the same visual language.

The owner's current request defines this change. Treat the supplied image as visual reference and older design documents as context. This amendment supersedes the shared hero/journey panel and heavy goal-label styling in the earlier Road to Comrades implementation. Keep the existing working data sources and interactions.

Reference supplied by the owner: `docs/design/road-to-comrades-UI-upgrade/ChatGPT Image Oct 18, 2026, 06_48_05 AM.png` in the owner's Windows checkout. That file is not present in this cloud checkout; the attached image was visually reviewed. During implementation, retain that original reference in the design folder if available, alongside new comparison captures.

Interpret the spoken “Everyone Has a Reason” as the reference's existing **“Every run has a reason.”** Keep that exact wording over the photo. “Your Goal” replaces the current “Your big goal.” Actual race names, targets, dates, achievement titles and results remain data driven; example facts in the prototype are not production data.

## Findings from the current implementation

| Current source | Relevant difference | Planned change |
| --- | --- | --- |
| `apps/web/components/dashboard/dashboard-shell.tsx` | `.home-goal-panel` surrounds both hero and journey. The greeting/check-in already render inside the hero. | Retain header ownership; turn the outer wrapper into a layout container without the shared panel surface. |
| `apps/web/components/dashboard/home-goal-context.tsx` | The image belongs only to `.road-hero`; journey is a section below it. Now uses a diagonal-arrow SVG. Management control sits in the journey header. | Share a photo scene behind hero and journey; give journey its own surface; use runner SVG; put management below the journey. |
| `apps/web/components/dashboard/road-to-comrades.css` | Goal label is weight 700, main title has tight negative tracking, image uses `cover` with desktop `center 60%` and mobile `68% center`. Next has an extra cyan halo; achieved badges are muted. | Define deliberate type styles, image composition and reference-matched markers, badges and rails. |
| `apps/web/app/globals.css` / `app/layout.tsx` | Body names Inter in a system stack, but no font loader or bundled font is defined there. | Load actual font files and apply explicit Home typography rather than relying on platform fallback. |
| `apps/web/public/road-to-comrades.webp` | The current 1672 × 941 reconstruction already contains clear sky, mountains and the sunrise. It is not the exact source photograph from the mockup. | Tune framing first. Keep the asset and existing custom-background preference/fallback. |
| `apps/web/components/dashboard/race-achievement-manager.tsx` | Manage achievements opens the existing editor dialog through a button. | Keep its action and accessible button semantics; present it visually as a quiet text link beneath the panel. |

The saved desktop capture in `docs/plans/references/road-to-comrades/desktop.png` predates the latest header/image changes. Use a fresh capture of the implementation baseline rather than treating that older screenshot as the current screen.

## 1. Create the implementation branch from main

Start from the latest remote `main`, in a separate worktree so the existing checkout remains available. From the repository root:

```bash
git status --short --branch
git fetch origin main
git worktree add -b feat/home-prototype-parity ../RacePedictor-home-prototype-parity origin/main
cd ../RacePedictor-home-prototype-parity
git log -1 --oneline
npm ci
```

Record the starting `origin/main` SHA in the implementation notes. Use a fresh branch/worktree name if that name already exists. Do not discard existing changes. Follow `apps/web/AGENTS.md`, including reading the relevant installed Next.js documentation before writing application code.

Capture Home at 1440px and 390px before changing it. Use deterministic test data for reference comparisons and keep captures in a new `docs/plans/references/home-prototype-parity/` directory so earlier evidence is preserved.

## 2. Match typography before tuning layout

The raster prototype does not expose a font family or reliable font metadata. Exact font identity cannot be established from this attachment alone. Treat matching letter shapes, width, weight, spacing and hierarchy as a concrete implementation task; do not claim an exact font identification from appearance.

1. Make a small specimen using the reference phrases: “Morning, Mike”, “YOUR GOAL”, “COMRADES 2027”, “SUB 11 HOURS”, the date, milestone titles, badges, navigation and card labels. Compare the locally available **DejaVu Sans Condensed** family with the reference; the family and source design font still cannot be identified from the raster alone.
2. Use the regular and bold DejaVu Sans Condensed files currently bundled in `apps/web/public/fonts/` as a self-contained, licensed approximation. They are registered as the Home-only `Race Sans Condensed` family in `road-to-comrades.css`, with explicit 400 and 700 faces. The DejaVu notice is included beside them. Compare the rendered result with the reference when a browser preview is available; replace these files if the original design font becomes available.
3. Keep font-family variables scoped to `.road-layout` and its dialogs. Verify the loaded faces in the browser; avoid synthetic bold and CSS horizontal scaling.
4. Apply the selected typography consistently across the entire Home screen: greeting, goal, date, tagline, timeline, lower cards, navigation, check-in controls and dialogs. Explicitly reconcile inherited `.eyebrow`, heading and button rules.

Starting values for visual calibration, in CSS pixels at normal zoom:

| Role | Desktop | Phone | Treatment |
| --- | --- | --- | --- |
| Greeting | 34–36 / 700 | 26–28 / 700 | Condensed, compact line height |
| YOUR GOAL | 13–14 / 400 | 10–11 / 400 | Thin, uppercase, tracking about `0.30em`; visibly lighter than the title |
| Main goal | 50–54 / 800 | 32–36 / 800 | Bold condensed uppercase; near-neutral tracking instead of current `-.045em` |
| Time target | 32–36 / 700 | 24–27 / 700 | Same display family, below the race name |
| Race date | 12–14 / 500–600 | 10–11 / 500–600 | Uppercase, tracking about `0.24em` |
| Tagline | 15–16 / 400 | 11–12 / 400 | Light, spaced, lime rule above/beside as shown in the reference |
| Milestone titles | 14–16 / 600 | 12–14 / 600 | Condensed, readable wrapping |
| Group headings / badges | 11–13 / 500–600 | 10–12 / 500–600 | Spaced group headings; compact badges |

Use responsive `clamp()` values and rem-based sizing in the final styles. These are starting values, not a reason to compress long live labels or restrict text zoom.

## 3. Separate the photo scene from the journey panel

Suggested structure within `HomeGoalContext`:

```text
Home scene — layout and shared photograph, no shared card border
  Decorative photo + independent contrast layers
  Hero content
    Greeting/date and check-in
    Your Goal → race title → target → date
    Every run has a reason. + existing View plan access
  Journey section — independent floating navy panel
    Achieved → runner / Now → Ahead
    Existing additional milestones and scoped state messages
  Quiet action row
    Manage achievements
```

- Place the image behind both the hero content and journey within a positioned, isolated scene. Give the journey its own rounded border, translucent deep navy surface and restrained shadow. The photo should remain visible around it and subtly through it.
- Keep the journey in normal layout flow on the shared background so variable-length labels, errors and expanded milestones push following content down. Use grid/padding to create the overlay; avoid absolutely positioning the content panel at a fixed vertical coordinate.
- Remove the old background/border from `.home-goal-panel`. Round and clip the decorative image layer separately rather than clipping panel shadows or focus rings.
- Keep the tagline in the hero text group, above and outside the journey surface. It remains live HTML over the photo, rather than being baked into the image.
- Retain semantic journey heading/landmark; visually hide the extra “Your running journey” and introductory eyebrow if necessary to reproduce the reference's Achieved/Now/Ahead presentation.
- Move the existing management component to the action row beneath the journey. Preserve the label “Manage achievements”, existing dialog behavior and focus return. Its text can be small/quiet while its clickable area remains at least 44px high.
- Keep View plan reachable. Match the reference's lower-card arrangement: Last run on the left and Today's session on the right at desktop, with Last run before Today on mobile. Preserve the cards' existing content and destinations.

## 4. Show more sky and the complete sunrise

Tune the photo after the font specimen establishes the text dimensions.

- Review the source asset directly and mark the sun/mountain ridge as the focal region. At desktop widths, use the full-width scene and start with top-biased positioning so the upper sky is not cropped away.
- Tune scene height/aspect ratio together with image sizing. Changing `object-position` only moves the crop; it does not zoom out. Do not increase image scale above 1 or assume a taller `cover` container always reveals more image.
- If `cover` still removes the sunrise, use a contained, uncropped photo layer over a matching dark background, or an art-directed crop made from the existing source. Avoid a visible hard letterbox edge. Select the treatment through side-by-side captures.
- For phones, use a separately calibrated composition that retains sky above the ridge and the sun beside the goal text. A narrow portrait viewport cannot show the entire landscape edge to edge; prioritize those features without stretching the image or cropping away the runner.
- Reduce the current near-opaque left and bottom gradients where they hide the landscape. Keep localized shading behind the text for contrast; the journey's own surface supplies its contrast.
- Preserve Settings → Appearance custom backgrounds, authenticated image delivery and the default-image error fallback. Check both the default and a bright uploaded image. Missing images must leave a readable navy surface.

Acceptance: at 1440px and 390px, the full sun, surrounding sunrise glow, mountain ridge and a visible strip of sky are discernible, with more breathing room than the baseline. The shared photo continues behind the journey panel. Record any unavoidable difference from the prototype: the existing image is a reconstruction, and CSS cannot reproduce details absent from it.

## 5. Recreate the milestone visual language

Continue using `buildRaceJourney()` and the existing result/target rules. Refactor presentation into small hero/journey/marker components only where useful; keep fetching, retries and refresh ownership in `HomeGoalContext`.

| Element | Required appearance |
| --- | --- |
| Achieved marker | Lime-filled circle, dark check, fine bright edge and restrained glow. Same size and baseline across achieved milestones. |
| Achieved status | Bright lime rounded badge with dark “Achieved” text. Retain existing PB information where supplied, without inventing results. |
| Now marker | White running-person SVG inside a cyan circular ring with a subtle glow. Desktop “NOW” sits above it; phone label sits beside the connecting marker. Replace the current diagonal arrow. |
| Upcoming marker | One smooth, clean circular outline with dark fill. Remove the extra Next halo; identify Next with the cyan badge below. |
| Completed rail | Thin continuous lime line through the centers of achieved circles. |
| Around Now | Short cyan dashed segments leading into and away from the runner. Match the reference's fine, almost dotted rhythm. |
| Ahead rail | Continuous muted pale-blue line through future circles, with a small forward arrow at the desktop end. |

Build the marker rail on a shared marker row with explicit center alignment, independent of text height. Use decorative SVG or CSS segments anchored to that row; hide connector graphics from assistive technology. Avoid uncoordinated per-item lines whose positions shift when a title wraps. Keep all milestone labels, links, statuses and dates as HTML.

Desktop: one independent panel with achieved milestones, Now, and ahead milestones on one horizontal axis. Match the prototype's relative spacing rather than stretching isolated markers into unrelated blocks.

Phone: follow the prototype's two compact bordered surfaces, Achieved above Ahead, within one semantic journey section over the shared image. Join them using the centered cyan dashed connector and runner/Now marker. Keep three items per group where readable; use a vertical layout at very narrow widths or with long text rather than shrinking text or causing sideways page scrolling. Size the breakpoint from available panel width; the current 1099px rule is a starting point.

Retain the existing latest-three achieved / next-three ahead summary and All milestones disclosure. Handle zero, one, two and many items without inventing circles or drawing a connector through an empty-state message. Preserve loading, no-goal, history error/retry, stale refresh and result-pending states.

## 6. Implementation checkpoints and files

| Checkpoint | Files / deliverable | Done when |
| --- | --- | --- |
| A — Typography | New local font assets/license and Home font module; `dashboard-shell.tsx`; `road-to-comrades.css` | Required weights load; specimen resembles the reference; Your Goal is visibly thinner. |
| B — Scene and composition | `home-goal-context.tsx`; `dashboard-shell.tsx`; `road-to-comrades.css` | Shared image framing shows sunrise/sky; journey has its own floating surface; tagline belongs to hero. |
| C — Timeline and action | `home-goal-context.tsx` or extracted journey component; `race-achievement-manager.tsx` only if trigger styling requires it | Runner, circles, badges, continuous rails and below-panel management match the reference at both layouts. |
| D — Full-screen polish | Home typography rules, `home-recent-training.tsx` / `today-coaching-card.tsx` only where inherited styles are insufficient | Cards, labels and controls share the selected fonts without changing their data/actions. |
| E — Verification and handoff | Existing Road/Home browser specs; new comparison captures and short evidence note | Visual/functional checks below pass; branch preview is ready for owner testing. |

Scope new selectors to Home. Consolidate superseded Road styles rather than appending conflicting overrides. If multiple TSX components change, apply the repository's relevant React review guidance during implementation. This work needs no schema migration or new API.

## 7. Verification and preview before release

Use existing fixtures and extend the current browser tests only for meaningful gaps created by the new layout. The Road suite seeds synthetic history through the local test API; run it only against its isolated fixture server/database.

From the implementation worktree:

```bash
npm run test:cloud
npm exec --workspace @racepredictor/web -- playwright test --config playwright.road.local.config.ts
npm exec --workspace @racepredictor/web -- playwright test --config playwright.home.local.config.ts
npm run build
git diff --check
```

Use the repository's existing isolated test configuration and runtime prerequisites; do not point fixture seeding at a real athlete database. The normal build command differs from the migration-running `vercel-build` command; review the build scripts again at implementation time.

Review at 320, 390, 768, 1024 and 1440 CSS pixels, plus 200% browser zoom:

- Wait for `document.fonts.ready` and image decoding before visual captures; verify actual font loading, not just a CSS family name.
- Compare default Home with the prototype side by side at equivalent app-content sizes, excluding the concept board's outer frame and phone hardware.
- Verify thin Your Goal, bold race title, consistent supporting fonts, visible sun/sky, independent panel border, tagline outside the panel, and management below it.
- Verify marker centers remain on the rail with long names and optional result/date details. Check 0/1/2/3/more-than-3 milestones per group and independent read errors.
- Verify no clipping, page overflow, overlapping text or hidden focus rings. Check contrast, keyboard reading order and focus, reduced motion, and automated accessibility scans.
- Open Manage achievements from its new location; edit/save/reload through the existing fixture API; close with Escape and confirm focus returns to the relocated control.
- Recheck daily check-in open/save/skip/edit, modal focus containment/return, View plan, milestone detail, session and activity links, custom background/fallback and refresh behavior. Home page loads must introduce no new writes.

Capture desktop/mobile Home and one open mobile dialog in the new evidence directory. Keep synthetic comparison captures distinct from any screenshots containing real athlete facts. Record commands, results, viewport sizes, selected font names/weights and remaining visual differences in the handoff.

Commit the checkpoints on `feat/home-prototype-parity`, push that branch, and open a PR into `main` with comparison images. Test locally and, where configured, in a branch preview using an isolated test data source; review preview deployment scripts because this repository's `vercel-build` runs database migrations. Keep production credentials out of fixture runs.

The owner tests and accepts the branch/preview before merge. After acceptance, merge into `main` through the normal release workflow, then smoke-test the deployed Home. Keep the preceding release commit available for rollback. Creating the branch or a preview does not itself authorize a production release.

## Implementation progress

- Created `feat/home-prototype-parity` from `origin/main` SHA `e893895a5ed9b113be84bb39a09ac615367ca6f6`. A subsequent live check through the connected GitHub app confirmed that remote `main` still points to this exact commit. Shell networking and browser processes require execution outside the socket-restricted sandbox; using that permission allowed locked dependency installation and local browser verification.
- Restructured the Home hero and journey so one sunrise image sits behind the goal and the independent journey panel. Moved Manage achievements below the panel, replaced the Now arrow with a runner SVG, and restyled markers, rails, badges and mobile milestone cards.
- Added bundled DejaVu Sans Condensed regular/bold faces and the accompanying font license notice. Fresh synthetic desktop/mobile captures are available below for owner comparison; the exact original typeface remains unidentified.

## Review fixes and verification

All four selected review comments were addressed: the narrow-screen grid now follows Goal → Last run → Today; desktop dashed segments join the neighboring milestone centers to Now; the phone runner is centered independently of its label; and the existing Home layout assertions check the intended panel overlap and new card order.

The marker and connector positions share size/heading variables, and one- or two-stop summary groups use the available width without leaving empty grid columns. The local Home/Road test server explicitly disables cloud mode so inherited cloud configuration cannot divert synthetic tests to the sign-in page. This setting is confined to the local test configuration.

Verification on 19 October 2026:

- TypeScript: `npm run typecheck --workspace @racepredictor/web` passed.
- Isolated Chromium layout checks reproduced the old desktop-bridge, mobile-runner and mobile-order failures, then passed with the corrected CSS at 320, 374, 375, 390, 768, 1024, 1099, 1100 and 1440px. Connector checks also passed with one, two and three stops in each group. This uses the branch styles and shared assertions with synthetic HTML; it is additional geometry coverage rather than an application/API test.
- Road to Comrades browser suite: 5/5 passed, covering real local achievement persistence/conflicts, check-in interactions, plan/history refresh, private-background upload/restore, no page-load mutations, responsive geometry and accessibility scans. An initial attempt inherited cloud mode and stopped at sign-in; the explicit local fixture setting resolved it before the successful run.
- Home/accessibility suite: 28 scenarios passed in the full run. Its remaining failure was another obsolete DOM-order expectation; that expectation was updated, and the affected scenario passed on a focused rerun, accounting for all 29 Home scenarios across the final runs.
- Calendar companion: the focused Home summary scenario passed at its six configured viewport sizes using the updated shared layout assertions.
- `git diff --check` passed. Local verification did not change production data or its deployment.

### Staging deployment — 19 October 2026

- Deployed source commit `0e8742ff675beda18e500239e9e8738935a714d8` to the existing Vercel `racepedictor` project, target `staging`. Deployment `dpl_9zAhYXda4qotnVhRttNQ4t8cU6ZM` reached `READY`; Next.js 16.3.0 build completed in 59 seconds.
- Test URL: https://racepedictor-road-to-comrades.vercel.app/dashboard. The existing public staging `AUTH_URL` already uses this hostname.
- Uploaded branch source directly with deployment-specific `npm run build`, retaining `apps/web` as the root. Build logs confirm Prisma client generation and compilation, with no database migration command. The branch has not been pushed, avoiding the Git integration's inherited migration-running build command.
- The staging health endpoint returned HTTP 200, `status: ok`, owner authentication configured, and the expected source commit. The login page returned HTTP 200 with the owner GitHub sign-in control. Owner-authenticated Home acceptance remains for the user; local Home and journey coverage is recorded above.
- The production hostname still resolves to its prior deployment `dpl_4k34eH1eA1Gx9WgfWAVJh8PcNZgW`.
- Staging currently shares the production database through the existing preview environment settings. No migrations or test data writes were performed for this deployment; user changes saved while testing will affect that shared database.

Review captures use synthetic test facts:

- [Desktop Home](references/home-prototype-parity/desktop.png)
- [Mobile Home](references/home-prototype-parity/mobile.png)
- [Daily check-in](references/home-prototype-parity/daily-check-in.png)
- [Settings background](references/home-prototype-parity/settings-background.png)

## Final acceptance checklist

- [ ] Implementation branch starts from the recorded latest `origin/main` SHA.
- [ ] All Home font roles use explicit loaded fonts selected against the prototype; any approximation is documented.
- [ ] “YOUR GOAL” is thinner than “COMRADES 2027” and uses the requested wording.
- [ ] Sunrise, mountain ridge and sky remain clearly visible at desktop and phone widths.
- [ ] Journey is an independent floating panel over the image, with the phone grouping shown in the reference.
- [ ] Achieved check circles/badges, runner/Now, single-ring upcoming nodes and continuous/dashed rail treatments match the reference.
- [ ] “Every run has a reason.” is over the photo outside the milestone panel.
- [ ] Manage achievements is a quiet link-style control below the journey and still opens the working editor.
- [ ] Existing live facts, detail links, loading/error handling, check-in and background settings work.
- [ ] Responsive, accessibility and focused regression checks pass; comparison screenshots are attached to the PR.
- [ ] Owner testing happens on the branch/preview before merging and going live.
