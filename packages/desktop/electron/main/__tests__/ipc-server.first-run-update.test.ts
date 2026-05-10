/**
 * IPC handler seam tests for praxis.config.firstRunCompleted,
 * praxis.config.markFirstRunComplete, and praxis.update.checkLatest.
 *
 * Strategy: mirror log-channel.test.ts — stub ipcMain.handle to capture
 * registered listeners, then invoke them directly with a fake services
 * object and assert the delegate calls.
 *
 * The ipc-server registers these via createIpcHelpers(log).handle(), which
 * itself calls ipcMain.handle(). We stub at the ipcMain level so the full
 * wiring (createIpcHelpers wrapping + registerIpcHandlers dispatch) is exercised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture handlers registered with ipcMain.handle so the test can invoke them.
// biome-ignore lint/suspicious/noExplicitAny: handler args vary per channel
type Handler = (event: unknown, ...args: any[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();

vi.mock("electron", () => ({
  app: {
    getVersion: () => "1.2.3",
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

// registerIpcHandlers is imported AFTER the mock is in place (hoisting handled by Vitest).
import { registerIpcHandlers } from "../ipc-server.js";

// ── Minimal fake logger ──────────────────────────────────────────────────────

function makeFakeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: unknown) {
      return makeFakeLogger();
    }),
    ingestRendererRecord: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

// ── Minimal fake Services ────────────────────────────────────────────────────
// Only populate the service methods exercised by the three channels under test.

function makeServices(overrides: {
  firstRunCompleted?: () => Promise<boolean>;
  markFirstRunComplete?: () => Promise<void>;
  checkLatest?: (version: string) => Promise<unknown>;
}) {
  const config = {
    firstRunCompleted: overrides.firstRunCompleted ?? vi.fn().mockResolvedValue(false),
    markFirstRunComplete: overrides.markFirstRunComplete ?? vi.fn().mockResolvedValue(undefined),
    // Stub the rest of config so registerIpcHandlers doesn't throw on boot.
    isLocked: vi.fn().mockResolvedValue(false),
    setLockCode: vi.fn(),
    unlock: vi.fn(),
    selectedEngine: vi.fn().mockResolvedValue("claude-code"),
    setSelectedEngine: vi.fn(),
    engineConfig: vi.fn().mockResolvedValue({}),
    setEngineConfig: vi.fn(),
    bootstrapConfig: vi.fn().mockResolvedValue({}),
    setBootstrapConfig: vi.fn(),
  };

  const update = {
    checkLatest: overrides.checkLatest ?? vi.fn().mockResolvedValue({ status: "disabled" }),
  };

  // biome-ignore lint/suspicious/noExplicitAny: partial stub — only used fields matter
  return { config, update } as any;
}

beforeEach(() => {
  handlers.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── praxis.config.firstRunCompleted ──────────────────────────────────────────

describe("praxis.config.firstRunCompleted handler", () => {
  it("is registered by registerIpcHandlers", () => {
    const log = makeFakeLogger();
    registerIpcHandlers(makeServices({}), () => null, log);
    expect(handlers.has("praxis.config.firstRunCompleted")).toBe(true);
  });

  it("delegates to services.config.firstRunCompleted and returns its value", async () => {
    const firstRunCompleted = vi.fn().mockResolvedValue(true);
    const log = makeFakeLogger();
    registerIpcHandlers(makeServices({ firstRunCompleted }), () => null, log);

    const handler = handlers.get("praxis.config.firstRunCompleted");
    const result = await handler?.({});

    expect(firstRunCompleted).toHaveBeenCalledOnce();
    expect(result).toBe(true);
  });
});

// ── praxis.config.markFirstRunComplete ──────────────────────────────────────

describe("praxis.config.markFirstRunComplete handler", () => {
  it("is registered by registerIpcHandlers", () => {
    const log = makeFakeLogger();
    registerIpcHandlers(makeServices({}), () => null, log);
    expect(handlers.has("praxis.config.markFirstRunComplete")).toBe(true);
  });

  it("delegates to services.config.markFirstRunComplete", async () => {
    const markFirstRunComplete = vi.fn().mockResolvedValue(undefined);
    const log = makeFakeLogger();
    registerIpcHandlers(makeServices({ markFirstRunComplete }), () => null, log);

    const handler = handlers.get("praxis.config.markFirstRunComplete");
    await handler?.({});

    expect(markFirstRunComplete).toHaveBeenCalledOnce();
  });
});

// ── praxis.update.checkLatest ────────────────────────────────────────────────

describe("praxis.update.checkLatest handler", () => {
  it("is registered by registerIpcHandlers", () => {
    const log = makeFakeLogger();
    registerIpcHandlers(makeServices({}), () => null, log);
    expect(handlers.has("praxis.update.checkLatest")).toBe(true);
  });

  it("forwards app.getVersion() to services.update.checkLatest", async () => {
    const checkLatest = vi.fn().mockResolvedValue({ status: "up-to-date", current: "1.2.3" });
    const log = makeFakeLogger();
    registerIpcHandlers(makeServices({ checkLatest }), () => null, log);

    const handler = handlers.get("praxis.update.checkLatest");
    const result = await handler?.({});

    // app.getVersion() returns "1.2.3" per the electron mock above.
    expect(checkLatest).toHaveBeenCalledWith("1.2.3");
    expect(result).toMatchObject({ status: "up-to-date", current: "1.2.3" });
  });
});
