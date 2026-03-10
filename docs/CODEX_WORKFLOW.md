# CODEX_WORKFLOW

## Per-Story Delivery Loop (Required)

### 0) Story intake (before coding)

- Confirm the story has all required framing:
  - parent epic
  - objective and why-now
  - likely affected files/layers
  - explicit acceptance criteria
  - non-goals and risks/edge cases
- If any item is ambiguous, resolve it before implementation.

1. **Implement slice**
   - Build the smallest end-to-end vertical slice that delivers user-visible or API-visible value.
   - Keep changes scoped; avoid unrelated refactors.

2. **Run checks**
   - Execute required quality gates for touched scope (at minimum lint, typecheck, tests).
   - Confirm contracts and schema validations where relevant.
   - Complete the docs-sync gate checklist (mark each as `Updated` or `N/A`, never leave blank):
     - [ ] `docs/CONTEXT.md` — scope/constraints decisions
     - [ ] `docs/PRODUCT.md` — behavior and feature intent
     - [ ] `docs/ARCHITECTURE.md` — boundaries/layer placement
     - [ ] `docs/API_CONTRACT.md` — endpoint/request/response changes
     - [ ] `docs/DB_SCHEMA.md` — model/index/dedupe/persistence changes
     - [ ] `docs/UI_UX_SPEC.md` — IA, flows, responsive behavior
     - [ ] `docs/UI_GUIDELINES.md` — visual/component interaction rules
     - [ ] `docs/CODEX_WORKFLOW.md` — process/lifecycle changes
     - [ ] `docs/ROADMAP.md` — task status/acceptance tracking

3. **Diff-first review**
   - Review the patch before merge/commit with a diff-first mindset:
     - correctness
     - boundary compliance
     - contract compatibility
     - accidental churn
   - Apply docs-drift gate: do not merge when implementation intent and documentation diverge.

4. **Commit / merge**
   - Commit coherent slice changes with clear message.
   - PR summary must include:
     - `Checklist status` (acceptance criteria met/not met)
     - `Docs updated` section naming each touched document, each docs-sync item marked `Updated` or `N/A`
     - explicit follow-ups for anything deferred
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

## Story Done Checklist (Blocking)

Before marking a story done, all items below must be true:

- [ ] Acceptance criteria are satisfied exactly as written.
- [ ] Non-goals were preserved (no unplanned scope expansion).
- [ ] Quality checks passed for touched scope.
- [ ] Docs-sync gate is fully resolved (`Updated` or `N/A` for every listed doc).
- [ ] Docs-drift gate passed (implementation matches docs and vice versa).
- [ ] Risks/edge cases were addressed or captured as explicit follow-ups.
- [ ] PR/commit summary includes checklist status and docs updates.

## Commit Guidance
- Use small, purposeful commits.
- Message format recommendation:
  - `feat(scope): ...`
  - `fix(scope): ...`
  - `docs(scope): ...`
- Avoid mixing mechanical and behavioral changes in one commit when possible.
