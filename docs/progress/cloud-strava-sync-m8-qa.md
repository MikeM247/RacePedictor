# Milestone 8 QA Gate — Provisioning and Production Smoke

**Date:** 2026-08-12
**Result:** Needs Review
**Recommendation:** Human Decision Required

## Acceptance criteria check

| Criterion | Evidence | Result |
|---|---|---|
| Owner-only authentication is fail-closed and tenant-scoped | Focused auth 5/5, DB identity 3/3, full web 73/73, persisted access lookup, and protected route coverage | Pass |
| Existing cloud host remains free tier | Existing Vercel Hobby project verified | Pass |
| Production database is provisioned on free tier | Neon Free resource created in Frankfurt and connected to Vercel Production/Preview | Pass |
| Production secrets are configured without disclosure | Required auth, database, cloud-mode, disabled feature flags, and scheduler values are present in Production/Preview; no live value entered source control | Pass |
| Production schema and owner access are provisioned | 10/10 migrations successful, 24 public tables, zero prohibited columns, one owner identity, one athlete, and one owner grant | Pass |
| Production deployment and anonymous access controls work | Current production deployment is Ready; health 200, dashboard redirects to login, protected API returns 401, and production OAuth callback is correct | Pass |
| Real owner session resolves the persisted athlete | GitHub consent completed; live dashboard and Neon-backed Settings load the provisioned owner's empty tenant state | Pass |
| Private raw provider storage works in production | A real bounded history import completed and created private raw-object metadata alongside canonical activity records; the online activity detail exposes no raw object URL or credential | Pass for the private write/read path; independent checksum-read evidence remains part of final smoke |
| History import protects the provider allowance and keeps durable progress | Core service denies provider I/O before an unavailable reservation, persists checkpoints on planned pause and retry, and the scheduler yields after one deferred job | Pass in automated QA; production deployment and smoke remain |
| Strava completes the real connect-to-workout journey | Owner OAuth is connected; the bounded 90-day import job completed once and its imported workout is visible online | Pass for owner connect and history import; Needs Review for an automatic webhook delivery |
| Local Second Brain sends only selected structured fields | Synthetic and local-agent boundaries pass; real device pairing and live round trip remain | Needs Review |

## Validation summary

- Build: Pass — current Next.js 16 production build, including auth, dashboard, provider, webhook, sync, and health routes.
- Lint/types: Pass — current strict TypeScript production configuration.
- Tests: Pass — 82 core, 54 database, and 77 web tests, including manual history-import bounds/retry, proactive capacity reservation, durable checkpoint resumption, and PostgreSQL JSONB idempotency coverage.
- Playwright/E2E: Pass — owner-auth and online dashboard histories, including manual history-import request bounds and retry.
- Dependency audit: Pass — zero known vulnerabilities.
- Repository hygiene: Pass — `git diff --check` has no errors; line-ending notices are informational.
- Live deployment: Pass — corrected preview Ready; promoted production deployment Ready and Current at commit `2d4f388`.
- Live unauthenticated smoke: Pass — health/config, redirect, 401 envelope, and GitHub provider callback all match the contract.
- Live authenticated smoke: Pass — configured owner enters the dashboard; tenant-scoped empty state and unpaired device state render without exposing another athlete.

## Issues and remediation

The first integrated rerun found partially written Next.js development-cache type files. A supported custom production TypeScript configuration now isolates release validation from that live cache while retaining strict checks. The exact cloud-test-then-build order passes after remediation.

The first Vercel preview exposed missing web-workspace storage dependencies because Vercel builds from `apps/web`. The web workspace now owns the required AWS SDK packages and generates the Prisma client before compiling; the exact app-level build passes and the corrected preview/production deployments are Ready.

No blocking defect remains in the production foundation or owner-authenticated history-import path. The pacing hardening now has automated evidence but needs this release's production smoke. The remaining M8 gaps are that smoke, a real automatic webhook delivery, an independent raw checksum read, and local-device selected-context smoke.

## QA decision

The implemented owner-authenticated, bounded history-import, and pacing slices pass. The complete M8 milestone remains **Needs Review** and must not be marked done until production pacing smoke plus the final automatic-webhook, raw-integrity, and local selected-context evidence above passes.
