/**
 * Regression tests: lock-gating on `praxis.author.setGlobalPrompt` and
 * `praxis.author.setModeAppend` IPC handlers.
 *
 * Architecture context: lock enforcement lives at the IPC layer, NOT in
 * `AuthoringServiceImpl`. The `requireUnlocked()` guard in `ipc-server.ts`
 * (line ~73) is the backstop for the entire `praxis.author.*` channel group.
 * See `packages/core/src/services/authoring-service.ts:8` for the explicit
 * design comment.
 *
 * Full seam under test:
 *   praxis.author.setGlobalPrompt / praxis.author.setModeAppend (ipcMain.handle)
 *     → requireUnlocked()
 *       → services.lock.isUnlocked()
 *         → false → throws "Locked: configure surface requires unlock..."
 *         → true  → delegates to services.authoring.*
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpyLogger } from "../../../../../tests/helpers/mocks.js";

// Capture handlers registered via ipcMain.handle so the test can invoke them.
// biome-ignore lint/suspicious/noExplicitAny: handler args vary per channel
type Handler = (event: unknown, ...args: any[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();

vi.mock("electron", () => ({
  app: {
    getVersion: () => "0.1.1",
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn);
    },
    on: () => {},
    removeHandler: () => {},
    removeAllListeners: () => {},
  },
}));

// Import AFTER mock is in place — Vitest hoists vi.mock() automatically.
import { registerIpcHandlers } from "../ipc-server.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal fake Services bag sufficient for `registerIpcHandlers` to
 * complete without crashing, while giving full control over:
 *   - `lock.isUnlocked` — controls the gate
 *   - `authoring.setGlobalPrompt` / `authoring.setModeAppend` — the stubs that
 *     must NOT be called when the lock gate rejects
 */
function makeServices({
  isUnlocked,
  setGlobalPrompt,
  setModeAppend,
}: {
  isUnlocked: () => Promise<boolean>;
  setGlobalPrompt?: () => Promise<void>;
  setModeAppend?: () => Promise<void>;
}) {
  const lock = {
    isSet: vi.fn().mockResolvedValue(false),
    isUnlocked: vi.fn().mockImplementation(isUnlocked),
    setLockCode: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue({ ok: true }),
    lock: vi.fn().mockResolvedValue(undefined),
    clearLock: vi.fn().mockResolvedValue(undefined),
  };

  const authoring = {
    setGlobalPrompt: setGlobalPrompt
      ? vi.fn().mockImplementation(setGlobalPrompt)
      : vi.fn().mockResolvedValue(undefined),
    getGlobalPrompt: vi.fn().mockResolvedValue(null),
    setModeAppend: setModeAppend
      ? vi.fn().mockImplementation(setModeAppend)
      : vi.fn().mockResolvedValue(undefined),
    getModeAppend: vi.fn().mockResolvedValue(null),
    previewPrompt: vi.fn().mockResolvedValue(""),
    // Other authoring methods needed so ipc-server registration doesn't crash.
    setFragmentOverride: vi.fn().mockResolvedValue(undefined),
    clearFragmentOverride: vi.fn().mockResolvedValue(undefined),
    setStyleSliders: vi.fn().mockResolvedValue(undefined),
    getStyleSliders: vi.fn().mockResolvedValue({ socratic: 5, verbosity: 5, formality: 5 }),
    resetConcept: vi.fn().mockResolvedValue(undefined),
    openConfigurator: vi.fn().mockResolvedValue(undefined),
    listActions: vi.fn().mockResolvedValue([]),
    setGateStatus: vi.fn().mockResolvedValue(undefined),
    setGateLockdown: vi.fn().mockResolvedValue(undefined),
  };

  const session = {
    active: vi.fn().mockResolvedValue([]),
    start: vi.fn().mockResolvedValue({}),
    end: vi.fn().mockResolvedValue({}),
    list: vi.fn().mockResolvedValue([]),
    send: vi.fn(async function* () {}),
    spawnFromAssignment: vi.fn().mockResolvedValue({}),
    notifySession: vi.fn().mockResolvedValue(undefined),
  };

  const config = {
    isLocked: vi.fn().mockResolvedValue(false),
    setLockCode: vi.fn(),
    unlock: vi.fn(),
    selectedEngine: vi.fn().mockResolvedValue("claude-code"),
    setSelectedEngine: vi.fn(),
    engineConfig: vi.fn().mockResolvedValue({}),
    setEngineConfig: vi.fn(),
    bootstrapConfig: vi.fn().mockResolvedValue({}),
    setBootstrapConfig: vi.fn(),
    firstRunCompleted: vi.fn().mockResolvedValue(false),
    markFirstRunComplete: vi.fn().mockResolvedValue(undefined),
  };

  const update = {
    checkLatest: vi.fn().mockResolvedValue({ status: "disabled" }),
  };

  // biome-ignore lint/suspicious/noExplicitAny: partial stub — only author + lock paths exercised
  return { session, config, update, lock, authoring } as any;
}

beforeEach(() => {
  handlers.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── praxis.author.setGlobalPrompt — lock gate ─────────────────────────────────

describe("praxis.author.setGlobalPrompt lock gate", () => {
  it("rejects with lock error when isUnlocked() returns false", async () => {
    const log = makeSpyLogger();
    const services = makeServices({ isUnlocked: async () => false });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.setGlobalPrompt");
    expect(handler).toBeDefined();

    await expect(handler?.({}, { text: "injected prompt" })).rejects.toThrow(
      /Locked|configurator|unlock/i,
    );
  });

  it("does NOT call authoring.setGlobalPrompt when locked", async () => {
    const log = makeSpyLogger();
    const services = makeServices({ isUnlocked: async () => false });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.setGlobalPrompt");
    await (handler?.({}, { text: "injected prompt" }) as Promise<unknown>).catch(() => {});

    expect(services.authoring.setGlobalPrompt).not.toHaveBeenCalled();
  });

  it("delegates to authoring.setGlobalPrompt when unlocked (positive control)", async () => {
    const log = makeSpyLogger();
    const services = makeServices({ isUnlocked: async () => true });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.setGlobalPrompt");
    await handler?.({}, { text: "my custom prompt" });

    expect(services.authoring.setGlobalPrompt).toHaveBeenCalledOnce();
    expect(services.authoring.setGlobalPrompt).toHaveBeenCalledWith("my custom prompt");
  });
});

// ── praxis.author.setModeAppend — lock gate ───────────────────────────────────

describe("praxis.author.setModeAppend lock gate", () => {
  it("rejects with lock error when isUnlocked() returns false", async () => {
    const log = makeSpyLogger();
    const services = makeServices({ isUnlocked: async () => false });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.setModeAppend");
    expect(handler).toBeDefined();

    await expect(handler?.({}, { modeId: "teach", text: "injected append" })).rejects.toThrow(
      /Locked|configurator|unlock/i,
    );
  });

  it("does NOT call authoring.setModeAppend when locked", async () => {
    const log = makeSpyLogger();
    const services = makeServices({ isUnlocked: async () => false });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.setModeAppend");
    await (handler?.({}, { modeId: "teach", text: "injected append" }) as Promise<unknown>).catch(
      () => {},
    );

    expect(services.authoring.setModeAppend).not.toHaveBeenCalled();
  });

  it("delegates to authoring.setModeAppend when unlocked (positive control)", async () => {
    const log = makeSpyLogger();
    const services = makeServices({ isUnlocked: async () => true });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.setModeAppend");
    await handler?.({}, { modeId: "teach", text: "extra context" });

    expect(services.authoring.setModeAppend).toHaveBeenCalledOnce();
    expect(services.authoring.setModeAppend).toHaveBeenCalledWith({
      modeId: "teach",
      text: "extra context",
    });
  });
});
