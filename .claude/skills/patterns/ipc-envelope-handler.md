# Pattern: IPC Envelope-Wrapped Handler

Main-process handlers that mutate state, validate input, or cross the renderer trust boundary use `handleEnvelope(channel, log, schema, fn)` (for channels that take a payload) or bare `wrapEnvelope(channel, log, fn)` (for zero-argument / no-schema channels) so the wire format is `{ ok: true, value } | { ok: false, error: { code, message, requestId } }` rather than a thrown `Error`. The client peels the envelope with `unwrapEnvelope`, which throws `IpcError` carrying `.code` and `.requestId`. The same `requestId` (UUIDv7) appears in the main-side log row so support can join the renderer-visible failure to the server stack trace.

## Rationale

Electron's structured-clone serialization strips custom `Error` subclasses to bare `{ message, stack }`, losing `code` and any stable failure category. The renderer needs `code` to branch UX (validation vs unauthorized vs not-found vs internal) and `requestId` to link a user-reported failure to a log row. A discriminated-union envelope preserves both, never leaks raw stack traces or secret-shaped strings across the trust boundary (the redactor in `serializeErrorRedacted` runs on the log side, the user-safe message on the envelope side), and a single wrapper enforces the contract uniformly.

## Preferred form: `handleEnvelope`

**File**: `packages/desktop/electron/main/ipc-helpers.ts:54`

`handleEnvelope` is the canonical helper for any channel that takes a payload. It composes `wrapEnvelope + withSchema` and strips the Electron `IpcMainInvokeEvent` argument that `createIpcHelpers.handle` prepends — so `withSchema` receives only the payload, not the event object.

```ts
handle(
  "praxis.config.setSelectedEngine",
  handleEnvelope("praxis.config.setSelectedEngine", log, EngineIdSchema,
    async (engineId) => services.config.setSelectedEngine(engineId)),
);
```

**Use `handleEnvelope`** (default) for schema-validated invoke channels — any channel that receives a structured payload.

**Use raw `wrapEnvelope`** for zero-argument or no-schema endpoints where there is no payload to validate, e.g. simple list or read endpoints:

```ts
handle(
  "praxis.config.selectedEngine",
  wrapEnvelope("praxis.config.selectedEngine", log, async () => services.config.selectedEngine()),
);
```

Do **not** use `wrapEnvelope(channel, log, withSchema(schema, fn))` directly for payload-bearing channels — `createIpcHelpers.handle` calls `fn(event, ...args)`, so `withSchema` receives the event object as `raw` and always returns `VALIDATION_FAILED`. Use `handleEnvelope` instead.

## Examples

### Example 1: Schema-validated invoke channel (preferred form)

**File**: `packages/desktop/electron/main/config-channel.ts:59`

```typescript
handle(
  "praxis.config.setSelectedEngine",
  handleEnvelope("praxis.config.setSelectedEngine", log, EngineIdSchema, async (engineId) =>
    services.config.setSelectedEngine(engineId),
  ),
);
```

### Example 2: No-input channel (raw `wrapEnvelope`)

**File**: `packages/desktop/electron/main/config-channel.ts:66`

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

**File**: `packages/desktop/electron/main/ipc-helpers.ts:54` (`handleEnvelope`) and `packages/desktop/electron/main/ipc-error-envelope.ts` (`wrapEnvelope`)

```typescript
// handleEnvelope — preferred for payload-bearing channels
export function handleEnvelope<TIn, TOut>(
  channel: string,
  log: Logger,
  schema: z.ZodType<TIn>,
  fn: (input: TIn) => Promise<TOut> | TOut,
): (_event: IpcMainInvokeEvent, payload: unknown) => Promise<IpcEnvelope<TOut>> { ... }

// wrapEnvelope — use for zero-argument or no-schema channels
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

- Using `wrapEnvelope(channel, log, withSchema(schema, fn))` directly for a channel that takes a payload — `createIpcHelpers.handle` calls the registered function as `fn(event, ...args)`, so `withSchema` receives the event object as `raw` and always returns `VALIDATION_FAILED`. Use `handleEnvelope` instead.
- Wrapping a streaming channel with `wrapEnvelope` — the stream's events go on a separate channel; the start invoke just kicks subscription off
- Forgetting `withSchema` (or `handleEnvelope`) on a channel that takes a structured payload — `cfg.maxSteps` arriving as a string crashes the service with a cryptic TypeError instead of returning `VALIDATION_FAILED`
- Adding a new failure `code` outside the allowlist in `extractAllowlistedCode` — silently folded into the generic `INTERNAL` message instead of surfacing the code to the renderer
- Throwing inside `wrapEnvelope`'s `fn` and *also* logging — the wrapper already logs at `error` level with `requestId`; duplicating the log loses the `requestId` linkage
- Calling `transport.invoke<void>(...)` on a `handleEnvelope`-wrapped channel without `unwrapEnvelope` — the `{ ok: false, error }` envelope is silently discarded and validation failures are invisible to the renderer
