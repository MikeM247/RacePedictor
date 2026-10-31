# Milestone Home staging release — 31 October 2026

This follows the [architecture review](milestone-home-architecture-review-20261031.md). The reviewed implementation is merged with the existing staging branch's newer Coach changes.

## Corrections and acceptance evidence

- Undated achievements retain saved order; equal-date entries retain stable saved order.
- Cloud training summaries use the active plan timezone, then the newest saved plan history. There is no separate cloud athlete-profile timezone field. If neither source can supply a timezone, the saved run and its metrics remain available with an unknown date; the UI shows **Recorded date unavailable** rather than inventing a date tile. A failed plan source does not discard an available run.
- The Calendar browser test closes its session modal before activating the background Return to Home link. It verifies the exact selected session and restored Home launcher focus.
- The merged source passes **54 web/core test files**, including source ownership, revisions, filtering and synchronization tests. The direct image integration run passes **9 tests**, including timezone-history and unavailable-source cases.
- The actual repository Home browser suite passes **7/7 checks**: six responsive widths, equivalent-content visual geometry/pixels, Settings upload/save/cancel, partial-source failure, expanded journey, axe/keyboard/long names, Calendar return, normal phone viewport navigation and reflow at the CSS viewport equivalent of 200% desktop zoom.
- TypeScript passes. The production build is checked before publication.

Visual comparison uses equivalent saved fixture content: the prototype sponsor subtitle and final destination secondary copy differ from the verified target contract. The primary geometry remains within 1 px and the comparison passes its 0.5% threshold with a 16/255 channel tolerance. This is local automated evidence; manual screen-reader acceptance, actual browser zoom, live authenticated cloud upload and real paired-device conflict testing remain distinct checks.

## Deployment contract

Target: Vercel project `racepedictor`, team `team_wLBaPFKiJfCCbTqOZrhNIzSf`, **Preview / work**. The new Home switch is enabled only for that branch. The existing staging migration guard requires the isolated preview database override, expected authentication origin, and disabled Strava ingestion/Second Brain publication before migration. Production activation is outside this release.

Owner entry point: https://racepedictor-road-to-comrades.vercel.app/dashboard

The stable alias is updated only after the deployment reports READY and its migration/build logs pass. Authentication continues to use the existing owner sign-in. Saved verified records supply Home content; installation does not seed example goals, PBs or workouts. Supplied race images remain explicit catalogue choices in Settings.

Rollback: restore the preceding staging alias or set `RACEPREDICTOR_MILESTONE_HOME_ENABLED=false` and redeploy Preview/work. Retain the additive image tables and assignments.
