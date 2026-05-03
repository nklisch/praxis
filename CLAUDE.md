# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Praxis is an open-source AI tutoring framework — a pnpm workspace monorepo whose packages compose into either an Electron desktop app or a future hosted Node service. The README has the canonical user-facing setup; this file is for AI agents working in the repo.

## Common commands

Run from the repo root unless noted.

```bash
# Build, typecheck, lint, test (each commit must leave these green)
pnpm build              # tsc -b across all packages (writes dist/)
pnpm typecheck          # uses tsgo (TS native preview) — ~10× faster than tsc
pnpm lint               # biome check . (lint + format verify)
pnpm lint:fix           # biome check --write .
pnpm test               # vitest run across the workspace

# Single-package or single-file tests
pnpm --filter @praxis/core test                       # one package's vitest
pnpm vitest run packages/core/src/__tests__/foo.test.ts   # one file
pnpm vitest run -t "describes substring"              # one test by name
pnpm test:watch                                        # vitest --watch

# Database
pnpm db:migrate         # apply Drizzle migrations to .praxis/dev.db
pnpm db:generate        # generate migration SQL from schema changes
pnpm db:reset           # delete dev DB and re-migrate
pnpm db:show            # print all tables + row counts
# Domain inspectors: db:episodic, db:mastery, db:grades, db:gates,
# db:packs, db:configurator-actions, db:cards-due

# Desktop app (Electron)
pnpm --filter @praxis/desktop rebuild:electron   # FIRST RUN ONLY — rebuild native modules for Electron's ABI
pnpm dev                                          # builds workspace dist/ then runs Electron + Vite hot-reload
pnpm rebuild better-sqlite3 canvas               # restore Node ABI bindings after rebuild:electron

# Build distributables (multi-step pipeline; see README → "Build a distributable")
pnpm --filter @praxis/desktop dist:dir           # unpacked .app (fastest smoke test)
pnpm --filter @praxis/desktop dist:mac|dist:win|dist:linux
```

**Single-test gotchas:**
- Slow Pyodide tests are gated behind `PRAXIS_RUN_SLOW_TESTS=1` (see `slow-test-gating` pattern).
- DB tests need `PRAXIS_DB_PATH` pointed at a temp dir — use `useTempDb()` from `tests/helpers/db-setup.ts`. Never let a test touch `.praxis/dev.db`.
- The workspace uses a `praxis-source` custom TS condition (in `tsconfig.base.json`) so that within the repo, package imports resolve to source `.ts`, not built `dist/.js`. You generally don't need to run `pnpm build` between edits for typecheck/test to see your changes — but `pnpm dev` (Electron) does need `pnpm build` because the main process loads workspace packages from each `dist/` at runtime.

## Stack summary

- **Runtime**: Node ≥ 24 (Node 25 works), ESM-only (`"type": "module"` everywhere)
- **Package manager**: pnpm 10 (10.33.2 pinned via `packageManager`), workspace protocol (`workspace:*`)
- **Language**: TypeScript 6, `strict: true`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`
- **Type-checker**: `tsgo` from `@typescript/native-preview` (the future TS 7) — used for `pnpm typecheck`. Build still uses `tsc -b`.
- **Database**: SQLite via Drizzle ORM 0.45 + better-sqlite3 12; sqlite-vec for embeddings. Schema split across `packages/{core,artifacts,memory,curriculum}/src/schema.ts`.
- **Testing**: Vitest 3, per-package `vitest.config.ts`, root workspace via `vitest.workspace.ts`
- **Lint + format**: Biome 2 — single tool, no ESLint, no Prettier
- **UI**: React 19 + TanStack Router (Vite SPA); packaged via Electron 41 + electron-vite. tldraw for sketch surfaces, React Flow / `@xyflow/react` for graph editors.
- **Native modules**: `better-sqlite3`, `canvas` — see README "Native modules" for the dual-rebuild dance. JS sandbox uses QuickJS WASM (`quickjs-emscripten`) — no native build required.

## Architecture (read `docs/ARCHITECTURE.md` for the full picture)

Praxis is **an agent harness specialized for tutoring**. The tutor is a model agent looping over tools; the framework gives it the right brief, tools, artifacts, and memory per mode. The full design lives in `docs/` (`VISION.md`, `ARCHITECTURE.md`, `CONTRACT.md`, `SPEC.md`, `UX.md`, `CURRICULUM.md`, `ROADMAP.md`).

```
UI (@praxis/ui) ──→ @praxis/client ──RPC over transport──→ @praxis/core ──run(brief,tools)──→ @praxis/engines
                                       (IPC | WS+HTTP)            │                              (Claude Code, Codex, Direct)
                                                                  ▼
                                       domain pkgs: @praxis/{artifacts, memory, tools, curriculum}
```

### Package layout

| Package | Responsibility |
|---|---|
| `@praxis/core` | Orchestrator — DB, shared types, service composition, session loop, ingestion, sketch |
| `@praxis/engines` | LLM engine adapters (Claude Code, Codex, Direct via Vercel AI SDK). No `@praxis/*` runtime imports. |
| `@praxis/memory` | Episodic log + four projections (semantic / procedural / affective / misconception); BKT-inspired mastery |
| `@praxis/artifacts` | Courses, lessons, assignments, exams, gates, flashcards, notes, concept maps |
| `@praxis/tools` | Verification + pedagogy + course tools; Zod schemas; runtime handlers |
| `@praxis/curriculum` | Modes, pedagogy packs, gating logic, adaptive routing, knowledge graph |
| `@praxis/client` | Typed RPC client; bundles IPC and WS+HTTP transports. Type-only deps on core. |
| `@praxis/ui` | React SPA — student chat / progress map / workspace / configure |
| `@praxis/desktop` | Electron host: starts core in main process, mounts IPC, loads UI bundle in renderer |
| `@praxis/claude-cli-sdk` | Vendored fork of `@nklisch/claude-cli-sdk` (TS wrapper around Claude Code CLI subprocess); vendored so `pnpm deploy` doesn't choke on `link:` paths |

### Dependency direction rules

The dependency graph is strict — the productization invariant (engine adapters can be swapped/removed without breaking anything else) depends on it:

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

**Phase 3 exception**: `packages/core/src/services/` (only this subdirectory) imports `@praxis/engines` and `@praxis/tools` at runtime — `SessionServiceImpl` is the composition root that wires engines + tools + core session logic together. The rest of `@praxis/core` must not import `@praxis/engines` or `@praxis/tools`.

### Where the big pieces live

- **Engine session loop**: `packages/core/src/services/session-service.ts` (composition root). Per-engine adapters under `packages/engines/src/{claude-code,codex,direct}/`. Each adapter has `events.ts` mapping SDK events → normalized `EngineEvent`.
- **Claude Code permission mode (load-bearing)**: the Claude Code adapter's `createConversation(...)` call MUST set `permissionMode: "bypassPermissions"`. Praxis drives the CLI non-interactively — there is no human at the CLI to answer prompts. Without this option, the CLI defaults to `"default"` mode, which prompts on every tool call; the call then silently denies and the model improvises an "I need permission to access..." or "approve the two tool calls" response back to the student. The same regression silently breaks the bootstrap explorer (every `document.outline` / `draft_*` call denied → zero successful tool results → `no_finalize_call` or `max_steps_reached` after a long stall). Bypass is correct because the only tools registered through the MCP bridge are first-party Praxis tools the user opted into by running the app. Don't remove this option without replacing the entire permission story.
- **Tool registry / dispatch**: `packages/tools/src/` — Zod schemas + handlers. Single source of truth regardless of engine.
- **DB module + migrations**: `packages/core/src/db/`; migration SQL in `drizzle/`; per-package schemas in `packages/{core,artifacts,memory,curriculum}/src/schema.ts`. `drizzle.config.ts` at repo root.
- **IPC transport**: `packages/desktop/electron/main/` (server side) ↔ `packages/client/src/` (client side). Channel naming: `praxis.{domain}.{action}`; streaming uses `.start` / `.events.<streamId>` / `.cancel`.
- **UI shell**: `packages/ui/src/` — TanStack Router routes + components. Editorial primitives (RouteHeader, LibrarySection, EmptyState, etc.) and `composes: editorial from global;` CSS form the design system — use them, never re-implement. `<ActivityRail />` is mounted at the root (in `router.tsx`) and surfaces ambient long-running work via `useActivity()`; it replaces the old blocking `IngestionProgress` modal. Add new long-running producers by injecting `ActivityRegistry` into the relevant service (`ServiceDeps.activity`), not by creating new modals.
- **Per-mode tab bodies**: `QuizTabBody`, `HomeworkTabBody`, `ExamTabBody`, `BootstrapTabBody` in `packages/ui/src/components/` — dispatched by `session.modeId` inside the chat workspace. Each mode has a distinct UI shape; the `display:none` isolation pattern from `tab-body-isolation` applies at the tab wrapper, not within these bodies.
- **Parent-child session linkage**: `SessionService.notifySession()` delivers a `system_note` event to a running parent session (teach-mode tutor) when a child assignment session submits. `spawnFromAssignment()` opens a child session whose `parentSessionId` links back to the tutor. `parent_session_id` column on both `sessions` and `assignments` tables.
- **Course documents join**: `CourseDocumentsServiceImpl` in `@praxis/core/services` manages the `course_documents` join table that links ingested documents to specific courses. Used by the bootstrap explorer to scope which documents an exploration session reads.
- **Bootstrap explorer tools**: `course.start_exploration` (entry point for the agentic multi-turn explorer), `course.draft_add_unit`, `course.draft_set_assessment_plan`, `course.draft_add_lesson_assessment` in `@praxis/tools/course`. `persistDraft` in `BootstrapServiceImpl` materialises units + lessons + assessment shells in one transaction.

## Code patterns

`.claude/rules/patterns.md` indexes ~20 project-specific patterns with concrete `file:line` examples. Each pattern has a full reference under `.claude/skills/patterns/{slug}.md`. **Read the relevant pattern before implementing or reviewing in that area.** Highlights:

- **engine-session-lifecycle** — `Engine.open(opts)` → `EngineSession`; `send(msg)` reuses the live SDK conversation; `close()` in `finally`.
- **async-generator-event-stream** — every turn yields `EngineEvent` via `async function*`; persist + forward each event as it arrives, never buffer.
- **episodic-append-ordering** — within a turn: `recordUserMessage` → yield `user_message` → `for await engine events` → `appendEpisodic` immediately per event → yield event; write-failure is non-fatal.
- **load-or-throw** — after `.insert/update/delete().run()`, call `loadOrThrow(() => this.get(...), ...)` to round-trip. Never inline `if-null-throw`.
- **service-deps-injection** — `ServiceDeps` is the single DI container; `engineFactory?: fn` is the test injection seam for `FakeEngine`.
- **ipc-channel-convention**, **discriminated-union-dispatch**, **mode-tool-scoping**, **modal-primitive**, **use-resource-hook**, **context-hook-pair**, **tab-body-isolation**, **session-tab-open-flow**, **temp-db-test-helper**, **ui-test-helper**, **slow-test-gating** — see the index for the rest.

## Conventions

### Imports
- **Type-only imports must use `import type`** — enforced by `verbatimModuleSyntax: true` and Biome's `useImportType` rule. Violations are lint errors.
- For sibling packages, import by package name (`import type { Course } from "@praxis/core/types"`), not relative path.
- ESM imports must use the `.js` extension (compiled output extension), even when the source is `.ts`. Example: `import { foo } from "./utils.js"`.

### File / symbol naming
- **Files**: kebab-case (`concept-graph.ts`, `user-service.ts`)
- **Types and interfaces**: PascalCase (`CourseId`, `EngineEvent`)
- **Functions and variables**: camelCase (`openDb`, `resolveDbPath`)
- **Constants that are single-source registries**: SCREAMING_SNAKE_CASE (`ROLE_CONFIG`)

### Discriminated unions

Praxis uses two discriminator field names by convention:

- **`type`** — for events flowing through a stream or IPC channel (`EngineEvent`, IPC envelope messages, telemetry). Names *what just happened*.
- **`kind`** — for variants of a stored or transmitted domain object (`CourseSource`, `GateTarget`, `gradeMathInput`/`gradeMathOutput`, `SuccessCriteria`). Names the *shape* of the value.

Heuristic: if the union is consumed by a `for await` or a switch over a streamed event, use `type`. If it's a stored shape that gets read and written (DB, RPC, embedded in another type), use `kind`. Use `z.discriminatedUnion("kind", [...])` for Zod.

### Tests
- Tests are **colocated** with source as `*.test.ts` files in `src/__tests__/` directories.
- Root-level integration / end-to-end tests live in `tests/`.
- Type-only tests use `.test-d.ts` (vitest convention).
- Use `beforeEach`/`afterEach` for isolation; never share mutable state across tests.
- DB tests must use `useTempDb()` from `tests/helpers/db-setup.ts` and `PRAXIS_DB_PATH` — never touch `.praxis/dev.db`.
- UI tests: use `makeFakeClient(overrides?)` from `__tests__/helpers/fake-client.ts` and wrap renders in `<PraxisClientProvider>`.

### Type SSOT

`docs/CONTRACT.md` is the canonical source of truth for cross-package type contracts. Check it before defining a new shared type. **Generated types take precedence over hand-written duplicates** — prefer `typeof table.$inferSelect` (Drizzle) over a parallel hand-rolled interface.

### `any` policy

Do **not** use `any` without an explanation comment:

```typescript
// biome-ignore lint/suspicious/noExplicitAny: <reason>
```

Prefer `unknown` with a type guard, or a precise union, over `any`.

### Commits

- Commits describe *what landed*, not a task ID.
- Each commit should leave the repo in a passing `pnpm typecheck && pnpm lint && pnpm test` state.
- Do not commit generated files in `drizzle/meta/` or `.praxis/`.

## Phase map

Praxis is built in numbered phases; each has a design doc in `docs/designs/`. Always check the relevant design before implementing. Phases 1–16 have shipped (foundation → engine layer → UI shell → verification tools → textbook RAG → course/lesson bootstrap → adaptive memory → multi-mode assessment → gates/progress map → knowledge-graph canonical pack → configure-mode authoring → workspace notes/flashcards → editorial foundation → tabs and library → sketch/concept maps → bootstrap explorer + modalities/assessment loop). Also shipped as non-phase chunks: **activity rail** (ambient progress surface — replaces the `IngestionProgress` modal; design in `docs/designs/activity-rail.md`) and **language-sandbox-registry** (QuickJS replaces isolated-vm; design in `docs/designs/language-sandbox-registry.md`). New design docs go in `docs/designs/phase-NN-*.md`; refactor plans in `docs/refactors/`.
