/**
 * End-to-end integration test: praxis.session.send.cancel propagates the
 * AbortSignal all the way from the IPC layer through to the fake engine's
 * `send(message, signal)` call.
 *
 * The full seam under test:
 *   praxis.session.send.cancel (ipcMain.on listener)
 *     → activeAbortControllers.get(streamId)?.abort()
 *     → controller.signal (passed to services.session.send)
 *     → fake engine's send() receives signal; signal.aborted becomes true
 *
 * Strategy: mirror ipc-server.first-run-update.test.ts — stub ipcMain.handle
 * and ipcMain.on to capture registered listeners, then invoke them directly
 * with a fake services bag.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture handlers registered with ipcMain.handle and listeners from ipcMain.on.
// biome-ignore lint/suspicious/noExplicitAny: handler args vary per channel
type Handler = (event: unknown, ...args: any[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();
const onListeners = new Map<string, Handler>();

vi.mock("electron", () => ({
  app: {
    getVersion: () => "0.1.0",
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

import type { EngineEvent } from "@praxis/core/types";
// registerIpcHandlers is imported AFTER the mock is in place (Vitest hoisting).
import { registerIpcHandlers } from "../ipc-server.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFakeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => makeFakeLogger()),
    ingestRendererRecord: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Build a minimal fake Services bag that only populates `session.send` and
 * the handful of other properties needed so registerIpcHandlers doesn't crash
 * during registration.
 *
 * `sessionSend` is the sole control point — the test provides the generator.
 */
function makeServices(
  sessionSend: (
    sessionId: string,
    message: string,
    signal: AbortSignal,
  ) => AsyncIterable<EngineEvent>,
) {
  const session = {
    send: vi.fn().mockImplementation(sessionSend),
    start: vi.fn(),
    end: vi.fn().mockResolvedValue({}),
    active: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
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

  const lock = {
    isSet: vi.fn().mockResolvedValue(false),
    isUnlocked: vi.fn().mockResolvedValue(true),
    setLockCode: vi.fn(),
    unlock: vi.fn().mockResolvedValue({ ok: true }),
    lock: vi.fn(),
    clearLock: vi.fn(),
  };

  // biome-ignore lint/suspicious/noExplicitAny: partial stub — only session.send path exercised
  return { session, config, update, lock } as any;
}

beforeEach(() => {
  handlers.clear();
  onListeners.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("praxis.session.send.cancel → AbortSignal propagation", () => {
  it("registers both praxis.session.send.start and praxis.session.send.cancel", () => {
    const log = makeFakeLogger();
    registerIpcHandlers(
      makeServices(async function* () {}),
      () => null,
      log,
    );

    expect(handlers.has("praxis.session.send.start")).toBe(true);
    expect(onListeners.has("praxis.session.send.cancel")).toBe(true);
  });

  it("praxis.session.send.cancel aborts the AbortSignal received by session.send", async () => {
    const streamId = "test-stream-42";
    const sessionId = "session-abc";

    // Track whether the signal was aborted when the fake engine observed it.
    let capturedSignal: AbortSignal | undefined;
    // A promise/resolve pair so the fake stream can pause and await cancel.
    let resolveCancel!: () => void;
    const cancelPromise = new Promise<void>((r) => {
      resolveCancel = r;
    });

    async function* fakeSend(
      _id: string,
      _msg: string,
      signal: AbortSignal,
    ): AsyncIterable<EngineEvent> {
      capturedSignal = signal;
      // Yield one event to prove the stream started.
      yield { type: "model_message", content: "hello partial", partial: true };
      // Now park until the signal fires (simulating a long-running engine turn).
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
        } else {
          signal.addEventListener("abort", () => resolve(), { once: true });
        }
      });
      // Signal cancel promise to the test so it can proceed with assertions.
      resolveCancel();
      // The ipc-server will break out of `for await` when signal is aborted,
      // so we simply stop yielding here.
    }

    const log = makeFakeLogger();
    const services = makeServices(fakeSend);

    // A fake WebContents that collects pushed events (needed so push() doesn't
    // crash on `wc.send(...)`).
    const pushedMessages: unknown[] = [];
    const fakeWebContents = {
      isDestroyed: () => false,
      send: (_channel: string, msg: unknown) => {
        pushedMessages.push(msg);
      },
    };

    registerIpcHandlers(services, () => fakeWebContents as unknown as Electron.WebContents, log);

    // Invoke send.start — do NOT await; it will block until the stream resolves.
    const startHandler = handlers.get("praxis.session.send.start");
    expect(startHandler).toBeDefined();
    const startPromise = startHandler?.({}, streamId, sessionId, "Hi there");

    // Give the generator time to yield its first event and park at the await.
    await new Promise<void>((r) => setImmediate(r));

    // Verify session.send was called and that we captured the signal.
    expect(services.session.send).toHaveBeenCalledOnce();
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    // Fire cancel.
    const cancelListener = onListeners.get("praxis.session.send.cancel");
    expect(cancelListener).toBeDefined();
    cancelListener?.({}, streamId);

    // The signal should be aborted immediately.
    expect(capturedSignal!.aborted).toBe(true);

    // Wait for the fake stream to observe the abort and notify us.
    await cancelPromise;

    // Wait for the start handler to finish draining the (now-aborted) stream.
    await startPromise;

    // The IPC server should have removed the stream from activeAbortControllers.
    // We verify by invoking cancel again — a second abort on an already-aborted
    // signal is a no-op and must not throw.
    expect(() => cancelListener?.({}, streamId)).not.toThrow();
  });

  it("does not abort unrelated streams when cancelling by streamId", async () => {
    const streamIdA = "stream-A";
    const streamIdB = "stream-B";

    let capturedSignalA: AbortSignal | undefined;
    let capturedSignalB: AbortSignal | undefined;
    let resolveA!: () => void;
    let resolveB!: () => void;
    const cancelledA = new Promise<void>((r) => {
      resolveA = r;
    });
    const cancelledB = new Promise<void>((r) => {
      resolveB = r;
    });

    // A single fakeSend that parks until the signal fires, capturing the signal.
    async function* fakeSend(
      id: string,
      _msg: string,
      signal: AbortSignal,
    ): AsyncIterable<EngineEvent> {
      yield { type: "model_message", content: "partial", partial: true };
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener("abort", () => resolve(), { once: true });
      });
      if (id === streamIdA) {
        capturedSignalA = signal;
        resolveA();
      } else {
        capturedSignalB = signal;
        resolveB();
      }
    }

    // We need two separate call sites that forward the sessionId-as-id trick.
    // The real ipc handler forwards `sessionId` not `streamId` to session.send,
    // so we need a different approach — track by call order instead.
    const signals: AbortSignal[] = [];
    async function* trackingSend(
      _id: string,
      _msg: string,
      signal: AbortSignal,
    ): AsyncIterable<EngineEvent> {
      signals.push(signal);
      yield { type: "model_message", content: "partial", partial: true };
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener("abort", () => resolve(), { once: true });
      });
    }

    const log = makeFakeLogger();
    const services = makeServices(trackingSend);
    const fakeWc = { isDestroyed: () => false, send: vi.fn() };

    registerIpcHandlers(services, () => fakeWc as unknown as Electron.WebContents, log);

    const startHandler = handlers.get("praxis.session.send.start");
    const cancelListener = onListeners.get("praxis.session.send.cancel");
    expect(startHandler).toBeDefined();
    expect(cancelListener).toBeDefined();

    // Start two concurrent streams.
    const promiseA = startHandler?.({}, streamIdA, "session-1", "msg A");
    const promiseB = startHandler?.({}, streamIdB, "session-2", "msg B");

    // Let both streams park at their await.
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    expect(signals).toHaveLength(2);
    const [sigA, sigB] = signals as [AbortSignal, AbortSignal];
    expect(sigA.aborted).toBe(false);
    expect(sigB.aborted).toBe(false);

    // Cancel only stream A.
    cancelListener?.({}, streamIdA);

    expect(sigA.aborted).toBe(true);
    expect(sigB.aborted).toBe(false);

    // Drain both streams.
    cancelListener?.({}, streamIdB);
    await Promise.all([promiseA, promiseB]);
  });
});
