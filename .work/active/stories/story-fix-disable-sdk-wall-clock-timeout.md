---
id: story-fix-disable-sdk-wall-clock-timeout
kind: story
stage: done
tags: [bug, engines]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Disable Claude CLI SDK per-turn wall-clock timeout in adapter + vision

## Symptom

Long-running but legitimate agent turns — most notably the bootstrap explorer
reading large textbook bundles, and slow image-read calls in vision — were
being killed mid-flight with `CLITimeoutError` once they exceeded the
SDK's per-turn wall-clock default (10 minutes for `createConversation`,
5 minutes for `query`). The student saw an opaque "I'm having trouble..."
response back from the model that improvises around a silently-failed
turn, with no indication that a wall-clock limit was the cause.

## Root cause

`@praxis/claude-cli-sdk` ships a default per-turn timeout (`setTimeout` in
`packages/claude-cli-sdk/src/cli/stream.ts:37`) that the Praxis adapter and
vision capability inherit without opting out. The default exists as a safety
against truly-stuck child processes, but Praxis already has two stronger
bounds:

- `maxSteps` (passed to `createConversation` as `maxTurns`) — the real safety
  against runaway model loops.
- An explicit `AbortSignal` that flows through `signal` →
  `conv.abort()` in `ClaudeCodeEngineSession.send` (and through the
  caller's `AbortSignal` in `ClaudeCodeVision.read`).

With those two in place, the wall-clock timeout buys nothing — it only
converts legitimately-long turns (bootstrap exploration over large
documents, slow vision reads) into opaque failures.

The SDK had no way to disable the timeout entirely; passing `0` would
trip `setTimeout(fn, 0)` and fire immediately, and `Infinity` would
also fire effectively-immediately on some Node versions. So the SDK
itself needed a small change to treat `timeout <= 0 || !isFinite(timeout)`
as "no timeout".

## Fix approach

Two-package change:

1. **`@praxis/claude-cli-sdk`** — gate the `setTimeout` call in
   `streamEvents` so `timeout <= 0 || !isFinite(timeout)` skips the timer
   entirely. The existing `clearTimeout(timeoutId)` in the finally block
   is a documented no-op when `timeoutId` is `undefined`, so no other
   change is needed. Doc comments on `OptionsBase.timeout` and `query()`
   updated to document the `0` / `Infinity` escape hatch.

2. **`@praxis/engines/claude-code`** — pass `timeout: 0` from both
   `ClaudeCodeEngine.open` (per-conversation default for tutor sessions)
   and `ClaudeCodeVision.read` (per-call for vision), with comments
   explaining why disabling is safe (maxSteps + AbortSignal cover both
   the runaway-loop and explicit-cancellation cases).

## Regression test

Coverage exists at the seams — no new tests added:

- `streamEvents` timeout=0 behavior is a guard around `setTimeout`; the
  branch is dead-simple (`if (timeout > 0 && isFinite(timeout))`) and the
  pre-existing `clearTimeout(undefined)` is documented Node behavior.
- The adapter and vision callsites are pure config — they pass the new
  `timeout: 0` and don't add any new logic that needs assertions.
- The original wall-clock-fires path is still exercised whenever a caller
  passes an explicit positive `timeout` (`query()` defaults to 300_000).

If a regression were to slip in (e.g., someone re-introducing a default
timeout that overrides callsite `timeout: 0`), the bootstrap explorer
would start failing on large textbook reads — the same symptom that
motivated the fix.

## Implementation notes

- Files changed:
  - `packages/claude-cli-sdk/src/cli/stream.ts` — guard `setTimeout` on
    `timeout > 0 && isFinite(timeout)`; clearTimeout-on-undefined is a
    safe no-op.
  - `packages/claude-cli-sdk/src/query.ts` — doc comment notes the
    `0` / `Infinity` escape hatch.
  - `packages/claude-cli-sdk/src/types/options.ts` — `OptionsBase.timeout`
    JSDoc documents the escape hatch and the per-turn vs per-call defaults.
  - `packages/engines/src/claude-code/adapter.ts` — `createConversation`
    call passes `timeout: 0` with an explanatory comment pointing at
    `maxSteps` + `conv.abort()`.
  - `packages/engines/src/claude-code/vision.ts` — `query()` call passes
    `timeout: 0` with comment pointing at `maxTurns` + `AbortSignal`.
- Diff size: 5 files, ~26 lines net.
- `pnpm typecheck` clean. SDK and engines test suites unchanged (no test
  assertions branched on the previous behavior).

## Out-of-scope (intentionally not bundled)

- The SDK could surface a typed `CLITimeoutError` discriminator on its
  error union so callers can distinguish wall-clock kills from other
  failure modes — useful if we ever want to keep a high but non-infinite
  ceiling and recover gracefully. Not needed for the current fix.
- The vision path could plumb a caller-controlled timeout from `req` for
  cases where a bounded read is desired. Not in scope here — the existing
  `AbortSignal` covers explicit cancellation, and vision is only invoked
  from internal flows.
