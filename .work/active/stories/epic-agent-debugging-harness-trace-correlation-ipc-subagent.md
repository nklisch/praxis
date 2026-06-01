---
id: epic-agent-debugging-harness-trace-correlation-ipc-subagent
kind: story
stage: implementing
tags: []
parent: epic-agent-debugging-harness-trace-correlation
depends_on: [epic-agent-debugging-harness-trace-correlation-session-tools]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# IPC stream and sub-agent timeline correlation

## Scope

Make streamed IPC lifecycle evidence trace-aware and capture sub-agent timeline
summaries from the existing `SubAgentRegistry` path.

## Implementation notes

- Replace renderer stream ids based on a module counter with collision-resistant
  ids so reload-like client reinitialization cannot reuse `stream-1`.
- Extend the centralized stream handler with optional trace binding and event
  summary hooks.
- Bind session send streams to `sessionId` and sub-agent streams to
  `parentCallId`.
- Capture stream start/event/done/error/cancel summaries without changing
  cancellation semantics.
- Subscribe to `SubAgentRegistry` events for trace records; do not create a
  second source of truth for sub-agent state.

## Acceptance criteria

- [ ] IPC stream logs and trace records include `streamId`, channel name,
      event count, and available `sessionId` or `parentCallId`.
- [ ] Tests cover stream id uniqueness across client reinitialization.
- [ ] Sub-agent trace records preserve `parentCallId`, phase/status, and step
      `callId` where present.
- [ ] Existing session and sub-agent stream tests continue to cover
      cancellation and teardown.
