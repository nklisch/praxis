---
id: epic-agent-debugging-harness-trace-correlation-renderer-outcomes
kind: story
stage: implementing
tags: []
parent: epic-agent-debugging-harness-trace-correlation
depends_on: [epic-agent-debugging-harness-trace-correlation-ipc-subagent]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Renderer-visible outcomes and browser replay handoff

## Scope

Record renderer-observed outcomes for streamed chat/tool/sub-agent events and
document the trace identifiers that browser replay and student simulation must
carry into later Playwright artifacts.

## Implementation notes

- Add a narrow best-effort client log/debug sink over the existing
  `praxis.log.record` IPC channel.
- Generate `rendererEventId` values in `useStreamedSend` for accepted events,
  rendered chat items, rendered tool calls/results, unmatched tool results,
  stream errors, and final completion.
- Renderer outcome records should include surface/component name, `sessionId`,
  available `callId`, available `streamId`, error summary, and outcome.
- Keep rendering non-blocking; the debug sink must not delay chat UI updates.
- Do not add Playwright in this story. Browser replay and student simulation
  consume the identifiers and add browser traces in their own features.

## Acceptance criteria

- [ ] Renderer outcome records are emitted through a best-effort client sink
      without blocking streamed chat rendering.
- [ ] `useStreamedSend` tests prove model/tool/error/final events create stable
      `rendererEventId` records tied to `sessionId` and `callId` where present.
- [ ] Object-shaped tool/model content is normalized or guarded before reaching
      React children.
- [ ] The implementation notes record the browser replay handoff fields:
      `runId`, `sessionId`, `turnId`, `streamId`, `rendererEventId`, and
      artifact path.
