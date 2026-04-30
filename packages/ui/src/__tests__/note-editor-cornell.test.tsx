import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CornellBody } from "../components/note-editor-cornell.js";
import { NoteEditorCornell } from "../components/note-editor-cornell.js";

afterEach(() => cleanup());

function makeBody(overrides: Partial<CornellBody> = {}): CornellBody {
  return {
    kind: "cornell",
    questions: ["Q1", "Q2"],
    details: ["D1", "D2"],
    summary: "Summary text",
    ...overrides,
  };
}

describe("NoteEditorCornell", () => {
  it("renders question and detail textareas", () => {
    render(<NoteEditorCornell body={makeBody()} onChange={() => {}} />);
    expect(screen.getByLabelText("Question 1")).toBeDefined();
    expect(screen.getByLabelText("Detail 1")).toBeDefined();
    expect(screen.getByLabelText("Question 2")).toBeDefined();
    expect(screen.getByLabelText("Detail 2")).toBeDefined();
  });

  it("renders summary textarea", () => {
    render(<NoteEditorCornell body={makeBody()} onChange={() => {}} />);
    const summary = screen.getByLabelText("Summary", { exact: true });
    expect((summary as HTMLTextAreaElement).value).toBe("Summary text");
  });

  it("calls onChange when question changes", () => {
    const onChange = vi.fn();
    render(<NoteEditorCornell body={makeBody()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Question 1"), { target: { value: "New Q" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ questions: ["New Q", "Q2"] }));
  });

  it("calls onChange when summary changes", () => {
    const onChange = vi.fn();
    render(<NoteEditorCornell body={makeBody()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Summary", { exact: true }), {
      target: { value: "New summary" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ summary: "New summary" }));
  });

  it("Add row button adds a new row", () => {
    const onChange = vi.fn();
    render(<NoteEditorCornell body={makeBody()} onChange={onChange} />);
    fireEvent.click(screen.getByText("+ Add row"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: ["Q1", "Q2", ""],
        details: ["D1", "D2", ""],
      }),
    );
  });

  it("remove button fires onChange with row removed", () => {
    const onChange = vi.fn();
    render(<NoteEditorCornell body={makeBody()} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Remove row 1"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: ["Q2"],
        details: ["D2"],
      }),
    );
  });
});
