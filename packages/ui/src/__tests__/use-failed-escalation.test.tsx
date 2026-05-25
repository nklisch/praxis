/**
 * Tests for useFailedEscalation — activity-strip escalation for failed messages.
 *
 * Uses vi.useFakeTimers() for deterministic timer control.
 *
 * Covers:
 * - Activity entry created after thresholdMs when item stays failed
 * - Retry/remove before threshold prevents activity entry (timer cleared)
 * - Re-failure of same id after retry produces a fresh timer
 * - Unmount clears all timers and finishes open handles
 * - Hook is a no-op when activity is null/undefined
 */

import type { ActivityHandle, ActivityStartInput } from "@praxis/core/types";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRegistryClient } from "../hooks/use-failed-escalation.js";
import {
  DEFAULT_ESCALATION_THRESHOLD_MS,
  useFailedEscalation,
} from "../hooks/use-failed-escalation.js";
import type { PendingMessageItem } from "../hooks/use-streamed-send.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeFailedItem(
  id: string,
  failedAt: number,
  errorReason = "test error",
): PendingMessageItem {
  return {
    kind: "pending-message",
    id,
    text: "some message",
    status: "failed",
    errorReason,
    failedAt,
  };
}

function makeFakeActivity(): ActivityRegistryClient & {
  startCalls: Array<{ input: ActivityStartInput; handle: ActivityHandle }>;
} {
  const startCalls: Array<{ input: ActivityStartInput; handle: ActivityHandle }> = [];
  return {
    startCalls,
    start(input: ActivityStartInput): ActivityHandle {
      const handle: ActivityHandle = {
        id: `handle-${startCalls.length}`,
        update: vi.fn(),
        finish: vi.fn(),
      };
      startCalls.push({ input, handle });
      return handle;
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useFailedEscalation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Escalation fires after threshold ─────────────────────────────────────

  it("calls activity.start after thresholdMs when item stays failed", () => {
    const activity = makeFakeActivity();
    const failedAt = Date.now();
    const item = makeFailedItem("msg-1", failedAt);

    renderHook(() =>
      useFailedEscalation({
        failedItems: [item],
        activity,
        thresholdMs: 30_000,
      }),
    );

    expect(activity.startCalls).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(activity.startCalls).toHaveLength(1);
    expect(activity.startCalls[0]?.input.label).toBe("Queued message failed to send");
    expect(activity.startCalls[0]?.input.metadata?.messageId).toBe("msg-1");
  });

  it("does not escalate before threshold", () => {
    const activity = makeFakeActivity();
    const failedAt = Date.now();
    const item = makeFailedItem("msg-1", failedAt);

    renderHook(() =>
      useFailedEscalation({
        failedItems: [item],
        activity,
        thresholdMs: 30_000,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(29_999);
    });

    expect(activity.startCalls).toHaveLength(0);
  });

  it("respects a custom thresholdMs", () => {
    const activity = makeFakeActivity();
    const failedAt = Date.now();
    const item = makeFailedItem("msg-1", failedAt);

    renderHook(() =>
      useFailedEscalation({
        failedItems: [item],
        activity,
        thresholdMs: 5_000,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(activity.startCalls).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(activity.startCalls).toHaveLength(1);
  });

  it("uses DEFAULT_ESCALATION_THRESHOLD_MS when thresholdMs is omitted", () => {
    const activity = makeFakeActivity();
    const failedAt = Date.now();
    const item = makeFailedItem("msg-1", failedAt);

    renderHook(() => useFailedEscalation({ failedItems: [item], activity }));

    act(() => {
      vi.advanceTimersByTime(DEFAULT_ESCALATION_THRESHOLD_MS - 1);
    });
    expect(activity.startCalls).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(activity.startCalls).toHaveLength(1);
  });

  // ─── Retry / remove before threshold ──────────────────────────────────────

  it("clears timer when item disappears before threshold (retry)", () => {
    const activity = makeFakeActivity();
    const failedAt = Date.now();
    const item = makeFailedItem("msg-1", failedAt);

    const { rerender } = renderHook(
      ({ failedItems }: { failedItems: PendingMessageItem[] }) =>
        useFailedEscalation({ failedItems, activity, thresholdMs: 30_000 }),
      { initialProps: { failedItems: [item] } },
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    // Item disappears (retried).
    rerender({ failedItems: [] });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    // Timer was cleared — no escalation.
    expect(activity.startCalls).toHaveLength(0);
  });

  it("finishes handle when item disappears after escalation fires", () => {
    const activity = makeFakeActivity();
    const failedAt = Date.now();
    const item = makeFailedItem("msg-1", failedAt);

    const { rerender } = renderHook(
      ({ failedItems }: { failedItems: PendingMessageItem[] }) =>
        useFailedEscalation({ failedItems, activity, thresholdMs: 30_000 }),
      { initialProps: { failedItems: [item] } },
    );

    // Escalation fires.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(activity.startCalls).toHaveLength(1);
    const handle = activity.startCalls[0]?.handle;

    // Item disappears after escalation.
    rerender({ failedItems: [] });

    expect(handle?.finish).toHaveBeenCalledWith("failed");
  });

  // ─── Re-failure of same id ─────────────────────────────────────────────────

  it("reschedules timer when same id re-fails with newer failedAt", () => {
    const activity = makeFakeActivity();
    const firstFailedAt = Date.now();
    const item1 = makeFailedItem("msg-1", firstFailedAt);

    const { rerender } = renderHook(
      ({ failedItems }: { failedItems: PendingMessageItem[] }) =>
        useFailedEscalation({ failedItems, activity, thresholdMs: 30_000 }),
      { initialProps: { failedItems: [item1] } },
    );

    // Advance 15s — item disappears (retried).
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    rerender({ failedItems: [] });
    expect(activity.startCalls).toHaveLength(0);

    // Re-fail with a new failedAt (15s later).
    const secondFailedAt = Date.now();
    const item2 = makeFailedItem("msg-1", secondFailedAt);
    rerender({ failedItems: [item2] });

    // Advance only 29s from now — should NOT escalate (second timer fresh).
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(activity.startCalls).toHaveLength(0);

    // One more second → second timer fires.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(activity.startCalls).toHaveLength(1);
    expect(activity.startCalls[0]?.input.metadata?.messageId).toBe("msg-1");
  });

  it("does not create a second activity entry if same id + same failedAt renders again", () => {
    const activity = makeFakeActivity();
    const failedAt = Date.now();
    const item = makeFailedItem("msg-1", failedAt);

    const { rerender } = renderHook(
      ({ failedItems }: { failedItems: PendingMessageItem[] }) =>
        useFailedEscalation({ failedItems, activity, thresholdMs: 30_000 }),
      { initialProps: { failedItems: [item] } },
    );

    // Re-render with same item (simulate parent re-render).
    rerender({ failedItems: [item] });
    rerender({ failedItems: [item] });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    // Only one escalation — not three.
    expect(activity.startCalls).toHaveLength(1);
  });

  // ─── Unmount cleanup ───────────────────────────────────────────────────────

  it("clears all timers and finishes open handles on unmount", () => {
    const activity = makeFakeActivity();
    const failedAt = Date.now();
    const items = [makeFailedItem("msg-1", failedAt), makeFailedItem("msg-2", failedAt)];

    const { unmount } = renderHook(() =>
      useFailedEscalation({ failedItems: items, activity, thresholdMs: 30_000 }),
    );

    // Escalate msg-1.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(activity.startCalls).toHaveLength(2);

    unmount();

    // Handles for escalated items are finished on unmount.
    expect(activity.startCalls[0]?.handle.finish).toHaveBeenCalledWith("failed");
    expect(activity.startCalls[1]?.handle.finish).toHaveBeenCalledWith("failed");
  });

  it("clears pending timers on unmount without calling activity.start", () => {
    const activity = makeFakeActivity();
    const failedAt = Date.now();
    const item = makeFailedItem("msg-1", failedAt);

    const { unmount } = renderHook(() =>
      useFailedEscalation({ failedItems: [item], activity, thresholdMs: 30_000 }),
    );

    // Unmount before timer fires.
    unmount();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    // Timer was cleared — no escalation.
    expect(activity.startCalls).toHaveLength(0);
  });

  // ─── Graceful degradation ──────────────────────────────────────────────────

  it("is a no-op when activity is null", () => {
    const failedAt = Date.now();
    const item = makeFailedItem("msg-1", failedAt);

    // Should not throw.
    expect(() => {
      const { unmount } = renderHook(() =>
        useFailedEscalation({ failedItems: [item], activity: null, thresholdMs: 30_000 }),
      );
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      unmount();
    }).not.toThrow();
  });

  it("is a no-op when activity is undefined", () => {
    const failedAt = Date.now();
    const item = makeFailedItem("msg-1", failedAt);

    expect(() => {
      const { unmount } = renderHook(() =>
        useFailedEscalation({ failedItems: [item], activity: undefined, thresholdMs: 30_000 }),
      );
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      unmount();
    }).not.toThrow();
  });

  // ─── Past-threshold items escalate immediately ─────────────────────────────

  it("escalates immediately when failedAt is already past the threshold", () => {
    const activity = makeFakeActivity();
    // Item that failed 60s ago (past the 30s threshold).
    const failedAt = Date.now() - 60_000;
    const item = makeFailedItem("msg-1", failedAt);

    renderHook(() => useFailedEscalation({ failedItems: [item], activity, thresholdMs: 30_000 }));

    // Advance 0ms — the timer has remaining=0, fires on next tick.
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(activity.startCalls).toHaveLength(1);
  });

  // ─── Multiple items ────────────────────────────────────────────────────────

  it("tracks multiple failed items independently", () => {
    const activity = makeFakeActivity();
    const now = Date.now();
    const items = [
      makeFailedItem("msg-1", now - 25_000), // needs 5s more
      makeFailedItem("msg-2", now - 10_000), // needs 20s more
    ];

    renderHook(() => useFailedEscalation({ failedItems: items, activity, thresholdMs: 30_000 }));

    act(() => {
      vi.advanceTimersByTime(5_001);
    });
    expect(activity.startCalls).toHaveLength(1);
    expect(activity.startCalls[0]?.input.metadata?.messageId).toBe("msg-1");

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(activity.startCalls).toHaveLength(2);
    expect(activity.startCalls[1]?.input.metadata?.messageId).toBe("msg-2");
  });
});
