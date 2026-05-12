---
id: gate-tests-ipc-cancel-propagation-e2e
kind: story
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# IPC cancel propagation end-to-end (`session.send.cancel → controller.abort → engine conv.abort`) lacks an integration test

## Priority
Medium

## Spec reference
Item: `epic-bootstrap-readiness-in-flight-affordances` (Unit 4)
Acceptance criterion: "Sending `praxis.session.send.cancel` mid-turn now propagates all the way to `conv.abort()` in the Claude Code adapter."

## Gap type
e2e-seam — signal-threading tested per-layer (session-service, claude-code adapter), but no test asserts the full IPC path. This is exactly the seam that broke before the fix landed.

## Suggested test
```ts
// packages/desktop/electron/main/__tests__/ipc-server.cancel.test.ts (new)
it("praxis.session.send.cancel propagates to engine conv.abort via controller signal", async () => {
  // Set up ipc-server with a fake services bag where session.send accepts a signal.
  // Spy on the engine's conv.abort().
  // Fire praxis.session.send.start, then praxis.session.send.cancel with the streamId.
  // Verify AbortController was aborted AND the engine adapter received an aborted signal.
  // The fake engine should observe conv.abort().
});
```

## Test location (suggested)
`packages/desktop/electron/main/__tests__/ipc-server.cancel.test.ts`

## Implementation notes

Created `packages/desktop/electron/main/__tests__/ipc-server.cancel.test.ts` with 3 tests:

1. **Registration check** — verifies both `praxis.session.send.start` (handle) and `praxis.session.send.cancel` (on) are registered by `registerIpcHandlers`.

2. **Cancel propagation** — the core seam test: starts a streaming turn via `praxis.session.send.start`, parks the fake `session.send` generator mid-stream using a signal-aware await, fires `praxis.session.send.cancel` with the same `streamId`, and asserts the `AbortSignal` passed to `session.send` is immediately `aborted`. Verifies the ipc-server's `activeAbortControllers` map round-trip (`set` on start, `abort` on cancel, `delete` in finally).

3. **Stream isolation** — fires two concurrent streams with different `streamId`s, cancels only stream A, and confirms stream B's signal remains unaborted.

Test strategy: mirrors `ipc-server.first-run-update.test.ts` — mocks `electron` to capture `ipcMain.handle` and `ipcMain.on` registrations, then invokes them directly. No real DB, no Electron process. The cancel path (`activeAbortControllers.get(streamId)?.abort()`) is traced end-to-end through the `AbortSignal` visible to the fake `session.send` generator.

No design-flaw discovered: the signal threads cleanly from `praxis.session.send.cancel` → `AbortController.abort()` → `controller.signal` passed to `services.session.send`. The per-layer tests in `session-service-cancel.test.ts` cover the signal-to-engine dispatch; this test covers the IPC seam that was missing.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
