---
name: patterns
description: "Praxis project code patterns. Auto-loads when implementing, designing, or reviewing
  code. Provides structural patterns with concrete file:line examples — engine session lifecycle,
  event streaming, tool dispatch, episodic ordering, IPC channels, test helpers, and more."
user-invocable: false
allowed-tools: Read, Glob, Grep
---

# Praxis Code Patterns Reference

Structural patterns for the Praxis AI tutoring framework. Read individual pattern files for full details, implementation notes, and common violations. The dense index is in `.claude/rules/patterns.md`.

## Available patterns

### Core engine patterns
- [async-generator-event-stream.md](async-generator-event-stream.md) — `async function*` yielding `EngineEvent`; never buffer
- [engine-session-lifecycle.md](engine-session-lifecycle.md) — `Engine.open()` → `EngineSession.send()/close()`; native SDK multi-turn
- [sdk-event-mapping.md](sdk-event-mapping.md) — per-adapter `map*Event()` translates SDK events to `EngineEvent`
- [tool-dispatch-pipeline.md](tool-dispatch-pipeline.md) — model → `registry.dispatch()` → Zod → `handler(args, ToolContext)`
- [episodic-append-ordering.md](episodic-append-ordering.md) — user message persisted before engine runs; engine events appended per-event

### Configuration and data patterns
- [config-kv-store.md](config-kv-store.md) — `config_kv` table for app-wide K/V; merge stored + defaults + env
- [mode-tool-scoping.md](mode-tool-scoping.md) — `mode.toolNames` filters tools for each session's registry
- [service-deps-injection.md](service-deps-injection.md) — `ServiceDeps` DI container; `engineFactory` for test injection
- [lazy-resolver-thunk.md](lazy-resolver-thunk.md) — `() => T` / `(id) => T | null` thunks for late-bound deps (engine, vision, bootstrap config, course lookup); call per-use, never capture
- [load-or-throw.md](load-or-throw.md) — `loadOrThrow(fetch, ctx)` after `db.insert/update/delete().run()`; uniform "X not found after Y: id" wording

### Memory and indexer patterns
- [indexer-class.md](indexer-class.md) — `Indexer` interface (`id`, `schedule: "post-turn" | "session-end"`, `run(ctx)`); orchestrator handles debounce + parallel + error isolation
- [mode-prompt-fragment-composition.md](mode-prompt-fragment-composition.md) — `Mode` is a list of `PromptFragment` objects; `composeSystemPrompt` sorts by fixed `FRAGMENT_ORDER` and applies overrides; non-customizable overrides throw

### UI data patterns
- [use-resource-hook.md](use-resource-hook.md) — `useResource(loader)` for load-on-mount + `{ data, loading, error, refresh, setData }`; layer mutations on top
- [context-hook-pair.md](context-hook-pair.md) — `createContext(null)` + Provider + guard-throwing hook; `usePraxisClient`, `useAuthStatus`

### UI component patterns
- [modal-primitive.md](modal-primitive.md) — `<Modal>` provides backdrop + ESC + ARIA once; 5 modal consumers wrap content inside it
- [editorial-ui-primitives.md](editorial-ui-primitives.md) — RouteHeader, LibrarySection, EmptyState, LoadingState, ErrorMessage, COPY module, `composes: editorial from global;`
- [tab-body-isolation.md](tab-body-isolation.md) — all `<ChatTabBody>` instances mounted; `display:none` for inactive — preserves per-tab state across switches
- [session-tab-open-flow.md](session-tab-open-flow.md) — `openSessionInTab` helper chains `session.start` → `tabs.open` → `navigate`; always use the helper

### Communication patterns
- [ipc-channel-convention.md](ipc-channel-convention.md) — `praxis.{domain}.{action}`; streaming adds `.start/.events.<id>/.cancel`
- [discriminated-union-dispatch.md](discriminated-union-dispatch.md) — `type` for events, `kind` for domain objects; `switch` for exhaustive dispatch
- [subscriber-fanout-stream.md](subscriber-fanout-stream.md) — service `subscribe(listener)` (sends `snapshot` first) → `*-channel.ts` fanout with AbortController hold-open → client `events()` → UI hook iterating `for await` and folding `event.kind` into a Map

### Testing patterns
- [ui-test-helper.md](ui-test-helper.md) — `makeFakeClient(overrides?)` from `__tests__/helpers/`; `<PraxisClientProvider>` render wrapper; TanStack Router mock
- [temp-db-test-helper.md](temp-db-test-helper.md) — `useTempDb()` from `tests/helpers/db-setup.ts`; import via relative path
- [slow-test-gating.md](slow-test-gating.md) — `describe.skipIf(!process.env.PRAXIS_RUN_SLOW_TESTS)` for Pyodide integration tests
