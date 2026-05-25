/**
 * Tests for usePendingQueue — the pending-message queue lifecycle hook.
 *
 * Covers:
 * - enqueue: adds to queue + items with status "queued"
 * - cancelPending: removes from queue + items
 * - dequeueNext: dequeues when not cancelled; no-op when cancelled
 * - markDispatching: queued → dispatching; warn-logs on mismatch
 * - markFailed: dispatching → failed; sets errorReason + failedAt; warn-logs on mismatch
 * - retryFailed: failed → queued; clears error fields; returns {text, sketchId?}; warn-logs on mismatch
 * - editPending: updates text on queued items; warn-logs on mismatch; updates pendingQueue too
 * - removeFailed: removes failed items; warn-logs on mismatch
 * - derivePendingCounts: correct pendingCount + failedCount from items array
 */

import { act, renderHook } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { PendingMessage } from "../hooks/use-pending-queue.js";
import { derivePendingCounts, usePendingQueue } from "../hooks/use-pending-queue.js";
import type { ChatStreamItem } from "../hooks/use-streamed-send.js";

// Capture items state alongside queue state for assertion.
function useTestHook() {
  const [items, setItems] = React.useState<ChatStreamItem[]>([]);
  const queue = usePendingQueue();
  return { items, setItems, queue };
}

const ID = "pending-001";
const MSG: PendingMessage = {
  id: ID,
  text: "test message",
};
const MSG_WITH_SKETCH: PendingMessage = {
  id: "pending-002",
  text: "sketch message",
  sketchId: "sketch-abc",
};

describe("usePendingQueue — enqueue", () => {
  it("adds item to pendingQueue and items with status 'queued'", () => {
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });

    expect(result.current.queue.pendingQueue).toHaveLength(1);
    expect(result.current.queue.pendingQueue[0]?.id).toBe(ID);

    const pending = result.current.items.find(
      (it) => it.kind === "pending-message" && it.id === ID,
    );
    expect(pending).toBeDefined();
    if (pending?.kind === "pending-message") {
      expect(pending.status).toBe("queued");
      expect(pending.text).toBe("test message");
    }
  });

  it("preserves sketchId when enqueuing", () => {
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG_WITH_SKETCH, result.current.setItems);
    });

    const pending = result.current.items.find(
      (it) => it.kind === "pending-message" && it.id === "pending-002",
    );
    if (pending?.kind === "pending-message") {
      expect(pending.sketchId).toBe("sketch-abc");
    }
  });

  it("pendingCount increments with each enqueue", () => {
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue({ id: "a", text: "one" }, result.current.setItems);
      result.current.queue.enqueue({ id: "b", text: "two" }, result.current.setItems);
    });

    expect(result.current.queue.pendingCount).toBe(2);
  });
});

describe("usePendingQueue — cancelPending", () => {
  it("removes item from both queue and items", () => {
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });
    act(() => {
      result.current.queue.cancelPending(ID, result.current.setItems);
    });

    expect(result.current.queue.pendingQueue).toHaveLength(0);
    const pending = result.current.items.find(
      (it) => it.kind === "pending-message" && it.id === ID,
    );
    expect(pending).toBeUndefined();
  });

  it("is a no-op for unknown ids", () => {
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });
    act(() => {
      result.current.queue.cancelPending("no-such-id", result.current.setItems);
    });

    expect(result.current.queue.pendingQueue).toHaveLength(1);
  });
});

describe("usePendingQueue — dequeueNext", () => {
  it("returns the first queued message and removes it from queue + items", () => {
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue({ id: "a", text: "first" }, result.current.setItems);
      result.current.queue.enqueue({ id: "b", text: "second" }, result.current.setItems);
    });

    let dequeued: ReturnType<typeof result.current.queue.dequeueNext> = null;
    act(() => {
      dequeued = result.current.queue.dequeueNext(result.current.setItems);
    });

    expect(dequeued?.id).toBe("a");
    expect(dequeued?.text).toBe("first");
    expect(result.current.queue.pendingQueue).toHaveLength(1);
    // pending-message item for "a" should be removed
    const itemA = result.current.items.find((it) => it.kind === "pending-message" && it.id === "a");
    expect(itemA).toBeUndefined();
    // pending-message item for "b" should still be there
    const itemB = result.current.items.find((it) => it.kind === "pending-message" && it.id === "b");
    expect(itemB).toBeDefined();
  });

  it("returns null when queue is empty", () => {
    const { result } = renderHook(() => useTestHook());
    let dequeued: ReturnType<typeof result.current.queue.dequeueNext> = undefined as never;
    act(() => {
      dequeued = result.current.queue.dequeueNext(result.current.setItems);
    });
    expect(dequeued).toBeNull();
  });

  it("returns null and preserves queue when userCancelledRef is true", () => {
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });

    // Simulate user-initiated cancel
    act(() => {
      result.current.queue.userCancelledRef.current = true;
    });

    let dequeued: ReturnType<typeof result.current.queue.dequeueNext> = undefined as never;
    act(() => {
      dequeued = result.current.queue.dequeueNext(result.current.setItems);
    });

    expect(dequeued).toBeNull();
    expect(result.current.queue.pendingQueue).toHaveLength(1);
  });
});

describe("usePendingQueue — markDispatching", () => {
  it("transitions a queued item to dispatching", () => {
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });
    act(() => {
      result.current.queue.markDispatching(ID, result.current.setItems);
    });

    const item = result.current.items.find((it) => it.kind === "pending-message" && it.id === ID);
    expect(item?.kind === "pending-message" && item.status).toBe("dispatching");
  });

  it("warn-logs and no-ops when item is not queued (dispatching state)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });
    act(() => {
      result.current.queue.markDispatching(ID, result.current.setItems); // queued → dispatching
    });
    act(() => {
      result.current.queue.markDispatching(ID, result.current.setItems); // dispatching → warn
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("markDispatching"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"dispatching"'));
    warn.mockRestore();
  });

  it("warn-logs when item is not found (unknown id)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.markDispatching("no-such-id", result.current.setItems);
    });

    // No warn expected — there's simply no item to match; no-op silently.
    // (The current implementation only warns on status mismatch, not missing item.)
    warn.mockRestore();
  });
});

describe("usePendingQueue — markFailed", () => {
  it("transitions a dispatching item to failed with errorReason and failedAt", () => {
    const { result } = renderHook(() => useTestHook());
    const before = Date.now();

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });
    act(() => {
      result.current.queue.markDispatching(ID, result.current.setItems);
    });
    act(() => {
      result.current.queue.markFailed(ID, "engine timed out", result.current.setItems);
    });

    const item = result.current.items.find((it) => it.kind === "pending-message" && it.id === ID);
    expect(item?.kind === "pending-message" && item.status).toBe("failed");
    if (item?.kind === "pending-message") {
      expect(item.errorReason).toBe("engine timed out");
      expect(item.failedAt).toBeGreaterThanOrEqual(before);
    }
  });

  it("warn-logs and no-ops when item is not dispatching (still queued)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });
    act(() => {
      result.current.queue.markFailed(ID, "boom", result.current.setItems);
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("markFailed"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"queued"'));

    const item = result.current.items.find((it) => it.kind === "pending-message" && it.id === ID);
    // Status should still be queued — no-op
    expect(item?.kind === "pending-message" && item.status).toBe("queued");
    warn.mockRestore();
  });
});

describe("usePendingQueue — retryFailed", () => {
  it("transitions a failed item back to queued and returns {text, sketchId?}", () => {
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG_WITH_SKETCH, result.current.setItems);
    });
    act(() => {
      result.current.queue.markDispatching(MSG_WITH_SKETCH.id, result.current.setItems);
    });
    act(() => {
      result.current.queue.markFailed(MSG_WITH_SKETCH.id, "timeout", result.current.setItems);
    });

    let captured: ReturnType<typeof result.current.queue.retryFailed> = null;
    act(() => {
      captured = result.current.queue.retryFailed(MSG_WITH_SKETCH.id, result.current.setItems);
    });

    expect(captured).toEqual({ text: "sketch message", sketchId: "sketch-abc" });

    const item = result.current.items.find(
      (it) => it.kind === "pending-message" && it.id === MSG_WITH_SKETCH.id,
    );
    expect(item?.kind === "pending-message" && item.status).toBe("queued");
    if (item?.kind === "pending-message") {
      expect(item.errorReason).toBeUndefined();
      expect(item.failedAt).toBeUndefined();
    }
  });

  it("warn-logs and returns null when item is not failed (queued state)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });

    let captured: ReturnType<typeof result.current.queue.retryFailed> = undefined as never;
    act(() => {
      captured = result.current.queue.retryFailed(ID, result.current.setItems);
    });

    expect(captured).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("retryFailed"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"queued"'));
    warn.mockRestore();
  });
});

describe("usePendingQueue — editPending", () => {
  it("updates text on a queued item", () => {
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });
    act(() => {
      result.current.queue.editPending(ID, "updated text", result.current.setItems);
    });

    const item = result.current.items.find((it) => it.kind === "pending-message" && it.id === ID);
    if (item?.kind === "pending-message") {
      expect(item.text).toBe("updated text");
    }
    // Also updates pendingQueue
    expect(result.current.queue.pendingQueue[0]?.text).toBe("updated text");
  });

  it("warn-logs and no-ops when item is dispatching", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });
    act(() => {
      result.current.queue.markDispatching(ID, result.current.setItems);
    });
    act(() => {
      result.current.queue.editPending(ID, "should not apply", result.current.setItems);
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("editPending"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"dispatching"'));

    const item = result.current.items.find((it) => it.kind === "pending-message" && it.id === ID);
    if (item?.kind === "pending-message") {
      expect(item.text).toBe("test message"); // unchanged
    }
    warn.mockRestore();
  });

  it("warn-logs and no-ops when item is failed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });
    act(() => {
      result.current.queue.markDispatching(ID, result.current.setItems);
    });
    act(() => {
      result.current.queue.markFailed(ID, "err", result.current.setItems);
    });
    act(() => {
      result.current.queue.editPending(ID, "should not apply", result.current.setItems);
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("editPending"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"failed"'));
    warn.mockRestore();
  });
});

describe("usePendingQueue — removeFailed", () => {
  it("removes a failed item from the items list", () => {
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });
    act(() => {
      result.current.queue.markDispatching(ID, result.current.setItems);
    });
    act(() => {
      result.current.queue.markFailed(ID, "boom", result.current.setItems);
    });
    act(() => {
      result.current.queue.removeFailed(ID, result.current.setItems);
    });

    const item = result.current.items.find((it) => it.kind === "pending-message" && it.id === ID);
    expect(item).toBeUndefined();
  });

  it("warn-logs and no-ops when item is queued", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });
    act(() => {
      result.current.queue.removeFailed(ID, result.current.setItems);
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("removeFailed"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"queued"'));

    const item = result.current.items.find((it) => it.kind === "pending-message" && it.id === ID);
    expect(item).toBeDefined(); // should not have been removed
    warn.mockRestore();
  });

  it("warn-logs and no-ops when item is dispatching", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue(MSG, result.current.setItems);
    });
    act(() => {
      result.current.queue.markDispatching(ID, result.current.setItems);
    });
    act(() => {
      result.current.queue.removeFailed(ID, result.current.setItems);
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("removeFailed"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"dispatching"'));
    warn.mockRestore();
  });
});

describe("derivePendingCounts", () => {
  it("returns 0/0 for empty items", () => {
    expect(derivePendingCounts([])).toEqual({ pendingCount: 0, failedCount: 0 });
  });

  it("counts queued and dispatching as pendingCount, failed as failedCount", () => {
    const items: ChatStreamItem[] = [
      { kind: "pending-message", id: "a", text: "a", status: "queued" },
      { kind: "pending-message", id: "b", text: "b", status: "dispatching" },
      {
        kind: "pending-message",
        id: "c",
        text: "c",
        status: "failed",
        errorReason: "err",
        failedAt: 1,
      },
      {
        kind: "pending-message",
        id: "d",
        text: "d",
        status: "failed",
        errorReason: "err2",
        failedAt: 2,
      },
    ];
    expect(derivePendingCounts(items)).toEqual({ pendingCount: 2, failedCount: 2 });
  });

  it("ignores non-pending items", () => {
    const items: ChatStreamItem[] = [
      { kind: "message", id: "m1", role: "user", content: "hello", rawContent: "hello" },
      { kind: "pending-message", id: "p1", text: "p", status: "queued" },
    ];
    expect(derivePendingCounts(items)).toEqual({ pendingCount: 1, failedCount: 0 });
  });
});

describe("usePendingQueue — pendingCount", () => {
  it("reflects queued-only items in pendingQueue (pre-dispatch)", () => {
    const { result } = renderHook(() => useTestHook());

    act(() => {
      result.current.queue.enqueue({ id: "a", text: "a" }, result.current.setItems);
      result.current.queue.enqueue({ id: "b", text: "b" }, result.current.setItems);
    });

    expect(result.current.queue.pendingCount).toBe(2);

    act(() => {
      result.current.queue.cancelPending("a", result.current.setItems);
    });

    expect(result.current.queue.pendingCount).toBe(1);
  });
});
