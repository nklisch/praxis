/**
 * Tests for SubAgentRegistryImpl — start, step events, setLabel, finish,
 * linger removal, snapshot, and filtered subscribe.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubAgentEvent } from "../../types/subagent.js";
import { SubAgentRegistryImpl } from "../subagent-registry.js";

function noopLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => noopLogger(),
    shutdown: vi.fn(),
  };
}

describe("SubAgentRegistryImpl", () => {
  let registry: SubAgentRegistryImpl;
  let events: SubAgentEvent[];
  let unsubscribe: () => void;

  const fakeNow = { value: 1_000_000 }; // non-zero start for Timestamp clarity
  const pendingTimers = new Map<number, { fn: () => void; delay: number }>();
  let nextTimerId = 1;

  const fakeSetTimeout = vi.fn((fn: () => void, delay: number): ReturnType<typeof setTimeout> => {
    const id = nextTimerId++;
    pendingTimers.set(id, { fn, delay });
    // biome-ignore lint/suspicious/noExplicitAny: fake timer id passthrough
    return id as any;
  });

  function fireTimers() {
    for (const [id, { fn }] of pendingTimers) {
      pendingTimers.delete(id);
      fn();
    }
  }

  beforeEach(() => {
    fakeNow.value = 1_000_000;
    pendingTimers.clear();
    nextTimerId = 1;
    fakeSetTimeout.mockClear();

    registry = new SubAgentRegistryImpl({
      log: noopLogger() as ReturnType<typeof noopLogger>,
      now: () => fakeNow.value,
      // biome-ignore lint/suspicious/noExplicitAny: fake timer compatibility
      setTimeout: fakeSetTimeout as any,
      resolveLabel: (toolName) => `[${toolName}]`,
    });

    events = [];
    unsubscribe = registry.subscribe((e) => events.push(e));
    // snapshot fires synchronously on subscribe — clear it so tests start clean
    events.length = 0;
  });

  afterEach(() => {
    unsubscribe();
  });

  it("subscribe receives initial snapshot of empty registry", () => {
    const captured: SubAgentEvent[] = [];
    const unsub = registry.subscribe((e) => captured.push(e));
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({ kind: "snapshot", items: [] });
    unsub();
  });

  it("start() emits a 'started' event with the supplied fields", () => {
    const handle = registry.start({
      parentCallId: "call-1",
      // biome-ignore lint/suspicious/noExplicitAny: Timestamp brand cast for tests
      sessionId: "sess-1" as any,
      label: "reading your materials",
    });
    expect(handle.parentCallId).toBe("call-1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "started",
      item: {
        parentCallId: "call-1",
        sessionId: "sess-1",
        label: "reading your materials",
        status: "running",
        steps: [],
      },
    });
  });

  it("start() with same parentCallId is a silent no-op (by design — collision is a registry guarantee, not an error)", () => {
    // Spec-silent contract pin: the registry treats collision as idempotent.
    // Pinned in source: subagent-registry.ts start() early-return.
    // Capture the logger so we can pin the debug-log diagnostic seam.
    const logger = noopLogger();
    const r = new SubAgentRegistryImpl({
      log: logger as ReturnType<typeof noopLogger>,
      now: () => fakeNow.value,
      // biome-ignore lint/suspicious/noExplicitAny: fake timer compatibility
      setTimeout: fakeSetTimeout as any,
      resolveLabel: (toolName) => `[${toolName}]`,
    });
    const localEvents: SubAgentEvent[] = [];
    const unsub = r.subscribe((e) => localEvents.push(e));
    localEvents.length = 0; // drop snapshot
    // biome-ignore lint/suspicious/noExplicitAny: Timestamp brand cast for tests
    r.start({ parentCallId: "call-1", sessionId: "sess-1" as any, label: "first" });
    localEvents.length = 0; // drop first "started"
    // biome-ignore lint/suspicious/noExplicitAny: Timestamp brand cast for tests
    r.start({ parentCallId: "call-1", sessionId: "sess-1" as any, label: "second" });
    // No event is emitted for the collision.
    expect(localEvents).toHaveLength(0);
    // No duplicate item is created.
    expect(r.list()).toHaveLength(1);
    // The original label is preserved (the second start is fully ignored —
    // it does NOT update the existing item's label).
    expect(r.list()[0]?.label).toBe("first");
    // The collision is logged at debug for diagnosability without alarm.
    expect(logger.debug).toHaveBeenCalledWith("subagent-registry.start.collision", {
      parentCallId: "call-1",
    });
    unsub();
  });

  it("list() returns current items", () => {
    registry.start({ parentCallId: "call-1", sessionId: "sess-1" as any, label: "reading" });
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]?.parentCallId).toBe("call-1");
  });

  it("stepStarted emits step_started with resolved label", () => {
    const handle = registry.start({
      parentCallId: "call-1",
      sessionId: "sess-1" as any,
      label: "reading",
    });
    events.length = 0;
    handle.stepStarted({ callId: "step-1", toolName: "course.draft_init" });

    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev).toMatchObject({
      kind: "step_started",
      parentCallId: "call-1",
      step: {
        callId: "step-1",
        toolName: "course.draft_init",
        label: "[course.draft_init]", // from our resolveLabel stub
      },
    });

    // step appended to item
    const item = registry.list()[0];
    expect(item?.steps).toHaveLength(1);
    expect(item?.steps[0]?.callId).toBe("step-1");
  });

  it("stepSettled emits step_settled and updates the step's ok/endedAt", () => {
    const handle = registry.start({
      parentCallId: "call-1",
      sessionId: "sess-1" as any,
      label: "reading",
    });
    handle.stepStarted({ callId: "step-1", toolName: "course.draft_init" });
    events.length = 0;

    handle.stepSettled({ callId: "step-1", ok: true });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "step_settled",
      parentCallId: "call-1",
      callId: "step-1",
      ok: true,
    });

    const item = registry.list()[0];
    expect(item?.steps[0]?.ok).toBe(true);
    expect(item?.steps[0]?.endedAt).toBeDefined();
  });

  it("stepSettled with ok=false records failure", () => {
    const handle = registry.start({
      parentCallId: "call-1",
      sessionId: "sess-1" as any,
      label: "reading",
    });
    handle.stepStarted({ callId: "step-1", toolName: "retrieve_from_documents" });
    events.length = 0;

    handle.stepSettled({ callId: "step-1", ok: false });
    expect(events[0]).toMatchObject({ kind: "step_settled", ok: false });
  });

  it("setLabel emits phase_changed and updates item label", () => {
    const handle = registry.start({
      parentCallId: "call-1",
      sessionId: "sess-1" as any,
      label: "reading your materials",
    });
    events.length = 0;

    handle.setLabel("drafting an outline");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "phase_changed",
      parentCallId: "call-1",
      label: "drafting an outline",
    });

    const item = registry.list()[0];
    expect(item?.label).toBe("drafting an outline");
  });

  it("finish emits finished event and item lingers before removal", () => {
    const handle = registry.start({
      parentCallId: "call-1",
      sessionId: "sess-1" as any,
      label: "reading",
    });
    events.length = 0;

    handle.finish("done");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "finished",
      parentCallId: "call-1",
      status: "done",
    });

    // Item still present (linger period)
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]?.status).toBe("done");

    // Fire the linger timer — item removed
    fireTimers();
    expect(registry.list()).toHaveLength(0);
  });

  it("finish('failed') includes errorMessage when provided", () => {
    const handle = registry.start({
      parentCallId: "call-1",
      sessionId: "sess-1" as any,
      label: "reading",
    });
    events.length = 0;

    handle.finish("failed", { message: "engine error" });

    expect(events[0]).toMatchObject({
      kind: "finished",
      status: "failed",
      errorMessage: "engine error",
    });
    expect(registry.list()[0]?.errorMessage).toBe("engine error");
  });

  it("subscribe(listener, { parentCallId }) receives snapshot filtered to that item", () => {
    registry.start({ parentCallId: "call-A", sessionId: "sess-1" as any, label: "A" });
    registry.start({ parentCallId: "call-B", sessionId: "sess-2" as any, label: "B" });

    const filtered: SubAgentEvent[] = [];
    const unsub = registry.subscribe((e) => filtered.push(e), { parentCallId: "call-A" });

    // snapshot should only include call-A
    expect(filtered).toHaveLength(1);
    const snapshot = filtered[0];
    expect(snapshot?.kind).toBe("snapshot");
    if (snapshot?.kind === "snapshot") {
      expect(snapshot.items).toHaveLength(1);
      expect(snapshot.items[0]?.parentCallId).toBe("call-A");
    }

    unsub();
  });

  it("subscribe(listener, { parentCallId }) only receives events for that parentCallId", () => {
    const handleA = registry.start({
      parentCallId: "call-A",
      sessionId: "sess-1" as any,
      label: "A",
    });
    registry.start({ parentCallId: "call-B", sessionId: "sess-2" as any, label: "B" });

    const filteredA: SubAgentEvent[] = [];
    const unsub = registry.subscribe((e) => filteredA.push(e), { parentCallId: "call-A" });
    filteredA.length = 0; // clear snapshot

    handleA.stepStarted({ callId: "s1", toolName: "foo" });

    expect(filteredA).toHaveLength(1);
    expect(filteredA[0]?.kind).toBe("step_started");

    unsub();
  });

  it("filtered subscriber does not receive events for other parentCallIds", () => {
    registry.start({ parentCallId: "call-A", sessionId: "sess-1" as any, label: "A" });
    const handleB = registry.start({
      parentCallId: "call-B",
      sessionId: "sess-2" as any,
      label: "B",
    });

    const filteredA: SubAgentEvent[] = [];
    const unsub = registry.subscribe((e) => filteredA.push(e), { parentCallId: "call-A" });
    filteredA.length = 0; // clear snapshot

    handleB.stepStarted({ callId: "s1", toolName: "foo" });
    handleB.finish("done");

    expect(filteredA).toHaveLength(0);
    unsub();
  });

  it("unsubscribe stops delivering events", () => {
    const handle = registry.start({
      parentCallId: "call-1",
      sessionId: "sess-1" as any,
      label: "A",
    });

    const extra: SubAgentEvent[] = [];
    const unsub = registry.subscribe((e) => extra.push(e));
    extra.length = 0; // clear snapshot

    unsub();
    handle.stepStarted({ callId: "s1", toolName: "foo" });
    expect(extra).toHaveLength(0);
  });

  it("after finish, step events are no-ops (item status !== 'running')", () => {
    const handle = registry.start({
      parentCallId: "call-1",
      sessionId: "sess-1" as any,
      label: "A",
    });
    handle.finish("done");
    events.length = 0;

    handle.stepStarted({ callId: "s2", toolName: "foo" });
    expect(events).toHaveLength(0);
  });
});

// ─── interruptAllForSession ──────────────────────────────────────────────────

describe("SubAgentRegistryImpl — interruptAllForSession", () => {
  let registry: SubAgentRegistryImpl;
  let events: SubAgentEvent[];
  let unsubscribe: () => void;

  const fakeNow = { value: 2_000_000 };
  const pendingTimers = new Map<number, { fn: () => void }>();
  let nextTimerId = 100;

  const fakeSetTimeout = vi.fn((fn: () => void, _delay: number): ReturnType<typeof setTimeout> => {
    const id = nextTimerId++;
    pendingTimers.set(id, { fn });
    // biome-ignore lint/suspicious/noExplicitAny: fake timer id passthrough
    return id as any;
  });

  beforeEach(() => {
    fakeNow.value = 2_000_000;
    pendingTimers.clear();
    nextTimerId = 100;
    fakeSetTimeout.mockClear();

    registry = new SubAgentRegistryImpl({
      log: noopLogger() as ReturnType<typeof noopLogger>,
      now: () => fakeNow.value,
      // biome-ignore lint/suspicious/noExplicitAny: fake timer compatibility
      setTimeout: fakeSetTimeout as any,
    });

    events = [];
    unsubscribe = registry.subscribe((e) => events.push(e));
    events.length = 0; // clear snapshot
  });

  afterEach(() => {
    unsubscribe();
  });

  it("transitions running items for the session to interrupted and emits finished event", () => {
    registry.start({ parentCallId: "call-A", sessionId: "sess-target" as any, label: "A" });
    events.length = 0;

    registry.interruptAllForSession("sess-target" as any);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "finished",
      parentCallId: "call-A",
      status: "interrupted",
    });

    const item = registry.list()[0];
    expect(item?.status).toBe("interrupted");
    expect(item?.endedAt).toBeDefined();
  });

  it("does not affect items from other sessions", () => {
    registry.start({ parentCallId: "call-A", sessionId: "sess-target" as any, label: "A" });
    registry.start({ parentCallId: "call-B", sessionId: "sess-other" as any, label: "B" });
    events.length = 0;

    registry.interruptAllForSession("sess-target" as any);

    // Only one finished event — for call-A.
    const finished = events.filter((e) => e.kind === "finished");
    expect(finished).toHaveLength(1);
    const finishedEvent = finished[0];
    expect(finishedEvent?.kind === "finished" ? finishedEvent.parentCallId : null).toBe("call-A");

    // call-B remains running.
    const itemB = registry.list().find((i) => i.parentCallId === "call-B");
    expect(itemB?.status).toBe("running");
  });

  it("is a no-op for items already in a terminal status", () => {
    const handle = registry.start({
      parentCallId: "call-A",
      sessionId: "sess-target" as any,
      label: "A",
    });
    handle.finish("done");
    events.length = 0;

    registry.interruptAllForSession("sess-target" as any);

    // No new events — item is already done.
    expect(events).toHaveLength(0);
    const item = registry.list().find((i) => i.parentCallId === "call-A");
    expect(item?.status).toBe("done");
  });

  it("interrupts multiple running items for the same session", () => {
    registry.start({ parentCallId: "call-A", sessionId: "sess-multi" as any, label: "A" });
    registry.start({ parentCallId: "call-B", sessionId: "sess-multi" as any, label: "B" });
    events.length = 0;

    registry.interruptAllForSession("sess-multi" as any);

    const finished = events.filter((e) => e.kind === "finished");
    expect(finished).toHaveLength(2);
    const finishedCallIds = finished.map((e) => (e.kind === "finished" ? e.parentCallId : null));
    expect(finishedCallIds).toContain("call-A");
    expect(finishedCallIds).toContain("call-B");

    for (const item of registry.list()) {
      if (item.sessionId === ("sess-multi" as any)) {
        expect(item.status).toBe("interrupted");
      }
    }
  });

  it("interrupted item lingers and is removed after the linger timer fires", () => {
    registry.start({ parentCallId: "call-A", sessionId: "sess-target" as any, label: "A" });
    registry.interruptAllForSession("sess-target" as any);

    // Item still present during linger.
    expect(registry.list()).toHaveLength(1);

    // Fire linger timer.
    for (const { fn } of pendingTimers.values()) fn();
    expect(registry.list()).toHaveLength(0);
  });
});
