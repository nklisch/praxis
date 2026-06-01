---
id: epic-agent-debugging-harness-failure-replay-capture-slices
kind: story
stage: done
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

- [x] Capturing by `sessionId` writes matching trace records when present and
      full `EngineEvent` payloads from `episodic_events.event_json`.
- [x] Capturing by `callId` includes matching tool dispatch records and the
      surrounding session/turn event slice.
- [x] Missing trace or log evidence is recorded in the manifest instead of
      failing capture.
- [x] Renderer outcomes are written with `sessionId`, `callId`, and
      `rendererEventId` where available.
- [x] Existing test fixtures are not forced to wire the capture service.

## Implementation Notes

- Added `DebugBundleCaptureInput`, `DebugBundleCaptureResult`, and
  `DebugBundleCaptureService` shared contracts.
- Added `DebugBundleCaptureServiceImpl`, which captures matching live
  `DebugTraceRegistry` records, full episodic `EngineEvent` payloads, split
  trace-derived slices, and optional matching JSONL log records into a local
  debug bundle.
- Capture supports `runId`, `turnId`, `callId`, and `sessionId` entry points.
  `callId` capture widens to the containing turn so the bundle includes the
  surrounding transcript slice, not just the single tool event.
- Missing trace, renderer, IPC, sub-agent, tool-dispatch, session-event, or log
  evidence is represented as `evidence_missing` in the manifest instead of
  failing capture.
- Added `JsonlDebugLogReader` as an optional pino JSONL reader. `ServiceDeps`
  exposes the capture service as optional `debugBundles`, so existing fixtures
  are not forced to provide it.

## Verification

- `pnpm vitest run packages/core/src/services/debug/__tests__/debug-bundle-capture-service.test.ts packages/core/src/services/debug/__tests__/debug-bundle-writer.test.ts packages/core/src/services/debug/__tests__/debug-trace-registry.test.ts`
- `pnpm --filter @praxis/core typecheck`
- `pnpm exec biome check packages/core/src/types/debug-bundle.ts packages/core/src/services/debug/debug-log-reader.ts packages/core/src/services/debug/debug-bundle-capture-service.ts packages/core/src/services/debug/index.ts packages/core/src/services/index.ts packages/core/src/services/types.ts packages/core/src/services/debug/__tests__/debug-bundle-capture-service.test.ts`
- `git diff --check`

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fast-lane story review. Implementation notes include green focused
tests, core typecheck, focused Biome, and whitespace checks; item advanced to
`stage: done`.
