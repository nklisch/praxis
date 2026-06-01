---
id: epic-agent-debugging-harness-trace-correlation-types
kind: story
stage: implementing
tags: []
parent: epic-agent-debugging-harness-trace-correlation
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Trace vocabulary and bounded registry

## Scope

Add the shared trace vocabulary and a bounded in-memory trace registry that
downstream trace-correlation slices can consume. This story is the contract
foundation; it should not wire session turns, tools, IPC, or renderer code yet.

## Implementation notes

- Add shared types and helpers under `packages/core/src/types/debug-trace.ts`
  and export them from `packages/core/src/types/index.ts`.
- Add a concrete registry in `packages/core/src/services/debug/` with bounded
  count-based retention and query helpers by `runId`, `sessionId`, and `turnId`.
- Add an optional registry dependency to `ServiceDeps` without requiring every
  test fixture to wire it.
- Use `type` for trace record variants because they are streamed/captured
  events.
- Keep retained records compact: identifiers, summaries, timestamps, durations,
  and artifact pointers only. Full payload capture belongs to failure replay.

## Acceptance criteria

- [ ] `makeTurnId(sessionId, turnIndex)` is deterministic and tested.
- [ ] `DebugTraceContext` includes `runId`, `sessionId`, optional `turnId`,
      `turnIndex`, `callId`, `parentCallId`, `streamId`, and
      `rendererEventId`.
- [ ] `DebugTraceRegistry` records and queries trace records by core ids.
- [ ] The registry evicts older records while preserving the newest bounded
      window.
- [ ] `ServiceDeps.debugTrace` or equivalent optional injection compiles without
      broad test-fixture churn.
