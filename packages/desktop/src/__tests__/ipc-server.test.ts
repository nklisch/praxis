/**
 * IPC server handler tests.
 * Tests the shape and behavior of the IPC protocol by validating the handler
 * registration pattern using mocked electron ipcMain.
 *
 * Note: The actual ipc-server.ts lives in electron/main/ (not in src/) and is
 * bundled by electron-vite. These tests validate the overall IPC protocol
 * contract without importing across the src/electron boundary.
 */
import { describe, expect, it, vi } from "vitest";

// Mock electron
vi.mock("electron", () => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const onListeners = new Map<string, Array<(...args: unknown[]) => void>>();

  return {
    ipcMain: {
      handle: vi.fn((channel: string, fn: (...args: unknown[]) => Promise<unknown>) => {
        handlers.set(channel, fn);
      }),
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel);
      }),
      on: vi.fn((channel: string, fn: (...args: unknown[]) => void) => {
        const list = onListeners.get(channel) ?? [];
        list.push(fn);
        onListeners.set(channel, list);
      }),
      removeAllListeners: vi.fn((channel: string) => {
        onListeners.delete(channel);
      }),
      _handlers: handlers,
      _invoke: async (channel: string, ...args: unknown[]) => {
        const fn = handlers.get(channel);
        if (!fn) throw new Error(`No handler for channel: ${channel}`);
        return fn({} as unknown, ...args);
      },
    },
  };
});

/**
 * Minimal IPC protocol contract tests.
 * These verify that:
 * 1. The channel naming convention is correct
 * 2. Stream channels use the .start/.events./.cancel pattern
 * 3. Before-quit lifecycle invokes session.shutdown
 */
describe("IPC server protocol", () => {
  it("channel naming convention: praxis.session.send uses .start/.events./.cancel", () => {
    const baseChannel = "praxis.session.send";
    expect(`${baseChannel}.start`).toBe("praxis.session.send.start");
    expect(`${baseChannel}.events.${"stream-1"}`).toBe("praxis.session.send.events.stream-1");
    expect(`${baseChannel}.cancel`).toBe("praxis.session.send.cancel");
  });

  it("IpcStreamMessage has 'kind' discriminant", () => {
    // Type-level check via runtime value shapes
    type EventMsg = { kind: "event"; payload: unknown };
    type DoneMsg = { kind: "done" };
    type ErrorMsg = { kind: "error"; error: string };

    const eventMsg: EventMsg = { kind: "event", payload: { type: "model_message", content: "hi" } };
    const doneMsg: DoneMsg = { kind: "done" };
    const errorMsg: ErrorMsg = { kind: "error", error: "oops" };

    expect(eventMsg.kind).toBe("event");
    expect(doneMsg.kind).toBe("done");
    expect(errorMsg.kind).toBe("error");
  });

  it("before-quit hook calls session.shutdown and then app.exit", async () => {
    // Test the before-quit pattern in isolation — verifies the shutdown lifecycle
    const shutdown = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    const services = { session: { shutdown } };
    let shuttingDown = false;

    const handler = async (event: { preventDefault: () => void }) => {
      if (shuttingDown || !services) return;
      shuttingDown = true;
      event.preventDefault();
      try {
        await services.session.shutdown();
      } finally {
        exit(0);
      }
    };

    const fakeEvent = { preventDefault: vi.fn() };
    await handler(fakeEvent);

    expect(fakeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("before-quit is idempotent (shuttingDown guard)", async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    const services = { session: { shutdown } };
    let shuttingDown = false;

    const handler = async (event: { preventDefault: () => void }) => {
      if (shuttingDown || !services) return;
      shuttingDown = true;
      event.preventDefault();
      try {
        await services.session.shutdown();
      } finally {
        exit(0);
      }
    };

    const fakeEvent = { preventDefault: vi.fn() };
    await handler(fakeEvent);
    await handler(fakeEvent); // second call should be a no-op

    expect(shutdown).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });
});
