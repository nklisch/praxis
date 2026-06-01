import { describe, expect, it, vi } from "vitest";
import type { IpcStreamMessage, PraxisIpcBridge } from "../transport/ipc.js";
import { createIpcTransport, IpcStreamError, streamAsAsyncIterable } from "../transport/ipc.js";

interface TestBridge {
  bridge: PraxisIpcBridge;
  pushToRegisteredChannel: (msg: IpcStreamMessage<unknown>) => void;
  getLastRegisteredEventsChannel: () => string | undefined;
  invokeSpy: Array<{ channel: string; args: unknown[] }>;
  sendSpy: Array<{ channel: string; args: unknown[] }>;
}

function makeBridge(): TestBridge {
  const listeners = new Map<string, Array<(data: unknown) => void>>();
  const invokeSpy: Array<{ channel: string; args: unknown[] }> = [];
  const sendSpy: Array<{ channel: string; args: unknown[] }> = [];
  let lastRegisteredChannel: string | undefined;

  const bridge: PraxisIpcBridge = {
    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      invokeSpy.push({ channel, args });
      return Promise.resolve(undefined);
    },
    on(channel: string, listener: (data: unknown) => void): () => void {
      lastRegisteredChannel = channel;
      const list = listeners.get(channel) ?? [];
      list.push(listener);
      listeners.set(channel, list);
      return () => {
        const updated = listeners.get(channel)?.filter((l) => l !== listener) ?? [];
        listeners.set(channel, updated);
      };
    },
    send(channel: string, ...args: unknown[]): void {
      sendSpy.push({ channel, args });
    },
  };

  return {
    bridge,
    pushToRegisteredChannel(msg: IpcStreamMessage<unknown>) {
      if (!lastRegisteredChannel) throw new Error("No channel registered yet");
      for (const l of listeners.get(lastRegisteredChannel) ?? []) {
        l(msg);
      }
    },
    getLastRegisteredEventsChannel() {
      return lastRegisteredChannel;
    },
    invokeSpy,
    sendSpy,
  };
}

describe("streamAsAsyncIterable", () => {
  it("rejects the iterator when startup invoke fails before any event arrives", async () => {
    const { bridge } = makeBridge();
    bridge.invoke = () => Promise.reject(new Error("start failed"));

    const iterable = streamAsAsyncIterable<string>(
      bridge,
      "ch.start",
      "ch.events.",
      "ch.cancel",
      [],
    );

    await expect(
      (async () => {
        for await (const _event of iterable) {
          // no-op
        }
      })(),
    ).rejects.toThrow("start failed");
  });

  it("yields events and completes on done", async () => {
    const { bridge, pushToRegisteredChannel } = makeBridge();

    const iterable = streamAsAsyncIterable<string>(bridge, "ch.start", "ch.events.", "ch.cancel", [
      "arg1",
    ]);

    const results: string[] = [];
    // Push events after a microtask so the iterator has had time to register.
    const iterPromise = (async () => {
      for await (const v of iterable) {
        results.push(v);
      }
    })();

    // The for-await-of loop creates the iterator synchronously, which calls bridge.on.
    // Push via microtask to let the iterator reach its first await.
    await Promise.resolve();
    pushToRegisteredChannel({ kind: "event", payload: "hello" });
    pushToRegisteredChannel({ kind: "event", payload: "world" });
    pushToRegisteredChannel({ kind: "done" });

    await iterPromise;
    expect(results).toEqual(["hello", "world"]);
  });

  it("throws IpcStreamError on error message", async () => {
    const { bridge, pushToRegisteredChannel } = makeBridge();

    const iterable = streamAsAsyncIterable<string>(
      bridge,
      "ch2.start",
      "ch2.events.",
      "ch2.cancel",
      [],
    );

    const iterPromise = (async () => {
      const out: string[] = [];
      for await (const v of iterable) {
        out.push(v);
      }
      return out;
    })();

    await Promise.resolve();
    pushToRegisteredChannel({ kind: "error", error: "something broke" });

    await expect(iterPromise).rejects.toThrow(IpcStreamError);
  });

  it("sends cancel signal when consumer breaks out early", async () => {
    const { bridge, pushToRegisteredChannel, sendSpy } = makeBridge();

    const iterable = streamAsAsyncIterable<number>(
      bridge,
      "ch3.start",
      "ch3.events.",
      "ch3.cancel",
      [],
    );

    const iterPromise = (async () => {
      for await (const v of iterable) {
        if (v === 1) break;
      }
    })();

    await Promise.resolve();
    pushToRegisteredChannel({ kind: "event", payload: 1 });
    pushToRegisteredChannel({ kind: "event", payload: 2 }); // consumer already broke out

    await iterPromise;
    expect(sendSpy.some((s) => s.channel === "ch3.cancel")).toBe(true);
  });

  it("does not reuse stream ids after reload-like module reinitialization", async () => {
    const firstId = await firstStreamIdFromFreshTransportModule();
    const secondId = await firstStreamIdFromFreshTransportModule();

    expect(firstId).not.toBe(secondId);
    expect(firstId).not.toMatch(/^stream-\d+$/);
    expect(secondId).not.toMatch(/^stream-\d+$/);
  });
});

describe("createIpcTransport", () => {
  it("invoke delegates to bridge.invoke", async () => {
    const { bridge, invokeSpy } = makeBridge();
    const transport = createIpcTransport(bridge);
    await transport.invoke("praxis.session.active");
    expect(invokeSpy).toHaveLength(1);
    expect(invokeSpy[0]?.channel).toBe("praxis.session.active");
  });

  it("stream uses .start / .events. / .cancel channel convention", async () => {
    const { bridge, invokeSpy, pushToRegisteredChannel, getLastRegisteredEventsChannel } =
      makeBridge();
    const transport = createIpcTransport(bridge);

    const stream = transport.stream<string>("praxis.session.send", "session-1", "hello");

    const iterPromise = (async () => {
      const results: string[] = [];
      for await (const v of stream) {
        results.push(v);
      }
      return results;
    })();

    // After one microtask tick the iterator has started and registered.
    await Promise.resolve();
    const eventsChannel = getLastRegisteredEventsChannel();
    expect(eventsChannel).toMatch(/^praxis\.session\.send\.events\./);

    // The .start invoke should have been called.
    const startCall = invokeSpy.find((c) => c.channel === "praxis.session.send.start");
    expect(startCall).toBeDefined();

    pushToRegisteredChannel({ kind: "event", payload: "response" });
    pushToRegisteredChannel({ kind: "done" });

    const results = await iterPromise;
    expect(results).toEqual(["response"]);
  });

  it("generates distinct non-predictable stream ids across transport instances", async () => {
    const first = makeBridge();
    const second = makeBridge();
    const firstTransport = createIpcTransport(first.bridge);
    const secondTransport = createIpcTransport(second.bridge);

    const firstIterator = firstTransport
      .stream<string>("praxis.session.send", "session-1", "hello")
      [Symbol.asyncIterator]();
    const secondIterator = secondTransport
      .stream<string>("praxis.session.send", "session-2", "hello")
      [Symbol.asyncIterator]();

    await firstIterator.return?.();
    await secondIterator.return?.();

    const firstId = first.invokeSpy[0]?.args[0];
    const secondId = second.invokeSpy[0]?.args[0];
    expect(firstId).toEqual(expect.any(String));
    expect(secondId).toEqual(expect.any(String));
    expect(firstId).not.toBe(secondId);
    expect(firstId).not.toMatch(/^stream-\d+$/);
    expect(secondId).not.toMatch(/^stream-\d+$/);
  });
});

async function firstStreamIdFromFreshTransportModule(): Promise<string> {
  vi.resetModules();
  const fresh = await import("../transport/ipc.js");
  const { bridge, invokeSpy } = makeBridge();
  const iterator = fresh
    .streamAsAsyncIterable<string>(bridge, "ch.start", "ch.events.", "ch.cancel", [])
    [Symbol.asyncIterator]();

  await iterator.return?.();

  const streamId = invokeSpy[0]?.args[0];
  if (typeof streamId !== "string") {
    throw new Error("fresh transport did not invoke stream start with a stream id");
  }
  return streamId;
}
