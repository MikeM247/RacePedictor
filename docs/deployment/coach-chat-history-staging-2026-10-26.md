# Coach chat history: staging release

26 October 2026 · Owner requested staging deployment for testing.

## Deployed target

- Project/team: `racepedictor` / `mikes-projects-bc95b7f5`.
- Environment: built-in **Preview**, scoped to Git branch `work`. The project has no custom staging environment.
- Stable test URL: https://racepedictor-road-to-comrades.vercel.app/dashboard/coach
- Stable alias deployment: `dpl_FyJtWyDoY49S4TMYayqSGZif4jEs`, Ready.
- Immutable deployment: https://racepedictor-99llvo34v-mikes-projects-bc95b7f5.vercel.app
- Source: `5d25c0eecca4e9de628da6a6324afcc4713cb9b0`, including feature `7c108fc` and staging migration guards `fa8d3f2` / `5d25c0e`.
- `origin/work` fast-forwarded from `858d1de` to `5d25c0e`. Its automatic Git deployment `dpl_2XrJDSgvQgNHQQ9stUP4V1BmUuz7` also reached Ready with the same source.
- Production alias `racepedictor.vercel.app` remains on `dpl_HGZq9v6JB3XCVwLPuYoQbcpjSrDb`; no production deployment, alias change or database migration was performed.

## Migration and isolation

`20261025180000_coach_conversation_archives` was applied successfully before the new application became Ready. The release command verified the completed Prisma migration record and queried the archive table on the isolated staging database.

Preview database credentials are Vercel sensitive variables and cannot be retrieved for local migration. The `vercel-build` script now runs `packages/db/scripts/migrate-coach-staging.js` only for Preview Git branch `work`, after Prisma generation and before Next.js compilation. The existing production build command is retained unchanged.

The migration command fails closed unless the runtime is Vercel Preview/work and both dedicated V2 TLS connection URLs match the established `ep-tiny-band-b1j73wgx` staging endpoint pair. It overrides integration-injected database URLs only for that command. It verifies authentication variable presence and canonical origin and requires Strava ingestion and Second Brain sync to remain disabled. No reset, seed, chat clearing, data deletion or production mutation was performed.

Five existing preview database isolation tests passed. Remote build logs confirm isolation checks, required authentication settings, disabled background ingestion, successful migration and table verification, compilation and TypeScript success.

## Smoke checks

- Stable staging `/login`: HTTP 200, supported Continue with GitHub form present.
- `/api/auth/providers`: HTTP 200; GitHub callback and sign-in URLs use `racepedictor-road-to-comrades.vercel.app`, matching `AUTH_URL` and the stable alias.
- `/api/v1/auth/session`: HTTP 200 and truthful unauthenticated state for the fresh test client.
- `/api/v1/coaching/chat/history`: HTTP 401 without an owner session.
- Alias lookup: stable staging alias resolves to the verified Ready deployment; production still resolves to its previous deployment.
- Fresh deployment-specific Preview error/fatal runtime log query after the smoke checks returned no matching logs.

No owner OAuth sign-in, provider consent, live chat generation or mutation of an existing discussion was performed during the release smoke test. The owner can sign in at the stable staging URL to test viewport fitting, Clear chat, draft preservation and Previous chats. The implementation's local contract/database/browser validation is recorded in `docs/progress/COACH_CHAT_HISTORY_2026-10-25.md`.

## Rollback

Previous stable staging alias target: `dpl_YaFSRKL5Cvu4ALVChPjXkfkkoT4j` / https://racepedictor-mcgxvevfd-mikes-projects-bc95b7f5.vercel.app (`work` source `20f9bda`). Previous work-branch alias target: `dpl_AkwsY2YMH8hLfXLbqnWTtupTN3JH` (`858d1de`).

If the owner requests rollback, reassign only the stable staging alias to its previous deployment. Preserve the additive migration, retained messages and archives. Never reverse the schema migration or use permanent history deletion as a deployment rollback. Keep production aliases and settings unchanged.
