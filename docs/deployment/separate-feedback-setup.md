# Separate activity feedback: environment setup

Setup status on 2026-10-01: feature changes are uncommitted on
`codex/separate-activity-feedback`. Production is READY at main commit
`aab83999316038cdb209b18d37640843d4d57462`. No setup changes, migration,
merge or deployment were performed during this setup check.

## Account handoff

Sign in directly on these sites; do not send passwords, verification codes,
API keys or database connection strings through chat.

- [Vercel project environment variables](https://vercel.com/mikes-projects-bc95b7f5/racepedictor/settings/environment-variables)
- [OpenAI API keys](https://platform.openai.com/api-keys)
- [Cloudflare dashboard](https://dash.cloudflare.com/)
- [Neon console](https://console.neon.tech/)

The Vercel connector can read deployments, but the browser session currently
requires login. Cloudflare and Neon also require login. OpenAI currently
shows a browser verification page that requires the owner's attention.

## Preview configuration

Create or select an isolated Neon branch and a private R2 preview bucket.
Scope preview variables to `codex/separate-activity-feedback`; never point
this preview at the production database. Inspect existing configuration
before replacing anything: working Strava ingestion already uses R2.

| Variable | Value / source |
| --- | --- |
| `DATABASE_URL` | Pooled connection string for the selected Neon branch |
| `DATABASE_URL_UNPOOLED` | Direct connection string for the same branch; this is the name used by the current Prisma schema |
| `R2_BUCKET` | Selected private bucket name |
| `R2_ENDPOINT` | Bucket's S3 API endpoint, copied from Cloudflare |
| `R2_ACCESS_KEY_ID` | S3 access key with object read/write access limited to the selected bucket |
| `R2_SECRET_ACCESS_KEY` | Corresponding secret, entered directly in Vercel |
| `OPENAI_API_KEY` | OpenAI project API key, entered directly in Vercel |
| `RACEPREDICTOR_ACTIVITY_REVIEW_MODEL` | `gpt-5-mini` |

Keep all credentials server-only; none of these should have a
`NEXT_PUBLIC_` prefix. Review the current generation controls before adding
the OpenAI key: this branch currently starts generation whenever the key
is present and has no explicit rollout/rollback switch.

## Upload CORS

The adjacent `activity-upload-cors.production.json` is a prepared dashboard
policy for the verified production alias `https://racepedictor.vercel.app`.
It has not been applied. Inspect existing bucket policies and preserve
other required rules. Keep the bucket private and leave public access off.

For preview, apply the same rule on the preview bucket with its exact,
verified deployment origin instead. Do not use a wildcard origin for all
Vercel projects. Add other application aliases only if they are actually
used for uploads. A new deployment hostname requires an updated preview
origin unless a stable preview alias is used.

Cloudflare's dashboard accepts the array format in this JSON file under
R2 > selected bucket > Settings > CORS Policy > JSON. This is not Wrangler's
different `rules` file format. See the
[Cloudflare CORS documentation](https://developers.cloudflare.com/r2/buckets/cors/).

## Migration and release gate

The review branch `codex/home-calendar-redesign` has automatic Git
deployments disabled through `git.deploymentEnabled` in the repository
and web project `vercel.json` files. This allows the release PR to be
reviewed while Preview still shares production services. After preview
isolation and the remaining gates are ready, explicitly remove that
branch rule before requesting a Git preview deployment. Other branches
retain Vercel's default behavior; do not merge to main before the
production release gate is clear.

The additive migration is
`packages/db/prisma/migrations/20261001120000_separate_activity_feedback/migration.sql`.
The root `vercel-build` script already runs `npm run db:migrate:deploy`
before the application build. Confirm the Vercel build command uses that
script, and confirm the target database before starting any deployment.
Prisma uses `DATABASE_URL_UNPOOLED` for migrations, not `DIRECT_URL`.
Do not paste SQL into production or run a reset command.

Apply and verify the migration in preview first. The worker's prompt
version limit and the combined feedback response envelope were corrected
locally on 2026-10-04. The worker now uses the 38-character version
`activity-coach-review.cloud-metrics.v1`; feedback data is validated before
the single success envelope is applied. Regression tests exercise worker
publication and the real cloud-handler/client response contract, including
empty and populated feedback. No production configuration or deployment
was changed by this repair.

Concurrency/recovery/input-isolation acceptance still needs targeted
coverage before merging. Signed browser uploads must also be checked end
to end, including the current `content-length` header handling. These are
release issues, independent of account setup.

Run the required cloud, targeted review/import/publication, typecheck,
build and authenticated browser checks. Verify preview Strava, CSV, GPX
and paired-device publication, then run one bounded OpenAI smoke test.
Only after the release gate passes should production configuration,
the additive migration, merge and production deployment be completed.
Verify saved content and upload preflight behavior after deployment.

Environment changes apply to subsequent deployments; see
[Vercel environment variables](https://vercel.com/docs/environment-variables).
