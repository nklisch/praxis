---
name: patterns
description: "Praxis project code patterns. Auto-loads when implementing, designing, or reviewing
  code. Provides structural patterns with concrete file:line examples — engine session lifecycle,
  event streaming, tool dispatch, episodic ordering, IPC channels, test helpers, and more."
user-invocable: false
allowed-tools: Read, Glob, Grep
---

# Praxis Code Patterns Reference

Structural patterns for the Praxis AI tutoring framework (4 phases shipped). Read individual pattern files for full details, implementation notes, and common violations. The dense index is in `.claude/rules/patterns.md`.

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

### Communication patterns
- [ipc-channel-convention.md](ipc-channel-convention.md) — `praxis.{domain}.{action}`; streaming adds `.start/.events.<id>/.cancel`
- [discriminated-union-dispatch.md](discriminated-union-dispatch.md) — `type` for events, `kind` for domain objects; `switch` for exhaustive dispatch

### Testing patterns
- [temp-db-test-helper.md](temp-db-test-helper.md) — `useTempDb()` from `tests/helpers/db-setup.ts`; import via relative path
- [slow-test-gating.md](slow-test-gating.md) — `describe.skipIf(!process.env.PRAXIS_RUN_SLOW_TESTS)` for Pyodide integration tests
