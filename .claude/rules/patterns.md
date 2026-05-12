# Praxis Code Patterns

Detailed examples for each pattern are in `.claude/skills/patterns/{slug}.md`. Read the full file when implementing or reviewing code in that area.

## Core engine patterns (read when building engines, tools, or sessions)
- **async-generator-event-stream**: Every agent turn yields `EngineEvent` via `async function*`; persist and forward each event as it arrives — never buffer → [async-generator-event-stream.md]
- **engine-session-lifecycle**: `Engine.open(opts)` → `EngineSession`; `send(msg)` reuses the live SDK conversation; `close()` in `finally`; seed with `priorTurns` only on engine swap/restart → [engine-session-lifecycle.md]
- **sdk-event-mapping**: Each adapter has a `map*Event(sdkEvent, ctx)` in its `events.ts` that returns `EngineEvent | null`; Codex returns `EngineEvent[]` (one SDK event can produce multiple) → [sdk-event-mapping.md]
- **tool-dispatch-pipeline**: Model call → adapter maps to `registry.dispatch(name, args)` → Zod validation → `handler(parsed.data, ToolContext)` → `ToolResult`; all adapters share the same dispatch path → [tool-dispatch-pipeline.md]
- **batch-tool-per-item-results**: Tools that mutate N items in one step return `{ ok: AND(item.ok), results: ({ok:true, ...id} | {ok:false, ...id, reason})[] }` and never abort on per-item failure; sequential `await` to preserve order; per-item `reason` is the model's correction signal → [batch-tool-per-item-results.md]
- **episodic-append-ordering**: Within a turn: `recordUserMessage` → yield `user_message` → `for await engine events` → `appendEpisodic` immediately per event → yield event; write-failure is non-fatal → [episodic-append-ordering.md]

## Configuration and data patterns
- **config-kv-store**: `config_kv` table stores app-wide key/value config as JSON; read merges stored + defaults + env overrides; write via `onConflictDoUpdate` → [config-kv-store.md]
- **mode-tool-scoping**: `mode.toolNames` filters `ServiceDeps.toolDefinitions` in `SessionServiceImpl.openActive`; `toolNames === []` means all tools (backward compat); always keep `toolNames` and prompt fragment in sync → [mode-tool-scoping.md]
- **service-deps-injection**: `ServiceDeps` is the single DI container; `engineFactory?: fn` is the test injection seam for `FakeEngine`; `toolServices: { sympy, sandbox }` populated in `buildServices` → [service-deps-injection.md]
- **lazy-resolver-thunk**: For deps that must be late-bound (user-tunable config, runtime swaps, acyclic ordering, narrow lookup-by-id), declare the dep as `() => T` or `(id) => T | null` and call it per-use; never capture the result at construction → [lazy-resolver-thunk.md]
- **load-or-throw**: After `.insert/update/delete().run()`, call `loadOrThrow(() => this.get(...), { entity, op, id, log })` to round-trip — never inline the if-null-throw; uniform error format `"<entity> not found after <op>: <id>"` → [load-or-throw.md]

## Memory and curriculum patterns
- **indexer-class**: Background memory writers implement `Indexer` (`id`, `schedule: "post-turn" | "session-end"`, `async run(ctx)`); registered as an array on `IndexerOrchestratorImpl`, which handles debounce + parallel fan-out + per-indexer error isolation + turnFloor advancement → [indexer-class.md]
- **mode-prompt-fragment-composition**: A `Mode` is a list of `PromptFragment` objects (`{ id, position, customizable, template }`); `composeSystemPrompt` sorts mode + additional fragments by a fixed `FRAGMENT_ORDER` and applies `overrides`; non-customizable overrides throw — share fragments across modes, don't inline mode-specific content into shared ones → [mode-prompt-fragment-composition.md]

## UI data patterns
- **use-resource-hook**: `useResource(loader)` returns `{ data, loading, error, refresh, setData }`; loads on mount via useEffect; layer mutations on top using `setData` for optimistic updates; never inline the `setLoading/try/catch/finally` block → [use-resource-hook.md]
- **context-hook-pair**: `createContext(null)` + Provider + `useX()` that throws if outside Provider; used for PraxisClient (`usePraxisClient`) and auth status (`useAuthStatus`); guards surface missing-provider bugs immediately → [context-hook-pair.md]
- **activity-rail-producer**: Long-running services inject `ActivityRegistry` via `ServiceDeps.activity`; producers call `ctx.activity?.start({ label, metadata? })` → hold `ActivityHandle` → call `handle.update(patch)` / `handle.finish("done"|"failed")`; items appear on the `<ActivityRail>` after their `quietPeriodMs` threshold (default 800ms for indexers). Never create a blocking modal for background work — use the rail instead. → [service-deps-injection.md]

## UI component patterns
- **modal-primitive**: `<Modal onClose={fn}>` provides backdrop + ESC + click-outside + ARIA once; 5 modals wrap content inside it; never duplicate the escape handler or backdrop div → [modal-primitive.md]
- **editorial-ui-primitives**: RouteHeader, LibrarySection, EmptyState, LoadingState, ErrorMessage, COPY module, and `composes: editorial from global;` CSS utility form the editorial design system — use these primitives, never re-implement → [editorial-ui-primitives.md]
- **tab-body-isolation**: ALL open `<ChatTabBody>` instances mount simultaneously; inactive ones use `display:none` (not unmount) to preserve per-tab message logs and in-flight streams across tab switches → [tab-body-isolation.md]
- **session-tab-open-flow**: Opening a session always chains `session.start` → `tabs.open` (via `useTabs().openTab`) → `navigate`; use `openSessionInTab` helper — never call only session.start without opening a tab → [session-tab-open-flow.md]

## Communication patterns
- **ipc-channel-convention**: Channels follow `praxis.{domain}.{action}`; streaming splits into `.start` (invoke) / `.events.<streamId>` (push) / `.cancel` (signal); subscribe before invoking to avoid race → [ipc-channel-convention.md]
- **discriminated-union-dispatch**: Use `type` for streamed events (`EngineEvent`), `kind` for stored/transmitted domain objects (tool inputs, artifact variants); `switch` for exhaustive dispatch; `z.discriminatedUnion("kind", [...])` for Zod schemas → [discriminated-union-dispatch.md]
- **subscriber-fanout-stream**: For shared mutable main-process state surfaced to many renderers — service `subscribe(listener)` (sends `snapshot` first) → `*-channel.ts` fanout with AbortController hold-open → client `events()` → UI hook iterating `for await` and folding `event.kind` into a Map → setState → [subscriber-fanout-stream.md]

## Testing patterns
- **ui-test-helper**: `makeFakeClient(overrides?)` from `__tests__/helpers/fake-client.ts` is the single SOT for test PraxisClient stubs; wrap renders in `<PraxisClientProvider>`; mock `@tanstack/react-router` with `async importOriginal` form to preserve non-hook exports → [ui-test-helper.md]
- **temp-db-test-helper**: `useTempDb(opts?)` from `tests/helpers/db-setup.ts` sets up per-test isolated SQLite + migrations; from per-package tests import via `../../../../tests/helpers/db-setup.js` → [temp-db-test-helper.md]
- **slow-test-gating**: Pyodide integration tests use `describe.skipIf(!process.env.PRAXIS_RUN_SLOW_TESTS)` with `{ timeout: 120_000 }`; fast unit tests mock the runtime → [slow-test-gating.md]
- **shared-test-fake-factories**: Port test doubles live as factory functions in `tests/helpers/mocks.ts` (`noopLogger`, `noopLockService`, `inMemorySecretStorage`, `unavailableSecretStorage`, `noopCourseDocuments`, `recordingLogger`); tests import these instead of inlining literal mocks — new ports added to `ServiceDeps` warrant a fake here when 3+ tests will need it → [shared-test-fake-factories.md]
