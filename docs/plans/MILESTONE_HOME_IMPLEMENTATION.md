# Milestone Home implementation and release handoff

31 October 2026 · Option 09 and Settings milestone images.

## Feature and authority

`RACEPREDICTOR_MILESTONE_HOME_ENABLED=true` enables the new Home and Settings image controls. Default: false. Switching it off renders the previous Home and hides image controls, retaining stored images and timeline decisions. Historical confirmations, membership, plan approval and verified publication remain authoritative.

[BRD](../product/milestone-homepage/BRD.md) defines behaviour. [Locked option 09](references/milestone-home/09-last-next-training.html) defines appearance. `scripts/build-milestone-home-css.cjs` scopes the original CSS cascade to Home. Existing hero preferences and Coach permissions are respected.

## Home data and flow

The existing shared milestone projection remains the source of visible entries. A pure selector preserves the next target, one primary destination, dated/undated history, result-pending states and distinct PB/completion/performance classifications. More than four entries produce four stable highlights and a read-only vertical all-milestones dialog. Native dialogs retain focus/scroll/Escape behaviour. Activity/session navigation saves a Home recovery context.

`GET /api/v1/dashboard/training-summary` returns `{data:{timezone,lastRun,nextSession}}`. Each section is `{status:"ready",item:{id,title,date,detail}}`, `{status:"empty"}` or `{status:"unavailable"}`. The server determines today and timezone. Last runs use recorded timestamps, ownership, deletion and running sport filters. Next sessions use verified active-plan/effective-calendar readers through the plan end. Failures and last-successful card values remain independent.

## Image persistence and API

The additive migration `20261031090000_milestone_images` adds `milestone_image_state`, `milestone_image_assets` and `milestone_image_uploads`. PostgreSQL holds online state/assets; SQLite holds local state/assets, pending publications and conflict snapshots. No source record or approved plan is backfilled or changed. The image source-version digest includes verified source facts and timeline membership revision, so remove/restore/link changes invalidate stale editors even when the displayed ID survives. Image reads create no rows/tables; explicit local writes add their schema transactionally.

Uploads accept still PNG/JPEG/WebP, at most 5 MiB and 64–4096 px per axis. Actual magic bytes, decoded format, dimensions and animation are validated. Sharp strips metadata, preserves transparency/aspect ratio and produces WebP within 512×512 px and 512 KiB. Public catalogue files are the three supplied unchanged marks; uploaded bytes are athlete-scoped and served private/no-store with nosniff.

| Interface | Contract |
| --- | --- |
| `GET /api/v1/coaching/milestone-images` | Revisioned state, source version and local/online/pending/conflict status. |
| `PUT` on that path | `{entryId,expectedRevision,sourceVersion,choice,label?}`; catalogue/upload choice or null to restore the mapped default/badge. |
| `GET .../assets/{id}` | Owned normalized bytes. |
| `POST .../uploads/initiate` | Local mode or a ten-minute signed R2 URL under a dedicated milestone staging prefix. |
| `POST .../uploads/finalize` | Verify owner, size, checksum and expiry; normalize/store a derivative without assigning it. Idempotent. |
| `POST .../uploads/local` | Bounded direct local processing. |
| `POST .../resolve` | Explicit local sync-conflict decision: keep local for publication or adopt online choices. |

Images bind to verified source kinds/IDs and explicit aliases. Titles and distances never select an event logo. First catalogue selection establishes a mapped default; uploading another image preserves that default. Reset returns to it. Linking conflicting images requires an owner choice. The existing link command optionally carries `imageResolution:{expectedRevision,choice}`. Membership and image reconciliation commit atomically in serializable PostgreSQL or reserved SQLite transactions. Unlink, remove and restore retain associations.

## Device synchronization and maintenance

Existing paired-device authentication protects `/api/v1/sync/device/milestone-images`, `/assets` and `/assets/{id}`. Transfers verify normalized WebP bytes and hashes. Publication uses expected cloud revision and verified source IDs. Unpublished targets remain pending until verified online. Network/ambiguous failures retain the outbox; identical acknowledged state is recognized on retry. Concurrent changes retain local and remote choices for explicit review, without last-write-wins.

Enable the feature flag in the local sync process to include images in `sync` and `sync-and-publish`. Online desktop/phone share PostgreSQL immediately. Paired offline saves say **Saved locally · awaiting sync**. Unpaired local saves remain local.

The existing authenticated reconciliation cron cleans staging after 24 hours and unreferenced normalized assets after 30 days. Removed timeline entries retain bindings and count as references. Local cleanup: `npm run milestone-images:cleanup --workspace @racepredictor/db`; pending/conflict state also counts as referenced. Logs record operations/outcomes, excluding bytes, signed URLs and result facts.

## Validation and release

```sh
npm run db:generate
npm run typecheck --workspace @racepredictor/web
NODE_ENV=test RACEPREDICTOR_CLOUD_MODE=disabled npm test --workspace @racepredictor/web
node --experimental-strip-types packages/core/test/home-milestones.test.ts
node --experimental-strip-types apps/web/test/milestone-images.test.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:milestone-home --workspace @racepredictor/web
npm run build --workspace @racepredictor/web
```

The browser configuration uses a synthetic SQLite database under the temporary directory, never the owner’s live records. Coverage includes six responsive widths, geometry/pixel comparison, catalogue save/reload, cancelled drafts, upload persistence, stale revisions, independent card failures, overflow, keyboard/focus, long names and axe accessibility. The cloud storage test uses an isolated S3 adapter; migration/CAS tests use PGlite. Live staging/cloud credentials and cross-device endpoints still need the deployment smoke test.

1. Build/test the reviewed source. The existing Preview/work deployment guard runs migration deploy against its isolated database and verifies all three new tables before activation.
2. Configure private staging R2 CORS for its exact origin, PUT, content-type and signed x-amz-meta-athlete-id/upload-id/sha256 headers. Keep staging storage/credentials isolated from production.
3. Enable the feature flag for Preview/work and the paired test device; verify authenticated Home, Settings upload and device sync on staging.
4. Confirm event dates and production use of catalogue marks. Initial assignments require Settings selection or reviewed stable-ID mapping. Do not create targets/PBs during installation.
5. Release through the existing owner-controlled workflow. Rollback sets the flag false and retains additive tables and all image/membership decisions.

The previous automatic review rejected the private-source GitHub push. This automatic continuation grants no new approval. No push, staging deployment, live database migration or production activation has been performed.
