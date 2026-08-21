# ADR 0004: Owner-selected active approved plan

- **Status:** Accepted
- **Date:** 2026-08-12
- **Decision owners:** Product Owner and RacePredictor delivery team

## Context

The online Plan page exposed approved plan history but treated it as read-only. An owner could approve and publish a newer plan locally, yet could not select a different already-approved version from the web. The interface also labelled the database approval record as `Plan vN`, which could be confused with a coaching artifact version such as `1.1.0`.

## Decision

A signed-in owner may select any active or retired approved cloud plan projection as the active plan. Selection is a lifecycle command, not plan authoring or adaptation:

- drafts and withdrawn proposals are ineligible;
- the request includes the active plan ID observed by the browser, including `null`, and stale requests fail with `409 CONFLICT`;
- one serializable database transaction retires the current plan, activates the selected plan, and appends ordered plan/calendar sync changes;
- lifecycle changes increment record revisions while preserving the approved goal, sessions, prescriptions, approval metadata, and content hash;
- the local pull projection applies the selected lifecycle and settled-goal change on the paired computer;
- Today and Calendar read only the resulting active projection.

The UI distinguishes **coaching version** (when it can be recovered from explicit approval metadata) from **approval record** (the monotonic database version). It never claims a missing coaching version exists. A later approved 1.2 artifact will appear only after its normal local import, explicit approval, and publication.

## API

`POST /api/v1/coaching/plans/:planId/activate`

```json
{ "expectedActivePlanId": "plan_current" }
```

The response contains `activePlan`, the nullable `retiredPlan`, and `reused`. The route requires an owner session and never accepts a paired-device credential.

## Acceptance criteria

1. Approved inactive versions expose a clear **Make this approved plan active** action; drafts never do.
2. A confirmation states that the current version will be retired and prescriptions will not be edited.
3. Success updates Active plan, Today, Calendar, history status, and the paired local projection through the change feed.
4. A stale browser, foreign athlete, device credential, missing version, malformed request, or inconsistent projection fails closed without changing the active plan.
5. At most one active projection exists after success, and publication of a new approved plan keeps prior history internally consistent.
6. Automated contract, repository, route, UI journey, type, build, and regression tests pass.

## Consequences

Owners regain deliberate control without bypassing plan approval. Lifecycle metadata is mutable and auditable while prescriptions remain immutable. The transaction and local projection are more involved, and semantic coaching version display remains best-effort for legacy records that did not store it as a dedicated field.
