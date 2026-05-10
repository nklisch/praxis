/**
 * Tests for ActivityRegistryImpl — lifecycle, quietPeriod, linger, dismiss,
 * shutdown, and id-collision behaviour.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent } from "../../types/activity.js";
import { ActivityRegistryImpl } from "../activity-registry.js";

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

describe("ActivityRegistryImpl", () => {
  let registry: ActivityRegistryImpl;
  let events: ActivityEvent[];
  let unsubscribe: () => void;

  const fakeNow = { value: 0 };
  const timers: Array<{ fn: () => void; delay: number; id: number }> = [];
  let nextTimerId = 1;
  const pendingTimers = new Map<number, (typeof timers)[number]>();

  const fakeSetTimeout = vi.fn((fn: () => void, delay: number): ReturnType<typeof setTimeout> => {
    const id = nextTimerId++;
    const entry = { fn, delay, id };
    pendingTimers.set(id, entry);
    // biome-ignore lint/suspicious/noExplicitAny: fake timer id passthrough
    return id as any;
  });

  const fakeClearTimeout = vi.fn((id: number) => {
    pendingTimers.delete(id);
  });

  function advanceTimerBy(ms: number) {
    fakeNow.value += ms;
    for (const [id, entry] of pendingTimers) {
      if (entry.delay <= ms || fakeNow.value >= entry.delay) {
        pendingTimers.delete(id);
        entry.fn();
      }
    }
  }

  beforeEach(() => {
    fakeNow.value = 0;
    pendingTimers.clear();
    nextTimerId = 1;
    fakeSetTimeout.mockClear();
    fakeClearTimeout.mockClear();

    registry = new ActivityRegistryImpl({
      log: noopLogger() as ReturnType<typeof noopLogger>,
      now: () => fakeNow.value,
      // biome-ignore lint/suspicious/noExplicitAny: fake timer compatibility
      setTimeout: fakeSetTimeout as any,
      // biome-ignore lint/suspicious/noExplicitAny: fake timer compatibility
      clearTimeout: fakeClearTimeout as any,
    });

    events = [];
    unsubscribe = registry.subscribe((e) => events.push(e));
    // snapshot fires synchronously on subscribe — clear it so tests start clean
    events.length = 0;
  });

  afterEach(() => {
    unsubscribe();
  });

  it("empty registry — list() is empty; subscriber sees snapshot:[]", () => {
    const captured: ActivityEvent[] = [];
    const unsub = registry.subscribe((e) => captured.push(e));
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({ kind: "snapshot", items: [] });
    expect(registry.list()).toHaveLength(0);
    unsub();
  });

  it("start() — list() has item; subscriber sees added", () => {
    const handle = registry.start({ label: "loading data" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "added",
      item: { id: handle.id, label: "loading data", status: "running" },
    });
    expect(registry.list()).toHaveLength(1);
  });

  it("update() — subscriber sees updated", () => {
    const handle = registry.start({ label: "loading" });
    events.length = 0;

    handle.update({ detail: "page 5 of 20" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "updated", item: { detail: "page 5 of 20" } });
  });

  it("finish('done') — sees updated(status:done), then removed after DEFAULT_LINGER_MS (4s)", () => {
    const handle = registry.start({ label: "indexing" });
    events.length = 0;

    handle.finish("done");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "updated", item: { status: "done" } });

    // advance past linger
    advanceTimerBy(4_001);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ kind: "removed", id: handle.id });
  });

  it("finish('failed', msg) — 10s linger, dismiss available", () => {
    const handle = registry.start({ label: "indexing" });
    events.length = 0;

    handle.finish("failed", { message: "out of memory" });
    expect(events[0]).toMatchObject({
      kind: "updated",
      item: { status: "failed", errorMessage: "out of memory" },
    });

    // not yet gone at 9s
    advanceTimerBy(9_000);
    expect(events).toHaveLength(1);

    // gone at 10s
    advanceTimerBy(1_001);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ kind: "removed" });
  });

  it("quietPeriodMs — finish before quiet period: no events ever fired", () => {
    const handle = registry.start({ label: "indexing", quietPeriodMs: 100 });
    // nothing visible yet
    expect(events).toHaveLength(0);
    expect(registry.list()).toHaveLength(0);

    // finish within quiet period
    handle.finish("done");

    // still no events — item never became visible
    expect(events).toHaveLength(0);
    expect(registry.list()).toHaveLength(0);
  });

  it("quietPeriodMs — still running at 100ms: added fires", () => {
    const handle = registry.start({ label: "indexing", quietPeriodMs: 100 });
    expect(events).toHaveLength(0);

    advanceTimerBy(100);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "added", item: { id: handle.id } });
  });

  it("dismiss() on running item — no-op", () => {
    const handle = registry.start({ label: "loading" });
    events.length = 0;

    registry.dismiss(handle.id);
    expect(events).toHaveLength(0); // no event
  });

  it("dismiss() on done item — immediate removal", () => {
    const handle = registry.start({ label: "loading" });
    handle.finish("done");
    events.length = 0;

    registry.dismiss(handle.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "removed", id: handle.id });
  });

  it("same-id collision — second start() updates label rather than creating a new item", () => {
    const handle = registry.start({ id: "my-item", label: "original" });
    expect(registry.list()).toHaveLength(1);
    events.length = 0;

    // second start with same id — treated as update
    registry.start({ id: "my-item", label: "updated" });
    expect(registry.list()).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "updated", item: { label: "updated" } });
    expect(handle.id).toBe("my-item");
  });

  it("shutdown() — running items become failed; final snapshot:[] emitted; state cleared", () => {
    registry.start({ label: "task a" });
    registry.start({ label: "task b" });
    events.length = 0;

    registry.shutdown();

    // Two updated(failed) + one snapshot([])
    const updatedEvents = events.filter((e) => e.kind === "updated");
    const snapshotEvents = events.filter((e) => e.kind === "snapshot");
    expect(updatedEvents).toHaveLength(2);
    expect(snapshotEvents).toHaveLength(1);
    expect(snapshotEvents[0]).toMatchObject({ kind: "snapshot", items: [] });

    // state cleared
    expect(registry.list()).toHaveLength(0);
  });

  it("subscriber receives snapshot on subscribe", () => {
    registry.start({ label: "running" });
    const latecomer: ActivityEvent[] = [];
    const unsub = registry.subscribe((e) => latecomer.push(e));
    expect(latecomer[0]).toMatchObject({ kind: "snapshot", items: [{ label: "running" }] });
    unsub();
  });

  it("custom lingerMs is respected", () => {
    const handle = registry.start({ label: "custom", lingerMs: 1_000 });
    handle.finish("done");
    events.length = 0;

    advanceTimerBy(1_001);
    expect(events[0]).toMatchObject({ kind: "removed" });
  });
});
