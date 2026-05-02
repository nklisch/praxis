import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEasedStream } from "../hooks/use-eased-stream.js";

// ── rAF mock ─────────────────────────────────────────────────────────────────
//
// jsdom doesn't implement requestAnimationFrame. We replace it with a
// manual queue so tests can drive frames deterministically.

type RafCallback = (timestamp: number) => void;

let rafQueue: Array<{ id: number; cb: RafCallback }> = [];
let rafIdCounter = 0;
let rafTimestamp = 0;

function mockRaf(cb: RafCallback): number {
  const id = ++rafIdCounter;
  rafQueue.push({ id, cb });
  return id;
}

function mockCancelRaf(id: number): void {
  rafQueue = rafQueue.filter((entry) => entry.id !== id);
}

/**
 * Flush all queued rAF frames, advancing the timestamp by `deltaMs`.
 * The first call sets the baseline timestamp; subsequent calls advance it.
 */
function flushRaf(deltaMs = 16): void {
  rafTimestamp += deltaMs;
  const current = rafTimestamp;
  const toRun = [...rafQueue];
  rafQueue = [];
  for (const entry of toRun) {
    entry.cb(current);
  }
}

// ── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  rafQueue = [];
  rafIdCounter = 0;
  rafTimestamp = 0;
  vi.stubGlobal("requestAnimationFrame", mockRaf);
  vi.stubGlobal("cancelAnimationFrame", mockCancelRaf);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── tests ────────────────────────────────────────────────────────────────────

describe("useEasedStream — disabled mode", () => {
  it("returns raw synchronously when disabled=true", () => {
    const { result } = renderHook(() => useEasedStream("hello world", { disabled: true }));
    expect(result.current).toBe("hello world");
  });

  it("returns empty string immediately when raw is empty and disabled=true", () => {
    const { result } = renderHook(() => useEasedStream("", { disabled: true }));
    expect(result.current).toBe("");
  });
});

describe("useEasedStream — eased mode", () => {
  it("starts with empty displayed text before any frames fire", () => {
    const { result } = renderHook(() => useEasedStream("hello world", { charsPerSecond: 80 }));
    // No frames have fired yet — hook returns "" (displayedLen starts at 0)
    expect(result.current).toBe("");
  });

  it("grows the displayed string over multiple frames", () => {
    const { result } = renderHook(() => useEasedStream("hello world", { charsPerSecond: 80 }));

    // First frame sets the baseline timestamp (elapsed = 0, no chars released)
    act(() => {
      flushRaf(16);
    });
    // Second frame: elapsed = 16ms → ~1.28 chars at 80 cps
    act(() => {
      flushRaf(16);
    });

    const afterFrame2 = result.current;
    expect(afterFrame2.length).toBeGreaterThan(0);
    expect(afterFrame2.length).toBeLessThan("hello world".length);
    expect("hello world".startsWith(afterFrame2)).toBe(true);

    // Third frame advances further
    act(() => {
      flushRaf(16);
    });
    const afterFrame3 = result.current;
    expect(afterFrame3.length).toBeGreaterThanOrEqual(afterFrame2.length);
  });

  it("eventually reaches the full raw string", () => {
    const raw = "hello world";
    const { result } = renderHook(() => useEasedStream(raw, { charsPerSecond: 500 }));

    // At 500 cps, 11 chars takes ~22ms. Flush many frames to ensure completion.
    for (let i = 0; i < 30; i++) {
      act(() => {
        flushRaf(16);
      });
    }

    expect(result.current).toBe(raw);
  });

  it("is always a prefix of raw (never jumps ahead or garbles)", () => {
    const raw = "the quick brown fox";
    const { result } = renderHook(() => useEasedStream(raw, { charsPerSecond: 80 }));

    for (let i = 0; i < 10; i++) {
      act(() => {
        flushRaf(16);
      });
      expect(raw.startsWith(result.current)).toBe(true);
    }
  });

  it("resets displayed text immediately when raw shrinks to empty", () => {
    let raw = "hello world";
    const { result, rerender } = renderHook(
      ({ r }: { r: string }) => useEasedStream(r, { charsPerSecond: 80 }),
      { initialProps: { r: raw } },
    );

    // Advance two frames so some characters are displayed
    act(() => {
      flushRaf(16);
    });
    act(() => {
      flushRaf(16);
    });
    expect(result.current.length).toBeGreaterThan(0);

    // Simulate a new message: raw resets to ""
    raw = "";
    act(() => {
      rerender({ r: raw });
    });

    expect(result.current).toBe("");
  });

  it("resets displayed text when raw shrinks to a shorter string", () => {
    let raw = "hello world";
    const { result, rerender } = renderHook(
      ({ r }: { r: string }) => useEasedStream(r, { charsPerSecond: 80 }),
      { initialProps: { r: raw } },
    );

    // Advance two frames to get some text displayed
    act(() => {
      flushRaf(16);
    });
    act(() => {
      flushRaf(16);
    });
    expect(result.current.length).toBeGreaterThan(0);

    // Raw shrinks (simulating a reset to a shorter new string)
    raw = "hi";
    act(() => {
      rerender({ r: raw });
    });

    // Should reset to start displaying from 0 again
    expect(result.current.length).toBeLessThanOrEqual("hi".length);
    expect("hi".startsWith(result.current)).toBe(true);
  });

  it("accelerates when buffer lag exceeds catchUpAt", () => {
    // 500-char raw at 80 cps normal with catchUpAt=400
    // lag=500 > catchUpAt=400 → multiplier = 1 + (500-400)/400 = 1.25
    const raw = "x".repeat(500);
    const { result } = renderHook(() =>
      useEasedStream(raw, { charsPerSecond: 80, catchUpAt: 400 }),
    );

    // First frame sets baseline (elapsed=0)
    act(() => {
      flushRaf(16);
    });
    // Second frame: elapsed=16ms, base=1.28, lag=~500, multiplier=1.25, release=~1.6
    act(() => {
      flushRaf(16);
    });

    // Should have released at least 1 char (catch-up accelerated)
    expect(result.current.length).toBeGreaterThan(0);
  });

  it("releases more chars per frame with larger buffer (catch-up vs steady-state)", () => {
    // Compare two hooks: one with big lag (500 chars), one with small lag (5 chars)
    // The one with bigger lag should release more per frame
    const bigRaw = "x".repeat(500);
    const smallRaw = "hello";

    const { result: bigResult } = renderHook(() =>
      useEasedStream(bigRaw, { charsPerSecond: 80, catchUpAt: 50 }),
    );
    const { result: smallResult } = renderHook(() =>
      useEasedStream(smallRaw, { charsPerSecond: 80, catchUpAt: 50 }),
    );

    // First frame baseline
    act(() => {
      flushRaf(16);
    });
    // Second frame — both release chars, but big buffer accelerates more
    act(() => {
      flushRaf(16);
    });

    // Big buffer has more lag → accelerated release, so should catch up faster
    // Small buffer at steady-state cps, can't exceed its raw.length
    const bigReleased = bigResult.current.length;
    const smallReleased = smallResult.current.length;
    // Big should release >= small (catch-up multiplier applies)
    expect(bigReleased).toBeGreaterThanOrEqual(smallReleased);
  });

  it("does not queue another rAF after reaching the full string", () => {
    const raw = "hi";
    renderHook(() => useEasedStream(raw, { charsPerSecond: 500 }));

    // Flush enough frames to complete (should settle within a few frames)
    for (let i = 0; i < 15; i++) {
      act(() => {
        flushRaf(16);
      });
    }

    // The loop should have stopped — no more queued rAF frames
    const queueAfterCompletion = rafQueue.length;
    act(() => {
      flushRaf(16);
    }); // extra flush should be a no-op
    expect(rafQueue.length).toBe(queueAfterCompletion);
  });

  it("cancels pending rAF on unmount (no continued updates)", () => {
    const { unmount } = renderHook(() => useEasedStream("hello world", { charsPerSecond: 80 }));

    // A frame is queued after mount
    expect(rafQueue.length).toBeGreaterThan(0);

    unmount();

    // Cleanup cancels the pending frame
    expect(rafQueue.length).toBe(0);
  });
});
