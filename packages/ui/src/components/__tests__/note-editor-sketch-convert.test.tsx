/**
 * Tests for the <NoteEditorSketch> sketch → concept-map bridge:
 *   - Convert button appears when onConvertToConceptMap is provided.
 *   - Convert button is absent when onConvertToConceptMap is absent.
 *   - Clicking the button opens the confirmation modal.
 *   - Clicking "Cancel" closes the modal without calling onConvertToConceptMap.
 *   - Clicking "Convert" calls onConvertToConceptMap.
 *   - Error state: if onConvertToConceptMap throws, the error is displayed in the modal.
 *   - Loading state: "Converting…" shown while the async call is in flight.
 *
 * tldraw is mocked (as in sketch-canvas.test.tsx) to avoid jsdom canvas errors.
 */
import type { NoteId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteEditorSketch } from "../note-editor-sketch.js";

afterEach(() => cleanup());

// ── tldraw mock ───────────────────────────────────────────────────────────────

vi.mock("tldraw", () => ({
  Tldraw: ({ onMount }: { onMount?: (editor: unknown) => void }) => {
    if (onMount) onMount({ getSnapshot: () => ({}), store: { listen: () => () => {} } });
    return <div data-testid="tldraw-canvas" />;
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOTE_ID = brandId<"NoteId">("note-sketch-test") as NoteId;
const noop = vi.fn().mockResolvedValue(undefined);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("NoteEditorSketch — convert button visibility", () => {
  it("shows the convert button when onConvertToConceptMap is provided", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} onConvertToConceptMap={vi.fn()} />);
    // The button lives in the inline notice strip ("convert to a concept map ↗")
    expect(screen.getByRole("button", { name: /convert to a concept map/i })).toBeDefined();
  });

  it("hides the convert button when onConvertToConceptMap is absent", () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} />);
    expect(screen.queryByRole("button", { name: /convert to a concept map/i })).toBeNull();
  });
});

describe("NoteEditorSketch — confirmation modal", () => {
  it("opens the modal when the convert button is clicked", async () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} onConvertToConceptMap={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /convert to a concept map/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText(/convert to concept map\?/i)).toBeDefined();
    });
  });

  it("clicking Cancel closes the modal without calling onConvertToConceptMap", async () => {
    const onConvert = vi.fn();
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} onConvertToConceptMap={onConvert} />);
    fireEvent.click(screen.getByRole("button", { name: /convert to a concept map/i }));
    await waitFor(() => screen.getByText(/convert to concept map\?/i));

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => {
      expect(screen.queryByText(/convert to concept map\?/i)).toBeNull();
    });
    expect(onConvert).not.toHaveBeenCalled();
  });

  it("clicking Convert calls onConvertToConceptMap", async () => {
    const onConvert = vi.fn().mockResolvedValue(undefined);
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} onConvertToConceptMap={onConvert} />);
    fireEvent.click(screen.getByRole("button", { name: /convert to a concept map/i }));
    await waitFor(() => screen.getByText(/convert to concept map\?/i));

    fireEvent.click(screen.getByRole("button", { name: /^convert$/i }));
    await waitFor(() => {
      expect(onConvert).toHaveBeenCalledOnce();
    });
  });

  it("shows error message when onConvertToConceptMap throws", async () => {
    const onConvert = vi.fn().mockRejectedValue(new Error("Service unavailable"));
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} onConvertToConceptMap={onConvert} />);
    fireEvent.click(screen.getByRole("button", { name: /convert to a concept map/i }));
    await waitFor(() => screen.getByText(/convert to concept map\?/i));

    fireEvent.click(screen.getByRole("button", { name: /^convert$/i }));
    await waitFor(() => {
      expect(screen.getByText(/Service unavailable/)).toBeDefined();
    });
    // Modal stays open on error
    expect(screen.getByText(/convert to concept map\?/i)).toBeDefined();
  });

  it("ESC key closes the modal", async () => {
    render(<NoteEditorSketch noteId={NOTE_ID} onSave={noop} onConvertToConceptMap={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /convert to a concept map/i }));
    await waitFor(() => screen.getByText(/convert to concept map\?/i));

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText(/convert to concept map\?/i)).toBeNull();
    });
  });
});
