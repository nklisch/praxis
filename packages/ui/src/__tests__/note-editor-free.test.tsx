import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FreeBody } from "../components/note-editor-free.js";
import { NoteEditorFree } from "../components/note-editor-free.js";

afterEach(() => cleanup());

function makeBody(overrides: Partial<FreeBody> = {}): FreeBody {
  return { kind: "free", text: "Hello world", ...overrides };
}

describe("NoteEditorFree", () => {
  it("renders textarea with initial text", () => {
    render(<NoteEditorFree body={makeBody()} onChange={() => {}} />);
    const el = screen.getByLabelText("Note content") as HTMLTextAreaElement;
    expect(el.value).toBe("Hello world");
  });

  it("calls onChange when text changes", () => {
    const onChange = vi.fn();
    render(<NoteEditorFree body={makeBody()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Note content"), { target: { value: "Updated" } });
    expect(onChange).toHaveBeenCalledWith({ kind: "free", text: "Updated" });
  });

  it("renders the markdown hint text", () => {
    render(<NoteEditorFree body={makeBody()} onChange={() => {}} />);
    expect(screen.getByText(/Markdown is welcome/)).toBeDefined();
  });
});
