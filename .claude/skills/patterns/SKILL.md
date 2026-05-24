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
- [batch-tool-per-item-results.md](batch-tool-per-item-results.md) — batch tools collapse N mutations into one model step; return `{ ok: AND(item.ok), results: ({ok:true, ...id} | {ok:false, ...id, reason})[] }`; never abort on per-item failure
- [episodic-append-ordering.md](episodic-append-ordering.md) — user message persisted before engine runs; engine events appended per-event

### Configuration and data patterns
- [config-kv-store.md](config-kv-store.md) — `config_kv` table for app-wide K/V; merge stored + defaults + env
- [mode-tool-scoping.md](mode-tool-scoping.md) — `mode.toolNames` filters tools for each session's registry
- [service-deps-injection.md](service-deps-injection.md) — `ServiceDeps` DI container; `engineFactory` for test injection
- [lazy-resolver-thunk.md](lazy-resolver-thunk.md) — `() => T` / `(id) => T | null` thunks for late-bound deps (engine, vision, bootstrap config, course lookup); call per-use, never capture
- [load-or-throw.md](load-or-throw.md) — `loadOrThrow(fetch, ctx)` after `db.insert/update/delete().run()`; uniform "X not found after Y: id" wording
- [dynamic-where-predicate.md](dynamic-where-predicate.md) — Drizzle queries with optional filters seed a mutable `eq[]` accumulator and finalize with `.where(and(...predicates))`; never chain `.where().where()`

### Memory and indexer patterns
- [indexer-class.md](indexer-class.md) — `Indexer` interface (`id`, `schedule: "post-turn" | "session-end"`, `run(ctx)`); orchestrator handles debounce + parallel + error isolation
- [mode-prompt-fragment-composition.md](mode-prompt-fragment-composition.md) — `Mode` is a list of `PromptFragment` objects; `composeSystemPrompt` sorts by fixed `FRAGMENT_ORDER` and applies overrides; non-customizable overrides throw
- [one-shot-llm-inference.md](one-shot-llm-inference.md) — background LLM passes (graders, indexers, notes summarization) use `runOneShot(engine, { systemPrompt, tools: { list:[], dispatch: noopDispatch }, maxSteps: 1 }, userMessage)` + for-await accumulator + `extractJsonBlock`
- [agent-prompt-sidecar.md](agent-prompt-sidecar.md) — each LLM agent ships its system prompt in a sibling `<name>-prompt.ts` file exporting one `NAME_SYSTEM_PROMPT` const

### Service composition patterns
- [service-facade-sibling-dir.md](service-facade-sibling-dir.md) — services > ~400 LoC split into a `<name>-service.ts` facade + sibling `<name>/` directory of pure helpers, registries, prompt sidecars, and sub-services; barrel re-exports keep imports flat
- [builder-module-composition.md](builder-module-composition.md) — 9 `build-<domain>-services.ts` modules each export an `<Domain>Services` interface + `build<Domain>Services(deps)` factory; orchestrator wires them in dependency order
- [ref-cell-bridge.md](ref-cell-bridge.md) — cyclic runtime deps resolved via `let xxxRef: T | undefined` + `setXxxRef(fn)` setter on the earlier builder; orchestrator closes the ref after the second service is constructed
- [kind-adapter-registry.md](kind-adapter-registry.md) — per-variant logic exposed as `buildXxxRegistry(): Record<Union["kind"], Adapter>`; TS exhaustiveness forces every new union member to register an adapter
- [row-to-domain-mapper.md](row-to-domain-mapper.md) — per-service `function rowToX(row: typeof tableName.$inferSelect): X` colocated with the service; all read methods funnel rows through it

### UI data patterns
- [use-resource-hook.md](use-resource-hook.md) — `useResource(loader)` for load-on-mount + `{ data, loading, error, refresh, setData }`; layer mutations on top
- [use-resource-aggregation-loader.md](use-resource-aggregation-loader.md) — page-level surfaces with N independent reads pass a `useCallback`'d `Promise.all` loader to `useResource`; one shared `loading`/`error`/`refresh`
- [context-hook-pair.md](context-hook-pair.md) — `createContext(null)` + Provider + guard-throwing hook; `usePraxisClient`, `useAuthStatus`

### UI component patterns
- [modal-primitive.md](modal-primitive.md) — `<Modal>` provides backdrop + ESC + ARIA once; 5 modal consumers wrap content inside it
- [editorial-ui-primitives.md](editorial-ui-primitives.md) — RouteHeader, LibrarySection, EmptyState, LoadingState, ErrorMessage, COPY module, `composes: editorial from global;`
- [tab-body-isolation.md](tab-body-isolation.md) — all `<ChatTabBody>` instances mounted; `display:none` for inactive — preserves per-tab state across switches
- [session-tab-open-flow.md](session-tab-open-flow.md) — `openSessionInTab` helper chains `session.start` → `tabs.open` → `navigate`; always use the helper
- [resizable-side-panel-hook.md](resizable-side-panel-hook.md) — drag-to-resize + per-device persisted width via `useResizableWidth({ storageKey, defaultWidth, minWidth, maxWidth, side })` paired with `<ResizeHandle>`; one storage key per panel
- [hook-decomposition-setitems-callback.md](hook-decomposition-setitems-callback.md) — complex hooks (`useStreamedSend`, `useIngestion`) split into independent sub-hooks each owning one state slice + imperative API; parent's `setItems` passed in at call time to avoid stale-closure bugs

### Communication patterns
- [ipc-channel-convention.md](ipc-channel-convention.md) — `praxis.{domain}.{action}`; streaming adds `.start/.events.<id>/.cancel`
- [ipc-envelope-handler.md](ipc-envelope-handler.md) — mutating / validating / trust-boundary channels use `wrapEnvelope(channel, log, withSchema(zod, fn))`; clients peel with `unwrapEnvelope` and catch `IpcError` with `.code` + `.requestId`
- [server-resolved-student-id.md](server-resolved-student-id.md) — IPC handlers needing `studentId` resolve it via `getStudentId(services)`; the Zod schema declares no `studentId` field — never let the renderer pass it
- [per-domain-channel-module.md](per-domain-channel-module.md) — cohesive IPC domains live in `<domain>-channel.ts` exporting `registerXxxHandlers(services, …, log)`; `createIpcHelpers(log)` is the single seam for timing + redacted error logging
- [discriminated-union-dispatch.md](discriminated-union-dispatch.md) — `type` for events, `kind` for domain objects; `switch` for exhaustive dispatch
- [subscriber-fanout-stream.md](subscriber-fanout-stream.md) — service `subscribe(listener)` (sends `snapshot` first) → `*-channel.ts` fanout with AbortController hold-open → client `events()` → UI hook iterating `for await` and folding `event.kind` into a Map
- [streaming-ipc-channel-helpers.md](streaming-ipc-channel-helpers.md) — `registerSubscriberStream` (callback) and `registerGeneratorStream` (AsyncIterable) factories own all `.start`/`.events.<id>`/`.cancel` envelope/abort/redaction boilerplate; derive channel names from a single `channelBase`
- [notify-listeners-helper.md](notify-listeners-helper.md) — `notifyListeners(listeners, event, log, component)` in `services/db-helpers.ts` is the shared listener-loop with per-listener try/catch; services keep their own `Set` and snapshot semantics, but the fanout step is the helper

### Testing patterns
- [ui-test-helper.md](ui-test-helper.md) — `makeFakeClient(overrides?)` from `__tests__/helpers/`; `<PraxisClientProvider>` render wrapper; TanStack Router mock
- [temp-db-test-helper.md](temp-db-test-helper.md) — `useTempDb()` from `tests/helpers/db-setup.ts`; import via relative path
- [slow-test-gating.md](slow-test-gating.md) — `describe.skipIf(!process.env.PRAXIS_RUN_SLOW_TESTS)` for Pyodide integration tests
- [shared-test-fake-factories.md](shared-test-fake-factories.md) — port test doubles live in `tests/helpers/mocks.ts` as factory fns (`inMemorySecretStorage`, `noopLockService`, `recordingLogger`, `noopDocumentScopes`); new ports added to `ServiceDeps` get a factory here when 3+ tests will need it
- [electron-ipc-test-harness.md](electron-ipc-test-harness.md) — stub `electron` at the module boundary so `ipcMain.handle/on` capture handlers; import `registerIpcHandlers` *after* the mock; invoke `handlers.get("praxis.x.y")?.({}, ...args)` with a minimal fake `Services`
- [ipc-envelope-test-triad.md](ipc-envelope-test-triad.md) — each `handleEnvelope`-wrapped channel gets a per-`describe` block asserting four outcomes: `ok:true`, `VALIDATION_FAILED`, `INTERNAL` (never rejects), no host-path leakage in INTERNAL message
