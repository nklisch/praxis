import type { LogRecord } from "@praxis/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the listener registered with ipcMain.on so the test can invoke it directly.
type Listener = (event: unknown, payload: unknown) => void;
const listeners = new Map<string, Listener>();

vi.mock("electron", () => ({
  ipcMain: {
    on: (channel: string, listener: Listener) => {
      listeners.set(channel, listener);
    },
  },
}));

type Captured = { level: string; message: string; record: LogRecord };
let captured: Captured[];
let debugCalls: Array<{ message: string; fields?: Record<string, unknown> }>;

import { LOG_CHANNEL, registerLogChannel } from "../log-channel.js";
import type { MainLogger } from "../logger.js";

function makeFakeLogger(): MainLogger {
  return {
    debug: (message, fields) => {
      debugCalls.push({ message, ...(fields !== undefined && { fields }) });
    },
    info: () => {},
    warn: () => {},
    error: () => {},
    child: function (this: MainLogger) {
      return this;
    },
    ingestRendererRecord: (record) => {
      captured.push({ level: record.level, message: record.message, record });
    },
    shutdown: async () => {},
  };
}

beforeEach(() => {
  listeners.clear();
  captured = [];
  debugCalls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("LOG_CHANNEL", () => {
  it("is exported as 'praxis.log.record'", () => {
    expect(LOG_CHANNEL).toBe("praxis.log.record");
  });
});

describe("registerLogChannel", () => {
  it("subscribes to LOG_CHANNEL on ipcMain", () => {
    registerLogChannel(makeFakeLogger());
    expect(listeners.has(LOG_CHANNEL)).toBe(true);
  });

  it("forwards a valid LogRecord to ingestRendererRecord", () => {
    registerLogChannel(makeFakeLogger());
    const listener = listeners.get(LOG_CHANNEL);
    const record: LogRecord = {
      level: "info",
      time: 1700000000000,
      message: "renderer.hello",
      fields: { foo: "bar" },
      bindings: { component: "renderer" },
    };
    listener?.({}, record);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.level).toBe("info");
    expect(captured[0]?.message).toBe("renderer.hello");
    expect(captured[0]?.record.fields).toEqual({ foo: "bar" });
    expect(captured[0]?.record.bindings).toEqual({ component: "renderer" });
  });

  it("accepts a record without optional fields/bindings", () => {
    registerLogChannel(makeFakeLogger());
    listeners.get(LOG_CHANNEL)?.({}, {
      level: "warn",
      time: 1,
      message: "minimal",
    } satisfies LogRecord);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.level).toBe("warn");
  });

  it("drops a payload missing 'level' and emits a debug note instead", () => {
    registerLogChannel(makeFakeLogger());
    listeners.get(LOG_CHANNEL)?.({}, { time: 1, message: "x" });
    expect(captured).toHaveLength(0);
    expect(debugCalls).toHaveLength(1);
    expect(debugCalls[0]?.message).toBe("log.record.malformed");
  });

  it("drops a payload with an unknown level", () => {
    registerLogChannel(makeFakeLogger());
    listeners.get(LOG_CHANNEL)?.({}, { level: "verbose", time: 1, message: "x" });
    expect(captured).toHaveLength(0);
    expect(debugCalls).toHaveLength(1);
  });

  it("drops a payload where time is not a number", () => {
    registerLogChannel(makeFakeLogger());
    listeners.get(LOG_CHANNEL)?.({}, { level: "info", time: "now", message: "x" });
    expect(captured).toHaveLength(0);
    expect(debugCalls).toHaveLength(1);
  });

  it("drops a payload where message is not a string", () => {
    registerLogChannel(makeFakeLogger());
    listeners.get(LOG_CHANNEL)?.({}, { level: "info", time: 1, message: 42 });
    expect(captured).toHaveLength(0);
  });

  it("drops null payload", () => {
    registerLogChannel(makeFakeLogger());
    listeners.get(LOG_CHANNEL)?.({}, null);
    expect(captured).toHaveLength(0);
  });

  it("drops a string payload", () => {
    registerLogChannel(makeFakeLogger());
    listeners.get(LOG_CHANNEL)?.({}, "just a string");
    expect(captured).toHaveLength(0);
  });

  it("drops a record with non-object fields", () => {
    registerLogChannel(makeFakeLogger());
    listeners.get(LOG_CHANNEL)?.(
      {},
      {
        level: "info",
        time: 1,
        message: "x",
        fields: "not-an-object",
      },
    );
    expect(captured).toHaveLength(0);
  });

  it("does not throw on any malformed payload", () => {
    registerLogChannel(makeFakeLogger());
    const listener = listeners.get(LOG_CHANNEL);
    expect(() => listener?.({}, undefined)).not.toThrow();
    expect(() => listener?.({}, [])).not.toThrow();
    expect(() => listener?.({}, 42)).not.toThrow();
  });
});
