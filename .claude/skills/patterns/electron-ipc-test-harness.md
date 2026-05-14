# Pattern: Electron IPC Test Harness

IPC channel tests stub `electron` at the module boundary so `ipcMain.handle` / `ipcMain.on` push their listeners into local `Map<string, Handler>` instances the test owns; `registerIpcHandlers` (or a `register*Handlers` from a per-domain channel module) is then imported *after* the mock is in place (Vitest hoists `vi.mock`), and the test invokes captured handlers directly with a minimal fake `Services` bag — no `ipcRenderer.invoke`, no Electron runtime.

## Rationale

The full IPC seam ("renderer calls a channel → main handler runs → service is called → renderer receives a value or rejection") is what we want to verify, but spinning up Electron in a test is slow and brittle. Stubbing at `ipcMain` captures handlers into a Map; calling `handlers.get("praxis.x.y")?.({}, ...args)` exercises the *exact* wrapper that `wrapEnvelope` / `createIpcHelpers` builds, so timing-logging, envelope wrapping, and Zod validation all run as in production. The fake `Services` bag is shaped per-test — only the methods the test will actually call are populated; everything else can throw on unexpected access so cross-talk surfaces loudly.

## Examples

### Example 1: Capture map + electron mock + post-mock import

**File**: `packages/desktop/electron/main/__tests__/ipc-server.first-run-update.test.ts:18`

```typescript
const handlers = new Map<string, Handler>();

vi.mock("electron", () => ({
  app: { getVersion: () => "1.2.3" },
  ipcMain: {
    handle: (channel: string, fn: Handler) => { handlers.set(channel, fn); },
    on: () => {},
    removeHandler: () => {},
    removeAllListeners: () => {},
  },
}));

// Import AFTER the mock is in place — Vitest hoists vi.mock() automatically.
import { registerIpcHandlers } from "../ipc-server.js";
```

### Example 2: Cancel-signal end-to-end test with both `handle` and `on` capture

**File**: `packages/desktop/electron/main/__tests__/ipc-server.cancel.test.ts:21`

```typescript
const handlers = new Map<string, Handler>();
const onListeners = new Map<string, Handler>();

vi.mock("electron", () => ({
  app: { getVersion: () => "0.1.0" },
  ipcMain: {
    handle: (channel: string, fn: Handler) => { handlers.set(channel, fn); },
    on: (channel: string, listener: Handler) => { onListeners.set(channel, listener); },
    removeHandler: () => {},
    removeAllListeners: () => {},
  },
}));
```

### Example 3: Author/lock gate test — same shape, different fake `Services`

**File**: `packages/desktop/electron/main/__tests__/ipc-server.author.lock.test.ts:25`

```typescript
vi.mock("electron", () => ({
  app: { getVersion: () => "0.1.1" },
  ipcMain: {
    handle: (channel: string, fn: Handler) => { handlers.set(channel, fn); },
    on: () => {},
    removeHandler: () => {},
    removeAllListeners: () => {},
  },
}));
import { registerIpcHandlers } from "../ipc-server.js";
// ... later
const handler = handlers.get("praxis.author.setGlobalPrompt");
await expect(handler?.({}, { prompt: "x" })).rejects.toThrow(/locked/);
```

Additional instances: `ipc-helpers.test.ts:10`, `log-channel.test.ts:8`, `secret-storage.test.ts:21`.

## When to Use

- Testing an IPC channel's wiring (handler registration, Zod validation, envelope wrapping, abort-signal propagation)
- Verifying that a channel calls the right service method with the right arguments
- Asserting failure modes (locked / not-authorized / validation-failed) without spinning up Electron

## When NOT to Use

- Pure service-layer tests — call the service method directly with `useTempDb` + a fake logger; no need to drag IPC into it
- UI / renderer-side tests — use `makeFakeClient(overrides?)` (`ui-test-helper` pattern); the renderer never sees the main-side handler

## Common Violations

- Importing `registerIpcHandlers` *before* `vi.mock("electron")` — the real `ipcMain` is imported and the test silently does nothing
- Adding extra `ipcMain` surface (`removeHandler`, `removeAllListeners`) only to some tests — `registerIpcHandlers` calls these during cleanup; tests need the same skeleton
- Building a different fake-services factory per file when 3+ tests want the same minimal bag — factor into `tests/helpers/mocks.ts` (`shared-test-fake-factories`)
