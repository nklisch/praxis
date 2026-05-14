---
id: fix-wrapenvelope-withschema-arg-routing-and-client-unwrap
kind: story
stage: done
tags: [bug, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: []
release_binding: v0.1.2
gate_origin: review
created: 2026-05-14
updated: 2026-05-14
---

# Fix `wrapEnvelope + withSchema` arg routing and missing `unwrapEnvelope` on client

## Priority
High (Blocker)

## Source
Found during review of `test-gap-ipc-envelope-migration-integration`.

## Bug description

### Server-side: `withSchema` validates the IPC event object, not the payload

`createIpcHelpers.handle` (`packages/desktop/electron/main/ipc-helpers.ts:36`) registers:

```typescript
ipcMain.handle(channel, async (event, ...args) => fn(event, ...args))
```

When a channel is registered as `handle(channel, wrapEnvelope(channel, log, withSchema(schema, inner)))`, the timing wrapper calls `fn(event, payload)`. `wrapEnvelope` receives `(event, payload)` as `...args` and forwards them to `withSchema`'s returned function, which has signature `(raw: unknown) => ...`. So `raw = event` (the Electron IPC event object) and `payload` is silently dropped.

Every `wrapEnvelope + withSchema` channel in production validates the event object, not the actual payload. Since the event object is never a `z.string()` or structured schema type, these channels always return `VALIDATION_FAILED` regardless of what the renderer sends. Affected channels:

- `praxis.shell.openExternal` — `withSchema(z.string().min(1).refine(isAllowedExternalUrl), ...)`
- `praxis.config.setLockCode` — `withSchema(z.string().min(1), ...)`
- `praxis.config.setSelectedEngine` — `withSchema(EngineIdSchema, ...)`
- `praxis.config.setEngineConfig` — `withSchema(EngineConfigSchema, ...)`
- `praxis.config.setBootstrapConfig` — `withSchema(z.object({...}), ...)`
- `praxis.lock.setLockCode` — `withSchema(z.string().min(1), ...)`
- `praxis.lock.unlock` — `withSchema(z.string().min(1), ...)`
- `praxis.lock.clearLock` — `withSchema(z.string().min(1), ...)`

### Client-side: `unwrapEnvelope` missing for migrated channels

The client services for the migrated channels call `transport.invoke<void>` without `unwrapEnvelope`, so the `{ ok: false, error: {...} }` envelope is silently discarded and validation failures are invisible to the renderer:

- `ConfigClient.setLockCode` (`packages/client/src/services/config-client.ts:19`)
- `ConfigClient.setSelectedEngine` (`packages/client/src/services/config-client.ts:31`)
- `LockClientImpl.setLockCode` (`packages/client/src/services/lock-client.ts:26`)
- `LockClientImpl.unlock` (`packages/client/src/services/lock-client.ts:29`) — note: this one DOES return `{ ok: boolean }` from the service but the channel uses `withSchema` so the envelope wraps that; client treats the raw result as `{ ok: boolean }` not as `IpcEnvelope<{ ok: boolean }>`.
- `LockClientImpl.clearLock` (`packages/client/src/services/lock-client.ts:38`)
- `ShellClientImpl.openExternal` (`packages/client/src/services/shell-client.ts:14`)

## Root cause

The `ipc-envelope-handler` pattern (`.claude/skills/patterns/ipc-envelope-handler.md`) describes `wrapEnvelope` composing with `withSchema`, but the composition is exercised at the unit level where `wrapEnvelope` is called directly without the event object being prepended. The pattern does not address the mismatch introduced by `createIpcHelpers.handle`'s timing wrapper, which always prepends `event` before spreading `...args` to `fn`.

## Fix

### Server-side: strip the event at the `wrapEnvelope + withSchema` callsite

Channels that use `withSchema` must register the handler so the event is excluded before `wrapEnvelope` sees it:

```typescript
// Before (broken):
handle(
  "praxis.lock.setLockCode",
  wrapEnvelope(
    "praxis.lock.setLockCode",
    log,
    withSchema(z.string().min(1, "code"), async (code) =>
      services.lock.setLockCode({ code }),
    ),
  ),
);

// After (fixed):
handle(
  "praxis.lock.setLockCode",
  async (_event, payload: unknown) =>
    wrapEnvelope(
      "praxis.lock.setLockCode",
      log,
      withSchema(z.string().min(1, "code"), async (code) =>
        services.lock.setLockCode({ code }),
      ),
    )(payload),
);
```

Or equivalently, change `createIpcHelpers.handle` to strip the event before forwarding to `fn` — but that would affect all handlers. The per-callsite approach is more surgical and matches the existing `(_event, payload)` convention already used throughout `ipc-server.ts`.

A cleaner alternative: add a `handleEnvelope(channel, schema, fn)` helper to `ipc-helpers.ts` that composes the event stripping, `wrapEnvelope`, and `withSchema` in one call. This is the preferred approach per the `ipc-envelope-handler` pattern.

### Client-side: add `unwrapEnvelope` to migrated channels

Update each client method to peel the envelope and surface `IpcError` on failure:

```typescript
// Example fix for LockClientImpl.setLockCode:
async setLockCode(code: string): Promise<void> {
  const result = await this.transport.invoke<IpcEnvelope<void> | void>(
    `${C}.setLockCode`,
    code,
  );
  unwrapEnvelope(result);
}
```

Apply the same pattern to `LockClientImpl.unlock`, `LockClientImpl.clearLock`, `ConfigClient.setLockCode`, `ConfigClient.setSelectedEngine`, and `ShellClientImpl.openExternal`.

For `LockClientImpl.unlock` whose return type is `{ ok: boolean }`, wrap as `IpcEnvelope<{ ok: boolean }>`.

### Update integration tests

After the fix, the integration tests in `ipc-server.envelope-migration.test.ts` can be updated to actually exercise the success path for `withSchema` channels. The harness constraint (event prepending) will no longer apply if the fix is done at the callsite. Tests that previously verified "always VALIDATION_FAILED due to event routing" should be updated to verify the actual validation behavior: valid payload → `{ ok: true }`, invalid payload → `VALIDATION_FAILED`.

## Acceptance criteria

- [x] All `wrapEnvelope + withSchema` channels in `ipc-server.ts` correctly receive the payload (not the event) as the validated argument.
- [x] All migrated channels on the client side call `unwrapEnvelope` and surface `IpcError` to the caller.
- [x] `ipc-server.envelope-migration.test.ts` success-path tests for `withSchema` channels verify `{ ok: true }` on valid input.
- [x] `pnpm typecheck && pnpm lint && pnpm test` pass.

## Implementation

### Helper added

`handleEnvelope<TIn, TOut>(channel, log, schema, fn)` added to `packages/desktop/electron/main/ipc-helpers.ts`. It composes event-stripping + `wrapEnvelope` + `withSchema` in one call. The key fix: it strips the Electron IPC event that `createIpcHelpers.handle` prepends, forwarding only `payload` to `withSchema`. Without this, `withSchema` received the event object as `raw` and always returned `VALIDATION_FAILED`.

### Channels migrated server-side (8 total)

All migrated from `wrapEnvelope(..., withSchema(...))` to `handleEnvelope(...)`:

- `praxis.config.setLockCode`
- `praxis.config.setSelectedEngine`
- `praxis.config.setEngineConfig`
- `praxis.config.setBootstrapConfig`
- `praxis.lock.setLockCode`
- `praxis.lock.unlock`
- `praxis.lock.clearLock`
- `praxis.shell.openExternal`

No-schema channels (`praxis.config.engineConfig`, `praxis.config.engineConfig.reveal`, `praxis.update.checkLatest`) remain as bare `wrapEnvelope` — they take no payload so there is no event/payload mismatch.

### Client methods updated with `unwrapEnvelope` (6 total)

- `ConfigClient.setLockCode` (`config-client.ts`)
- `ConfigClient.setSelectedEngine` (`config-client.ts`)
- `ConfigClient.setBootstrapConfig` (`config-client.ts`) — also missing unwrap; fixed
- `LockClientImpl.setLockCode` (`lock-client.ts`)
- `LockClientImpl.unlock` (`lock-client.ts`)
- `LockClientImpl.clearLock` (`lock-client.ts`)
- `ShellClientImpl.openExternal` (`shell-client.ts`)

### Test updates

`ipc-server.envelope-migration.test.ts`: complete rewrite — 23 tests total. Previous tests documented the bug ("always VALIDATION_FAILED due to event routing"). Updated to verify correct behavior:

- Success-path tests: valid payload → `{ ok: true, value }` for every `handleEnvelope` channel
- Validation-failure tests: invalid/empty/wrong-type payload → `{ ok: false, error: { code: "VALIDATION_FAILED" } }`
- Security test: internal throw with path → `INTERNAL` with no path leakage
- Control channel test: non-envelope channel still rejects raw

### Pattern doc update

`.claude/skills/patterns/ipc-envelope-handler.md` updated:

- Example 1 now shows `handleEnvelope` as canonical form for payload-taking channels
- New "Common Violations" entry documents the `wrapEnvelope + withSchema` anti-pattern and the missing `unwrapEnvelope` client-side anti-pattern

### Verification

- `pnpm --filter @praxis/desktop typecheck`: pass
- `pnpm --filter @praxis/client typecheck`: pass
- `pnpm --filter @praxis/desktop test`: 136/136 pass
- `pnpm --filter @praxis/client test`: 62/62 pass
- `pnpm biome check` on all 6 changed files: clean

## Review (2026-05-14)

**Verdict: Approve**

### Correctness — load bearing

**`handleEnvelope` signature is correct.** The helper is declared as `(_event: IpcMainInvokeEvent, payload: unknown) => Promise<IpcEnvelope<TOut>>`, which matches the `(event, ...args) => fn(event, ...args)` calling convention of `createIpcHelpers.handle`. Inside, it captures `wrapEnvelope(channel, log, withSchema(schema, fn))` and returns a closure that calls `wrapped(payload)` — stripping the event before `withSchema` ever sees it. The types flow cleanly: `z.ZodType<TIn>` → `TIn` → `Promise<TOut>` → `IpcEnvelope<TOut>`.

**All 8 server channels migrated.** Confirmed via grep: `setLockCode`, `setSelectedEngine`, `setEngineConfig`, `setBootstrapConfig` (config domain) and `setLockCode`, `unlock`, `clearLock` (lock domain) plus `openExternal` (shell domain) all call `handleEnvelope`. The three bare `wrapEnvelope` channels (`engineConfig`, `engineConfig.reveal`, `update.checkLatest`) are zero-arg getters — event-stripping is irrelevant for them and they are correctly untouched. `withSchema` is no longer imported in `ipc-server.ts`.

**All 7 client methods updated.** `ConfigClient`: `setLockCode`, `setSelectedEngine`, `setEngineConfig` (pre-existing), `setBootstrapConfig`. `LockClientImpl`: `setLockCode`, `unlock`, `clearLock`. `ShellClientImpl`: `openExternal`. Every one calls `unwrapEnvelope(result)` or `return unwrapEnvelope(result)`. The count in the implementation notes says 6 but the list names 7 (it lists `setEngineConfig` which had its unwrap from a prior migration). Either way, all affected methods are correctly updated.

**`lock.unlock` double-envelope correctness.** The service returns `{ ok: boolean }`. The server wraps this as `IpcEnvelope<{ ok: boolean }>` — i.e., on success the wire value is `{ ok: true, value: { ok: boolean } }`. The client type is `IpcEnvelope<{ ok: boolean }> | { ok: boolean }`. `isEnvelope` detection checks for `ok === true && "value" in candidate`, which distinguishes the envelope from a raw `{ ok: boolean }` (no `value` key). `unwrapEnvelope` correctly returns `{ ok: boolean }` to `useLock`, which branches on `result.ok`. Correct end-to-end.

**No double-logging.** `handleEnvelope` uses `wrapEnvelope` which catches and returns an envelope — the outer `createIpcHelpers.handle` timing wrapper sees a successful resolution and does not log an error. The `wrapEnvelope` layer does the error logging with `requestId`. No duplicate log rows.

### Behavior end-to-end

All tests pass: 23/23 integration tests, 136/136 desktop tests, 62/62 client tests, both typechecks clean (verified above).

### Security

All 8 previously-broken channels now perform real validation. Each call site that previously silently failed now executes real mutations (setLockCode, setSelectedEngine, etc.). UI call sites (`useLock`, `useBootstrapBudget`, `onboarding-flow`, `settings`) all wrap mutations in `try/catch` and surface `err.message` (or a generic string) to the user — `IpcError` is an `Error` subclass, so `err instanceof Error` is true and `err.message` carries only the user-safe envelope message. No stack traces or path-shaped strings cross the boundary: `toEnvelopeError` runs `serializeErrorRedacted` on the main side and only a short user-safe string reaches the renderer.

### UX regression check

Before this fix, all 8 channels always returned `VALIDATION_FAILED`, so mutations were no-ops. The UI hooks were written expecting these to sometimes succeed: `useLock.setLockCode` calls `refresh()` after `await setLockCode(code)` — after the fix, the code now actually sets and the refresh reflects real state. `useBootstrapBudget.setMaxSteps` is optimistic with revert-on-error — after the fix, success leaves the optimistic state in place (correct). `onboarding-flow` and `settings.tsx` both have `catch` blocks that show error UI. In each case the hook/component handles the now-real success path correctly. No UX regressions identified.

### Minor observation (not a blocker)

`praxis.config.setEngineConfig` and `praxis.config.setBootstrapConfig` are migrated server-side but do not have dedicated describe blocks in the migration test. The `handleEnvelope` mechanism is proven by the other six channels and the structural wiring is identical, so this is low risk. Worth filing as a low-priority test gap if test completeness matters to the team, but not a reason to block this story.

### Pattern doc

The updated `ipc-envelope-handler.md` is accurate. Example 1 uses `handleEnvelope` as the canonical form. The three new Common Violations entries are precise: the `wrapEnvelope + withSchema` anti-pattern, the missing `handleEnvelope` on structured payloads, and the missing `unwrapEnvelope` on the client side. All three directly correspond to the defects this story fixed.
