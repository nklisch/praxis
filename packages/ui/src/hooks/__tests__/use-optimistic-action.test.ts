/**
 * Tests for useOptimisticAction — the canonical optimistic-dispatch hook.
 *
 * State machine:
 *   idle → pending → success (auto-resets to idle)
 *                  → failed
 *   failed → retrying → success
 *                     → failed
 *
 * Also covers: externalSettle, success auto-reset timer, retry param replay,
 * dismiss, onSuccess/onError callbacks.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOptimisticAction } from "../use-optimistic-action.js";

// ── Timer setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDispatch(resolves = true, delay = 0) {
  return vi.fn(async (_params: string): Promise<void> => {
    if (delay > 0) {
      await new Promise<void>((res) => setTimeout(res, delay));
    }
    if (!resolves) throw new Error("dispatch error");
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useOptimisticAction", () => {
  // ── trigger: idle → pending → success ──────────────────────────────────────

  it("starts at idle", () => {
    const { result } = renderHook(() => useOptimisticAction({ dispatch: makeDispatch() }));
    expect(result.current.state).toBe("idle");
    expect(result.current.errorReason).toBeUndefined();
  });

  it("transitions idle → pending → success on successful dispatch", async () => {
    let resolveDispatch!: () => void;
    const dispatch = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveDispatch = res;
        }),
    );
    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    act(() => result.current.trigger("param-a"));
    expect(result.current.state).toBe("pending");

    await act(async () => {
      resolveDispatch();
    });
    expect(result.current.state).toBe("success");
    expect(result.current.errorReason).toBeUndefined();
  });

  it("auto-resets success → idle after resetSuccessAfterMs (default 800ms)", async () => {
    const dispatch = makeDispatch();
    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    await act(async () => {
      result.current.trigger("x");
    });
    expect(result.current.state).toBe("success");

    act(() => vi.advanceTimersByTime(799));
    expect(result.current.state).toBe("success");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.state).toBe("idle");
  });

  it("respects custom resetSuccessAfterMs", async () => {
    const dispatch = makeDispatch();
    const { result } = renderHook(() =>
      useOptimisticAction({ dispatch, resetSuccessAfterMs: 200 }),
    );

    await act(async () => {
      result.current.trigger("x");
    });
    expect(result.current.state).toBe("success");

    act(() => vi.advanceTimersByTime(199));
    expect(result.current.state).toBe("success");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.state).toBe("idle");
  });

  // ── trigger: idle → pending → failed ──────────────────────────────────────

  it("transitions idle → pending → failed on rejected dispatch", async () => {
    const dispatch = makeDispatch(false);
    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    await act(async () => {
      result.current.trigger("param-fail");
    });
    expect(result.current.state).toBe("failed");
    expect(result.current.errorReason).toBe("dispatch error");
  });

  it("stays in failed state until retry() or dismiss()", async () => {
    const dispatch = makeDispatch(false);
    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    await act(async () => {
      result.current.trigger("x");
    });
    expect(result.current.state).toBe("failed");

    // Advance time well past any success-reset window
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.state).toBe("failed");
  });

  // ── retry: failed → retrying → success ────────────────────────────────────

  it("retry() transitions failed → retrying → success and replays captured params", async () => {
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error("first fail"))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    await act(async () => {
      result.current.trigger("the-params");
    });
    expect(result.current.state).toBe("failed");

    await act(async () => {
      result.current.retry();
    });
    expect(result.current.state).toBe("success");

    // Verify retry used the same captured params
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(1, "the-params");
    expect(dispatch).toHaveBeenNthCalledWith(2, "the-params");
  });

  it("retry() uses retrying (not pending) as the transitional state", async () => {
    let resolveRetry!: () => void;
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementation(
        () =>
          new Promise<void>((res) => {
            resolveRetry = res;
          }),
      );

    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    await act(async () => {
      result.current.trigger("p");
    });
    expect(result.current.state).toBe("failed");

    act(() => {
      result.current.retry();
    });
    expect(result.current.state).toBe("retrying");

    await act(async () => {
      resolveRetry();
    });
    expect(result.current.state).toBe("success");
  });

  it("retry() is a no-op before any trigger()", () => {
    const dispatch = makeDispatch();
    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    act(() => {
      result.current.retry();
    });
    expect(result.current.state).toBe("idle");
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ── dismiss ────────────────────────────────────────────────────────────────

  it("dismiss() transitions failed → idle", async () => {
    const dispatch = makeDispatch(false);
    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    await act(async () => {
      result.current.trigger("x");
    });
    expect(result.current.state).toBe("failed");

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.state).toBe("idle");
    expect(result.current.errorReason).toBeUndefined();
  });

  // ── onSuccess / onError callbacks ─────────────────────────────────────────

  it("calls onSuccess after successful dispatch", async () => {
    const onSuccess = vi.fn();
    const dispatch = makeDispatch();
    const { result } = renderHook(() => useOptimisticAction({ dispatch, onSuccess }));

    await act(async () => {
      result.current.trigger("x");
    });
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("calls onError after failed dispatch", async () => {
    const onError = vi.fn();
    const dispatch = makeDispatch(false);
    const { result } = renderHook(() => useOptimisticAction({ dispatch, onError }));

    await act(async () => {
      result.current.trigger("x");
    });
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  // ── externalSettle ────────────────────────────────────────────────────────

  it("externalSettle('success') transitions pending → success", () => {
    // Use a never-resolving dispatch — externalSettle drives completion.
    const dispatch = vi.fn(() => new Promise<void>(() => {}));
    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    act(() => {
      result.current.trigger("p");
    });
    expect(result.current.state).toBe("pending");

    act(() => {
      result.current.externalSettle("success");
    });
    expect(result.current.state).toBe("success");
  });

  it("externalSettle('failed') transitions pending → failed with reason", () => {
    const dispatch = vi.fn(() => new Promise<void>(() => {}));
    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    act(() => {
      result.current.trigger("p");
    });
    expect(result.current.state).toBe("pending");

    act(() => {
      result.current.externalSettle("failed", "External error");
    });
    expect(result.current.state).toBe("failed");
    expect(result.current.errorReason).toBe("External error");
  });

  it("externalSettle('success') is a no-op when state is idle", () => {
    const dispatch = makeDispatch();
    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    act(() => {
      result.current.externalSettle("success");
    });
    expect(result.current.state).toBe("idle");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("externalSettle fires onSuccess callback on success", () => {
    const onSuccess = vi.fn();
    const dispatch = vi.fn(() => new Promise<void>(() => {}));
    const { result } = renderHook(() => useOptimisticAction({ dispatch, onSuccess }));

    act(() => {
      result.current.trigger("p");
    });
    act(() => {
      result.current.externalSettle("success");
    });
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  // ── errorReason extraction ────────────────────────────────────────────────

  it("extracts message from Error instances", async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error("specific error msg"));
    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    await act(async () => {
      result.current.trigger("x");
    });
    expect(result.current.errorReason).toBe("specific error msg");
  });

  it("coerces non-Error throws to string", async () => {
    const dispatch = vi.fn().mockRejectedValue("string rejection");
    const { result } = renderHook(() => useOptimisticAction({ dispatch }));

    await act(async () => {
      result.current.trigger("x");
    });
    expect(result.current.errorReason).toBe("string rejection");
  });
});
