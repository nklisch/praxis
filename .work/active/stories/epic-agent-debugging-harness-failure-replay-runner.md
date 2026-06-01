---
id: epic-agent-debugging-harness-failure-replay-runner
kind: story
stage: review
tags: []
parent: epic-agent-debugging-harness-failure-replay
depends_on: [epic-agent-debugging-harness-failure-replay-db-snapshot]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Deterministic replay engine and runner

## Scope

Load a bundle, restore its focused DB snapshot into a temp DB, and replay the
recorded turn through `SessionServiceImpl` with a deterministic replay engine.

## Files

- `tests/helpers/replay-engine.ts`
- `tests/helpers/replay-runner.ts`
- `tests/failure-replay-end-to-end.test.ts`
- `packages/core/src/services/debug/debug-bundle-loader.ts`
- `packages/core/src/services/debug/__tests__/debug-bundle-loader.test.ts`

## Acceptance criteria

- [x] Replay engine supports multi-turn event maps and fails fast on missing
      turns.
- [x] Replay runner restores a bundle into a temp DB and calls
      `SessionServiceImpl.send(...)` without live model calls.
- [x] End-to-end replay fixture covers a tool failure before sub-agent start
      and preserves the expected missing sub-agent evidence.
- [x] Replay output includes yielded events, trace records, and replay
      limitations.
- [x] Missing artifacts produce explicit replay errors.

## Implementation Notes

- Added `loadDebugBundle(...)` and `DebugBundleLoadError` for manifest loading
  and explicit required-artifact failures.
- Added `ReplayEngine`, a deterministic test/debug engine that maps
  `trace.turnIndex` to recorded engine events and fails fast on missing turns or
  user-message mismatches.
- Added `replayDebugBundle(...)`, which loads a bundle, restores
  `db-snapshot.json` into a migrated temp DB, trims the replayed turn from
  restored episodic rows, and calls `SessionServiceImpl.send(...)` with
  `ReplayEngine`.
- Replay output includes the manifest, replayed turn, yielded events, fresh
  debug trace records, replay-written episodic rows, and explicit limitations.
- Added an end-to-end replay fixture for a course-create tool failure before
  sub-agent start, including the expected missing sub-agent evidence.

## Verification

- `pnpm vitest run packages/core/src/services/debug/__tests__/debug-bundle-loader.test.ts tests/failure-replay-end-to-end.test.ts packages/core/src/services/debug/__tests__/debug-db-snapshot.test.ts packages/core/src/services/debug/__tests__/debug-bundle-capture-service.test.ts packages/core/src/services/debug/__tests__/debug-bundle-writer.test.ts`
- `pnpm typecheck`
- `pnpm exec biome check packages/core/src/services/debug/debug-bundle-loader.ts packages/core/src/services/debug/index.ts packages/core/src/services/index.ts packages/core/src/services/debug/__tests__/debug-bundle-loader.test.ts tests/helpers/replay-engine.ts tests/helpers/replay-runner.ts tests/failure-replay-end-to-end.test.ts`
- `git diff --check`
