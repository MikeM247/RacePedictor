# CODEX_WORKFLOW

## Per-Story Delivery Loop (Required)

1. **Implement slice**
   - Build the smallest end-to-end vertical slice that delivers user-visible or API-visible value.
   - Keep changes scoped; avoid unrelated refactors.

2. **Run checks**
   - Execute required quality gates for touched scope (at minimum lint, typecheck, tests).
   - Confirm contracts and schema validations where relevant.
   - Use a docs-sync checklist for behavior/contract/schema changes:
     - [ ] `docs/CONTEXT.md`
     - [ ] `docs/API_CONTRACT.md`
     - [ ] `docs/DB_SCHEMA.md`
     - [ ] `docs/ROADMAP.md`

3. **Diff-first review**
   - Review the patch before merge/commit with a diff-first mindset:
     - correctness
     - boundary compliance
     - contract compatibility
     - accidental churn
   - Apply docs-drift gate: do not merge when implementation intent and documentation diverge.

4. **Commit / merge**
   - Commit coherent slice changes with clear message.
   - PR summary must include a `Docs updated` section naming each touched document (or explicitly `None`).
   - Merge only after checks pass, docs are updated, and docs-drift gate is clear.

## Required Documentation Updates Per Slice
When a slice changes any of the following, update the corresponding doc in the same PR/commit window:
- Scope or constraints changes → `docs/CONTEXT.md`
- Structural/boundary changes → `docs/ARCHITECTURE.md`
- API shape/endpoint changes → `docs/API_CONTRACT.md`
- DB model/index/dedupe changes → `docs/DB_SCHEMA.md`
- UX, IA, or responsive behavior changes → `docs/UI_UX_SPEC.md`
- Delivery plan/acceptance criteria updates → `docs/ROADMAP.md`

## Story Completion Criteria
A story is complete only when:
- Slice behavior is implemented.
- Checks pass for touched areas.
- Required docs are updated.
- Reviewer can validate intent via concise commit history.

## Commit Guidance
- Use small, purposeful commits.
- Message format recommendation:
  - `feat(scope): ...`
  - `fix(scope): ...`
  - `docs(scope): ...`
- Avoid mixing mechanical and behavioral changes in one commit when possible.
