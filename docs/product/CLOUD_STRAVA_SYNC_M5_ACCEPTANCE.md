# Milestone 5 Product Owner Acceptance

**Review date:** 2026-08-10  
**Decision:** PASS - GO for Milestone 6  
**Production approval:** No  
**Review method:** requirement-led review of the three M5 backlog features, formal QA record, executable integration evidence, and desktop/mobile product journeys

## Product Owner gate

| Gate criterion | Decision | Evidence and finding |
|---|---|---|
| Pair, initial/incremental sync, offline recovery, revoke, and re-pair journeys pass. | PASS | Core/DB/route integration plus online Settings product journey cover each state; local and provider/browser identities remain separate. |
| Replay and partial failure lose no cursor/data and cause no cloud rollback. | PASS | Note failure holds the cursor; entity replay is idempotent; missed acknowledgement is repaired from the committed cursor. |
| User-authored Obsidian content is unchanged. | PASS | Test compares the CRLF prefix byte-for-byte and proves exactly one owned generated span after replay. |
| Only explicitly selected structured context reaches immutable snapshots. | PASS | Exact v1 allow-list, closed nested schemas, pre-write source-ref validation, hash/revision/device fences, and prohibited-content assertions pass. |
| Latest cloud data remains useful while local is offline. | PASS | Online dashboard and Plan/Calendar product journeys remain available with stale local-device and Second Brain signals. |
| Automated and product suites are cumulative and green. | PASS | Core 71, DB 44, web 64, local 24, browser 15, Prisma, DPAPI, scheduler syntax, build, audit, and diff checks pass. |

## Feature acceptance

### Pair and revoke one athlete-scoped local sync device

PASS. Pairing is an owner action and returns a credential exactly once. The database stores its hash; the Windows computer stores the plaintext only through current-user DPAPI. Re-pair revokes the previous device, explicit revoke stops all device-authenticated routes, and neither operation disconnects Strava or invalidates browser identity. Settings shows name, paired time, last sync/cursor, and Active/Stale/Error/Revoked states.

### Synchronize cloud-authoritative changes to the local projection

PASS. The agent performs bounded initial and incremental reads, transactionally stages structured entities, atomically regenerates an owned note span, then advances and acknowledges the cursor. It handles activities, corrections, tombstones, approved plans, calendar sessions, and revisions. A scheduled-task installer provides automatic periodic execution once the live device is paired. Existing local coaching, plan approval, calendar, Today, imports, analytics, and Obsidian workflows have no release-blocking regression.

### Publish only selected structured Second Brain snapshots

PASS. One explicit structured input and exact selected-section array are required. The cloud receives no logical source reference or local path; local evidence records the categories and logical references. Immutable revision/hash enforcement and latest-after-revoke behavior pass. The payload cannot carry or mutate a goal, plan, session, activity, provider connection, or raw object.

## Product constraints

| Constraint | Decision |
|---|---|
| Strava first; no Garmin-specific implementation | PASS |
| Future-athlete-safe architecture, single-athlete UI now | PASS - actor/device/change/snapshot/plan operations are athlete-scoped |
| Raw provider data remains private cloud storage data | PASS - local sync receives selected canonical data only |
| Obsidian and qualitative notes remain local | PASS - no scan or note-upload route exists |
| Dashboard is online and independent of local availability | PASS |
| No automatic AI review or plan adaptation | PASS |
| Free tier and no external authentication before required | PASS - no managed resource or account credential was used |

## Accepted dependencies, not exceptions

- M6 will execute the clean-environment cumulative release gate, recovery/observability review, security review, and representative-volume checks.
- M7 will trace every original programme requirement to final evidence and record the formal release-candidate Product Owner decision.
- M8 will add the real owner identity adapter, provision Vercel/Neon/R2/Strava, enrol the real local device, install its scheduled task, and repeat the live offline/online smoke journey.

These dependencies do not waive authentication, privacy, tenant isolation, immutable history, or explicit plan approval.

## Product Owner decision

**PASS - GO for M6.**

M5 delivers the complete credential-free local structured synchronization capability. It is not production-approved until M6-M7 pass and M8 completes authenticated provisioning and live smoke verification.

**Product Owner:** Product Owner role gate  
**Next gate:** M6 - cumulative QA, security, recovery, and operational hardening
