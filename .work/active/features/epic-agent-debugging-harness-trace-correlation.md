---
id: epic-agent-debugging-harness-trace-correlation
kind: feature
stage: drafting
tags: []
parent: epic-agent-debugging-harness
depends_on: [epic-agent-debugging-harness-tooling-research]
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-05-31
---

# Trace Correlation

## Brief

Define and implement the shared correlation layer that lets a debugging run connect session turns, engine events, tool dispatches, sub-agent steps, IPC stream messages, UI-visible render outcomes, logs, and persisted episodic rows. The implementation should extend existing structured logging and event-flow patterns rather than bypassing them, preserving redaction and local-first defaults.

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
