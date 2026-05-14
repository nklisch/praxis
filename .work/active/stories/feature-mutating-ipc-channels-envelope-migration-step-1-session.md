---
id: feature-mutating-ipc-channels-envelope-migration-step-1-session
kind: story
stage: review
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: []
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.session.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe to the session invoke channels.

## Channels in scope
- `praxis.session.active` (no-payload getter)
- `praxis.session.end` (string payload)
- `praxis.session.spawnFromAssignment` (structured payload)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines 91, 110, plus spawnFromAssignment site)
- `packages/client/src/services/session-client.ts`
- `packages/desktop/electron/main/__tests__/session-channel-envelope.test.ts` (new — integration test)

## Recipe (from parent feature)
1. Replace `handle("praxis.session.X", async (_event, ...) => services.session.Y(...))` with the envelope-wrapped form (`handleEnvelope` for structured payloads, `wrapEnvelope` for no-payload).
2. Define a Zod schema for the structured-payload channels at the top of `ipc-server.ts` (or import from a shared location if already defined).
3. Update `SessionClientImpl` methods on the client side — call `unwrapEnvelope(result)`.
4. Add an integration test exercising one success path and one validation-failure path.
5. Run `pnpm --filter @praxis/desktop typecheck && pnpm --filter @praxis/client typecheck && pnpm --filter @praxis/desktop test && pnpm --filter @praxis/client test`.

## Acceptance
- All 3 listed channels use `handleEnvelope` or `wrapEnvelope`.
- All 3 corresponding client methods call `unwrapEnvelope`.
- Integration test asserts envelope shape (success + validation failure) for at least one structured-payload channel.
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Medium — `praxis.session.active` is polled frequently by the UI; an envelope-shape mismatch breaks the chat shell.
- **Rollback**: revert the commit; the previous raw-throw form is structurally simpler and the renderer's catch handlers were already lenient.

## Implementation

### Channels migrated
- `praxis.session.active` — `wrapEnvelope` (no payload); `SessionClient.active()` now calls `unwrapEnvelope`.
- `praxis.session.end` — `handleEnvelope` + `z.string().min(1, "sessionId")`; `SessionClient.end()` now calls `unwrapEnvelope`.
- `praxis.session.spawnFromAssignment` — `handleEnvelope` + `SpawnFromAssignmentSchema` (object with `assignmentId` and `parentSessionId`, both `z.string().min(1)`); `SessionClient.spawnFromAssignment()` now calls `unwrapEnvelope`.

`SpawnFromAssignmentSchema` is defined inline at the top of the Session section in `ipc-server.ts` — local to its use site, not hoisted to module scope, matching the style of the existing `EngineConfigSchema` import pattern.

### Files modified
- `packages/desktop/electron/main/ipc-server.ts` — 3 channels wrapped
- `packages/client/src/services/session-client.ts` — 3 methods updated to `unwrapEnvelope`
- `packages/desktop/electron/main/__tests__/session-channel-envelope.test.ts` — new file, 18 tests

### Test coverage (18 tests across 3 describe blocks)
- `praxis.session.active` (4 tests): success-null, success-with-handle, INTERNAL on service throw, INTERNAL with path leakage guard.
- `praxis.session.end` (6 tests): success, VALIDATION_FAILED on empty string, VALIDATION_FAILED on number, VALIDATION_FAILED on undefined, INTERNAL on service throw, INTERNAL with path leakage guard.
- `praxis.session.spawnFromAssignment` (8 tests): success, VALIDATION_FAILED on missing assignmentId, VALIDATION_FAILED on missing parentSessionId, VALIDATION_FAILED on empty assignmentId, VALIDATION_FAILED on non-object, VALIDATION_FAILED on undefined, INTERNAL on service throw, INTERNAL with path leakage guard.

### Verification
- `pnpm --filter @praxis/desktop typecheck` — pass
- `pnpm --filter @praxis/client typecheck` — pass
- `pnpm --filter @praxis/desktop test` — 154 tests pass (15 files)
- `pnpm --filter @praxis/client test` — 62 tests pass (7 files)
- `pnpm biome check` on modified files — pass (pre-existing workspace lint errors unaffected)
