---
id: story-epic-bootstrap-readiness-in-flight-affordances-signal
kind: story
stage: implementing
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
