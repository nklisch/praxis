---
id: feature-mutating-ipc-channels-envelope-migration-step-1-session
kind: story
stage: done
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

## Review (2026-05-14)

**Verdict: Approve**

### Correctness

All three channels correctly apply the envelope pattern:

- `praxis.session.active` — `wrapEnvelope` with a no-arg inner function, identical to the already-established `praxis.update.checkLatest` form. The `handle()` timing wrapper calls `fn(event, ...args)` but the inner function ignores all args; correct and consistent with prior art.
- `praxis.session.end` — `handleEnvelope` + `z.string().min(1, "sessionId")`. The biome-ignore comment for the branded-string cast was preserved from the pre-migration handler. Event-stripping is handled by `handleEnvelope` in `ipc-helpers.ts` (the fix noted in `ipc-server.envelope-migration.test.ts` is baked into `handleEnvelope`'s design).
- `praxis.session.spawnFromAssignment` — `handleEnvelope` + `SpawnFromAssignmentSchema` (`assignmentId` + `parentSessionId`, both `z.string().min(1)`). Schema fields match what the service expects; `brandId` wrapping is preserved inside the handler body.

`SpawnFromAssignmentSchema` is defined inline at the top of the Session section in `ipc-server.ts` — before first use, local to the section, not hoisted to module scope. This matches the `EngineConfigSchema` style in the same file.

Client-side: all three `SessionClient` methods now `await` the invoke result and call `unwrapEnvelope`. The union type `IpcEnvelope<T> | T` on the invoke call preserves backward-compat (channels not yet migrated still pass through). Correct.

Behavior is preserved: each channel still calls the same underlying `services.session.*` method with the same arguments; only the wire format and failure path changed.

### Test quality

18 tests across 3 describe blocks, confirmed passing (`pnpm vitest run` — 18/18, 212ms). Spot-checked all three channels:

- Success paths assert `{ ok: true, value: <expected> }` and confirm the underlying service was called with the correct arguments (e.g., the `spawnFromAssignment` success test verifies `services.session.spawnFromAssignment` was called with `{ assignmentId: "asgn-001", parentSessionId: "sess-parent-001" }`).
- Validation-failure paths assert `{ ok: false, error: { code: "VALIDATION_FAILED" } }` and confirm the service was NOT called (guard on `not.toHaveBeenCalled()` present for `session.end` empty-string and `spawnFromAssignment` missing-field cases).
- INTERNAL paths use `resolves.toMatchObject` — handler never rejects.
- Path-leakage guards present on all three channels: assert `.error.message` does not contain the filesystem path or `dev.db`.
- Coverage is thorough: `session.end` covers empty string, non-string (number), and undefined; `spawnFromAssignment` covers missing `assignmentId`, missing `parentSessionId`, empty `assignmentId`, non-object, and undefined payload.

Test harness follows `electron-ipc-test-harness` pattern correctly: `vi.mock("electron")` before import, Vitest hoisting, handlers captured in `Map`, `registerIpcHandlers` invoked per test via `beforeEach`.

The `makeServices` factory is comprehensive (all service ports stubbed) and override-friendly — copy-paste-able for subsequent steps.

### Template suitability for steps 2-12

Structure is clean and directly reusable:

1. Schema defined inline at the top of the channel section.
2. `wrapEnvelope` for no-payload, `handleEnvelope` for payload — consistent with existing migrated channels.
3. Test file: one describe block per channel, consistent `it` naming convention (`"resolves with { ok: true }"`, `"returns VALIDATION_FAILED for ..."`, `"returns INTERNAL envelope (never rejects)"`).
4. `makeServices` factory pattern is the right shape to clone and trim per domain.

No structural issues. Future implementers can use this file as the template.

### Findings

None. No blockers, no important issues, no nits.
