import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeynmanBody } from "../components/note-editor-feynman.js";
import { NoteEditorFeynman } from "../components/note-editor-feynman.js";

afterEach(() => cleanup());

function makeBody(overrides: Partial<FeynmanBody> = {}): FeynmanBody {
  return {
    kind: "feynman",
    explanation: "Photosynthesis is how plants eat sunlight.",
    followUps: ["Why is chlorophyll green?"],
    ...overrides,
  };
}

describe("NoteEditorFeynman", () => {
  it("renders explanation textarea with initial value", () => {
    render(<NoteEditorFeynman body={makeBody()} onChange={() => {}} />);
    const el = screen.getByLabelText("Explanation", {
      exact: false,
    }) as HTMLTextAreaElement;
    expect(el.value).toBe("Photosynthesis is how plants eat sunlight.");
  });

  it("renders follow-up textarea", () => {
    render(<NoteEditorFeynman body={makeBody()} onChange={() => {}} />);
    const el = screen.getByLabelText("Follow-up 1") as HTMLTextAreaElement;
    expect(el.value).toBe("Why is chlorophyll green?");
  });

  it("calls onChange when explanation changes", () => {
    const onChange = vi.fn();
    render(<NoteEditorFeynman body={makeBody()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Explanation", { exact: false }), {
      target: { value: "Plants use light." },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ explanation: "Plants use light." }),
    );
  });

  it("Add follow-up button appends empty string", () => {
    const onChange = vi.fn();
    render(<NoteEditorFeynman body={makeBody()} onChange={onChange} />);
    fireEvent.click(screen.getByText("+ Add follow-up"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        followUps: ["Why is chlorophyll green?", ""],
      }),
    );
  });

  it("remove follow-up button removes entry", () => {
    const onChange = vi.fn();
    render(<NoteEditorFeynman body={makeBody()} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Remove follow-up 1"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ followUps: [] }));
  });
});
