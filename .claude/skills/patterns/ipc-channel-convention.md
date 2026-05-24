# Pattern: IPC Channel Convention

All IPC channels follow `praxis.{domain}.{action}`. Streaming RPCs (the agent loop) split into three channels: `praxis.{domain}.{action}.start` (invoke), `praxis.{domain}.{action}.events.{streamId}` (server push), `praxis.{domain}.{action}.cancel` (client abort).

## Rationale

Electron's `ipcMain.handle` is Promise-based (single response). Streaming requires a separate channel per in-flight stream, keyed by a UUID `streamId`. Subscribing before invoking `.start` prevents race conditions on fast-emitting streams.

## Examples

### Example 1: Per-domain channel module — session handlers
**File**: `packages/desktop/electron/main/session-channel.ts:34`
```typescript
export function registerSessionHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);

  // Non-streaming channels (invoke → single Promise response, envelope-wrapped):
  const sessionActiveSchema = z.object({ modeId: z.string().optional() }).optional();
  handle(
    "praxis.session.active",
    handleEnvelope("praxis.session.active", log, sessionActiveSchema, async (opts) =>
      services.session.active(opts),
    ),
  );
  handle(
    "praxis.session.start",
    handleEnvelope("praxis.session.start", log, sessionStartSchema, async (opts) =>
      services.session.start({ modeId: opts.modeId, /* ... */ }),
    ),
  );
  handle(
    "praxis.session.end",
    handleEnvelope("praxis.session.end", log, z.string().min(1), async (sessionId) =>
      services.session.end(sessionId as SessionId),
    ),
  );

  // Streaming: .start invoke → per-stream events channel → .cancel on
  registerGeneratorStream<unknown, [sessionId: string, message: string]>(
    { channelBase: "praxis.session.send", log, webContentsGetter, activeAbortControllers },
    { handle, on },
    { iterate: ([sessionId, message], signal) => services.session.send(sessionId as SessionId, message, signal) },
  );
}
```

### Example 2: Client transport — subscribe before invoke (race-free)
**File**: `packages/client/src/transport/ipc.ts`
```typescript
async function* streamAsAsyncIterable<TEvent>(bridge, startChannel, args) {
  const streamId = uuidv7();
  const eventsChannel = `${startChannel}.events.${streamId}`;
  const cancelChannel = `${startChannel}.cancel`;

  // Subscribe BEFORE invoke — prevents missing events if server is fast
  const unsubscribe = bridge.subscribe(eventsChannel, (msg: IpcStreamMessage<TEvent>) => {
    if (msg.kind === "event") queue.push(msg.value);
    else if (msg.kind === "done") done = true;
    else if (msg.kind === "error") { errorMsg = msg.error; done = true; }
    wakeup();
  });

  await bridge.invoke(`${startChannel}.start`, { streamId, args });
  try {
    while (true) { /* drain queue */ }
  } finally {
    unsubscribe();
    if (!done) bridge.invoke(cancelChannel, { streamId }).catch(() => {});
  }
}
```

### Example 3: Client service constants — channel name definitions
**File**: `packages/client/src/services/session-client.ts`
```typescript
const C = {
  start:  "praxis.session.start",
  send:   "praxis.session.send",   // → .start / .events.<id> / .cancel
  end:    "praxis.session.end",
  active: "praxis.session.active",
} as const;
```

## When to Use

- Adding a new domain: follow `praxis.{newDomain}.{action}` naming; create a new `<newDomain>-channel.ts` exporting `registerNewDomainHandlers(services, …, log)` and add a single `registerNewDomainHandlers(…)` call to `ipc-server.ts`; add channel name constants in `packages/client/src/services/{newDomain}-client.ts`
- Streaming result: split into `.start` / `.events.<streamId>` / `.cancel` — never try to stream via a single `ipcMain.handle` Promise

## When NOT to Use

- Don't use the IPC pattern for communication that doesn't cross the Electron main/renderer boundary (e.g., service-to-service calls stay as direct method calls)

## Common Violations

- Invoking `.start` before subscribing to events — small but real race condition; always subscribe first
- Using `ipcMain.on` for request/response RPCs — use `ipcMain.handle` (returns a Promise) for anything that needs a response; `ipcMain.on` is for fire-and-forget signals like cancel
- Forgetting to unregister event listeners in the client's `finally` block — leaks the channel subscription across stream lifetimes
