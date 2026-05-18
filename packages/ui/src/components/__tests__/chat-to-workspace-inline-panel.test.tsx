/**
 * Integration test: chat composer → format picker → inline panel → save → toast.
 *
 * Tests the full inline note capture flow:
 *  1. "+ note" button appears in ComposerVerbs when onNoteOpen is provided.
 *  2. Clicking it opens the NoteFormatPickerPopover.
 *  3. Selecting a format fires onNoteOpen(format).
 *  4. Checking the ComposerVerbs with hasSessionNote shows the indicator.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposerVerbs } from "../composer-verbs.js";

afterEach(() => cleanup());

describe("ComposerVerbs — note picker integration", () => {
  it("does not render the note button when onNoteOpen is absent", () => {
    render(<ComposerVerbs modeId="teach" onPrefill={vi.fn()} />);
    expect(screen.queryByTestId("note-picker-trigger")).toBeNull();
  });

  it("renders '+ note' button when onNoteOpen is provided", () => {
    render(<ComposerVerbs modeId="teach" onPrefill={vi.fn()} onNoteOpen={vi.fn()} />);
    const btn = screen.getByTestId("note-picker-trigger");
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain("+ note");
  });

  it("shows indicator glyph when hasSessionNote is true", () => {
    render(
      <ComposerVerbs
        modeId="teach"
        onPrefill={vi.fn()}
        onNoteOpen={vi.fn()}
        hasSessionNote={true}
      />,
    );
    const btn = screen.getByTestId("note-picker-trigger");
    // When hasSessionNote, the button shows the glyph indicator
    expect(btn.textContent).toContain("¶");
  });

  it("clicking '+ note' opens the format picker popover", () => {
    render(<ComposerVerbs modeId="teach" onPrefill={vi.fn()} onNoteOpen={vi.fn()} />);
    fireEvent.click(screen.getByTestId("note-picker-trigger"));
    expect(screen.getByTestId("format-picker-popover")).toBeTruthy();
  });

  it("selecting a format from the popover calls onNoteOpen with that format", () => {
    const onNoteOpen = vi.fn();
    render(<ComposerVerbs modeId="teach" onPrefill={vi.fn()} onNoteOpen={onNoteOpen} />);

    // Open picker
    fireEvent.click(screen.getByTestId("note-picker-trigger"));
    // Select Cornell
    fireEvent.click(screen.getByTestId("format-option-cornell"));

    expect(onNoteOpen).toHaveBeenCalledWith("cornell");
    expect(onNoteOpen).toHaveBeenCalledTimes(1);
  });

  it("selecting Feynman calls onNoteOpen with 'feynman'", () => {
    const onNoteOpen = vi.fn();
    render(<ComposerVerbs modeId="teach" onPrefill={vi.fn()} onNoteOpen={onNoteOpen} />);

    fireEvent.click(screen.getByTestId("note-picker-trigger"));
    fireEvent.click(screen.getByTestId("format-option-feynman"));

    expect(onNoteOpen).toHaveBeenCalledWith("feynman");
  });

  it("after format selection, popover closes", () => {
    const onNoteOpen = vi.fn();
    render(<ComposerVerbs modeId="teach" onPrefill={vi.fn()} onNoteOpen={onNoteOpen} />);

    fireEvent.click(screen.getByTestId("note-picker-trigger"));
    expect(screen.getByTestId("format-picker-popover")).toBeTruthy();

    fireEvent.click(screen.getByTestId("format-option-cornell"));
    expect(screen.queryByTestId("format-picker-popover")).toBeNull();
  });

  it("Esc inside open picker closes it without calling onNoteOpen", () => {
    const onNoteOpen = vi.fn();
    render(<ComposerVerbs modeId="teach" onPrefill={vi.fn()} onNoteOpen={onNoteOpen} />);

    fireEvent.click(screen.getByTestId("note-picker-trigger"));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByTestId("format-picker-popover")).toBeNull();
    expect(onNoteOpen).not.toHaveBeenCalled();
  });

  it("renders null when modeId is undefined (no active session)", () => {
    const { container } = render(
      <ComposerVerbs modeId={undefined} onPrefill={vi.fn()} onNoteOpen={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
