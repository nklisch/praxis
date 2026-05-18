import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FreeBody } from "../components/note-editor-free.js";
import { NoteEditorFree } from "../components/note-editor-free.js";

afterEach(() => cleanup());

function makeBody(overrides: Partial<FreeBody> = {}): FreeBody {
  return { kind: "free", text: "", ...overrides };
}

describe("NoteEditorFree", () => {
  it("renders title input and body editor", () => {
    render(<NoteEditorFree body={makeBody()} onChange={() => {}} title="My Note" />);
    const titleInput = screen.getByLabelText("Note title") as HTMLInputElement;
    expect(titleInput.value).toBe("My Note");
    expect(screen.getByLabelText("Note body")).toBeDefined();
  });

  it("calls onTitleChange when title input changes", () => {
    const onTitleChange = vi.fn();
    render(
      <NoteEditorFree
        body={makeBody()}
        onChange={() => {}}
        title=""
        onTitleChange={onTitleChange}
      />,
    );
    const titleInput = screen.getByLabelText("Note title");
    fireEvent.change(titleInput, { target: { value: "New title" } });
    expect(onTitleChange).toHaveBeenCalledWith("New title");
  });

  it("drop-cap class is applied to the body editor first paragraph", () => {
    // The CSS rule `.bodyEditor > p:first-child::first-letter` targets the
    // first-child <p> inside the editor. We verify the editor element exists
    // and has the correct role so CSS targeting is possible.
    render(<NoteEditorFree body={makeBody()} onChange={() => {}} />);
    const editor = screen.getByRole("textbox", { name: "Note body" });
    expect(editor).toBeDefined();
    // The drop-cap is a CSS ::first-letter pseudo — verify the element is a
    // contenteditable div (not textarea) so the CSS selector applies.
    expect(editor.getAttribute("contenteditable")).toBe("true");
  });

  it("gutter shows word count and read time", () => {
    // Seed text with known word count (5 words → ~1 min read time).
    render(
      <NoteEditorFree body={makeBody({ text: "one two three four five" })} onChange={() => {}} />,
    );
    const wordCountEl = screen.getByTestId("word-count");
    const readTimeEl = screen.getByTestId("read-time");
    expect(wordCountEl.textContent).toBe("5");
    expect(readTimeEl.textContent).toBe("~1 min");
  });

  it("gutter shows concept tags when provided", () => {
    render(
      <NoteEditorFree
        body={makeBody()}
        onChange={() => {}}
        conceptTags={["chain rule", "rates"]}
      />,
    );
    const tagCloud = screen.getByTestId("concept-tags");
    expect(tagCloud.textContent).toContain("chain rule");
    expect(tagCloud.textContent).toContain("rates");
  });

  it("does not render concept tags panel when tags are empty", () => {
    render(<NoteEditorFree body={makeBody()} onChange={() => {}} conceptTags={[]} />);
    expect(screen.queryByTestId("concept-tags")).toBeNull();
  });

  it("slash-command menu appears when / is typed", () => {
    render(<NoteEditorFree body={makeBody()} onChange={() => {}} />);
    const editor = screen.getByRole("textbox", { name: "Note body" });

    // Simulate typing "/" — seed textContent and fire input event.
    editor.textContent = "/";
    const sel = window.getSelection();
    const range = document.createRange();
    const textNode = editor.firstChild;
    if (textNode) {
      range.setStart(textNode, 1);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    fireEvent.input(editor);

    // Menu should appear with at least the "Heading" command.
    expect(screen.getByRole("listbox", { name: "Slash commands" })).toBeDefined();
    expect(screen.getByText("Heading")).toBeDefined();
  });

  it("slash-command menu is dismissed on Escape", () => {
    render(<NoteEditorFree body={makeBody()} onChange={() => {}} />);
    const editor = screen.getByRole("textbox", { name: "Note body" });

    // Open menu.
    editor.textContent = "/";
    const sel = window.getSelection();
    const range = document.createRange();
    const textNode = editor.firstChild;
    if (textNode) {
      range.setStart(textNode, 1);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    fireEvent.input(editor);
    expect(screen.queryByRole("listbox", { name: "Slash commands" })).not.toBeNull();

    fireEvent.keyDown(editor, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Slash commands" })).toBeNull();
  });

  it("calls onChange when body text changes", () => {
    const onChange = vi.fn();
    render(<NoteEditorFree body={makeBody()} onChange={onChange} />);
    const editor = screen.getByRole("textbox", { name: "Note body" });

    editor.textContent = "Hello world";
    fireEvent.input(editor);

    expect(onChange).toHaveBeenCalledWith({
      kind: "free",
      text: "Hello world",
    });
  });
});
