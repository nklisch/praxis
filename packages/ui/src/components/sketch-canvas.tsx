/**
 * Phase 15a: SketchCanvas — tldraw v4 wrapper.
 *
 * Two variants:
 *   "inline" — fixed 320px height; chrome stripped. Used in the composer and
 *              per-item submission inputs.
 *   "full"   — fills its parent container; full tldraw chrome. Used in the
 *              workspace sketch-note editor.
 *
 * Imperative handle (via `handleRef`):
 *   capture() — returns { snapshot, image: Blob (PNG), width, height }
 *   clear()   — deletes all shapes on the current page
 *
 * Notes on image export inside vitest/jsdom:
 *   editor.toImage() requires a real canvas context. Tests must mock the editor
 *   or skip the image-export assertion. See sketch-canvas.test.tsx for the
 *   established mock pattern.
 */
import {
  type ForwardedRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";
import { type Editor, Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import styles from "./sketch-canvas.module.css";

// ── Public types ──────────────────────────────────────────────────────────────

export interface SketchSnapshot {
  /** tldraw snapshot JSON — opaque to most consumers; pass back via initialSnapshot. */
  readonly snapshot: unknown;
  /** PNG of the rendered drawing as a Blob (high-DPI, 2× scale). */
  readonly image: Blob;
  readonly width: number;
  readonly height: number;
}

export interface SketchCanvasHandle {
  /** Capture the current drawing state. Throws if the editor is not yet mounted. */
  capture: () => Promise<SketchSnapshot>;
  /** Remove all shapes from the current page. */
  clear: () => void;
}

export interface SketchCanvasProps {
  /** Inline: fixed 320px height, stripped chrome. Full: fills parent. Default "inline". */
  variant?: "inline" | "full";
  /** tldraw snapshot to restore on mount. */
  initialSnapshot?: unknown;
  /**
   * Fired whenever the canvas content changes (debounced ~500ms internally).
   * Receives the raw tldraw snapshot so callers can persist it.
   */
  onChange?: (snapshot: unknown) => void;
  /** Forwarded ref that exposes { capture, clear }. */
  handleRef?: ForwardedRef<SketchCanvasHandle>;
}

// Inline mode: hide all tldraw chrome so the canvas is a bare drawing surface.
const INLINE_COMPONENTS = {
  MenuPanel: null,
  MainMenu: null,
  NavigationPanel: null,
  PageMenu: null,
  StylePanel: null,
  TopPanel: null,
  HelpMenu: null,
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function SketchCanvas({
  variant = "inline",
  initialSnapshot,
  onChange,
  handleRef,
}: SketchCanvasProps) {
  const editorRef = useRef<Editor | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep onChange in a ref so the store listener always sees the latest value
  // without re-registering on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Stable capture function — reads from the ref at call time.
  const capture = useCallback(async (): Promise<SketchSnapshot> => {
    const editor = editorRef.current;
    if (!editor) throw new Error("SketchCanvas: editor is not mounted yet");

    const snapshot = editor.getSnapshot();
    const shapes = editor.getCurrentPageShapes();

    if (shapes.length === 0) {
      // Empty canvas — return a 1×1 transparent PNG
      const empty = new Blob([], { type: "image/png" });
      return { snapshot, image: empty, width: 0, height: 0 };
    }

    const { blob, width, height } = await editor.toImage(shapes, {
      format: "png",
      scale: 2,
    });

    return { snapshot, image: blob, width, height };
  }, []);

  // Stable clear function.
  const clear = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const ids = editor.getCurrentPageShapes().map((s) => s.id);
    if (ids.length > 0) {
      editor.deleteShapes(ids);
    }
  }, []);

  // Wire up the imperative handle via the forwarded ref.
  useImperativeHandle(handleRef, () => ({ capture, clear }), [capture, clear]);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Restore initial snapshot if provided.
      if (initialSnapshot != null) {
        try {
          // biome-ignore lint/suspicious/noExplicitAny: tldraw snapshot is opaque
          editor.loadSnapshot(initialSnapshot as any);
        } catch {
          // Malformed snapshot — start fresh rather than crashing.
        }
      }

      // Subscribe to store changes for the onChange debounce.
      // Returns an unsubscribe fn which tldraw calls when onMount returns a fn.
      return editor.store.listen(() => {
        if (!onChangeRef.current) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          onChangeRef.current?.(editor.getSnapshot());
        }, 500);
      });
    },
    // Only register once on mount — onChange is read via onChangeRef.
    // initialSnapshot is only applied at mount time; subsequent changes must
    // use clear() + capture() rather than re-loading.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only registration
    [],
  );

  return (
    <div className={variant === "inline" ? styles.inline : styles.full}>
      <Tldraw
        // Omit persistenceKey to disable localStorage — sketches are captured on demand.
        onMount={handleMount}
        {...(variant === "inline" && { components: INLINE_COMPONENTS })}
      />
    </div>
  );
}
