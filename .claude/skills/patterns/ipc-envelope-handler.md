# Pattern: IPC Envelope-Wrapped Handler

Main-process handlers that mutate state, validate input, or cross the renderer trust boundary are wrapped with `wrapEnvelope(channel, log, withSchema(zod, fn))` so the wire format is `{ ok: true, value } | { ok: false, error: { code, message, requestId } }` rather than a thrown `Error`. The client peels the envelope with `unwrapEnvelope`, which throws `IpcError` carrying `.code` and `.requestId`. The same `requestId` (UUIDv7) appears in the main-side log row so support can join the renderer-visible failure to the server stack trace.

## Rationale

Electron's structured-clone serialization strips custom `Error` subclasses to bare `{ message, stack }`, losing `code` and any stable failure category. The renderer needs `code` to branch UX (validation vs unauthorized vs not-found vs internal) and `requestId` to link a user-reported failure to a log row. A discriminated-union envelope preserves both, never leaks raw stack traces or secret-shaped strings across the trust boundary (the redactor in `serializeErrorRedacted` runs on the log side, the user-safe message on the envelope side), and a single `wrapEnvelope` wrapper enforces the contract uniformly. `withSchema(zod, fn)` composes underneath so input validation surfaces as `VALIDATION_FAILED` with a joined path string instead of a raw Zod message.

## Examples

### Example 1: Envelope wrapper + Zod input validation in main

**File**: `packages/desktop/electron/main/ipc-server.ts:198`

```typescript
handle(
  "praxis.config.setSelectedEngine",
  wrapEnvelope(
    "praxis.config.setSelectedEngine",
    log,
    withSchema(EngineIdSchema, async (engineId) =>
      services.config.setSelectedEngine(engineId),
    ),
  ),
);
```

### Example 2: Envelope with no input validation (just error wrapping)

**File**: `packages/desktop/electron/main/ipc-server.ts:209`

```typescript
handle(
  "praxis.config.engineConfig",
  wrapEnvelope("praxis.config.engineConfig", log, async () => {
    await requireUnlocked();
    return services.config.engineConfig();
  }),
);
```

### Example 3: Client peels the envelope and throws `IpcError`

**File**: `packages/client/src/services/config-client.ts:34`

```typescript
async engineConfig(): Promise<EngineConfigSnapshot> {
  const result = await this.transport.invoke<
    IpcEnvelope<EngineConfigSnapshot> | EngineConfigSnapshot
  >(`${CHANNEL}.engineConfig`);
  return unwrapEnvelope(result);
}
```

### Example 4: The helper definitions

**File**: `packages/desktop/electron/main/ipc-error-envelope.ts:54`

```typescript
export function wrapEnvelope<TArgs extends unknown[], TResult>(
  channel: string,
  log: Logger,
  fn: (...args: TArgs) => Promise<TResult> | TResult,
): (...args: TArgs) => Promise<IpcEnvelope<TResult>> { ... }
```

## When to Use

- Any IPC handler that mutates persistent state (config writes, lock/unlock, authoring) — failure modes must be discriminated for UX
- Any handler that validates structured input — Zod errors must be flattened to `VALIDATION_FAILED` with a stable code
- Any handler where the renderer needs to branch on failure category (`NOT_FOUND`, `UNAUTHORIZED`, etc.)
- Handlers crossing the trust boundary — secret-redaction in the log row + user-safe envelope message both matter

## When NOT to Use

- Pure read-only invoke channels that already return well-typed snapshots — bare `handle()` is fine (rejection round-trips a generic Error). Use `wrapEnvelope` if the renderer needs to distinguish failure modes.
- Streaming channels (`*.events.start` / `*.events.<streamId>` push / `*.cancel`) — they have their own per-event `IpcStreamMessage` envelope kinds (`event` / `done` / `error`) covered by `subscriber-fanout-stream`
- Internal helper functions inside the channel module — only the outer `ipcMain.handle` registration needs wrapping

## Common Violations

- Wrapping a streaming channel with `wrapEnvelope` — the stream's events go on a separate channel; the start invoke just kicks subscription off
- Forgetting `withSchema` on a channel that takes a structured payload — `cfg.maxSteps` arriving as a string crashes the service with a cryptic TypeError instead of returning `VALIDATION_FAILED`
- Adding a new failure `code` outside the allowlist in `extractAllowlistedCode` — silently folded into the generic `INTERNAL` message instead of surfacing the code to the renderer
- Throwing inside `wrapEnvelope`'s `fn` and *also* logging — the wrapper already logs at `error` level with `requestId`; duplicating the log loses the `requestId` linkage
