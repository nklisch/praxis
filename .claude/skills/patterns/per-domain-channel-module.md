# Pattern: Per-Domain Channel Module

Each domain that owns a cohesive set of IPC channels exposes a `registerXxxHandlers(services, …, log)` function that pulls `{ handle, on } = createIpcHelpers(log)` and registers every channel for that domain. `ipc-server.ts` is the composition root: it builds `services`, then calls each `register*Handlers` in turn. `createIpcHelpers(log)` is the single seam that adds uniform timing logging (`ipc.handle.ok` / `ipc.handle.slow` >200ms / `ipc.handle.error`) and `serializeErrorRedacted` on the error path.

## Rationale

Before this pattern, all 60+ channel registrations lived in one `ipc-server.ts` function. Splitting by domain (activity, subagent, bootstrap-drafts, quick-check, document-scopes, ingest) gives three concrete wins: (1) each channel module is independently testable with the `vi.mock("electron")` + handler-capture pattern; (2) the cleanup list in `ipc-server` stays short — the streaming channels each manage their own `activeAbortControllers` entries; (3) cross-cutting concerns (timing, logging, error redaction) live in `createIpcHelpers` so every channel gets them uniformly without ceremony. The `subscriber-fanout-stream` pattern reaches across all of these; this pattern names the module-file shape that hosts each instance of it.

## Examples

### Example 1: ActivityChannel — register function exporting subscribe + cancel

**File**: `packages/desktop/electron/main/activity-channel.ts:18`

```typescript
export function registerActivityHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);

  handle("praxis.activity.dismiss", async (_event, id: string) => {
    services.activity.dismiss(id);
  });

  handle("praxis.activity.events.start", async (_event, streamId: string) => {
    // ... subscriber-fanout-stream body with AbortController hold-open
  });

  on("praxis.activity.events.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });
}
```

### Example 2: DocumentScopesChannel — invoke-only domain

**File**: `packages/desktop/electron/main/document-scopes-channel.ts:22`

```typescript
export function registerDocumentScopesHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle("praxis.documentScopes.listOrphaned", async () => { /* ... */ });
  handle("praxis.documentScopes.listForScope", async (_event, scope) => { /* ... */ });
  handle("praxis.documentScopes.attach", async (_event, input) => { /* ... */ });
  // ... 2 more non-streaming endpoints
}
```

### Example 3: `ipc-server.ts` as composition root delegating to `register*Handlers`

**File**: `packages/desktop/electron/main/ipc-server.ts:1291`

```typescript
registerActivityHandlers(services, webContentsGetter, activeAbortControllers, log);
registerSubAgentHandlers(services, webContentsGetter, activeAbortControllers, log);
registerBootstrapDraftsHandlers(services, webContentsGetter, activeAbortControllers, log);
registerQuickCheckHandlers(services, webContentsGetter, activeAbortControllers, log);
registerDocumentScopesHandlers(services, log);
```

Other instances: `subagent-channel.ts:18`, `bootstrap-drafts-channel.ts:20`, `quick-check-channel.ts:16`, `ingest-channel.ts:65`.

## When to Use

- Adding a cohesive new set of IPC channels for one service or one capability (3+ channels share a prefix `praxis.<domain>.*`)
- The channel set has streaming + non-streaming endpoints — keeping them in one module makes the shared `activeAbortControllers` map plumbing local
- The domain has its own service in `services` and you want to test it without booting the full `ipc-server`

## When NOT to Use

- A single one-off invoke channel — register it directly in `ipc-server.ts` (the file already hosts many such handlers; splitting for one channel is over-abstraction)
- Channels that need access to many cross-domain services and don't have a natural owner — keep them in `ipc-server.ts`

## Common Violations

- Calling `ipcMain.handle` directly instead of `createIpcHelpers(log).handle` — skips uniform timing + redacted error logging
- Using a different parameter order on `register*Handlers` — the streaming-channel modules all take `(services, webContentsGetter, activeAbortControllers, log)`; deviating fragments the composition root
- Storing the channel module's own `Map<string, AbortController>` instead of receiving the shared one — the shell cleanup at app shutdown won't see it
