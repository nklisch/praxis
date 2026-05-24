/**
 * End-to-end test: interrupt propagation through the praxis.subAgent.events.*
 * IPC fanout to a UI subscriber.
 *
 * Gap addressed: existing tests (subagent-registry.test.ts) assert internal
 * registry state transitions but skip the "UI receives a terminal event from
 * the subscriber-fanout-stream" property — the spec's "UI is informed via
 * existing subscriber-fanout pattern" claim.
 *
 * This test uses a real SubAgentRegistryImpl (not a mock) to exercise the
 * actual subscribe → fanout → terminal-event pipeline through the IPC channel.
 *
 * Pattern: electron-ipc-test-harness — mock `electron` before importing the
 * channel module; capture handlers from ipcMain.handle / ipcMain.on; invoke
 * directly with a minimal fake Services bag.
 */

import { SubAgentRegistryImpl } from "@praxis/core/services";
import type { SessionId, SubAgentEvent } from "@praxis/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// Import AFTER the mock is in place — Vitest hoists vi.mock() automatically.
import { registerSubAgentHandlers } from "../subagent-channel.js";

/**
 * Create a fake WebContents that captures every `send(channel, msg)` call.
 * Returns the collector array alongside the fake.
 */
function makeFakeWebContents() {
  const sent: Array<{ channel: string; msg: unknown }> = [];
  const wc = {
    isDestroyed: () => false,
    send: (channel: string, msg: unknown) => {
      sent.push({ channel, msg });
    },
  };
  return { wc, sent };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  handlers.clear();
  onListeners.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("praxis.subAgent.events.* — interrupt fanout observability", () => {
  /**
   * Core contract: after `interruptAllForSession`, a UI subscriber that
   * previously opened a stream via `praxis.subAgent.events.start` must
   * receive a `{ kind: "event", payload: { kind: "finished", status:
   * "interrupted" } }` push for every sub-agent item that was running in
   * that session.
   *
   * Uses a real SubAgentRegistryImpl so we exercise the actual
   * subscribe → fanout → terminal-event path, not an approximation.
   */
  it("after interruptAllForSession, a UI subscriber receives a finished event for every previously-running item", async () => {
    // Use fake timers so linger-removal timers (30s) don't escape the test.
    vi.useFakeTimers();

    try {
      const fakeSetTimeout = vi.fn(
        (fn: () => void, delay: number): ReturnType<typeof setTimeout> => {
          // Schedule via the real fake-timer infrastructure so vi.runAllTimers()
          // can drain them if needed. We just want determinism; linger fires
          // are irrelevant to this test's assertions.
          return globalThis.setTimeout(fn, delay);
        },
      );

      const registry = new SubAgentRegistryImpl({
        log: makeSpyLogger(),
        now: () => 1_000_000,
        // biome-ignore lint/suspicious/noExplicitAny: fake timer compatibility
        setTimeout: fakeSetTimeout as any,
      });

      const log = makeSpyLogger();
      const { wc, sent } = makeFakeWebContents();
      const activeAbortControllers = new Map<string, AbortController>();

      // Register the subagent channel handlers with the real registry.
      registerSubAgentHandlers(
        { subAgent: registry } as unknown as import("../services.js").Services,
        () => wc as unknown as Electron.WebContents,
        activeAbortControllers,
        log,
      );

      const startHandler = handlers.get("praxis.subAgent.events.start");
      expect(startHandler).toBeDefined();

      // Open a stream subscription BEFORE starting any sub-agents so the
      // snapshot + subsequent events are both captured.
      const streamId = "stream-sa-e2e-1";
      // The start handler holds open via an AbortController promise — run it
      // concurrently and let the test drive cancellation.
      const streamDone = startHandler?.({}, streamId);

      // Give the microtask queue a turn so the subscribe call inside the handler
      // completes and the listener is registered.
      await Promise.resolve();

      // Now start two sub-agents for session-A.
      const sessionA = "sess-A" as SessionId;
      registry.start({ parentCallId: "call-1", sessionId: sessionA, label: "running task 1" });
      registry.start({ parentCallId: "call-2", sessionId: sessionA, label: "running task 2" });

      // Interrupt all running items for session-A.
      registry.interruptAllForSession(sessionA);

      // Cancel the stream to let the hold-open promise resolve and
      // drain the final `{ kind: "done" }` push.
      const cancelListener = onListeners.get("praxis.subAgent.events.cancel");
      cancelListener?.({}, streamId);

      // Await stream completion.
      await streamDone;

      // Collect only the event-kind pushes (filter out snapshot and done).
      const eventPushes = sent
        .filter(
          ({ msg }) =>
            msg !== null &&
            typeof msg === "object" &&
            "kind" in msg &&
            (msg as { kind: unknown }).kind === "event",
        )
        .map(({ msg }) => (msg as { kind: "event"; payload: SubAgentEvent }).payload);

      // We expect: snapshot (filtered out above), started×2, finished×2.
      // Among the event-kind pushes, there must be exactly two finished events
      // with status "interrupted".
      const finishedEvents = eventPushes.filter(
        (e): e is Extract<SubAgentEvent, { kind: "finished" }> => e.kind === "finished",
      );

      expect(finishedEvents).toHaveLength(2);

      const parentCallIds = finishedEvents.map((e) => e.parentCallId).sort();
      expect(parentCallIds).toEqual(["call-1", "call-2"]);

      for (const evt of finishedEvents) {
        expect(evt.status).toBe("interrupted");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Complementary test: items in a DIFFERENT session must NOT receive finished
   * events from interruptAllForSession("session-A").
   */
  it("interruptAllForSession does not emit finished events for items in a different session", async () => {
    vi.useFakeTimers();

    try {
      const registry = new SubAgentRegistryImpl({
        log: makeSpyLogger(),
        now: () => 1_000_000,
        setTimeout:
          // biome-ignore lint/suspicious/noExplicitAny: fake timer compatibility
          vi.fn((fn: () => void, delay: number) => globalThis.setTimeout(fn, delay)) as any,
      });

      const log = makeSpyLogger();
      const { wc, sent } = makeFakeWebContents();
      const activeAbortControllers = new Map<string, AbortController>();

      registerSubAgentHandlers(
        { subAgent: registry } as unknown as import("../services.js").Services,
        () => wc as unknown as Electron.WebContents,
        activeAbortControllers,
        log,
      );

      const startHandler = handlers.get("praxis.subAgent.events.start");
      expect(startHandler).toBeDefined();

      const streamId = "stream-sa-e2e-2";
      const streamDone = startHandler?.({}, streamId);
      await Promise.resolve();

      const sessionA = "sess-A" as SessionId;
      const sessionB = "sess-B" as SessionId;

      // Start one item per session.
      registry.start({ parentCallId: "call-a", sessionId: sessionA, label: "task A" });
      registry.start({ parentCallId: "call-b", sessionId: sessionB, label: "task B" });

      // Interrupt only session-A.
      registry.interruptAllForSession(sessionA);

      // Cancel and drain the stream.
      const cancelListener = onListeners.get("praxis.subAgent.events.cancel");
      cancelListener?.({}, streamId);
      await streamDone;

      const eventPayloads = sent
        .filter(
          ({ msg }) =>
            msg !== null &&
            typeof msg === "object" &&
            "kind" in msg &&
            (msg as { kind: unknown }).kind === "event",
        )
        .map(({ msg }) => (msg as { kind: "event"; payload: SubAgentEvent }).payload);

      const finishedEvents = eventPayloads.filter(
        (e): e is Extract<SubAgentEvent, { kind: "finished" }> => e.kind === "finished",
      );

      // Only call-a should be finished; call-b should still be running.
      expect(finishedEvents).toHaveLength(1);
      expect(finishedEvents[0]?.parentCallId).toBe("call-a");
      expect(finishedEvents[0]?.status).toBe("interrupted");
    } finally {
      vi.useRealTimers();
    }
  });
});
