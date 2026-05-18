/**
 * Tests for the restyled <NoteEditorSketch> surface:
 *   - Canvas (tldraw) mounts.
 *   - Tools rail renders all expected tool buttons.
 *   - Color swatches render.
 *   - Inline notice strip is visible.
 *   - Convert button appears in the notice strip when onConvertToConceptMap is provided.
 *   - Convert button is absent when onConvertToConceptMap is absent.
 *   - Convert button opens the confirmation modal (integration with existing bridge logic).
 *
 * tldraw is mocked (as in sketch-canvas.test.tsx) to avoid jsdom canvas errors.
 * The full bridge/modal interaction is covered in
 * packages/ui/src/components/__tests__/note-editor-sketch-convert.test.tsx.
 */
import type { NoteId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteEditorSketch } from "../components/note-editor-sketch.js";

afterEach(() => cleanup());

// ── tldraw mock ───────────────────────────────────────────────────────────────

vi.mock("tldraw", () => ({
  Tldraw: ({ onMount }: { onMount?: (editor: unknown) => void }) => {
    if (onMount) onMount({ getSnapshot: () => ({}), store: { listen: () => () => {} } });
    return <div data-testid="tldraw-canvas" />;
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOTE_ID = brandId<"NoteId">("note-sketch-surface-test") as NoteId;
const noop = vi.fn().mockResolvedValue(undefined);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("NoteEditorSketch — canvas", () => {
  it("mounts the tldraw canvas", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    expect(screen.getByTestId("tldraw-canvas")).toBeDefined();
  });
});

describe("NoteEditorSketch — tools rail", () => {
  it("renders the Select tool button", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    expect(screen.getByRole("button", { name: /^select$/i })).toBeDefined();
  });

  it("renders the Pen tool button", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    expect(screen.getByRole("button", { name: /^pen$/i })).toBeDefined();
  });

  it("renders the Arrow tool button", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    expect(screen.getByRole("button", { name: /^arrow$/i })).toBeDefined();
  });

  it("renders the Text tool button", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    expect(screen.getByRole("button", { name: /^text$/i })).toBeDefined();
  });

  it("renders the Shape tool button", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    expect(screen.getByRole("button", { name: /^shape$/i })).toBeDefined();
  });

  it("renders the Eraser tool button", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    expect(screen.getByRole("button", { name: /^eraser$/i })).toBeDefined();
  });

  it("Select is active by default (aria-pressed=true)", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    const selectBtn = screen.getByRole("button", { name: /^select$/i });
    expect(selectBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking Pen sets it active (aria-pressed=true)", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    const penBtn = screen.getByRole("button", { name: /^pen$/i });
    fireEvent.click(penBtn);
    expect(penBtn.getAttribute("aria-pressed")).toBe("true");
    // Select should now be inactive
    expect(screen.getByRole("button", { name: /^select$/i }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("renders all 5 color swatches", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    // Each swatch has an aria-label from COLOR_SWATCHES
    expect(screen.getByRole("button", { name: /black/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /accent/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /sage/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /amber/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /slate/i })).toBeDefined();
  });
});

describe("NoteEditorSketch — inline notice strip", () => {
  it("renders the notice strip with 'Sketch' label", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    expect(screen.getByRole("note")).toBeDefined();
    expect(screen.getByText(/Sketch/)).toBeDefined();
  });

  it("shows the convert button in the notice strip when onConvertToConceptMap is provided", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} onConvertToConceptMap={vi.fn()} />);
    expect(screen.getByRole("button", { name: /convert to a concept map/i })).toBeDefined();
  });

  it("does not show the convert button when onConvertToConceptMap is absent", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    expect(screen.queryByRole("button", { name: /convert to a concept map/i })).toBeNull();
  });

  it("clicking the convert button opens the confirmation modal", async () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} onConvertToConceptMap={vi.fn()} />);
    const convertBtn = screen.getByRole("button", { name: /convert to a concept map/i });
    fireEvent.click(convertBtn);
    await waitFor(() => {
      expect(screen.getByText(/convert to concept map\?/i)).toBeDefined();
    });
  });
});
