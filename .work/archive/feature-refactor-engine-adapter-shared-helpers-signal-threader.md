---
id: feature-refactor-engine-adapter-shared-helpers-signal-threader
kind: story
stage: done
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

## Review

**Verdict: done** — clean, correct extraction with no blockers.

**API choice confirmed sound**: `enter`/`exit` is the right API for `async function*` generators. A `with(signal, fn)` wrapper would require draining the entire generator before the finally cleared the signal, which is wrong. The class doc explains this clearly.

**Both adapters verified**:
- Each holds one `SignalThreader` per session (scoped to `open()`).
- `threader.enter(signal)` called before the generator body; `threader.exit()` in `finally`.
- `threader.getSignal` (bound arrow) passed to `startToolBridge` — propagation to tool dispatch is identical to before.

**Ordering check**: signal-threader commit (7a2cc98) landed before close-bridge (e202d86). The diff is reviewable independently — close-bridge only added `closeBridgeIfPresent` usage; it did not alter the threader wiring.

**Nit (not a blocker, pre-existing)**: In the Claude Code adapter, `threader.enter(signal)` is called at line 234 and the `try` block opens at line 255 — `this.conv.send(message)` sits in the gap. If `conv.send()` threw synchronously, `exit()` would not be called and the signal would be stale. This is the same structural position as `setCurrentSignal` before the refactor (no regression introduced here). Given `conv.send()` is extremely unlikely to throw synchronously, this is a low-priority nit to address if the gap is ever revisited. Codex adapter has no gap (`enter` is immediately followed by `try`).

No findings require bouncing. Advancing to done.
