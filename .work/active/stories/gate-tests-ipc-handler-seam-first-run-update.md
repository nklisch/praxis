---
id: gate-tests-ipc-handler-seam-first-run-update
kind: story
stage: review
tags: [testing]
parent: feature-release-v0.1.0-test-findings
depends_on: []
release_binding: v0.1.0
gate_origin: tests
created: 2026-05-10
updated: 2026-05-10
---

# IPC handlers for first-run + auto-update have no handler-side test

## Priority
Low

## Spec reference
Items: `epic-phase-19-first-run-flow`, `epic-phase-19-auto-update`
Acceptance criteria:
- "Unit 3 — IPC handler: handler registered; handler delegates to `services.update.checkLatest`" (auto-update)
- "Unit 3 — Two handlers registered alongside the existing `praxis.config.*`" (first-run-flow)

## Gap type
Missing test for IPC seam (e2e-seam)

## Suggested test

```ts
// packages/desktop/electron/main/__tests__/ipc-server.first-run-update.test.ts (new)
// Mirror the pattern in log-channel.test.ts: stub electron.ipcMain.handle to
// capture registered listeners, then invoke them with a fake services object
// and assert the delegate calls.
describe("praxis.config.firstRunCompleted handler", () => {
  it("delegates to services.config.firstRunCompleted");
});
describe("praxis.update.checkLatest handler", () => {
  it("forwards currentVersion arg to services.update.checkLatest");
});
```

## Test location (suggested)
`packages/desktop/electron/main/__tests__/ipc-server.first-run-update.test.ts`

## Rationale
Both ends of the IPC bridge are tested separately (client side in
`client.test.ts`, service side in `update-service.test.ts` and the hook
tests), but the bridge itself isn't. The pattern exists already in
`log-channel.test.ts`. Low priority because the handlers are one-line
pass-throughs; downgrade if the team prefers to rely on manual smoke per
ship-checklist Step 4.

## Implementation notes
New file: `packages/desktop/electron/main/__tests__/ipc-server.first-run-update.test.ts` (6 tests).
Mirrors log-channel.test.ts pattern: stub `electron.ipcMain.handle` to capture registered
handlers, then invoke them directly with a minimal fake services object. The electron mock
also stubs `app.getVersion()` returning `"1.2.3"` so the `checkLatest` handler's version
forwarding can be asserted precisely. `registerIpcHandlers` registers many channels; the fake
services object only populates the three under test plus minimal stubs for the other config
methods that are registered unconditionally at startup.
