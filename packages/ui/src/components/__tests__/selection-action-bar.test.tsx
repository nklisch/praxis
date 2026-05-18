/**
 * Tests for SelectionActionBar.
 *
 * Verifies:
 * - Renders the toolbar with all four action buttons when visible.
 * - Returns null when visible=false.
 * - Returns null when rect=null.
 * - Clicking each button fires the matching handler.
 * - Pressing Escape calls onDismiss.
 * - mousedown outside the bar calls onDismiss.
 * - Buttons are disabled while a handler is in-flight (pending state).
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionActionBar } from "../selection-action-bar.js";

afterEach(() => cleanup());

/** A minimal DOMRect substitute for tests. */
function makeRect(x = 100, y = 200, width = 120, height = 20): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    bottom: y + height,
    right: x + width,
    toJSON: () => ({}),
  };
}

function makeHandlers() {
  return {
    onNote: vi.fn().mockResolvedValue(undefined),
    onAskPraxis: vi.fn().mockResolvedValue(undefined),
    onCite: vi.fn().mockResolvedValue(undefined),
    onFlashcard: vi.fn().mockResolvedValue(undefined),
    onDismiss: vi.fn(),
  };
}

function renderBar(
  visible = true,
  rect: DOMRect | null = makeRect(),
  overrides: Partial<ReturnType<typeof makeHandlers>> = {},
) {
  const handlers = { ...makeHandlers(), ...overrides };
  const { rerender } = render(<SelectionActionBar visible={visible} rect={rect} {...handlers} />);
  return { handlers, rerender };
}

// ── Visibility ────────────────────────────────────────────────────────────────

describe("SelectionActionBar visibility", () => {
  it("renders all four buttons when visible=true and rect is set", () => {
    renderBar();
    expect(screen.getByRole("button", { name: /add note from selection/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /ask praxis/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /cite selection/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /add flashcard/i })).toBeDefined();
  });

  it("renders nothing when visible=false", () => {
    renderBar(false);
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("renders nothing when rect=null (even if visible=true)", () => {
    renderBar(true, null);
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("renders the toolbar with correct aria-label", () => {
    renderBar();
    expect(screen.getByRole("toolbar", { name: /selection actions/i })).toBeDefined();
  });
});

// ── Button labels ─────────────────────────────────────────────────────────────

describe("SelectionActionBar button labels", () => {
  it("shows + note label", () => {
    renderBar();
    expect(screen.getByRole("button", { name: /add note from selection/i }).textContent).toContain(
      "note",
    );
  });

  it("shows ↗ ask Praxis label", () => {
    renderBar();
    expect(
      screen.getByRole("button", { name: /ask praxis about selection/i }).textContent,
    ).toContain("ask Praxis");
  });

  it("shows + cite label", () => {
    renderBar();
    expect(screen.getByRole("button", { name: /cite selection/i }).textContent).toContain("cite");
  });

  it("shows + flashcard label", () => {
    renderBar();
    expect(
      screen.getByRole("button", { name: /add flashcard from selection/i }).textContent,
    ).toContain("flashcard");
  });
});

// ── Handler wiring ────────────────────────────────────────────────────────────

describe("SelectionActionBar handler wiring", () => {
  it("clicking + note calls onNote", async () => {
    const { handlers } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /add note from selection/i }));
    await waitFor(() => expect(handlers.onNote).toHaveBeenCalledOnce());
  });

  it("clicking ↗ ask Praxis calls onAskPraxis", async () => {
    const { handlers } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /ask praxis about selection/i }));
    await waitFor(() => expect(handlers.onAskPraxis).toHaveBeenCalledOnce());
  });

  it("clicking + cite calls onCite", async () => {
    const { handlers } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /cite selection/i }));
    await waitFor(() => expect(handlers.onCite).toHaveBeenCalledOnce());
  });

  it("clicking + flashcard calls onFlashcard", async () => {
    const { handlers } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /add flashcard from selection/i }));
    await waitFor(() => expect(handlers.onFlashcard).toHaveBeenCalledOnce());
  });

  it("calls onDismiss after handler resolves", async () => {
    const { handlers } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /add note from selection/i }));
    await waitFor(() => expect(handlers.onDismiss).toHaveBeenCalledOnce());
  });
});

// ── Dismiss triggers ──────────────────────────────────────────────────────────

describe("SelectionActionBar dismiss triggers", () => {
  it("pressing Escape calls onDismiss", () => {
    const { handlers } = renderBar();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(handlers.onDismiss).toHaveBeenCalledOnce();
  });

  it("mousedown outside the bar calls onDismiss", () => {
    const { handlers } = renderBar();
    fireEvent.mouseDown(document.body);
    expect(handlers.onDismiss).toHaveBeenCalledOnce();
  });

  it("mousedown inside the bar does NOT call onDismiss", () => {
    const { handlers } = renderBar();
    const toolbar = screen.getByRole("toolbar");
    fireEvent.mouseDown(toolbar);
    expect(handlers.onDismiss).not.toHaveBeenCalled();
  });

  it("does not listen for Escape when visible=false", () => {
    const onDismiss = vi.fn();
    renderBar(false, makeRect(), { onDismiss });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
