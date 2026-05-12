---
id: gate-tests-ipc-cancel-propagation-e2e
kind: story
stage: implementing
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
