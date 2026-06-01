---
id: epic-agent-debugging-harness-failure-replay-runner
kind: story
stage: implementing
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

- [ ] Replay engine supports multi-turn event maps and fails fast on missing
      turns.
- [ ] Replay runner restores a bundle into a temp DB and calls
      `SessionServiceImpl.send(...)` without live model calls.
- [ ] End-to-end replay fixture covers a tool failure before sub-agent start
      and preserves the expected missing sub-agent evidence.
- [ ] Replay output includes yielded events, trace records, and replay
      limitations.
- [ ] Missing artifacts produce explicit replay errors.
