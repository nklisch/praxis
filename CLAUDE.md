# Praxis — Agent Conventions

This file is the first thing an AI coding agent should read. It describes the project conventions that every agent must follow.

## Stack summary

- **Runtime**: Node >= 24, ESM-only (`"type": "module"` everywhere)
- **Package manager**: pnpm 9 with workspace protocol (`workspace:*`)
- **Language**: TypeScript 5.6+, `strict: true`, `verbatimModuleSyntax: true`
- **Database**: SQLite via Drizzle ORM + better-sqlite3; schema in `packages/{core,artifacts,memory,curriculum}/src/schema.ts`
- **Testing**: Vitest 2, per-package colocated tests
- **Lint + format**: Biome 2 — single tool, no ESLint, no Prettier
- **UI**: React (future phases); Electron for desktop packaging

## Dependency direction rules

The allowed dependency direction is strictly:

```
@praxis/desktop
  → @praxis/core, @praxis/ui
    @praxis/ui → @praxis/client
    @praxis/client → (type-only @praxis/core/types)
    @praxis/core → @praxis/artifacts, @praxis/memory, @praxis/curriculum
    @praxis/engines, @praxis/tools, @praxis/memory, @praxis/artifacts, @praxis/curriculum
      → (type-only @praxis/core/types)
```

**Never** introduce a runtime dependency that goes against this direction (e.g., `@praxis/core` importing `@praxis/engines`). Type-only imports across direction-reversed boundaries are fine — use `import type`.

### Phase 3 dependency exception

**`@praxis/core/services`** (i.e., `packages/core/src/services/`) imports `@praxis/engines` and `@praxis/tools` at runtime. This is a targeted, deliberate exception: `SessionServiceImpl` is the composition root that wires engines + tools + core session logic together. This exception is limited to the `services/` subdirectory only — the rest of `@praxis/core` must not import `@praxis/engines` or `@praxis/tools`.

## Import conventions

- **Type-only imports must use `import type`** — enforced by `verbatimModuleSyntax: true` in TypeScript and by Biome's `useImportType` rule. Violations are lint errors.
- When importing from a sibling package in the monorepo, use the package name (e.g., `import type { Course } from "@praxis/core/types"`), not a relative path across package directories.
- File extensions in ESM imports must be `.js` (the compiled output extension), even when the source is `.ts`. Example: `import { foo } from "./utils.js"`.

## File naming conventions

- **Files**: kebab-case (`concept-graph.ts`, `user-service.ts`)
- **Types and interfaces**: PascalCase (`CourseId`, `EngineEvent`)
- **Functions and variables**: camelCase (`openDb`, `resolveDbPath`)
- **Constants that are single-source registries**: SCREAMING_SNAKE_CASE (`ROLE_CONFIG`)

## Test conventions

- Tests are **colocated** with source as `*.test.ts` files in `src/__tests__/` directories.
- Root-level integration tests live in `tests/`.
- Type-only tests use the `.test-d.ts` suffix (vitest convention).
- Use `beforeEach`/`afterEach` for test isolation; never share mutable state across tests.
- Database tests must use a temp dir and `PRAXIS_DB_PATH` env var — never touch `.praxis/dev.db` in tests.

## Type SSOT

`docs/CONTRACT.md` is the canonical source of truth for cross-package type contracts. Before defining a new shared type or interface, check CONTRACT.md first. Generated types (Drizzle `$inferSelect`, etc.) take precedence over hand-written duplicates — prefer derived types over parallel definitions.

## `any` policy

Do **not** use `any` without an explanation comment. Format:

```typescript
// biome-ignore lint/suspicious/noExplicitAny: <reason>
```

Prefer `unknown` with a type guard, or a precise union, over `any`.

## Commit conventions

- Commits describe *what landed*, not a task ID.
- Each commit should leave the repo in a passing `pnpm typecheck && pnpm lint && pnpm test` state.
- Do not commit generated files in `drizzle/meta/` or `.praxis/`.

## Phase map

Praxis is built in 14 phases. Each phase has a design doc in `docs/designs/`. Check the relevant design before implementing a phase. Phase 1 established the monorepo skeleton and type contract; Phase 2 adds the engine layer; Phase 3 (backend units) adds the engine lifecycle (open/send/close), SessionServiceImpl, ConfigServiceImpl, and conversation history.
