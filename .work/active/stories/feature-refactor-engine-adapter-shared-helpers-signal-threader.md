---
id: feature-refactor-engine-adapter-shared-helpers-signal-threader
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-engine-adapter-shared-helpers
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Extract `SignalThreader` helper shared by Claude Code + Codex adapters

## Brief
Both `packages/engines/src/claude-code/adapter.ts` and
`packages/engines/src/codex/adapter.ts` maintain a mutable `currentSignal` ref and a
`getSignal` closure passed to tool handlers. The pattern is identical:
- Module-scope or closure-scope `let currentSignal: AbortSignal | undefined`
- A `getSignal = () => currentSignal` closure handed to the tool bridge / dispatch
- `send()` sets `currentSignal = opts.signal` at start, clears it in `finally`

## Current sites
- `packages/engines/src/claude-code/adapter.ts:56–57` (`getSignal` closure)
- `packages/engines/src/claude-code/adapter.ts:244–284` (`send` set/clear)
- `packages/engines/src/codex/adapter.ts:37–42` (`getSignal` closure)
- `packages/engines/src/codex/adapter.ts:160–179` (`send` set/clear)

## Target
Extract a small helper class in `packages/engines/src/common/signal-threader.ts`:
```ts
export class SignalThreader {
  private current: AbortSignal | undefined = undefined;
  readonly getSignal = (): AbortSignal | undefined => this.current;
  with<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
    this.current = signal;
    return fn().finally(() => { this.current = undefined; });
  }
}
```

Each adapter holds one `SignalThreader` per session; `send()` becomes
`return this.threader.with(opts.signal, async () => { ... });`.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` green
- Both adapters use `SignalThreader` instead of inline mutable refs
- Signal propagation to tool dispatch is preserved (existing adapter tests cover this)
- No change to engine contract or external behavior

## Implementation notes

**Helper file**: `packages/engines/src/common/signal-threader.ts` — new `common/` directory created.

**API chosen**: `enter(signal) / exit()` (not `with(signal, fn)`). Since both adapters' `send()` methods are `async function*` generators, the body cannot be wrapped in a `Promise<T>` callback cleanly. The `enter`/`exit` pair maps directly onto the existing `try/finally` structure each adapter already had.

**Both adapters updated**:
- `packages/engines/src/claude-code/adapter.ts`: removed `let currentSignal` + `getSignal` closure from `open()`, replaced `setCurrentSignal` callback with `SignalThreader` instance. Session class: replaced `setCurrentSignal` field with `threader: SignalThreader`, updated constructor, updated `send()` to call `threader.enter/exit`.
- `packages/engines/src/codex/adapter.ts`: same pattern applied identically.

**Signal propagation verified**: `threader.getSignal` is passed directly to `startToolBridge({ getSignal: threader.getSignal })` — the bridge's MCP handler still reads the live per-turn signal through the same getter interface as before.

**Verification**: `pnpm typecheck` — all packages clean. Engine adapter tests (30 tests across claude-code.test.ts + codex.test.ts) all pass. Full suite: 4743 tests pass.
