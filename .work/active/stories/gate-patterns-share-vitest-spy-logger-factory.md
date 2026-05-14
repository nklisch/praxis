---
id: gate-patterns-share-vitest-spy-logger-factory
kind: story
stage: done
tags: [refactor, testing]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: patterns
created: 2026-05-14
updated: 2026-05-14
---

# Factor the per-test Vitest spy `Logger` fake into `tests/helpers/mocks.ts`

## Existing pattern
`shared-test-fake-factories` — port test doubles live as factory
functions in `tests/helpers/mocks.ts`; new ports added to `ServiceDeps`
warrant a fake here when 3+ tests will need it.

## Nature of divergence

The `Logger` fake is reproduced verbatim in 4+ test files:

- `packages/desktop/electron/main/__tests__/ipc-server.first-run-update.test.ts:39`
- `packages/desktop/electron/main/__tests__/ipc-server.cancel.test.ts:46`
- `packages/desktop/electron/main/__tests__/ipc-server.author.lock.test.ts:44`
- `packages/desktop/electron/main/__tests__/log-channel.test.ts:23`

Each inlines a literal:

```typescript
function makeFakeLogger(): Logger {
  return {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: () => makeFakeLogger(),
    ingestRendererRecord: vi.fn(),
    shutdown: vi.fn(),
  };
}
```

`noopLogger` and `recordingLogger` already exist in `mocks.ts` — but
neither exposes `vi.fn()` spies these tests want for assertions like
`expect(logger.warn).toHaveBeenCalledWith(...)`. A third factory
`makeSpyLogger()` is the right addition.

## Suggested approach

1. Add `makeSpyLogger(): Logger & { _spies: { debug; info; warn; error; ingestRendererRecord; shutdown } }` to `tests/helpers/mocks.ts`, exposing the spies under `_spies` so they're accessible without leaking the spy type onto the Logger interface.
2. Replace the inlined `makeFakeLogger()` in the four call sites with `import { makeSpyLogger } from "../../../../tests/helpers/mocks.js"`.
3. Update assertions to read from `logger._spies.warn` etc.

## Acceptance

- `makeSpyLogger` exported from `tests/helpers/mocks.ts`.
- The four IPC channel test files use it instead of inlined literals.
- Test assertions on spy calls pass unchanged.

## Implementation

Added `makeSpyLogger()` to `tests/helpers/mocks.ts` as a factory that returns a `Logger & { ingestRendererRecord; shutdown; _spies: { debug, info, warn, error, ingestRendererRecord, shutdown } }`. The extra methods (`ingestRendererRecord`, `shutdown`) are exposed directly on the returned object (not only under `_spies`) so the spy logger satisfies the `MainLogger` superset used in desktop package code like `registerLogChannel`. Spies are aliased from `_spies` to the top-level methods so both `log.debug` and `log._spies.debug` reference the same `vi.fn()` instance.

Updated 4 call sites:
- `packages/desktop/electron/main/__tests__/ipc-server.first-run-update.test.ts` — replaced inlined `makeFakeLogger` + 6 `makeFakeLogger()` calls with `makeSpyLogger()`
- `packages/desktop/electron/main/__tests__/ipc-server.cancel.test.ts` — replaced inlined `makeFakeLogger` + 3 `makeSpyLogger()` calls
- `packages/desktop/electron/main/__tests__/ipc-server.author.lock.test.ts` — replaced inlined `makeFakeLogger` + 6 `makeSpyLogger()` calls
- `packages/desktop/electron/main/__tests__/log-channel.test.ts` — replaced custom capturing `makeFakeLogger` with `makeSpyLogger()`; assertions updated from manual `captured[]`/`debugCalls[]` arrays to `log._spies.ingestRendererRecord.mock.calls` / `log._spies.debug.mock.calls` and `toHaveBeenCalled*` matchers; module-level state removed

All 27 tests pass; `pnpm --filter @praxis/desktop typecheck` passes clean.

## Review

**Verdict: Approved — advance to done.**

### Typecheck (flagged concern resolved)

The step-4 reviewer's concern about a pre-existing typecheck failure in `log-channel.test.ts` does not apply. `pnpm --filter @praxis/desktop typecheck` exits cleanly with zero errors or warnings. The typecheck failure was not introduced by this story and does not exist in the current tree.

### Correctness

- `makeSpyLogger()` in `tests/helpers/mocks.ts` correctly constructs a single `spies` object and aliases each entry to the top-level logger fields — `log.debug` and `log._spies.debug` are the same `vi.fn()` instance.
- The return type properly extends `Logger` and adds `ingestRendererRecord`, `shutdown`, and `_spies` so the result is assignable to `MainLogger` (the desktop superset). `registerLogChannel(makeSpyLogger())` compiles without a cast.
- `child` returns a fresh `makeSpyLogger()`, which is the same contract the inlined factories had.
- `shutdown` is `vi.fn().mockResolvedValue(undefined)` — consistent with the original inlined factories.

### Migration completeness

All four call sites are fully migrated: no residual `makeFakeLogger` function definitions remain in any of the four files. Import paths use the `.js` extension as required by the ESM convention.

### Test results (verified independently)

4 test files, 27 tests — all passed.

### Nits

None.
