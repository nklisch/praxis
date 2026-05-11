---
id: story-epic-bootstrap-readiness-in-flight-affordances-signal
kind: story
stage: done
tags: [engine, ipc, tutor-ux]
parent: epic-bootstrap-readiness-in-flight-affordances
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Thread `AbortSignal` end-to-end + add `interrupted` EngineEvent

## Scope

The backend half of the in-flight-affordances feature. Adds a new
`{ type: "interrupted" }` variant to the `EngineEvent` union and threads
an optional `AbortSignal` from the IPC server down through
`SessionService.send` → `EngineSession.send` → `conv.abort()` in the
Claude Code adapter. Once landed, the existing
`praxis.session.send.cancel` IPC channel actually stops the engine
subprocess instead of just breaking the for-await loop.

## Units implemented

- **Unit 1** — Add `{ type: "interrupted"; reason: "user_cancel" | "engine_abort" }`
  to `EngineEvent`. Update all exhaustive switches across the workspace.
- **Unit 2** — `SessionService.send` accepts optional `AbortSignal`,
  yields one synthetic `interrupted` event on cancel, appends it to
  the episodic log.
- **Unit 3** — `EngineSession.send` interface accepts optional
  `AbortSignal`. Claude Code adapter wires signal to `conv.abort()`.
  Codex and Direct adapters thread the signal to their underlying SDK
  requests (best-effort for SDKs that don't honor mid-stream cancel).
- **Unit 4** — IPC server passes its `controller.signal` into
  `services.session.send(sessionId, message, signal)`.

## Files touched

- `packages/core/src/types/event.ts` (or wherever `EngineEvent` lives)
- `packages/core/src/services/session-service.ts`
- `packages/core/src/types/engine.ts` (or wherever `EngineSession`
  interface lives) — extend `send` signature
- `packages/engines/src/claude-code/adapter.ts`
- `packages/engines/src/codex/adapter.ts`
- `packages/engines/src/direct/adapter.ts`
- `packages/desktop/electron/main/ipc-server.ts` — pass
  `controller.signal` through
- `packages/core/src/__tests__/session-service.test.ts` — new test for
  cancel mid-turn
- `packages/engines/src/__tests__/claude-code.test.ts` — new test for
  signal → conv.abort()
- Every other file with a `switch (event.type)` on `EngineEvent` —
  add `case "interrupted":` (most are no-op branches that fall through
  to the existing default)

## Acceptance

- [ ] `EngineEvent` union includes the new `interrupted` variant.
- [ ] `pnpm typecheck` passes across the workspace (every exhaustive
      switch handles the new case).
- [ ] `SessionService.send(sessionId, message, signal)` accepts the
      optional signal and forwards it to the engine.
- [ ] On `signal.abort()` mid-turn:
      - Generator yields one final `{ type: "interrupted", reason:
        "user_cancel" }` event.
      - That event is appended to the episodic log via the same
        `appendEpisodic` path as other events.
      - Generator returns cleanly without re-throwing.
- [ ] Claude Code adapter calls `conv.abort()` when the passed signal
      aborts. Verifiable in unit test via a mocked
      `Conversation.abort()`.
- [ ] Codex and Direct adapters thread the signal into the underlying
      SDK request (if the SDK has an `abort` / `signal` parameter on
      the streaming call); document if cancel is best-effort.
- [ ] IPC server passes its `AbortController.signal` into
      `services.session.send`. End-to-end:
      `praxis.session.send.cancel` → `controller.abort()` →
      `services.session.send` sees signal → `EngineSession.send` sees
      signal → `conv.abort()` fires → CLI subprocess stops generating.
- [ ] Existing tests pass (no regressions on the no-signal path).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope (sibling story handles)

- UI `<ThinkingIndicator />` component.
- `useStreamedSend` hook changes (`thinking` state, `cancel` function,
  `interrupted` event handling for UI).
- Cancel button / Esc key affordance.

## Parent context

- Parent feature: `epic-bootstrap-readiness-in-flight-affordances`
- Parent epic: `epic-bootstrap-readiness`
- Independent from the sibling UI story. Both can land in parallel; the
  feature is whole only when both reach `done`.

## Implementation notes

### Files changed

- `packages/core/src/types/engine.ts` — Added `{ type: "interrupted"; reason: "user_cancel" | "engine_abort" }` to `EngineEvent` union. Extended `EngineSession.send` signature to accept optional `AbortSignal`.
- `packages/core/src/types/client.ts` — Extended `SessionService.send` interface to include optional `signal?: AbortSignal`.
- `packages/core/src/services/session-service.ts` — `SessionServiceImpl.send` accepts and threads `AbortSignal` into the engine; defensive `signal?.aborted` check after each yielded event emits and persists a synthetic `interrupted` event, then returns cleanly.
- `packages/engines/src/claude-code/adapter.ts` — `ClaudeCodeEngineSession.send` accepts `AbortSignal`; registers a one-shot `abort` listener that calls `conv.abort()` and removes itself in the `finally` block; handles pre-aborted signals synchronously.
- `packages/engines/src/codex/adapter.ts` — Threads `AbortSignal` into `thread.runStreamed(message, { signal })` (Codex SDK `TurnOptions` supports it).
- `packages/engines/src/direct/adapter.ts` — Threads `AbortSignal` into `streamText({ ..., abortSignal: signal })` (Vercel AI SDK supports it natively).
- `packages/desktop/electron/main/ipc-server.ts` — Passes `controller.signal` as the third arg to `services.session.send(sessionId, message, controller.signal)`.
- `packages/ui/src/hooks/episodic-to-messages.ts` — Added `case "interrupted":` (closes active bubble, no-op render; UI sibling story adds the visual indicator).

### Exhaustive-switch sites updated

1 site updated: `episodic-to-messages.ts` — the only switch without a `default` clause covering `EngineEvent`. The two indexer switches (`affective-indexer.ts`, `misconception-indexer.ts`) filter by `relevantTypes` set + `default: continue`, so they already handle unknown types safely. No new case was needed there.

### Tests added

- `packages/core/src/__tests__/session-service-cancel.test.ts` — 5 new tests: signal threading, interrupted event yield + clean return, episodic append, no-interrupted on clean turn, backward-compat no-signal.
- `packages/engines/src/__tests__/claude-code.test.ts` — 2 new tests: `conv.abort()` called on mid-turn signal fire; `conv.abort()` called immediately on pre-aborted signal.

### Codex/Direct best-effort caveats

- **Codex**: `thread.runStreamed(message, { signal })` passes the signal to the SDK. The Codex SDK honors it on the underlying network request. If the SDK version in use doesn't propagate deep enough, `SessionServiceImpl`'s defensive `signal?.aborted` guard backstops it.
- **Direct** (Vercel AI SDK `streamText`): `abortSignal` is a first-class parameter; the SDK propagates it to the underlying HTTP stream.

### Verification

- `pnpm typecheck` — only pre-existing `structured-question` errors (separate in-flight story); no new errors from this story's changes.
- `pnpm --filter @praxis/core test` — 69 test files, 657 tests, all passed.
- `pnpm --filter @praxis/engines test` — 13 test files, 96 tests, all passed.
- `pnpm test` — 284 test files (1 skipped), 2425 tests (15 skipped), all passed.
- `pnpm lint` — no errors in our changed files; pre-existing lint errors in other files unchanged.

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `docs/SPEC.md` doesn't yet describe end-to-end cancel propagation (IPC AbortController → SessionService → EngineSession → `conv.abort()`). The docs gate during release will catch this and roll it forward — the mechanism is now load-bearing for tutor UX.

**Notes**: Claude Code adapter wires the signal correctly — synchronous abort branch for pre-aborted signals, one-shot listener for in-flight aborts, defensive try/catch around `conv.abort()`, `signal?.removeEventListener` in `finally`. The session-service's `signal?.aborted` check after each yielded event is a clean defense-in-depth backstop for adapters that don't honor mid-stream abort promptly. Codex (`thread.runStreamed({ signal })`) and Direct (`streamText({ abortSignal })`) thread the signal natively — best-effort caveats correctly documented in the implementation notes. Only one switch site needed a new `case "interrupted":` (`episodic-to-messages.ts`); indexer switches were already default-safe. 7 new tests; full suite (2425) passes.
