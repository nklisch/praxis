/**
 * Tests for useResizableWidth hook.
 *
 * Verifies:
 *  - Synchronous localStorage init: empty / valid / out-of-range / garbage /
 *    null storageKey / throwing getItem.
 *  - reset() restores defaultWidth and clears storage.
 *  - Keyboard nav (arrow keys, Shift modifier, Home key) updates width,
 *    clamps to bounds, inverts for `side: "left"`, and persists immediately.
 *  - handleProps ARIA shape (role, aria-orientation, aria-valuenow/min/max,
 *    aria-label, tabIndex, onKeyDown, onPointerDown).
 *  - Narrative integration: a consumer rendering the hook + a styled element
 *    picks up the persisted width on mount.
 *
 * Notes:
 *  - Pointer-drag (onPointerDown → pointermove → pointerup) is not exercised
 *    end-to-end. The handler attaches listeners to `e.currentTarget` and uses
 *    `setPointerCapture`, both of which JSDOM doesn't simulate cleanly. The
 *    keyboard path shares the same widthRef + clamp + persist code, so the
 *    keyboard cases provide equivalent logic coverage.
 */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "../../components/resize-handle.js";
import { useResizableWidth } from "../use-resizable-width.js";

const KEY = "praxis.panel.test.width";

afterEach(() => {
  cleanup();
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
});

beforeEach(() => {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
});

function baseOpts(
  overrides: Partial<Parameters<typeof useResizableWidth>[0]> = {},
): Parameters<typeof useResizableWidth>[0] {
  return {
    storageKey: KEY,
    defaultWidth: 220,
    minWidth: 160,
    maxWidth: 480,
    side: "right",
    ...overrides,
  };
}

function keyEvent(
  key: string,
  opts: { shiftKey?: boolean } = {},
): React.KeyboardEvent<HTMLElement> {
  const preventDefault = vi.fn();
  // Cast: synthetic events in tests only need the fields the handler reads.
  return {
    key,
    shiftKey: opts.shiftKey ?? false,
    preventDefault,
    // biome-ignore lint/suspicious/noExplicitAny: minimal synthetic-event stub for hook test
  } as any;
}

describe("useResizableWidth — initial state", () => {
  it("returns defaultWidth when localStorage is empty", () => {
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    expect(result.current.width).toBe(220);
  });

  it("returns the persisted value when within bounds", () => {
    window.localStorage.setItem(KEY, "300");
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    expect(result.current.width).toBe(300);
  });

  it("clamps an out-of-range persisted value (above max)", () => {
    window.localStorage.setItem(KEY, "10000");
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    expect(result.current.width).toBe(480);
  });

  it("clamps an out-of-range persisted value (below min)", () => {
    window.localStorage.setItem(KEY, "10");
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    expect(result.current.width).toBe(160);
  });

  it("returns defaultWidth when persisted value is non-numeric garbage", () => {
    window.localStorage.setItem(KEY, "not-a-number");
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    expect(result.current.width).toBe(220);
  });

  it("returns defaultWidth when localStorage.getItem throws", () => {
    const spy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    expect(result.current.width).toBe(220);
    spy.mockRestore();
  });

  it("storageKey:null skips storage entirely and uses defaultWidth", () => {
    const getSpy = vi.spyOn(window.localStorage, "getItem");
    const { result } = renderHook(() => useResizableWidth(baseOpts({ storageKey: null })));
    expect(result.current.width).toBe(220);
    expect(getSpy).not.toHaveBeenCalled();
    getSpy.mockRestore();
  });
});

describe("useResizableWidth — reset()", () => {
  it("restores defaultWidth and removes the storage key", () => {
    window.localStorage.setItem(KEY, "300");
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    expect(result.current.width).toBe(300);

    act(() => {
      result.current.reset();
    });

    expect(result.current.width).toBe(220);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

describe("useResizableWidth — keyboard", () => {
  it("ArrowRight grows by 16 on a right-side handle and persists", () => {
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    act(() => {
      result.current.handleProps.onKeyDown(keyEvent("ArrowRight"));
    });
    expect(result.current.width).toBe(236);
    expect(window.localStorage.getItem(KEY)).toBe("236");
  });

  it("Shift+ArrowRight grows by 64 on a right-side handle", () => {
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    act(() => {
      result.current.handleProps.onKeyDown(keyEvent("ArrowRight", { shiftKey: true }));
    });
    expect(result.current.width).toBe(284);
  });

  it("ArrowLeft shrinks on right-side; clamps at minWidth", () => {
    window.localStorage.setItem(KEY, "170");
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    // Press ArrowLeft three times — 170 -> 154 (would underflow) -> clamped at 160.
    act(() => {
      result.current.handleProps.onKeyDown(keyEvent("ArrowLeft"));
    });
    expect(result.current.width).toBe(160);
    act(() => {
      result.current.handleProps.onKeyDown(keyEvent("ArrowLeft"));
    });
    expect(result.current.width).toBe(160);
  });

  it("ArrowRight clamps at maxWidth", () => {
    window.localStorage.setItem(KEY, "470");
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    act(() => {
      result.current.handleProps.onKeyDown(keyEvent("ArrowRight", { shiftKey: true }));
    });
    expect(result.current.width).toBe(480);
  });

  it("side:'left' inverts direction — ArrowLeft grows, ArrowRight shrinks", () => {
    const { result } = renderHook(() =>
      useResizableWidth(baseOpts({ side: "left", defaultWidth: 300 })),
    );
    act(() => {
      result.current.handleProps.onKeyDown(keyEvent("ArrowLeft"));
    });
    // On a left-edge handle the panel grows when ArrowLeft is pressed.
    expect(result.current.width).toBe(316);
    act(() => {
      result.current.handleProps.onKeyDown(keyEvent("ArrowRight"));
    });
    expect(result.current.width).toBe(300);
  });

  it("Home resets to defaultWidth and persists", () => {
    window.localStorage.setItem(KEY, "300");
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    act(() => {
      result.current.handleProps.onKeyDown(keyEvent("Home"));
    });
    expect(result.current.width).toBe(220);
    expect(window.localStorage.getItem(KEY)).toBe("220");
  });

  it("ignores keys that aren't ArrowLeft/ArrowRight/Home", () => {
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    act(() => {
      result.current.handleProps.onKeyDown(keyEvent("Tab"));
    });
    expect(result.current.width).toBe(220);
  });
});

describe("useResizableWidth — handleProps ARIA shape", () => {
  it("exposes role=separator, aria-orientation=vertical, numeric aria-valuenow, and tabIndex 0", () => {
    const { result } = renderHook(() => useResizableWidth(baseOpts()));
    const { handleProps } = result.current;
    expect(handleProps.role).toBe("separator");
    expect(handleProps["aria-orientation"]).toBe("vertical");
    expect(typeof handleProps["aria-valuenow"]).toBe("number");
    expect(handleProps["aria-valuenow"]).toBe(220);
    expect(handleProps["aria-valuemin"]).toBe(160);
    expect(handleProps["aria-valuemax"]).toBe(480);
    expect(handleProps.tabIndex).toBe(0);
    expect(typeof handleProps.onPointerDown).toBe("function");
    expect(typeof handleProps.onKeyDown).toBe("function");
    expect(typeof handleProps["aria-label"]).toBe("string");
  });

  it("aria-label differs by side", () => {
    const right = renderHook(() => useResizableWidth(baseOpts({ side: "right" })));
    const left = renderHook(() => useResizableWidth(baseOpts({ side: "left" })));
    expect(right.result.current.handleProps["aria-label"]).not.toBe(
      left.result.current.handleProps["aria-label"],
    );
  });
});

describe("useResizableWidth — narrative integration with <ResizeHandle>", () => {
  function Consumer(): JSX.Element {
    const { width, handleProps } = useResizableWidth(baseOpts());
    return (
      <div>
        <div data-testid="panel" style={{ width: `${width}px` }} />
        <ResizeHandle side="right" {...handleProps} />
      </div>
    );
  }

  it("renders an element whose inline width reflects the persisted localStorage value", () => {
    window.localStorage.setItem(KEY, "320");
    render(<Consumer />);
    const panel = screen.getByTestId("panel");
    expect(panel.style.width).toBe("320px");
    const separator = screen.getByRole("separator");
    expect(separator.getAttribute("aria-valuenow")).toBe("320");
  });

  it("renders default width when no persisted value is present", () => {
    render(<Consumer />);
    expect(screen.getByTestId("panel").style.width).toBe("220px");
  });
});
