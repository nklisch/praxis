import { DebugTraceRegistryImpl } from "@praxis/core/services";
import type { EngineEvent } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpyLogger } from "../../../../../tests/helpers/mocks.js";

// biome-ignore lint/suspicious/noExplicitAny: handler args vary per channel
type Handler = (event: unknown, ...args: any[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();
const onListeners = new Map<string, Handler>();

vi.mock("electron", () => ({
  app: {
    getVersion: () => "0.0.0-test",
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn);
    },
    on: (channel: string, listener: Handler) => {
      onListeners.set(channel, listener);
    },
    removeHandler: () => {},
    removeAllListeners: () => {},
  },
}));

import { registerSessionHandlers } from "../session-channel.js";

beforeEach(() => {
  handlers.clear();
  onListeners.clear();
  vi.clearAllMocks();
});

describe("praxis.session.send trace records", () => {
  it("records stream lifecycle and engine event summaries with stream and session ids", async () => {
    const debugTrace = new DebugTraceRegistryImpl({ now: () => 1_000 });
    const sessionId = "session-trace-1";

    async function* send(): AsyncIterable<EngineEvent> {
      yield { type: "tool_call", toolName: "document.search", args: {}, callId: "call-1" };
      yield {
        type: "final",
        usage: { inputTokens: 1, outputTokens: 2 },
        finalReason: "success",
      };
    }

    const services = {
      debugTrace,
      session: {
        active: vi.fn(),
        start: vi.fn(),
        end: vi.fn(),
        spawnFromAssignment: vi.fn(),
        spawnFromNote: vi.fn(),
        spawnFromPassage: vi.fn(),
        send: vi.fn().mockImplementation(send),
        list: vi.fn(),
        discardIfUnpromoted: vi.fn(),
      },
    };
    const fakeWebContents = {
      isDestroyed: () => false,
      send: vi.fn(),
    };

    registerSessionHandlers(
      services as unknown as import("../services.js").Services,
      () => fakeWebContents as unknown as Electron.WebContents,
      new Map(),
      makeSpyLogger(),
    );

    const startHandler = handlers.get("praxis.session.send.start");
    expect(startHandler).toBeDefined();

    await startHandler?.({}, "stream-session-trace-1", sessionId, "hello");

    const records = debugTrace.list().filter((record) => record.type === "ipc_stream_event");

    expect(records.map((record) => record.eventType)).toEqual([
      "start",
      "tool_call",
      "final",
      "done",
    ]);
    expect(records.every((record) => record.channel === "praxis.session.send")).toBe(true);
    expect(records.every((record) => record.trace.streamId === "stream-session-trace-1")).toBe(
      true,
    );
    expect(records.every((record) => record.trace.sessionId === sessionId)).toBe(true);
    expect(records.find((record) => record.eventType === "tool_call")?.trace.callId).toBe("call-1");
    expect(records.map((record) => record.eventCount)).toEqual([0, 1, 2, 2]);
  });
});
