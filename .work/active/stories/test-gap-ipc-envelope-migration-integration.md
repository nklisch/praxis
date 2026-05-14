---
id: test-gap-ipc-envelope-migration-integration
kind: story
stage: implementing
tags: [testing, security]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: tests
created: 2026-05-14
updated: 2026-05-14
---

# IPC envelope migration integration test + per-channel `withSchema` boundary coverage

## Priority
High

## Spec reference
Bound item: `epic-security-hardening-round-2-ipc-boundary-url-and-redactor-rollout`

Acceptance criteria covered:
- "New `packages/desktop/electron/main/__tests__/ipc-server.envelope-migration.test.ts` covers: migrated channel success path returns envelope shape; migrated channel validation failure returns `code: 'VALIDATION_FAILED'`; migrated channel internal throw returns `code: 'INTERNAL'` with no path leakage in `message`; non-migrated control channel still throws raw."
- "`praxis.config.setLockCode` / `praxis.lock.setLockCode` / `praxis.lock.unlock` / `praxis.lock.clearLock` reject `{ code: "" }`, `{ code: 123 }`, and any other shape via `VALIDATION_FAILED`."

## Gap type
Missing tests for e2e-seam and boundary/error case at the channel boundary.

## Context
The `url-and-redactor-rollout` story declared a new
`packages/desktop/electron/main/__tests__/ipc-server.envelope-migration.test.ts`
in its acceptance criteria, but the file was not created.

The shape of the wrapper IS covered at unit level by
`ipc-error-envelope.test.ts` (envelope success/failure, ZodError →
VALIDATION_FAILED, internal throw with no path leakage, redacted log
record), so the migration is not unverified — but a thin integration
test that drives the actual `praxis.shell.openExternal` and one of
the migrated config / lock channels through `ipcMain.handle` (mocked in
the existing test suite) would catch wiring regressions that unit tests
on the helper can't see.

Per-channel `withSchema` validation on `praxis.config.setLockCode` /
`praxis.lock.*` is similarly covered at the helper level but not at
the channel boundary — the gate found no test that asserts a
malformed payload returns `code: 'VALIDATION_FAILED'` on the wire for
these specific channels.

## Suggested tests

```typescript
// packages/desktop/electron/main/__tests__/ipc-server.envelope-migration.test.ts

it("praxis.shell.openExternal returns envelope on success", async () => {});
it("praxis.shell.openExternal('file:///etc/passwd') returns code:'VALIDATION_FAILED'", async () => {});
it("a migrated channel that throws Error('/Users/x/.praxis...') surfaces code:'INTERNAL' with generic message", async () => {});
it("non-migrated control channel (e.g. praxis.documents.list) still throws raw", async () => {});

it("praxis.lock.setLockCode with code:'' resolves with VALIDATION_FAILED envelope", async () => {});
it("praxis.lock.unlock with code:123 (non-string) resolves with VALIDATION_FAILED envelope", async () => {});
it("praxis.lock.clearLock with missing code field resolves with VALIDATION_FAILED envelope", async () => {});
```

Add as a sibling to `ipc-error-envelope.test.ts` so it lives next to
the helpers it exercises.
