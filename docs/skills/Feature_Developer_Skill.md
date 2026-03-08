# Feature Developer Skill

## 1) Title and Purpose
This skill is for implementing product features in the RacePredictor repository.
Its goal is to keep feature delivery aligned with product intent, architecture boundaries, UI/UX standards, and the Codex execution workflow.

## 2) Mandatory Inputs Before Starting Any Feature
Read these files before any implementation:
- `docs/CONTEXT.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DB_SCHEMA.md`
- `docs/API_CONTRACT.md`
- `docs/UI_UX_SPEC.md`
- `docs/UI_GUIDELINES.md`
- `docs/CODEX_WORKFLOW.md`

Conditional reads:
- If the feature touches security, session/auth, or sensitive data handling, also read `docs/SECURITY.md`.
- If the feature touches deployment, build, runtime behavior, or environment variables, also read `docs/DEPLOYMENT.md`.

If any required file is missing, stop and report it before implementation.

## 3) Source-of-Truth Rules
- `docs/CONTEXT.md` is the primary source of truth for repo constraints and delivery direction.
- `docs/UI_UX_SPEC.md` defines what UX content and flows must exist.
- `docs/UI_GUIDELINES.md` defines visual and interaction standards.
- `docs/API_CONTRACT.md` defines request/response contracts.
- `docs/DB_SCHEMA.md` defines model, relational, and persistence expectations.
- `docs/PRODUCT.md` defines scope and acceptance intent.
- `docs/ARCHITECTURE.md` defines boundaries, layering, and placement.

Conflict handling:
- Flag conflicts explicitly.
- Follow `docs/CONTEXT.md` first, then the more specific domain file.
- Do not silently improvise around conflicting requirements.

## 4) Feature Implementation Workflow
Use this sequence strictly:
1. Understand the feature request and expected user outcome.
2. Read mandatory docs and any conditional docs.
3. Identify affected layers: domain logic, DB schema, API contract, UI, tests, documentation.
4. Propose the smallest viable implementation slice.
5. Implement in the correct layer with reusable types/contracts.
6. Run relevant checks for the changed slice.
7. Review changes diff-first for correctness and scope control.
8. Update impacted docs and contracts.
9. Prepare a commit-ready summary with risks/assumptions.

## 5) Architecture Placement Rules
- Put business/domain logic in shared core packages, not only in `apps/web`.
- Keep `apps/web` focused on composition, routing, page assembly, and UI wiring.
- Reuse shared contracts/schemas/types; do not duplicate.
- Maintain web-first behavior now with mobile-ready structure for later.
- Do not hide business logic inside presentation components.
- Do not place direct DB logic in UI components.
- Use adapters/view-model mapping between domain data and UI rendering when needed.

## 6) UI Feature Rules
- Implement UI according to `docs/UI_UX_SPEC.md` and `docs/UI_GUIDELINES.md`.
- Keep layouts desktop-first.
- Preserve responsive baseline for smaller breakpoints.
- Avoid decorative dashboard filler without feature purpose.
- Support loading, empty, error, and stale-data states when relevant.
- Add charts/tables only when justified by feature requirements.
- Keep interfaces calm, structured, and readable.

## 7) Data / API / DB Rules
- Validate inputs/contracts with Zod.
- Use typed repository/data-access patterns.
- Avoid N+1 query patterns.
- Add indexes for new relational query paths when justified.
- Keep API changes additive in v1.
- Document all schema changes.
- Make migrations explicit and safe.

## 8) Documentation Update Rules
When feature work changes behavior or structure, update the matching source files:
- behavior/scope -> `docs/PRODUCT.md`
- architecture/module boundaries -> `docs/ARCHITECTURE.md`
- schema/tables/indexes -> `docs/DB_SCHEMA.md`
- endpoints/contracts -> `docs/API_CONTRACT.md`
- UI structure/flow -> `docs/UI_UX_SPEC.md`
- visual/component rules -> `docs/UI_GUIDELINES.md`
- workflow/process changes -> `docs/CODEX_WORKFLOW.md`
- context/constraints decisions -> `docs/CONTEXT.md`

## 9) Completion Checklist
- Feature matches request and design intent.
- Required docs were consulted.
- Code is placed in the correct layer.
- Contracts and validation are implemented correctly.
- Relevant docs are updated.
- Required checks pass.
- No unnecessary scope expansion.
- Change is ready for diff-first review.

## 10) Required Checks
Run smallest relevant checks first, then broader checks before completion:
- `pnpm -w lint`
- `pnpm -w typecheck`
- `pnpm -w test`
- `pnpm -w build`

If a full suite is expensive, run target/package-level checks first, then workspace-wide checks before finalizing.

## 11) Anti-Patterns To Avoid
- Implementing without reading required source docs.
- Inventing UX not defined in spec.
- Placing business logic in pages/components.
- Duplicating schemas/types/contracts.
- Big-bang feature changes instead of small verifiable slices.
- Decorative UI additions without product value.
- Unsafe casts to bypass typing.
- Silent contract/schema changes.
- Skipping doc updates for behavior/contract/schema/UI changes.

## 12) Output Format When Using This Skill
Before implementation, respond with:
- Docs consulted
- Affected layers
- Implementation plan
- Files to change
- Checks to run
- Risks/assumptions

Then proceed with implementation.