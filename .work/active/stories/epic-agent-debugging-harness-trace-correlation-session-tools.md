---
id: epic-agent-debugging-harness-trace-correlation-session-tools
kind: story
stage: review
tags: []
parent: epic-agent-debugging-harness-trace-correlation
depends_on: [epic-agent-debugging-harness-trace-correlation-types]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Session, engine, and tool dispatch correlation

## Scope

Generate trace context for each session turn, record compact engine-event
summaries as events are appended, and pass the trace context through engine
adapters into tool dispatch and tool context.

## Implementation notes

- Generate a `runId` per normal send and deterministic `turnId` from
  `sessionId` plus `turnIndex`.
- Extend the engine session send contract with optional trace context rather
  than adding debug-only marker events to `EngineEvent`.
- Extend `ToolDispatchMeta`, the tools package `DispatchMeta`, and
  `ToolContext` with optional debug trace context.
- Pass an optional trace registry/sink from `EngineSessionManager` into
  `InProcessToolRegistry`.
- Log and record dispatch start/ok/error with `runId`, `turnId`, `sessionId`,
  `callId`, tool name, duration, and serialized error summary.
- Preserve existing abort-signal threading and sub-agent parent-call behavior.

## Acceptance criteria

- [x] A normal turn records `turn_start` with `runId`, `sessionId`, `turnIndex`,
      `turnId`, mode id, and engine id.
- [x] Session event trace records include event type, `callId` where present,
      and the episodic event id returned by `appendEpisodic`.
- [x] Tool dispatch logs and trace records include `runId`, `turnId`,
      `sessionId`, and `callId` when available.
- [x] `ToolContext.callId`, `ToolContext.signal`, and
      `ToolContext.debugTrace` coexist in the per-call copied context.
- [x] A tool failure before sub-agent start is distinguishable from a sub-agent
      failure in tests.

## Implementation notes

- Extended `EngineSession.send` with optional `DebugTraceContext` and added
  `trace` to tool dispatch metadata while keeping learner-facing `EngineEvent`
  unchanged.
- `SessionServiceImpl.send` now creates one `runId` per normal turn,
  deterministic `turnId` via `makeTurnId(sessionId, turnIndex)`, records
  `turn_start`, records compact event summaries only after successful episodic
  append, and passes trace into the active engine session.
- `InProcessToolRegistry` now receives the optional debug trace registry,
  records dispatch start/end records for success, not found, invalid args, and
  thrown handlers, and logs trace fields with dispatch start/ok/error.
- Tool context remains per-call copied: `callId`, `signal`, and `debugTrace`
  are merged without mutating the registry base context.
- Added `TraceThreader` beside `SignalThreader` and threaded the current turn
  trace through Claude Code, Codex, and Direct adapters into MCP/Vercel tool
  dispatch.

## Verification

- `pnpm rebuild better-sqlite3` (required because the local binding was built
  for Node module 145 while this shell runs Node 24 / module 137)
- `pnpm --filter @praxis/core build`
- `pnpm vitest run packages/tools/src/__tests__/registry.test.ts packages/core/src/services/__tests__/session-service.debug-trace.test.ts`
- `pnpm vitest run packages/engines/src/__tests__/direct.test.ts packages/engines/src/__tests__/tool-bridge.test.ts`
- `pnpm --filter @praxis/core typecheck`
- `pnpm --filter @praxis/tools typecheck`
- `pnpm --filter @praxis/engines typecheck`
- `pnpm biome check packages/core/src/types/engine.ts packages/core/src/types/tool.ts packages/core/src/services/session-service.ts packages/core/src/services/session/session-promoter.ts packages/core/src/services/session/engine-session-manager.ts packages/tools/src/registry.ts packages/tools/src/__tests__/registry.test.ts packages/engines/src/common/trace-threader.ts packages/engines/src/direct/adapter.ts packages/engines/src/direct/tool-conversion.ts packages/engines/src/mcp/types.ts packages/engines/src/mcp/tool-bridge.ts packages/engines/src/claude-code/adapter.ts packages/engines/src/codex/adapter.ts packages/engines/src/__tests__/direct.test.ts packages/engines/src/__tests__/tool-bridge.test.ts packages/core/src/services/__tests__/session-service.debug-trace.test.ts`
