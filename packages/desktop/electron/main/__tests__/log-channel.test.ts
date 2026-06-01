import { DebugTraceRegistryImpl } from "@praxis/core/services";
import type { LogRecord, SessionId } from "@praxis/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpyLogger } from "../../../../../tests/helpers/mocks.js";

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

import { LOG_CHANNEL, registerLogChannel } from "../log-channel.js";

beforeEach(() => {
  listeners.clear();
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
    registerLogChannel(makeSpyLogger());
    expect(listeners.has(LOG_CHANNEL)).toBe(true);
  });

  it("forwards a valid LogRecord to ingestRendererRecord", () => {
    const log = makeSpyLogger();
    registerLogChannel(log);
    const listener = listeners.get(LOG_CHANNEL);
    const record: LogRecord = {
      level: "info",
      time: 1700000000000,
      message: "renderer.hello",
      fields: { foo: "bar" },
      bindings: { component: "renderer" },
    };
    listener?.({}, record);
    expect(log._spies.ingestRendererRecord).toHaveBeenCalledOnce();
    const call = log._spies.ingestRendererRecord.mock.calls[0]?.[0] as LogRecord;
    expect(call.level).toBe("info");
    expect(call.message).toBe("renderer.hello");
    expect(call.fields).toEqual({ foo: "bar" });
    expect(call.bindings).toEqual({ component: "renderer" });
  });

  it("mirrors renderer outcome records into the debug trace registry", () => {
    const log = makeSpyLogger();
    const debugTrace = new DebugTraceRegistryImpl({ now: () => 1_700_000_000_000 });
    registerLogChannel(log, debugTrace);
    const record: LogRecord = {
      level: "debug",
      time: 1_700_000_000_000,
      message: "renderer.trace.outcome",
      fields: {
        rendererEventId: "renderer-1",
        sessionId: "session-1",
        eventType: "tool_result",
        outcome: "rendered",
        callId: "call-1",
        streamId: "stream-1",
      },
      bindings: { component: "renderer-trace", surface: "chat" },
    };

    listeners.get(LOG_CHANNEL)?.({}, record);

    expect(log._spies.ingestRendererRecord).toHaveBeenCalledOnce();
    expect(debugTrace.findBySessionId("session-1" as SessionId)).toEqual([
      expect.objectContaining({
        type: "renderer_outcome",
        surface: "chat",
        eventType: "tool_result",
        outcome: "rendered",
        trace: expect.objectContaining({
          runId: "renderer:session-1",
          sessionId: "session-1",
          rendererEventId: "renderer-1",
          callId: "call-1",
          streamId: "stream-1",
        }),
      }),
    ]);
  });

  it("accepts a record without optional fields/bindings", () => {
    const log = makeSpyLogger();
    registerLogChannel(log);
    listeners.get(LOG_CHANNEL)?.({}, {
      level: "warn",
      time: 1,
      message: "minimal",
    } satisfies LogRecord);
    expect(log._spies.ingestRendererRecord).toHaveBeenCalledOnce();
    const call = log._spies.ingestRendererRecord.mock.calls[0]?.[0] as LogRecord;
    expect(call.level).toBe("warn");
  });

  it("drops a payload missing 'level' and emits a debug note instead", () => {
    const log = makeSpyLogger();
    registerLogChannel(log);
    listeners.get(LOG_CHANNEL)?.({}, { time: 1, message: "x" });
    expect(log._spies.ingestRendererRecord).not.toHaveBeenCalled();
    expect(log._spies.debug).toHaveBeenCalledOnce();
    expect(log._spies.debug.mock.calls[0]?.[0]).toBe("log.record.malformed");
  });

  it("drops a payload with an unknown level", () => {
    const log = makeSpyLogger();
    registerLogChannel(log);
    listeners.get(LOG_CHANNEL)?.({}, { level: "verbose", time: 1, message: "x" });
    expect(log._spies.ingestRendererRecord).not.toHaveBeenCalled();
    expect(log._spies.debug).toHaveBeenCalledOnce();
  });

  it("drops a payload where time is not a number", () => {
    const log = makeSpyLogger();
    registerLogChannel(log);
    listeners.get(LOG_CHANNEL)?.({}, { level: "info", time: "now", message: "x" });
    expect(log._spies.ingestRendererRecord).not.toHaveBeenCalled();
    expect(log._spies.debug).toHaveBeenCalledOnce();
  });

  it("drops a payload where message is not a string", () => {
    const log = makeSpyLogger();
    registerLogChannel(log);
    listeners.get(LOG_CHANNEL)?.({}, { level: "info", time: 1, message: 42 });
    expect(log._spies.ingestRendererRecord).not.toHaveBeenCalled();
  });

  it("drops null payload", () => {
    const log = makeSpyLogger();
    registerLogChannel(log);
    listeners.get(LOG_CHANNEL)?.({}, null);
    expect(log._spies.ingestRendererRecord).not.toHaveBeenCalled();
  });

  it("drops a string payload", () => {
    const log = makeSpyLogger();
    registerLogChannel(log);
    listeners.get(LOG_CHANNEL)?.({}, "just a string");
    expect(log._spies.ingestRendererRecord).not.toHaveBeenCalled();
  });

  it("drops a record with non-object fields", () => {
    const log = makeSpyLogger();
    registerLogChannel(log);
    listeners.get(LOG_CHANNEL)?.(
      {},
      {
        level: "info",
        time: 1,
        message: "x",
        fields: "not-an-object",
      },
    );
    expect(log._spies.ingestRendererRecord).not.toHaveBeenCalled();
  });

  it("does not throw on any malformed payload", () => {
    const log = makeSpyLogger();
    registerLogChannel(log);
    const listener = listeners.get(LOG_CHANNEL);
    expect(() => listener?.({}, undefined)).not.toThrow();
    expect(() => listener?.({}, [])).not.toThrow();
    expect(() => listener?.({}, 42)).not.toThrow();
  });
});
