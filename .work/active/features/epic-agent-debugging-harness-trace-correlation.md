---
id: epic-agent-debugging-harness-trace-correlation
kind: feature
stage: review
tags: []
parent: epic-agent-debugging-harness
depends_on: [epic-agent-debugging-harness-tooling-research]
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-06-01
---

# Trace Correlation

## Brief

Define and implement the shared correlation layer that lets a debugging run connect session turns, engine events, tool dispatches, sub-agent steps, IPC stream messages, UI-visible render outcomes, logs, and persisted episodic rows. The implementation should extend existing structured logging and event-flow patterns rather than bypassing them, preserving local-first ownership, full-fidelity local debug capture, bounded retention, and explicit export/share boundaries.

This feature should produce the common trace identifiers and capture hooks needed by replay, failure bundles, and student simulation. It should cover the critical path through `SessionServiceImpl.send`, `EngineSessionManager`, engine adapters, `InProcessToolRegistry.dispatch`, `SubAgentRegistry`, streaming IPC helpers, and the chat render surfaces enough that a later report can explain "what happened" without reading raw logs manually.

This feature does not choose external observability tools; it consumes the decisions from `epic-agent-debugging-harness-tooling-research`. It also does not implement full replay or synthetic scenarios; it only makes those features observable and correlated.

## Epic context

- Parent epic: `epic-agent-debugging-harness`
- Position in epic: shared foundation feature - replay and simulation depend on its trace vocabulary and capture hooks.

## Foundation references

- `docs/ARCHITECTURE.md` - session data flow, engine adapter integration, transport layer, and sub-agent transparency.
- `docs/CONTRACT.md` - `EngineEvent`, `ToolRegistry`, `ToolDispatchMeta`, and sub-agent event contracts.
- `.agents/skills/patterns/async-generator-event-stream.md` - stream each event as it arrives.
- `.agents/skills/patterns/tool-dispatch-pipeline.md` - keep tool execution on the registry path.
- `.agents/skills/patterns/streaming-ipc-channel-helpers.md` - keep streamed IPC lifecycle centralized.

## Design checkpoint

No strategic question remains open for this feature. The user direction is to
make browser replay and simulation part of the epic because visual anomalies are
common, to keep local debug capture full-fidelity by default, and to treat
export/share sanitization as a later explicit path rather than a core
requirement.

## Architectural choice

### Option A: OpenTelemetry runtime spans

Add OpenTelemetry JS and model session turns, tool dispatches, sub-agent steps,
IPC streams, and renderer outcomes as spans. This provides standard vocabulary
and future export paths, but it adds dependency and propagation complexity before
Praxis has a stable local evidence schema.

### Option B: Logs only

Add pino child bindings to the existing logs and rely on grep plus line ordering
to reconstruct a failure. This is the smallest implementation, but it leaves
failure replay and simulation without a structured in-memory source to query.

### Option C: Praxis-native trace context and capture registry

Define a small trace vocabulary in `@praxis/core` shared types, thread it through
existing session/tool/IPC/renderer seams, and capture compact trace records into
a bounded local registry. Continue to emit structured pino summaries with the
same identifiers. Browser traces and evidence bundles consume this vocabulary
later.

**Chosen**: Option C. It fits the local-first evidence standard from
`epic-agent-debugging-harness-tooling-research`, avoids a DB migration and
hosted observability dependency, and gives replay/simulation a durable contract.

## Trace model

- `runId` is a debug-capture run id, not an alias for `sessionId`. In normal
  chat turns where no wider capture run exists, the session service creates a
  new `runId` for the turn. Later student-simulation and replay runners may
  provide one `runId` that spans multiple sessions, browser traces, and bundle
  artifacts.
- `turnId` is deterministic: `makeTurnId(sessionId, turnIndex)`. This lets
  agents correlate persisted episodic rows by existing `sessionId` and
  `turnIndex` without adding a column.
- The learner-facing `EngineEvent` stream does not gain debug-only marker
  events. Trace records are a side channel written by the session service,
  tool registry, sub-agent registry subscription, IPC stream helpers, and
  renderer outcome hooks.
- `callId` remains the tool-call correlation id and is already threaded through
  engine events, `ToolDispatchMeta`, `ToolContext.callId`, and sub-agent
  `parentCallId`.
- `streamId` must be globally collision-resistant within a desktop run before
  renderer replay depends on it. Replace the renderer module counter with a
  random id or a per-window random prefix plus monotonic suffix.
- `rendererEventId` identifies a renderer-observed outcome: event accepted,
  chat item rendered, tool result normalized, unmatched tool result, stream
  error, or component error.

## Implementation units

### Unit 1: Trace vocabulary and bounded registry

**Story**: `epic-agent-debugging-harness-trace-correlation-types`

Add shared trace types and helpers under `@praxis/core` types, plus a core
`DebugTraceRegistry` service implementation with bounded in-memory retention.

Expected files:

- `packages/core/src/types/debug-trace.ts`
- `packages/core/src/types/index.ts`
- `packages/core/src/services/debug/debug-trace-registry.ts`
- `packages/core/src/services/types.ts`
- focused tests near the new service/types

Contract sketch:

```ts
interface DebugTraceContext {
  runId: string;
  sessionId: string;
  turnId?: string;
  turnIndex?: number;
  callId?: string;
  parentCallId?: string;
  streamId?: string;
  rendererEventId?: string;
}

type DebugTraceRecord =
  | { type: "turn_start"; trace: DebugTraceContext; modeId: string; engineId: string }
  | { type: "engine_event"; trace: DebugTraceContext; eventType: string; eventId?: string }
  | { type: "tool_dispatch_start"; trace: DebugTraceContext; toolName: string }
  | { type: "tool_dispatch_end"; trace: DebugTraceContext; toolName: string; ok: boolean; durationMs: number }
  | { type: "subagent_event"; trace: DebugTraceContext; phase: string }
  | { type: "ipc_stream_event"; trace: DebugTraceContext; channel: string; eventType: string }
  | { type: "renderer_outcome"; trace: DebugTraceContext; surface: string; outcome: string };
```

Implementation notes:

- Keep the registry dependency direction clean: shared interfaces live in
  `@praxis/core/types`; the concrete registry lives in `@praxis/core/services`.
- Retention is bounded by count, not wall-clock time, for v1. Default to the
  last 200 turns or equivalent record window, with constructor overrides for
  tests.
- The registry stores summaries and identifiers, not an evidence bundle. Full
  payload capture and artifact serialization belong to failure replay.

Acceptance criteria:

- [ ] Shared trace types and helpers compile from `@praxis/core/types`.
- [ ] `makeTurnId(sessionId, turnIndex)` is deterministic and tested.
- [ ] A `DebugTraceRegistry` can record, query by `runId`/`sessionId`/`turnId`,
      and evict old records without losing the newest window.
- [ ] `ServiceDeps` exposes the registry as optional so existing tests and
      deployments remain source-compatible.

### Unit 2: Session, engine, and tool dispatch correlation

**Story**: `epic-agent-debugging-harness-trace-correlation-session-tools`

Generate trace context at turn start, record engine-event summaries as events
are appended, and pass trace context through engine adapters to
`InProcessToolRegistry.dispatch`.

Expected files:

- `packages/core/src/services/session-service.ts`
- `packages/core/src/services/session/session-promoter.ts`
- `packages/core/src/services/session/engine-session-manager.ts`
- `packages/core/src/types/engine.ts`
- `packages/core/src/types/tool.ts`
- `packages/tools/src/registry.ts`
- `packages/engines/src/direct/tool-conversion.ts`
- `packages/engines/src/mcp/tool-bridge.ts`
- `packages/engines/src/mcp/types.ts`
- `packages/engines/src/common/trace-threader.ts`
- `packages/engines/src/{claude-code,codex,direct}/adapter.ts`
- focused session, registry, and engine-adapter tests

Implementation notes:

- Extend `EngineSession.send(...)` with an optional `DebugTraceContext` argument
  instead of changing `EngineEvent`.
- Extend `ToolDispatchMeta` and the concrete tools `DispatchMeta` with optional
  `trace`. `InProcessToolRegistry` should merge `{ ...trace, callId }` into the
  per-call tool context and into dispatch log fields.
- Add `ToolContext.debugTrace?: DebugTraceContext` so tools that need to spawn
  trace-aware work can do so without parsing logs.
- Add an optional trace sink/registry to the tool registry options, supplied by
  `EngineSessionManager` from `ServiceDeps`.
- Session service logs and registry records should include `runId`, `turnId`,
  `sessionId`, `turnIndex`, event summary, `callId` where present, and the
  episodic event id returned by `appendEpisodic`.
- Promoted lazy sessions should record the first user-message event id so a
  debugging report can correlate the persisted row for turn 0.

Acceptance criteria:

- [ ] A normal send creates one `runId` and deterministic `turnId`, records a
      `turn_start`, and passes the trace into the engine session.
- [ ] Tool dispatch start/ok/error logs include `runId`, `turnId`, `sessionId`,
      and `callId` when available.
- [ ] `ToolContext.callId`, `ToolContext.signal`, and `ToolContext.debugTrace`
      coexist without mutating the registry's base context.
- [ ] Session-event trace records include the episodic event id for appended
      engine events.
- [ ] Tests cover a tool failure before sub-agent start, proving the registry
      records the tool error and no matching sub-agent event.

### Unit 3: IPC stream and sub-agent timeline correlation

**Story**: `epic-agent-debugging-harness-trace-correlation-ipc-subagent`

Add trace-aware stream summaries and sub-agent subscription capture without
duplicating `SubAgentRegistry` state.

Expected files:

- `packages/desktop/electron/main/stream-handler.ts`
- `packages/desktop/electron/main/session-channel.ts`
- `packages/desktop/electron/main/subagent-channel.ts`
- `packages/client/src/transport/ipc.ts`
- `packages/core/src/services/debug/debug-trace-registry.ts`
- existing IPC/sub-agent tests

Implementation notes:

- Replace the renderer stream counter with a collision-resistant stream id.
  `crypto.randomUUID()` is acceptable if available in the runtime; otherwise
  use a per-window random prefix plus monotonic suffix.
- Extend the stream helper with optional `traceBindings(args)` and
  `summarizeEvent(event)` hooks so channel registrations can add `sessionId`,
  `parentCallId`, and event summaries without hand-rolling stream loops.
- `session-channel` should bind session send streams to `sessionId` and capture
  `EngineEvent` summaries with event type and `callId` where available.
- `subagent-channel` should bind subscriptions to `parentCallId` and capture
  sub-agent event summaries. The trace registry should subscribe to
  `SubAgentRegistry` events rather than maintaining a second sub-agent model.

Acceptance criteria:

- [ ] IPC stream logs/trace records include `streamId`, channel name, event
      count, and available `sessionId` or `parentCallId`.
- [ ] Renderer-generated stream ids do not collide after reload-like client
      reinitialization in tests.
- [ ] Sub-agent trace records are derived from `SubAgentRegistry` events and
      preserve `parentCallId` and step `callId`.
- [ ] Existing stream cancellation behavior remains unchanged.

### Unit 4: Renderer-visible outcomes and browser replay handoff

**Story**: `epic-agent-debugging-harness-trace-correlation-renderer-outcomes`

Record renderer outcomes for chat/tool/sub-agent surfaces and leave a concrete
handoff for browser replay and student simulation.

Expected files:

- `packages/client/src/client.ts`
- `packages/client/src/transport/types.ts`
- `packages/client/src/transport/ipc.ts`
- `packages/client/src/services/log-client.ts` or equivalent
- `packages/ui/src/hooks/use-streamed-send.ts`
- `packages/ui/src/components/message.tsx`
- `packages/ui/src/components/tool-call-entry.tsx`
- UI/client tests around streamed send and renderer logging

Implementation notes:

- Add a narrow client log/debug sink over the existing desktop
  `praxis.log.record` IPC channel. It should be best-effort and non-blocking.
- Generate `rendererEventId` values when `useStreamedSend` accepts events and
  when it records important outcomes: rendered model message, rendered tool
  call, rendered tool result, unmatched tool result, stream error, and final
  completion.
- Normalization failures like "Objects are not valid as a React child" should
  produce a record with `surface`, `sessionId`, available `callId`, component
  name, and error summary.
- Do not add Playwright in this story. The handoff should document the trace
  identifiers that failure replay and student simulation must pass into browser
  tests and trace artifacts.

Acceptance criteria:

- [ ] Renderer outcome records are emitted through a best-effort client sink
      without blocking chat rendering.
- [ ] Streamed-send tests prove model/tool/error/final events generate stable
      `rendererEventId` records tied to `sessionId` and `callId` where present.
- [ ] UI rendering still guards unknown object-shaped content instead of
      sending raw objects into React children.
- [ ] The story body records the browser replay handoff: expected `runId`,
      `sessionId`, `turnId`, `streamId`, `rendererEventId`, and artifact path
      fields.

## Other agent review

A peer design pass confirmed that the existing `callId` path is already strong:
`EngineEvent.tool_call.callId` reaches `ToolDispatchMeta.callId`,
`ToolContext.callId`, `SubAgentRegistry.start({ parentCallId })`, and
sub-agent step `callId`s. It also flagged three constraints that this design
adopts:

- Define `runId` as a separate debug-run identifier so later student simulation
  can group multiple turns and sessions.
- Keep trace vocabulary in `@praxis/core/types` to avoid dependency-direction
  pressure.
- Fix renderer `streamId` collisions before treating browser-side outcomes as
  replay-grade evidence.

The peer suggested a possible synthetic `turn_start` `EngineEvent`; this design
rejects that path for v1 because debug-only markers should not flow through the
learner-facing stream. The bounded trace registry records turn starts as a side
channel instead.

## Implementation summary

All child stories are implemented and reviewed:

- `epic-agent-debugging-harness-trace-correlation-types`: done. Added shared
  debug trace types, deterministic `makeTurnId(...)`, and bounded
  `DebugTraceRegistryImpl`.
- `epic-agent-debugging-harness-trace-correlation-session-tools`: done. Threaded
  per-turn trace context through session service, engine adapters, MCP/Vercel
  tool dispatch, tool context, and compact event/dispatch trace records.
- `epic-agent-debugging-harness-trace-correlation-ipc-subagent`: done. Added
  collision-resistant stream ids, trace-aware IPC lifecycle summaries, session
  and sub-agent stream bindings, and desktop composition for a shared trace
  registry.
- `epic-agent-debugging-harness-trace-correlation-renderer-outcomes`: done. Added
  best-effort renderer outcome logging through `PraxisClient.log.record(...)`,
  guarded streamed content before React rendering, and documented browser replay
  handoff fields.

Host verification reran the focused tests and typechecks recorded in each child
story. Cross-cutting deviations: no learner-facing `EngineEvent` debug markers,
no DB migration, no OpenTelemetry runtime dependency, and no Playwright/browser
runner in this feature.
