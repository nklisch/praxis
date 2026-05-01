# Praxis Code Patterns

Detailed examples for each pattern are in `.claude/skills/patterns/{slug}.md`. Read the full file when implementing or reviewing code in that area.

## Core engine patterns (read when building engines, tools, or sessions)
- **async-generator-event-stream**: Every agent turn yields `EngineEvent` via `async function*`; persist and forward each event as it arrives — never buffer → [async-generator-event-stream.md]
- **engine-session-lifecycle**: `Engine.open(opts)` → `EngineSession`; `send(msg)` reuses the live SDK conversation; `close()` in `finally`; seed with `priorTurns` only on engine swap/restart → [engine-session-lifecycle.md]
- **sdk-event-mapping**: Each adapter has a `map*Event(sdkEvent, ctx)` in its `events.ts` that returns `EngineEvent | null`; Codex returns `EngineEvent[]` (one SDK event can produce multiple) → [sdk-event-mapping.md]
- **tool-dispatch-pipeline**: Model call → adapter maps to `registry.dispatch(name, args)` → Zod validation → `handler(parsed.data, ToolContext)` → `ToolResult`; all adapters share the same dispatch path → [tool-dispatch-pipeline.md]
- **episodic-append-ordering**: Within a turn: `recordUserMessage` → yield `user_message` → `for await engine events` → `appendEpisodic` immediately per event → yield event; write-failure is non-fatal → [episodic-append-ordering.md]

## Configuration and data patterns
- **config-kv-store**: `config_kv` table stores app-wide key/value config as JSON; read merges stored + defaults + env overrides; write via `onConflictDoUpdate` → [config-kv-store.md]
- **mode-tool-scoping**: `mode.toolNames` filters `ServiceDeps.toolDefinitions` in `SessionServiceImpl.openActive`; `toolNames === []` means all tools (backward compat); always keep `toolNames` and prompt fragment in sync → [mode-tool-scoping.md]
- **service-deps-injection**: `ServiceDeps` is the single DI container; `engineFactory?: fn` is the test injection seam for `FakeEngine`; `toolServices: { sympy, sandbox }` populated in `buildServices` → [service-deps-injection.md]
- **load-or-throw**: After `.insert/update/delete().run()`, call `loadOrThrow(() => this.get(...), { entity, op, id, log })` to round-trip — never inline the if-null-throw; uniform error format `"<entity> not found after <op>: <id>"` → [load-or-throw.md]

## UI patterns
- **use-resource-hook**: `useResource(loader)` returns `{ data, loading, error, refresh, setData }`; loads on mount via useEffect; layer mutations on top using `setData` for optimistic updates and `refresh` for full re-fetches; never inline the `setLoading/try/catch/finally` block → [use-resource-hook.md]

## Communication patterns
- **ipc-channel-convention**: Channels follow `praxis.{domain}.{action}`; streaming splits into `.start` (invoke) / `.events.<streamId>` (push) / `.cancel` (signal); subscribe before invoking to avoid race → [ipc-channel-convention.md]
- **discriminated-union-dispatch**: Use `type` for streamed events (`EngineEvent`), `kind` for stored/transmitted domain objects (tool inputs, artifact variants); `switch` for exhaustive dispatch; `z.discriminatedUnion("kind", [...])` for Zod schemas → [discriminated-union-dispatch.md]

## Testing patterns
- **temp-db-test-helper**: `useTempDb(opts?)` from `tests/helpers/db-setup.ts` sets up per-test isolated SQLite + migrations; from per-package tests import via `../../../../tests/helpers/db-setup.js` → [temp-db-test-helper.md]
- **slow-test-gating**: Pyodide integration tests use `describe.skipIf(!process.env.PRAXIS_RUN_SLOW_TESTS)` with `{ timeout: 120_000 }`; fast unit tests mock the runtime → [slow-test-gating.md]
