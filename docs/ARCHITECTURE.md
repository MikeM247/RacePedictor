# ARCHITECTURE

## Monorepo Layout

```text
/
├─ apps/
│  └─ web/           # Dashboard application (routing, pages, API composition)
├─ packages/
│  ├─ core/          # Domain logic, schemas/contracts, service interfaces
│  ├─ db/            # DB schema, migrations, repositories, data access
│  └─ ui/            # Shared UI components, tokens, and patterns
└─ docs/             # Product and engineering source documents
```

## Package Responsibilities

### `apps/web`
- Hosts the desktop-first dashboard.
- Composes domain services from `packages/core`.
- Uses presentational + composed components from `packages/ui`.
- Must not define conflicting domain contracts already owned by `packages/core`.

### `packages/core`
- Canonical home for:
  - Domain types.
  - Zod request/response schemas.
  - API contract mappers.
  - Use-cases and validation logic.
- Framework-light and reusable across runtimes.

### `packages/db`
- Owns persistence concerns:
  - Schema definitions.
  - Migrations.
  - Repositories/query adapters.
  - Index/dedupe implementation details.
- Depends on `packages/core` types where practical, never on UI.

### `packages/ui`
- Reusable component library and design primitives.
- No direct DB access.
- No domain-side effects; components receive data via props/contracts.

## Boundary Rules (Must Follow)
1. **Allowed dependencies**
   - `apps/web` → `packages/core`, `packages/ui`, `packages/db` (via service layer only).
   - `packages/db` → `packages/core`.
   - `packages/ui` → shared utilities only (no db/core domain logic coupling).
   - `packages/core` → internal/shared libs, but no `apps/*` or `packages/ui`/`packages/db` runtime coupling.
2. **No reverse imports**
   - Packages must not import from `apps/web`.
3. **Contract ownership**
   - API contracts are authored in `packages/core` and consumed elsewhere.
4. **Persistence encapsulation**
   - SQL/query details remain in `packages/db`; callers use repository/service interfaces.
5. **UI purity**
   - `packages/ui` remains presentation-focused; orchestration occurs in app/core layers.

## Cross-Cutting Architecture Decisions
- API namespace fixed at `/api/v1` for initial release.
- Additive evolution strategy for v1 contracts.
- Ingestion pipeline writes to staging first, then normalization + dedupe pass.
- Documentation-first changes for architecture-impacting decisions.
