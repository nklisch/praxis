import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CornellBody } from "../components/note-editor-cornell.js";
import { NoteEditorCornell } from "../components/note-editor-cornell.js";

afterEach(() => cleanup());

// Mock scrollIntoView — not available in jsdom.
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function makeBody(overrides: Partial<CornellBody> = {}): CornellBody {
  return {
    kind: "cornell",
    questions: ["Q1", "Q2"],
    details: ["D1", "D2"],
    summary: "Summary text",
    ...overrides,
  };
}

describe("NoteEditorCornell — 3-zone layout", () => {
  it("renders the three-zone grid: cue column, notes column, summary band", () => {
    const { container } = render(<NoteEditorCornell body={makeBody()} onChange={() => {}} />);
    // cue column heading
    expect(screen.getByText(/Cues/i)).toBeDefined();
    // notes column heading
    expect(screen.getByText(/Notes/i)).toBeDefined();
    // summary band label (label element + textarea both match /Summary/i — use getAllBy)
    expect(screen.getAllByText(/Summary/i).length).toBeGreaterThan(0);
    // summary textarea by its id label
    expect(screen.getByLabelText("Summary", { exact: true })).toBeDefined();
    // sanity: container has the threeZone grid
    expect(container.querySelector('[class*="threeZone"]')).not.toBeNull();
  });

  it("renders cue textareas (question inputs) in the cue column", () => {
    render(<NoteEditorCornell body={makeBody()} onChange={() => {}} />);
    const q1 = screen.getByLabelText("Question 1") as HTMLTextAreaElement;
    const q2 = screen.getByLabelText("Question 2") as HTMLTextAreaElement;
    expect(q1.value).toBe("Q1");
    expect(q2.value).toBe("Q2");
  });

  it("renders detail textareas (notes body) in the notes column", () => {
    render(<NoteEditorCornell body={makeBody()} onChange={() => {}} />);
    const d1 = screen.getByLabelText("Detail 1") as HTMLTextAreaElement;
    const d2 = screen.getByLabelText("Detail 2") as HTMLTextAreaElement;
    expect(d1.value).toBe("D1");
    expect(d2.value).toBe("D2");
  });

  it("renders ◆ markers in the notes column — one per row", () => {
    const { container } = render(<NoteEditorCornell body={makeBody()} onChange={() => {}} />);
    const markers = container.querySelectorAll("[data-cue-id]");
    expect(markers).toHaveLength(2);
    expect((markers[0] as HTMLElement).dataset.cueId).toBe("0");
    expect((markers[1] as HTMLElement).dataset.cueId).toBe("1");
  });

  it("renders the summary textarea with initial value", () => {
    render(<NoteEditorCornell body={makeBody()} onChange={() => {}} />);
    const summary = screen.getByLabelText("Summary", { exact: true }) as HTMLTextAreaElement;
    expect(summary.value).toBe("Summary text");
  });

  it("shows 'Add a cue to start taking notes.' when body is empty", () => {
    render(
      <NoteEditorCornell body={makeBody({ questions: [], details: [] })} onChange={() => {}} />,
    );
    expect(screen.getByText(/Add a cue to start taking notes/i)).toBeDefined();
  });
});

describe("NoteEditorCornell — data editing", () => {
  it("calls onChange when a question changes", () => {
    const onChange = vi.fn();
    render(<NoteEditorCornell body={makeBody()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Question 1"), { target: { value: "New Q" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ questions: ["New Q", "Q2"] }));
  });

  it("calls onChange when a detail changes", () => {
    const onChange = vi.fn();
    render(<NoteEditorCornell body={makeBody()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Detail 2"), { target: { value: "New D" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ details: ["D1", "New D"] }));
  });

  it("calls onChange when summary changes", () => {
    const onChange = vi.fn();
    render(<NoteEditorCornell body={makeBody()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Summary", { exact: true }), {
      target: { value: "New summary" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ summary: "New summary" }));
  });

  it("'+ add a cue' button adds a new row", () => {
    const onChange = vi.fn();
    render(<NoteEditorCornell body={makeBody()} onChange={onChange} />);
    fireEvent.click(screen.getByText("+ add a cue"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: ["Q1", "Q2", ""],
        details: ["D1", "D2", ""],
      }),
    );
  });

  it("remove button fires onChange with the row removed", () => {
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

describe("NoteEditorCornell — cue ↔ marker navigation", () => {
  it("clicking a ◆ marker calls scrollIntoView on the matching cue button", () => {
    const { container } = render(<NoteEditorCornell body={makeBody()} onChange={() => {}} />);
    const marker = container.querySelector('[data-cue-id="0"]') as HTMLElement;
    fireEvent.click(marker);
    // The cue button for row 0 should have had scrollIntoView called.
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("clicking a cue button calls scrollIntoView on the matching ◆ marker", () => {
    render(<NoteEditorCornell body={makeBody()} onChange={() => {}} />);
    const cueBtn = screen.getByLabelText("Cue 1");
    fireEvent.click(cueBtn);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("clicking a cue button activates the cueButtonActive style", () => {
    const { container } = render(<NoteEditorCornell body={makeBody()} onChange={() => {}} />);
    const cueBtn = screen.getByLabelText("Cue 1");
    fireEvent.click(cueBtn);
    // The active cue should gain the active modifier class.
    expect(cueBtn.className).toMatch(/cueButtonActive/);
    // And the corresponding notesEntry should also gain the active class.
    const activeEntries = container.querySelectorAll('[class*="notesEntryActive"]');
    expect(activeEntries).toHaveLength(1);
  });
});

describe("NoteEditorCornell — spawn button", () => {
  it("does not render spawn buttons when onSpawnFromCue is not provided", () => {
    render(<NoteEditorCornell body={makeBody()} onChange={() => {}} />);
    expect(screen.queryByLabelText("Talk to Praxis about row 1")).toBeNull();
  });

  it("renders spawn buttons for each row when onSpawnFromCue is provided", () => {
    render(<NoteEditorCornell body={makeBody()} onChange={() => {}} onSpawnFromCue={() => {}} />);
    expect(screen.getByLabelText("Talk to Praxis about row 1")).toBeDefined();
    expect(screen.getByLabelText("Talk to Praxis about row 2")).toBeDefined();
  });

  it("calls onSpawnFromCue with the row index string when spawn button is clicked", () => {
    const onSpawnFromCue = vi.fn();
    render(
      <NoteEditorCornell body={makeBody()} onChange={() => {}} onSpawnFromCue={onSpawnFromCue} />,
    );
    fireEvent.click(screen.getByLabelText("Talk to Praxis about row 2"));
    expect(onSpawnFromCue).toHaveBeenCalledWith("1");
  });
});
