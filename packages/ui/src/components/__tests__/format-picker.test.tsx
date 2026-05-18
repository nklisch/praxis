/**
 * Tests for the NoteFormatPickerPopover component.
 *
 * Covers:
 *  - Renders all 5 format options.
 *  - Cornell is marked as suggested (first).
 *  - Clicking a format calls onSelect with the right format.
 *  - Keyboard shortcuts 1–5 call onSelect.
 *  - Esc calls onDismiss.
 *  - Clicking the backdrop calls onDismiss.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteFormatPickerPopover } from "../note-format-picker-popover.js";

afterEach(() => cleanup());

describe("NoteFormatPickerPopover", () => {
  it("renders all 5 format options", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<NoteFormatPickerPopover onSelect={onSelect} onDismiss={onDismiss} />);

    expect(screen.getByTestId("format-option-cornell")).toBeTruthy();
    expect(screen.getByTestId("format-option-feynman")).toBeTruthy();
    expect(screen.getByTestId("format-option-outline")).toBeTruthy();
    expect(screen.getByTestId("format-option-free")).toBeTruthy();
    expect(screen.getByTestId("format-option-sketch")).toBeTruthy();
  });

  it("clicking Cornell calls onSelect with 'cornell'", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<NoteFormatPickerPopover onSelect={onSelect} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId("format-option-cornell"));
    expect(onSelect).toHaveBeenCalledWith("cornell");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("clicking Feynman calls onSelect with 'feynman'", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<NoteFormatPickerPopover onSelect={onSelect} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId("format-option-feynman"));
    expect(onSelect).toHaveBeenCalledWith("feynman");
  });

  it("clicking Sketch calls onSelect with 'sketch'", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<NoteFormatPickerPopover onSelect={onSelect} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId("format-option-sketch"));
    expect(onSelect).toHaveBeenCalledWith("sketch");
  });

  it("numbered keyboard shortcut 1 selects cornell", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<NoteFormatPickerPopover onSelect={onSelect} onDismiss={onDismiss} />);

    fireEvent.keyDown(window, { key: "1" });
    expect(onSelect).toHaveBeenCalledWith("cornell");
  });

  it("numbered keyboard shortcut 2 selects feynman", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<NoteFormatPickerPopover onSelect={onSelect} onDismiss={onDismiss} />);

    fireEvent.keyDown(window, { key: "2" });
    expect(onSelect).toHaveBeenCalledWith("feynman");
  });

  it("numbered keyboard shortcut 5 selects sketch", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<NoteFormatPickerPopover onSelect={onSelect} onDismiss={onDismiss} />);

    fireEvent.keyDown(window, { key: "5" });
    expect(onSelect).toHaveBeenCalledWith("sketch");
  });

  it("Esc key calls onDismiss", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<NoteFormatPickerPopover onSelect={onSelect} onDismiss={onDismiss} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking backdrop calls onDismiss", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<NoteFormatPickerPopover onSelect={onSelect} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId("format-picker-backdrop"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("popover has accessible dialog role", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<NoteFormatPickerPopover onSelect={onSelect} onDismiss={onDismiss} />);

    const popover = screen.getByRole("dialog");
    expect(popover).toBeTruthy();
    expect(popover.getAttribute("aria-modal")).toBe("true");
  });

  it("renders 'suggested' badge on Cornell (first format)", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<NoteFormatPickerPopover onSelect={onSelect} onDismiss={onDismiss} />);

    // Cornell button should have the suggested class (aria-label includes "suggested")
    const cornellBtn = screen.getByTestId("format-option-cornell");
    expect(cornellBtn.getAttribute("aria-label")).toContain("suggested");
  });

  it("renders optional alt action when onOpenInWorkspace is provided", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    const onOpenInWorkspace = vi.fn();
    render(
      <NoteFormatPickerPopover
        onSelect={onSelect}
        onDismiss={onDismiss}
        onOpenInWorkspace={onOpenInWorkspace}
      />,
    );

    const altBtn = screen.getByLabelText("Open a new note in the workspace tab");
    expect(altBtn).toBeTruthy();
    fireEvent.click(altBtn);
    expect(onOpenInWorkspace).toHaveBeenCalledTimes(1);
  });

  it("does not render alt action when onOpenInWorkspace is absent", () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<NoteFormatPickerPopover onSelect={onSelect} onDismiss={onDismiss} />);

    expect(screen.queryByLabelText("Open a new note in the workspace tab")).toBeNull();
  });
});
