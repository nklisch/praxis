import type { Logger } from "@praxis/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture handlers and on-listeners registered via ipcMain.
// biome-ignore lint/suspicious/noExplicitAny: handler args vary per channel
type Handler = (event: unknown, ...args: any[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();
const onListeners = new Map<string, Handler>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => {
      handlers.set(channel, handler);
    },
    on: (channel: string, listener: Handler) => {
      onListeners.set(channel, listener);
    },
  },
}));

import { createIpcHelpers } from "../ipc-helpers.js";

interface CapturedRecord {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  fields?: Record<string, unknown>;
  bindings?: Record<string, unknown>;
}

function makeRecorder(): {
  log: Logger;
  records: CapturedRecord[];
} {
  const records: CapturedRecord[] = [];
  const make = (bindings: Record<string, unknown>): Logger => ({
    debug: (m, f) =>
      records.push({
        level: "debug",
        message: m,
        ...(f !== undefined && { fields: f }),
        ...(Object.keys(bindings).length > 0 && { bindings }),
      }),
    info: (m, f) =>
      records.push({
        level: "info",
        message: m,
        ...(f !== undefined && { fields: f }),
        ...(Object.keys(bindings).length > 0 && { bindings }),
      }),
    warn: (m, f) =>
      records.push({
        level: "warn",
        message: m,
        ...(f !== undefined && { fields: f }),
        ...(Object.keys(bindings).length > 0 && { bindings }),
      }),
    error: (m, f) =>
      records.push({
        level: "error",
        message: m,
        ...(f !== undefined && { fields: f }),
        ...(Object.keys(bindings).length > 0 && { bindings }),
      }),
    child: (b) => make({ ...bindings, ...b }),
  });
  return { log: make({}), records };
}

beforeEach(() => {
  handlers.clear();
  onListeners.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("createIpcHelpers — handle()", () => {
  it("registers an ipcMain.handle for the given channel", () => {
    const { log } = makeRecorder();
    const { handle } = createIpcHelpers(log);
    handle("praxis.test.ok", async () => 42);
    expect(handlers.has("praxis.test.ok")).toBe(true);
  });

  it("returns the handler's value to the caller on success", async () => {
    const { log } = makeRecorder();
    const { handle } = createIpcHelpers(log);
    handle("praxis.test.ok", async () => "hello");
    const result = await handlers.get("praxis.test.ok")?.({});
    expect(result).toBe("hello");
  });

  it("logs ipc.handle.ok at debug for fast calls", async () => {
    const { log, records } = makeRecorder();
    const { handle } = createIpcHelpers(log);
    handle("praxis.test.ok", async () => "done");
    await handlers.get("praxis.test.ok")?.({});
    const okRec = records.find((r) => r.message === "ipc.handle.ok");
    expect(okRec).toBeDefined();
    expect(okRec?.level).toBe("debug");
    expect(okRec?.bindings?.channel).toBe("praxis.test.ok");
    expect(okRec?.bindings?.component).toBe("ipc");
    expect(typeof okRec?.fields?.durationMs).toBe("number");
  });

  it("logs ipc.handle.slow at info when call exceeds 200ms", async () => {
    const { log, records } = makeRecorder();
    const { handle } = createIpcHelpers(log);
    let now = 1000;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => now);
    handle("praxis.test.slow", async () => {
      now = 1300; // simulate 300ms elapsed
      return "done";
    });
    await handlers.get("praxis.test.slow")?.({});
    spy.mockRestore();
    const slowRec = records.find((r) => r.message === "ipc.handle.slow");
    expect(slowRec).toBeDefined();
    expect(slowRec?.level).toBe("info");
    expect(slowRec?.fields?.durationMs).toBe(300);
  });

  it("re-throws errors so the renderer sees a rejection", async () => {
    const { log } = makeRecorder();
    const { handle } = createIpcHelpers(log);
    handle("praxis.test.err", async () => {
      throw new Error("boom");
    });
    await expect(handlers.get("praxis.test.err")?.({})).rejects.toThrow("boom");
  });

  it("logs ipc.handle.error with a serialized err on failure", async () => {
    const { log, records } = makeRecorder();
    const { handle } = createIpcHelpers(log);
    handle("praxis.test.err", async () => {
      throw new Error("boom");
    });
    await handlers.get("praxis.test.err")?.({}).catch(() => {
      /* expected */
    });
    const errRec = records.find((r) => r.message === "ipc.handle.error");
    expect(errRec).toBeDefined();
    expect(errRec?.level).toBe("error");
    expect(errRec?.bindings?.channel).toBe("praxis.test.err");
    expect(typeof errRec?.fields?.durationMs).toBe("number");
    const errField = errRec?.fields?.err as { message?: string } | undefined;
    expect(errField?.message).toBe("boom");
  });

  it("does not log ipc.handle.error twice for a single throw", async () => {
    const { log, records } = makeRecorder();
    const { handle } = createIpcHelpers(log);
    handle("praxis.test.once", async () => {
      throw new Error("nope");
    });
    await handlers.get("praxis.test.once")?.({}).catch(() => {
      /* expected */
    });
    const errRecs = records.filter((r) => r.message === "ipc.handle.error");
    expect(errRecs).toHaveLength(1);
  });

  it("forwards extra args to the handler", async () => {
    const { log } = makeRecorder();
    const { handle } = createIpcHelpers(log);
    let received: unknown[] = [];
    handle("praxis.test.args", async (_event, ...args) => {
      received = args;
      return null;
    });
    await handlers.get("praxis.test.args")?.({}, "a", "b", 3);
    expect(received).toEqual(["a", "b", 3]);
  });
});

describe("createIpcHelpers — on()", () => {
  it("registers an ipcMain.on for the given channel", () => {
    const { log } = makeRecorder();
    const { on } = createIpcHelpers(log);
    on("praxis.test.cancel", () => {});
    expect(onListeners.has("praxis.test.cancel")).toBe(true);
  });

  it("invokes the handler", async () => {
    const { log } = makeRecorder();
    const { on } = createIpcHelpers(log);
    let called = false;
    on("praxis.test.signal", () => {
      called = true;
    });
    await onListeners.get("praxis.test.signal")?.({});
    expect(called).toBe(true);
  });

  it("logs ipc.on.error and never re-throws when handler throws", async () => {
    const { log, records } = makeRecorder();
    const { on } = createIpcHelpers(log);
    on("praxis.test.fire", () => {
      throw new Error("oops");
    });
    await expect(onListeners.get("praxis.test.fire")?.({})).resolves.toBeUndefined();
    const errRec = records.find((r) => r.message === "ipc.on.error");
    expect(errRec).toBeDefined();
    expect(errRec?.level).toBe("error");
    expect(errRec?.bindings?.channel).toBe("praxis.test.fire");
  });
});
