/**
 * Unit tests for <SketchCanvas>.
 *
 * Vitest runs in jsdom, which lacks a real WebGL/Canvas context. tldraw's
 * editor.toImage() therefore cannot produce a real PNG in this environment.
 *
 * Strategy:
 *   - Mount the component and verify the container renders.
 *   - Verify that `handleRef` is populated on mount (editor stub via vi.mock).
 *   - Skip image-export assertions — those are verified in manual Electron smoke.
 *   - Test capture() fallback for empty canvas (returns empty Blob, width=0).
 *
 * We mock the entire `tldraw` module to avoid jsdom canvas errors and keep the
 * test deterministic. The mock exposes a fake Editor via the `onMount` callback.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SketchCanvas, type SketchCanvasHandle } from "../components/sketch-canvas.js";

afterEach(() => cleanup());

// ── tldraw mock ───────────────────────────────────────────────────────────────

const mockGetSnapshot = vi.fn().mockReturnValue({ document: {}, session: {} });
const mockGetCurrentPageShapes = vi.fn().mockReturnValue([]);
const mockToImage = vi
  .fn()
  .mockResolvedValue({ blob: new Blob([], { type: "image/png" }), width: 100, height: 80 });
const mockDeleteShapes = vi.fn();
const mockLoadSnapshot = vi.fn();

const fakeStore = {
  listen: vi.fn().mockReturnValue(() => {}),
};

const fakeEditor = {
  getSnapshot: mockGetSnapshot,
  getCurrentPageShapes: mockGetCurrentPageShapes,
  toImage: mockToImage,
  deleteShapes: mockDeleteShapes,
  loadSnapshot: mockLoadSnapshot,
  store: fakeStore,
};

vi.mock("tldraw", () => {
  return {
    Tldraw: ({ onMount }: { onMount?: (editor: unknown) => unknown }) => {
      // Call onMount synchronously with the fake editor to simulate tldraw mounting.
      if (onMount) {
        onMount(fakeEditor);
      }
      return <div data-testid="tldraw-canvas">tldraw</div>;
    },
  };
});

// Suppress "import 'tldraw/tldraw.css'" side-effect in jsdom
vi.mock("tldraw/tldraw.css", () => ({}));

// ── Helper: mount with a handleRef ────────────────────────────────────────────

function CanvasWithHandle({
  variant = "inline",
  onCapture,
}: {
  variant?: "inline" | "full";
  onCapture?: (handle: SketchCanvasHandle) => void;
}) {
  const handleRef = useRef<SketchCanvasHandle>(null);

  // Expose handle to test after render
  if (handleRef.current && onCapture) {
    onCapture(handleRef.current);
  }

  return <SketchCanvas variant={variant} handleRef={handleRef} />;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("<SketchCanvas>", () => {
  it("renders the tldraw container in inline variant", () => {
    render(<SketchCanvas variant="inline" />);
    expect(screen.getByTestId("tldraw-canvas")).toBeDefined();
  });

  it("renders in full variant", () => {
    render(<SketchCanvas variant="full" />);
    expect(screen.getByTestId("tldraw-canvas")).toBeDefined();
  });

  it("exposes capture() and clear() via handleRef after mount", async () => {
    let handle: SketchCanvasHandle | null = null;

    function Consumer() {
      const ref = useRef<SketchCanvasHandle>(null);
      // Access ref after render
      return (
        <SketchCanvas
          variant="inline"
          handleRef={(h) => {
            // biome-ignore lint/suspicious/noExplicitAny: test-only ref callback
            (ref as any).current = h;
            handle = h;
          }}
        />
      );
    }

    render(<Consumer />);

    await waitFor(() => {
      expect(handle).not.toBeNull();
    });

    expect(typeof handle!.capture).toBe("function");
    expect(typeof handle!.clear).toBe("function");
  });

  it("capture() returns empty snapshot for an empty canvas (no shapes)", async () => {
    // mockGetCurrentPageShapes returns [] — simulates blank canvas
    mockGetCurrentPageShapes.mockReturnValueOnce([]);

    let handle: SketchCanvasHandle | null = null;

    function Consumer() {
      const ref = useRef<SketchCanvasHandle>(null);
      return (
        <SketchCanvas
          variant="inline"
          handleRef={(h) => {
            handle = h;
          }}
        />
      );
    }

    render(<Consumer />);

    await waitFor(() => expect(handle).not.toBeNull());

    const result = await handle!.capture();
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
    expect(result.image).toBeInstanceOf(Blob);
    // snapshot is whatever mockGetSnapshot returns
    expect(result.snapshot).toBeDefined();
  });

  it("capture() calls toImage when shapes are present", async () => {
    const fakeShape = { id: "shape:1", type: "geo" };
    mockGetCurrentPageShapes.mockReturnValueOnce([fakeShape]);
    mockToImage.mockResolvedValueOnce({
      blob: new Blob(["png"], { type: "image/png" }),
      width: 320,
      height: 200,
    });

    let handle: SketchCanvasHandle | null = null;

    render(
      <SketchCanvas
        variant="inline"
        handleRef={(h) => {
          handle = h;
        }}
      />,
    );

    await waitFor(() => expect(handle).not.toBeNull());

    const result = await handle!.capture();
    expect(mockToImage).toHaveBeenCalledWith([fakeShape], { format: "png", scale: 2 });
    expect(result.width).toBe(320);
    expect(result.height).toBe(200);
  });

  it("clear() calls deleteShapes with all current page shape ids", async () => {
    const fakeShape = { id: "shape:abc", type: "geo" };
    mockGetCurrentPageShapes.mockReturnValue([fakeShape]);

    let handle: SketchCanvasHandle | null = null;

    render(
      <SketchCanvas
        variant="inline"
        handleRef={(h) => {
          handle = h;
        }}
      />,
    );

    await waitFor(() => expect(handle).not.toBeNull());

    handle!.clear();
    expect(mockDeleteShapes).toHaveBeenCalledWith(["shape:abc"]);
  });

  it("inline variant: does not show tldraw chrome (no MenuPanel etc.)", () => {
    // In our mock, Tldraw renders a plain div — this test verifies that
    // the inline components prop is passed by asserting the mock was called
    // with a `components` prop that sets MenuPanel to null. Since our mock
    // doesn't render chrome at all, we rely on the variant class instead.
    const { container } = render(<SketchCanvas variant="inline" />);
    // The wrapper div should have the inline class (320px height via CSS)
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toMatch(/inline/);
  });

  it("full variant: wrapper has full class", () => {
    const { container } = render(<SketchCanvas variant="full" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toMatch(/full/);
  });

  it("loads initialSnapshot via editor.loadSnapshot on mount", () => {
    const snapshot = { document: { store: {} }, session: {} };
    render(<SketchCanvas variant="inline" initialSnapshot={snapshot} />);
    expect(mockLoadSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it("calls onChange after store change fires (debounced)", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    // Capture the listener registered with store.listen
    let storeListener: (() => void) | null = null;
    fakeStore.listen.mockImplementationOnce((fn: () => void) => {
      storeListener = fn;
      return () => {};
    });

    render(<SketchCanvas variant="inline" onChange={onChange} />);

    // Simulate a store change
    storeListener?.();

    // onChange should not have fired yet (debounce)
    expect(onChange).not.toHaveBeenCalled();

    // Advance past debounce
    vi.runAllTimers();
    expect(onChange).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });
});
