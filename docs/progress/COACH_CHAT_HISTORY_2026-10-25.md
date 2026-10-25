# Coach panel and saved chats: delivery validation

Implementation branch: `codex/coach-chat-history`, based on V2 `work` at `858d1de`.

## QA result

**PASS** for implementation. Acceptance criteria, docs synchronization and regression checks pass. Proceed with the migration-first release sequence when deploying. No blocking defects remain in the verified scope.

## Acceptance criteria

| Criterion | Evidence | Result |
| --- | --- | --- |
| Full composer, send control, training links and footer visible on desktop entry | Playwright bounds at 1366×768, 1896×910 and 1440×900, with 40 long messages and a long draft | Pass |
| Mobile, keyboard-sized viewport and enlarged text remain usable | Coach reflow tests, actual Chromium 200% zoom, no horizontal overflow | Pass |
| Save full discussion before clearing | Repository test retains 65 messages across both archive pages; active generation becomes empty | Pass |
| Preserve unsent drafts and reset context | Browser clear/reload and two-tab draft tests | Pass |
| Pending replies cannot enter new discussion | Lease invalidation, old-generation replay rejection and late retry browser tests | Pass |
| Save failure preserves data; retry is idempotent | Transaction rollback, request replay/conflict tests and failed-save browser test | Pass |
| Saved chats are read-only and paginated | Viewer tests, 60-message pagination, error/retry and catalog pagination | Pass |
| Authentication, athlete isolation and permanent deletion | Route tests, repository tests and PostgreSQL foreign-key/unique constraints | Pass |

## Validation commands

- `npm test --workspace @racepredictor/core`: passed.
- `npm test --workspace @racepredictor/web`: passed.
- `npm run db:test:cloud --workspace @racepredictor/db`: passed.
- Targeted archive repository and migration tests: passed, 12 tests.
- Targeted archive/replay route and contract tests: passed, 7 tests.
- `npm run lint --workspace @racepredictor/web` / `typecheck`: passed.
- Full Coach Playwright suite with full Chromium: passed, 11 tests; additional history pagination/error/retry and composer focus tests passed.
- Additional Settings browser verification: passed; confirmation names all discussions and browser cleanup remains athlete-scoped. Thirteen distinct Coach browser scenarios passed across the full suite and targeted follow-ups.
- Final `npm run build --workspace @racepredictor/web`: passed, including TypeScript and the three new API routes.

The standard headless shell cannot open the existing zoom test's Chrome settings page. Browser verification uses already installed full Chromium via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. PostgreSQL tests use in-memory PGlite; no live data or provider calls are used.

## Docs-sync gate

| Document | Status |
| --- | --- |
| CONTEXT | Updated — owner-approved lifecycle amendment |
| PRODUCT | Updated — archive/history behavior |
| ARCHITECTURE | Updated — generation and persistence boundaries |
| API_CONTRACT | Updated — commands and pagination |
| DB_SCHEMA | Updated — archive model and migration |
| UI_UX_SPEC | Updated — responsive behavior and flows |
| UI_GUIDELINES | Updated — scroll/focus and distinct deletion |
| CODEX_WORKFLOW | N/A — no delivery-process change |
| ROADMAP | Updated — delivered acceptance criteria and release dependency |

ADR 0010 is amended and the complete release/rollback contract is in `docs/plans/COACH_CHAT_HISTORY.md`. No new architectural authority or AI provider behavior is introduced. The only repository instruction file present for the touched scope is `apps/web/AGENTS.md`; no `.codex/enforcement` or docs AGENTS files are present. The reviewed Next.js route-handler guide is bundled under `node_modules/next/dist/docs/`.

## Release and residual limits

Apply `20261025180000_coach_conversation_archives` before exposing the new controls. Existing active chats need no backfill. Rollback preserves the additive table and message rows. Previously permanently deleted chats cannot be recovered. Live migration, deployment and live-provider smoke testing have not been performed in this implementation task.
