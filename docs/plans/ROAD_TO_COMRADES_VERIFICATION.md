# Road to Comrades verification

17 October 2026 · branch `codex/road-to-comrades-dashboard`

The runner opens Home, checks in for the plan-local day, reads a live goal/history timeline and the next effective session, and can classify existing race records or change the background through authenticated APIs backed by PostgreSQL/SQLite.

| Boundary | Evidence |
| --- | --- |
| UI → plan/history | Goal and milestone changes refresh on focus. A past 10 km achievement does not complete a future Oldies target. Future-dated results are excluded from Achieved. |
| Achievement editor → API → data → UI | Browser editing persists through reload using the real local API/database. Stale revisions return 409, block another save and reload the current record for review. PostgreSQL migration and parameterised CRUD SQL also run against PGlite. |
| Target rules | Strict sub/under comparison rejects equality; numeric target accepts equality. Match requires target ID, race date, official distance and elapsed result. Archived approved criteria preserve earned history after plan replacement; corrected results are re-evaluated. Client-forged criteria are rejected. PBs require explicit confirmation. |
| Daily check-in | First daily modal, explicit save, skip, re-open/edit, preservation of other answers, cancelled detail edits, failed conflict reload, date rollover, focus restoration and no page-load HTTP mutations verified. The existing journal endpoint was intercepted in browser tests; its existing backend contracts remain covered by unit/API tests. |
| Settings → private image → Home | Actual local upload, server decode/resize/WebP conversion, private image GET, Home source update after navigation/reload, Restore default and athlete isolation verified. Invalid and oversized uploads are rejected. |
| Responsive/accessibility | Desktop 1440 px, phone 390/320 px, intermediate widths and 200% effective viewport. No horizontal page overflow. Axe scans pass for Home and daily modal. Existing Calendar/Training return navigation and review qualifications remain covered. |
| Build/types | Production Next.js build and final TypeScript checks pass. Native Prisma binary downloads are restricted in this workspace, so compilation used engine-free Prisma generation; no production database runtime is claimed. |

## Checks run

- Core suite: 20 test files passed. Web suite: 42 test files passed, including real PostgreSQL SQL/migration and SQLite persistence checks.
- Focused rules, capture/ownership, migration and appearance tests passed again after the final data-rule changes.
- New Road to Comrades browser suite: 5 scenarios passed. The refreshed-plan/history scenario was rerun after the final approved-target capture work and passed.
- Existing Home/accessibility suite: 27 scenarios passed initially; two duplicate-state-message failures were fixed and both passed on targeted rerun, covering all 29 scenarios.
- Home/Calendar companion scenario passed at six responsive review sizes.
- Production build passed; final typecheck and `git diff --check` passed.

## Review images

These are screenshots of implemented components with synthetic test facts. They are not images used as the dashboard itself, and their race dates/targets are not a production history export.

- [Desktop](references/road-to-comrades/desktop.png)
- [Mobile](references/road-to-comrades/mobile.png)
- [Daily check-in](references/road-to-comrades/daily-check-in.png)
- [Settings background](references/road-to-comrades/settings-background.png)

## Deployment/data boundary

No production deployment, migration, plan approval or historical backfill was performed. Apply the included additive database migration through the normal release workflow. Then classify the existing Comrades PB, 10 km goal and half-marathon goal through Manage achievements using the recorded race facts. Neither missing classifications nor missing approved future races are replaced with mock content. Production race rows were not retrieved in this workspace; the inspected schema establishes the missing category, not the exact historical values.
