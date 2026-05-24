---
id: feature-refactor-engine-adapter-shared-helpers-signal-threader
kind: story
stage: implementing
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
