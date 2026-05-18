/**
 * Tests for useDirtyState and useDirtyAggregate hooks.
 *
 * Verifies:
 *  - Single key: register, mark dirty, aggregate = 1/1; mark clean → 0/0.
 *  - Two keys: both dirty → 2/2. One clean → 1/1.
 *  - Three keys: all dirty → 3/3.
 *  - Unmount of a dirty key removes it from the aggregate.
 *  - Hooks throw when used outside <DirtyStateProvider>.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DirtyStateProvider } from "../../contexts/dirty-state-provider.js";
import { useDirtyAggregate, useDirtyState } from "../use-dirty-state.js";

afterEach(() => cleanup());

function wrapper({ children }: { children: ReactNode }) {
  return <DirtyStateProvider>{children}</DirtyStateProvider>;
}

// ── Single key ──────────────────────────────────────────────────────────────

describe("useDirtyState — single key", () => {
  it("starts clean and returns correct shape", () => {
    const { result } = renderHook(() => useDirtyState("surface.a"), { wrapper });
    expect(result.current.isDirty).toBe(false);
    expect(typeof result.current.markDirty).toBe("function");
    expect(typeof result.current.markClean).toBe("function");
  });

  it("markDirty sets isDirty to true", () => {
    const { result } = renderHook(() => useDirtyState("surface.a"), { wrapper });
    act(() => {
      result.current.markDirty();
    });
    expect(result.current.isDirty).toBe(true);
  });

  it("markClean clears isDirty back to false", () => {
    const { result } = renderHook(() => useDirtyState("surface.a"), { wrapper });
    act(() => {
      result.current.markDirty();
    });
    expect(result.current.isDirty).toBe(true);
    act(() => {
      result.current.markClean();
    });
    expect(result.current.isDirty).toBe(false);
  });

  it("markDirty is idempotent", () => {
    const { result } = renderHook(() => useDirtyState("surface.a"), { wrapper });
    act(() => {
      result.current.markDirty();
      result.current.markDirty();
    });
    expect(result.current.isDirty).toBe(true);
  });

  it("markClean is idempotent when already clean", () => {
    const { result } = renderHook(() => useDirtyState("surface.a"), { wrapper });
    // No error and stays clean:
    act(() => {
      result.current.markClean();
    });
    expect(result.current.isDirty).toBe(false);
  });
});

// ── Aggregate — single key ───────────────────────────────────────────────────

describe("useDirtyAggregate — single key", () => {
  it("aggregate is 0 when no key is dirty", () => {
    const { result } = renderHook(
      () => ({ dirty: useDirtyState("surface.a"), agg: useDirtyAggregate() }),
      { wrapper },
    );
    expect(result.current.agg.dirtyCount).toBe(0);
    expect(result.current.agg.surfaceCount).toBe(0);
  });

  it("aggregate is 1/1 after markDirty on one key", () => {
    const { result } = renderHook(
      () => ({ dirty: useDirtyState("surface.a"), agg: useDirtyAggregate() }),
      { wrapper },
    );
    act(() => {
      result.current.dirty.markDirty();
    });
    expect(result.current.agg.dirtyCount).toBe(1);
    expect(result.current.agg.surfaceCount).toBe(1);
  });

  it("aggregate returns to 0/0 after markClean", () => {
    const { result } = renderHook(
      () => ({ dirty: useDirtyState("surface.a"), agg: useDirtyAggregate() }),
      { wrapper },
    );
    act(() => {
      result.current.dirty.markDirty();
    });
    act(() => {
      result.current.dirty.markClean();
    });
    expect(result.current.agg.dirtyCount).toBe(0);
    expect(result.current.agg.surfaceCount).toBe(0);
  });
});

// ── Aggregate — two keys ─────────────────────────────────────────────────────

describe("useDirtyAggregate — two keys", () => {
  it("both dirty → 2/2; one clean → 1/1", () => {
    const { result } = renderHook(
      () => ({
        a: useDirtyState("surface.a"),
        b: useDirtyState("surface.b"),
        agg: useDirtyAggregate(),
      }),
      { wrapper },
    );

    // Both dirty
    act(() => {
      result.current.a.markDirty();
      result.current.b.markDirty();
    });
    expect(result.current.agg.dirtyCount).toBe(2);
    expect(result.current.agg.surfaceCount).toBe(2);

    // Clean one
    act(() => {
      result.current.a.markClean();
    });
    expect(result.current.agg.dirtyCount).toBe(1);
    expect(result.current.agg.surfaceCount).toBe(1);
  });

  it("independent keys track independently", () => {
    const { result } = renderHook(
      () => ({
        a: useDirtyState("surface.a"),
        b: useDirtyState("surface.b"),
        agg: useDirtyAggregate(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.a.markDirty();
    });
    expect(result.current.a.isDirty).toBe(true);
    expect(result.current.b.isDirty).toBe(false);
    expect(result.current.agg.dirtyCount).toBe(1);
  });
});

// ── Aggregate — three keys ───────────────────────────────────────────────────

describe("useDirtyAggregate — three keys", () => {
  it("three keys all dirty → 3/3", () => {
    const { result } = renderHook(
      () => ({
        a: useDirtyState("surface.a"),
        b: useDirtyState("surface.b"),
        c: useDirtyState("surface.c"),
        agg: useDirtyAggregate(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.a.markDirty();
      result.current.b.markDirty();
      result.current.c.markDirty();
    });
    expect(result.current.agg.dirtyCount).toBe(3);
    expect(result.current.agg.surfaceCount).toBe(3);
  });
});

// ── Unmount cleanup ───────────────────────────────────────────────────────────
// These tests render multi-consumer components inside a single provider so
// they share the same DirtyStateProvider instance.

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

/**
 * A component that registers a dirty-state key and exposes a button to toggle
 * dirty state and a readout for the current isDirty value.
 */
function DirtySurface({ surfaceKey }: { surfaceKey: string }) {
  const { isDirty, markDirty, markClean } = useDirtyState(surfaceKey);
  return (
    <div>
      <span data-testid={`isDirty-${surfaceKey}`}>{String(isDirty)}</span>
      <button type="button" data-testid={`markDirty-${surfaceKey}`} onClick={markDirty}>
        markDirty
      </button>
      <button type="button" data-testid={`markClean-${surfaceKey}`} onClick={markClean}>
        markClean
      </button>
    </div>
  );
}

/** Shows the aggregate dirty count. */
function AggDisplay() {
  const { dirtyCount } = useDirtyAggregate();
  return <span data-testid="agg">{dirtyCount}</span>;
}

/**
 * Harness that conditionally mounts surface A so we can test unmount cleanup.
 */
function UnmountHarness({ initialShowA = true }: { initialShowA?: boolean }) {
  const [showA, setShowA] = useState(initialShowA);
  return (
    <DirtyStateProvider>
      {showA && <DirtySurface surfaceKey="surface.a" />}
      <DirtySurface surfaceKey="surface.b" />
      <AggDisplay />
      <button type="button" data-testid="hide-a" onClick={() => setShowA(false)}>
        Hide A
      </button>
    </DirtyStateProvider>
  );
}

describe("useDirtyState — unmount cleanup", () => {
  it("unmounting a dirty consumer removes its key from the aggregate", () => {
    render(<UnmountHarness />);

    // Mark A and B dirty.
    act(() => {
      fireEvent.click(screen.getByTestId("markDirty-surface.a"));
      fireEvent.click(screen.getByTestId("markDirty-surface.b"));
    });
    expect(screen.getByTestId("agg").textContent).toBe("2");

    // Unmount A by hiding it.
    act(() => {
      fireEvent.click(screen.getByTestId("hide-a"));
    });

    // Aggregate should now be 1 (only B is dirty).
    expect(screen.getByTestId("agg").textContent).toBe("1");
  });

  it("unmounting a clean consumer does not affect other dirty keys", () => {
    render(<UnmountHarness />);

    // Only mark B dirty; A stays clean.
    act(() => {
      fireEvent.click(screen.getByTestId("markDirty-surface.b"));
    });
    expect(screen.getByTestId("agg").textContent).toBe("1");

    // Unmount the clean A.
    act(() => {
      fireEvent.click(screen.getByTestId("hide-a"));
    });

    // Aggregate stays 1 — only B was dirty.
    expect(screen.getByTestId("agg").textContent).toBe("1");
  });
});

// ── Out-of-provider guard ─────────────────────────────────────────────────────

describe("useDirtyState — provider guard", () => {
  it("throws when used outside <DirtyStateProvider>", () => {
    // renderHook with no wrapper = no provider
    expect(() => renderHook(() => useDirtyState("surface.a"))).toThrow(
      /useDirtyState must be used inside <DirtyStateProvider>/,
    );
  });
});

describe("useDirtyAggregate — provider guard", () => {
  it("throws when used outside <DirtyStateProvider>", () => {
    expect(() => renderHook(() => useDirtyAggregate())).toThrow(
      /useDirtyAggregate must be used inside <DirtyStateProvider>/,
    );
  });
});
