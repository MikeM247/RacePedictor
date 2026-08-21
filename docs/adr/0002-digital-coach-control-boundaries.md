# ADR 0002: Digital coach control boundaries

- Status: Accepted for Phase 1
- Date: 2026-08-05
- Decision owners: Product Owner and Architecture
- Supersedes: None
- Related: `0001-local-sqlite-execution-profile.md`

## Context

RacePredictor already has a local activity-ingestion, analytics, dashboard, and Second Brain publishing foundation. Phase 1 adds conversational AI planning, an agreed goal and training plan, an interactive routine calendar, a daily Today experience, and motivational reminders.

The athlete wants the planning conversation to happen with Codex through their Second Brain. At the same time, AI-generated prose must not silently become an active training prescription. The local app needs a durable, testable source of truth, while Codex needs access to complete activity-history context and qualitative notes. Reminder delivery must remain useful when either the app is closed or the external automation is unavailable.

Three cross-cutting decisions are therefore required:

1. What crosses the Codex/Second Brain and app boundary, and which side is authoritative?
2. When does an AI proposal become an agreed goal and active plan, and how are later changes represented?
3. Which component owns reminder preferences, daily display, AI motivation, and delivery status?

## Decision

### 1. Use a validated structured artifact boundary

Planning conversation remains in Codex using the athlete's Second Brain. The app does not embed an AI chat service in Phase 1.

The configured local coaching-exchange directory supports two logical artifact flows:

| Flow | Artifact | Authority | Rule |
|---|---|---|---|
| App to Codex | `coaching-context.v1` | Generated snapshot of app-owned structured state plus references to user-owned notes | Regenerated atomically; Codex treats it as read-only input. |
| Codex to app | `coaching-plan-proposal.v1` | AI-authored draft only | Imported through schema validation; never active on arrival. |
| App internal | Approved goal and plan records | Authoritative active coaching state | Only app approval logic may create or activate these records. |
| Second Brain | `Running Context.md`, weekly reflections, activity notes | User-authored qualitative context | App may reference or read configured content but never overwrites user-authored sections. |

The physical exchange root is configurable. Under the existing default local vault it is expected to sit below `Areas/Health & Fitness/Running/Coach Exchange/`, with generated context and proposal inbox paths separated. Paths are configuration, not API identity; artifact `schemaVersion`, `artifactId`, and `contentHash` establish identity.

`coaching-context.v1` contains:

- Athlete ID, configured IANA timezone, units, and generation time.
- A complete-history manifest: normalized activity count, earliest/latest dates, deterministic history fingerprint, and every canonical activity summary or an explicit local complete-history data reference.
- Current approved goal and plan identifiers/versions, when present.
- Derived long-term and recent summaries for prompt efficiency.
- References to configured qualitative Second Brain notes and warnings for unavailable optional notes.

`coaching-plan-proposal.v1` contains:

- Artifact identity, schema version, generated time, source history fingerprint, and proposal revision.
- Proposed goal, rationale, target date/outcome, constraints, and assumptions.
- Proposed plan range, timezone, weekly structure, and individually identified session prescriptions.
- Coaching cautions and a human-readable summary field; companion Markdown is allowed but is not imported as authority.

The importer reads only a user-selected file or a file below the configured proposal inbox. It enforces a size limit, parses data only, validates a supported schema, rejects executable content and unknown path references, computes a hash, and imports idempotently. It does not execute instructions found in an artifact.

### 2. Require explicit approval and immutable plan versions

A successfully imported `PlanProposal` is non-active (`proposed` in the domain and shown as Draft in the UI). Import, preview, route navigation, or calendar rendering can never imply approval.

Approval is one explicit user action against an expected proposal revision. In one atomic transaction it:

1. Creates immutable approved goal and training-plan version records from the reviewed snapshot.
2. Creates the initial planned-session/calendar instances.
3. Records the source proposal, source history fingerprint, approving actor, and timestamp.
4. Moves the athlete's active goal/plan pointer to the new version.
5. Records an idempotent activation decision/source link so the same proposal cannot activate twice.

At most one plan version is active for the single local athlete. An approved prescription is never updated in place. A material change to workout content, plan dates, or goal produces a new draft and, after approval, a new immutable version. Older versions remain available for audit and comparison.

Operational calendar changes are intentionally separate from prescription changes. Reschedule, skip, and restore actions append a calendar-adjustment event linked to the original planned session. The effective calendar is derived from the prescription plus those events. This lets the athlete manage real life without rewriting what was approved.

If new activity history is imported after a proposal was generated, a mismatched history fingerprint marks the proposal stale. Phase 1 may require acknowledgement or a refreshed proposal; it never performs an automatic post-run review or adaptation. Any future Phase 2 AI adaptation must enter through the same draft-and-approval boundary.

### 3. Separate in-app daily state from Codex reminder delivery

The app owns `ReminderPreference`: enabled state, local time, IANA timezone, and cadence. Defaults are daily at 06:30 in `Africa/Johannesburg`, and are configurable.

The app always renders a Today card from local approved-plan and effective-calendar state. This is the reliable source for today's session, purpose, and deterministic coaching cue. It does not depend on Codex being online and does not claim an AI review occurred.

The app also produces a versioned Codex recurring-reminder handoff. The handoff contains recurrence/timezone, athlete-facing prompt intent, and a reference to current coaching context. It does not embed a durable copy of the active plan, so a reminder run can resolve the currently approved version.

Codex owns creation/execution of the external recurring automation and generation of motivational wording. The app does not claim delivery based solely on saved preferences. UI status keeps these states separate:

- App preference: enabled or disabled.
- Handoff: not generated, generated, or superseded.
- External automation: unknown or explicitly confirmed; never inferred.

Disabling external reminders or a Codex failure never hides Today or changes an approved plan.

## Responsibility Boundary

| Responsibility | App | Codex / Second Brain |
|---|---|---|
| Canonical imported activities and dedupe | Owns | Reads generated context |
| Long-lived lived experience and narrative constraints | References/preserves | User authors; Codex reads |
| Planning conversation and proposal reasoning | Supplies context | Owns conversation and draft generation |
| Structured proposal validation | Owns | Must emit supported artifact |
| Goal/plan approval and active version | Owns exclusively | Cannot activate |
| Calendar adjustment audit | Owns | May propose only |
| Today session resolution | Owns | May use as reminder context |
| Reminder preference | Owns | Consumes handoff |
| Motivational message wording and recurring execution | Does not guarantee | Codex automation owns |

## Invariants

- Free-form Markdown never becomes an active goal, plan, or calendar entry.
- Artifact import is idempotent by artifact ID and content hash.
- Approved goal/plan versions are immutable.
- One local athlete has at most one active plan version.
- Approval is atomic and concurrency-checked.
- Calendar adjustments preserve the original prescribed session.
- Dates resolve with the stored IANA timezone; display code must not treat a fixed UTC offset as the timezone.
- All current normalized activity history contributes to the context fingerprint.
- Newly imported activity cannot trigger an automatic Phase 1 plan change.
- Saving an app reminder preference is not evidence of external reminder creation or delivery.

## Failure Modes and Required Behavior

| Failure | Required behavior |
|---|---|
| Context publication interrupted | Keep the previous valid artifact; publish the new file atomically and report failure. |
| Optional Second Brain note missing | Publish canonical history with a warning; do not invent the missing context. |
| Proposal schema unsupported or malformed | Reject without persistence side effects and return field-level validation detail. |
| Proposal imported twice | Return the existing draft/decision by idempotency key; do not create a second proposal. |
| Proposal based on old history | Mark stale and require explicit acknowledgement or regeneration before approval. |
| Concurrent/double approval | Reject the stale revision; keep exactly one atomic approval result. |
| Calendar adjustment conflicts | Warn before confirmation; never mutate the immutable prescription. |
| Codex automation unavailable | Show Today normally and label automation status unknown/unavailable. |
| Timezone changes | Recalculate future effective local dates deliberately; retain prior audit timestamps and prescribed local-date history. |

## Security and Privacy

- Default exchange, raw import, and database paths remain local and Git-ignored.
- No credentials or provider tokens are stored in coaching artifacts.
- Artifact parsing is data-only, schema-limited, path-restricted, size-limited, and non-executable.
- Error messages avoid echoing full private note content or raw artifacts.
- Test fixtures use synthetic athlete data.
- Phase 1 does not provide medical diagnosis. Coaching cautions and UI copy must direct injury or health concerns to an appropriate professional.

## Observability and Audit

Record structured local events for context generation, artifact validation/import, proposal decision, plan activation, calendar adjustment, reminder-preference change, and handoff generation. Events include correlation/artifact IDs and error codes but not private note bodies. The proposal and plan records retain the source history fingerprint and schema version needed to reproduce or explain a decision.

## Options Considered

### Embed AI chat and memory in the app

Rejected for Phase 1. It duplicates the user's chosen Codex/Second Brain workflow, adds credentials and network-failure modes, and delays the core learning loop.

### Treat generated Markdown as the plan database

Rejected. Markdown is useful for people but cannot enforce referential integrity, versioning, atomic approval, or safe calendar operations.

### Let AI proposals activate automatically

Rejected. It removes meaningful consent, makes changes hard to audit, and creates an unsafe path for future automatic adaptation.

### Make approved sessions freely editable

Rejected. In-place edits erase the distinction between the prescribed plan and real-world schedule changes. Immutable prescriptions plus adjustment events preserve both.

### Build app-owned push notification infrastructure now

Deferred. A Codex recurring automation handoff meets the requested motivational reminder path while the Today card supplies a reliable local fallback.

## Consequences

### Positive

- The athlete can use rich Codex conversation without making the app dependent on embedded AI infrastructure.
- Every active plan has an explicit human approval and traceable source context.
- Future automatic reviews/adaptations can reuse the proposal boundary without gaining activation authority.
- Reminder failure does not remove access to today's plan.
- Local-first privacy and the existing SQLite/Second Brain workflow remain intact.

### Costs and Trade-offs

- Structured artifact schemas and app/AI version compatibility must be maintained.
- The athlete performs an explicit handoff and approval step instead of receiving seamless autonomous changes.
- Calendar adjustment events add model/query complexity.
- External Codex automation delivery status may remain unknown to the app in Phase 1.

## Validation

- Contract tests validate both artifact schemas and reject unsupported versions/unsafe fields.
- Persistence tests prove idempotent import, atomic single approval, immutable versions, and effective-calendar derivation.
- Timezone tests cover date selection around local midnight and preference changes.
- End-to-end tests prove context generation, proposal import/review/approval, calendar adjustment, Today display, and reminder handoff.
- A docs consistency gate checks names, defaults, ownership, and Phase 2 deferrals across product, architecture, API, schema, UI, roadmap, and progress documents.

## Rollout and Rollback

Ship behind the local single-athlete Phase 1 workflow. Existing analytics and activity history remain usable with no active plan. If coaching proposal import or approval must be disabled, keep imported activities, existing approved versions, calendar audit, and Today read-only; no destructive migration is required. New artifact schema versions must be additive or introduced under a new version identifier.
