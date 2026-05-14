---
id: feature-mutating-ipc-channels-envelope-migration-step-4-memory
kind: story
stage: done
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-3-artifacts]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.memory.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe.

## Channels in scope
- `praxis.memory.studentModel` (no-payload getter)
- `praxis.memory.misconceptions` (no-payload getter)
- `praxis.memory.procedural` (no-payload getter)
- `praxis.memory.affective` (no-payload getter)
- `praxis.memory.export` (no-payload — returns blob)
- `praxis.memory.delete` (no-payload — destructive)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~372-419)
- `packages/client/src/services/memory-client.ts`
- `packages/desktop/electron/main/__tests__/memory-channel-envelope.test.ts` (new)

## Acceptance
- All 6 channels wrapped (all no-payload — use `wrapEnvelope`).
- Client methods unwrap.
- Integration test asserts envelope-on-success and envelope-on-throw for at least one getter and the `delete` mutation.
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Low — memory is read-mostly; `delete` is destructive but rarely invoked.
- **Rollback**: revert the commit.

## Review

**Verdict: Approved — advance to done.**

**Correctness**

All 6 `praxis.memory.*` invoke channels are wrapped with `wrapEnvelope` as required. Map-serialization logic (`conceptMastery` entries array in `studentModel` and `export`, `strategies` entries array in `procedural`) is preserved verbatim inside each wrapper — no behavior change, only wrapping. The `delete` channel correctly wraps the void-returning call.

Client-side: all 6 methods unwrap with `unwrapEnvelope`. The dual-type union `IpcEnvelope<T> | T` is used on every `transport.invoke` call, matching the step-3 pattern for backward compatibility during rollout. The `delete` client still passes `opts` to `invoke` (unchanged from before); the server ignores client-supplied opts and reads `confirm: true` from its own call site — no functional regression.

**Test quality**

16 tests, all passing. Coverage by channel:

- `studentModel`: success (Map serialized correctly), INTERNAL-on-throw, path-leakage redaction
- `misconceptions`: success-empty, success-with-data, INTERNAL-on-throw
- `procedural`: success (Map serialized correctly), INTERNAL-on-throw
- `affective`: success-with-data, INTERNAL-on-throw
- `export`: success (nested Maps), INTERNAL-on-throw, path-leakage redaction
- `delete`: success (void), INTERNAL-on-throw, path-leakage redaction

The file header comment says "12" tests but 16 exist and run — the comment is stale (it was written before the extra misconceptions positive-data test and the path-leakage tests for `export` and `delete` were added). Nit only; actual count matches the commit message and runner output.

The electron-ipc-test-harness pattern is followed correctly: `vi.mock("electron")` before the import, `registerIpcHandlers` imported after, handlers invoked directly from the captured `Map`.

**Typecheck**

`pnpm --filter @praxis/desktop typecheck` exits cleanly. The pre-existing `log-channel.test.ts` typecheck issue noted by the implementer is not present on this branch.

**Tests run**

- `electron/main/__tests__/memory-channel-envelope.test.ts`: 16/16 passed
- `@praxis/desktop` full suite: 222/222 passed
- `@praxis/client` full suite: 62/62 passed

No blockers. One nit (stale comment count) does not warrant a block.
