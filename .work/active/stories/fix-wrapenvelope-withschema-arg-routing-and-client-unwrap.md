---
id: fix-wrapenvelope-withschema-arg-routing-and-client-unwrap
kind: story
stage: implementing
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

- [ ] All `wrapEnvelope + withSchema` channels in `ipc-server.ts` correctly receive the payload (not the event) as the validated argument.
- [ ] All migrated channels on the client side call `unwrapEnvelope` and surface `IpcError` to the caller.
- [ ] `ipc-server.envelope-migration.test.ts` success-path tests for `withSchema` channels verify `{ ok: true }` on valid input.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass.
