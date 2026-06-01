---
id: epic-agent-debugging-harness-trace-correlation-types
kind: story
stage: done
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

- [x] `makeTurnId(sessionId, turnIndex)` is deterministic and tested.
- [x] `DebugTraceContext` includes `runId`, `sessionId`, optional `turnId`,
      `turnIndex`, `callId`, `parentCallId`, `streamId`, and
      `rendererEventId`.
- [x] `DebugTraceRegistry` records and queries trace records by core ids.
- [x] The registry evicts older records while preserving the newest bounded
      window.
- [x] `ServiceDeps.debugTrace` or equivalent optional injection compiles without
      broad test-fixture churn.

## Implementation notes

- Added `packages/core/src/types/debug-trace.ts` with the compact
  `DebugTraceContext`, trace record union, `DebugTraceRegistry` port, and
  deterministic `makeTurnId(sessionId, turnIndex)` helper.
- Added `DebugTraceRegistryImpl` under `packages/core/src/services/debug/` with
  count-bounded in-memory retention, timestamp injection, query helpers for
  `runId`, `sessionId`, and `turnId`, and `clear()` for tests.
- Exposed the shared types/helper from `@praxis/core/types`, the concrete
  registry from the services barrel, and optional `ServiceDeps.debugTrace`
  without wiring session turns, tools, IPC, or renderer behavior.

## Verification

- `pnpm vitest run packages/core/src/services/debug/__tests__/debug-trace-registry.test.ts`
- `pnpm --filter @praxis/core typecheck`
- `pnpm biome check packages/core/src/types/debug-trace.ts packages/core/src/types/index.ts packages/core/src/services/debug/debug-trace-registry.ts packages/core/src/services/debug/index.ts packages/core/src/services/debug/__tests__/debug-trace-registry.test.ts packages/core/src/services/types.ts packages/core/src/services/index.ts`

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fast-lane story review. Implementation record includes green focused
verification; host reran `pnpm vitest run
packages/core/src/services/debug/__tests__/debug-trace-registry.test.ts` and
`pnpm --filter @praxis/core typecheck`.
