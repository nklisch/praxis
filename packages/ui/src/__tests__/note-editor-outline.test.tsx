import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OutlineBody } from "../components/note-editor-outline.js";
import { NoteEditorOutline } from "../components/note-editor-outline.js";

afterEach(() => cleanup());

function makeBody(overrides: Partial<OutlineBody> = {}): OutlineBody {
  return {
    kind: "outline",
    root: {
      text: "Root topic",
      children: [
        { text: "Child 1", children: [] },
        { text: "Child 2", children: [] },
      ],
    },
    ...overrides,
  };
}

describe("NoteEditorOutline", () => {
  it("renders root topic input", () => {
    render(<NoteEditorOutline body={makeBody()} onChange={() => {}} />);
    const root = screen.getByLabelText("Root topic") as HTMLInputElement;
    expect(root.value).toBe("Root topic");
  });

  it("renders child nodes", () => {
    render(<NoteEditorOutline body={makeBody()} onChange={() => {}} />);
    const inputs = screen.getAllByRole("textbox");
    const values = inputs.map((el) => (el as HTMLInputElement).value);
    expect(values).toContain("Child 1");
    expect(values).toContain("Child 2");
  });

  it("calls onChange when root text changes", () => {
    const onChange = vi.fn();
    render(<NoteEditorOutline body={makeBody()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Root topic"), { target: { value: "New root" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ root: expect.objectContaining({ text: "New root" }) }),
    );
  });

  it("Add Child button on root fires onChange with a new child", () => {
    const onChange = vi.fn();
    render(<NoteEditorOutline body={makeBody()} onChange={onChange} />);
    // The root row has the first "+ Child" button
    const childBtns = screen.getAllByText("+ Child");
    const rootChildBtn = childBtns[0];
    if (!rootChildBtn) throw new Error("Expected + Child button");
    fireEvent.click(rootChildBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        root: expect.objectContaining({
          children: expect.arrayContaining([
            expect.objectContaining({ text: "Child 1" }),
            expect.objectContaining({ text: "Child 2" }),
            expect.objectContaining({ text: "" }),
          ]),
        }),
      }),
    );
  });
});
