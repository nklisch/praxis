---
id: epic-agent-debugging-harness-failure-replay-capture-slices
kind: story
stage: implementing
tags: []
parent: epic-agent-debugging-harness-failure-replay
depends_on: [epic-agent-debugging-harness-failure-replay-bundle-types]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Trace and episodic capture service

## Scope

Build the capture service that writes trace, episodic, tool, sub-agent, IPC,
renderer, and optional log evidence slices into a local debug bundle.

## Files

- `packages/core/src/services/debug/debug-bundle-capture-service.ts`
- `packages/core/src/services/debug/debug-log-reader.ts`
- `packages/core/src/services/debug/index.ts`
- `packages/core/src/services/index.ts`
- `packages/core/src/services/types.ts`
- `packages/core/src/services/debug/__tests__/debug-bundle-capture-service.test.ts`

## Acceptance criteria

- [ ] Capturing by `sessionId` writes matching trace records when present and
      full `EngineEvent` payloads from `episodic_events.event_json`.
- [ ] Capturing by `callId` includes matching tool dispatch records and the
      surrounding session/turn event slice.
- [ ] Missing trace or log evidence is recorded in the manifest instead of
      failing capture.
- [ ] Renderer outcomes are written with `sessionId`, `callId`, and
      `rendererEventId` where available.
- [ ] Existing test fixtures are not forced to wire the capture service.
