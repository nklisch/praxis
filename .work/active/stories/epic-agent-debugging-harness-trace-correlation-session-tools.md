---
id: epic-agent-debugging-harness-trace-correlation-session-tools
kind: story
stage: implementing
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

- [ ] A normal turn records `turn_start` with `runId`, `sessionId`, `turnIndex`,
      `turnId`, mode id, and engine id.
- [ ] Session event trace records include event type, `callId` where present,
      and the episodic event id returned by `appendEpisodic`.
- [ ] Tool dispatch logs and trace records include `runId`, `turnId`,
      `sessionId`, and `callId` when available.
- [ ] `ToolContext.callId`, `ToolContext.signal`, and
      `ToolContext.debugTrace` coexist in the per-call copied context.
- [ ] A tool failure before sub-agent start is distinguishable from a sub-agent
      failure in tests.
