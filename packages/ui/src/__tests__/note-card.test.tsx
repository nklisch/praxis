import type { Note } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NoteCard } from "../components/note-card.js";

afterEach(() => cleanup());

function makeNote(format: Note["format"], body: object, overrides: Partial<Note> = {}): Note {
  return {
    id: brandId<"NoteId">("note-1"),
    studentId: brandId("student-1"),
    context: {},
    format,
    body: JSON.stringify(body),
    links: [],
    createdAt: Date.now() as Note["createdAt"],
    updatedAt: Date.now() as Note["updatedAt"],
    ...overrides,
  };
}

describe("NoteCard", () => {
  it("renders cornell format: questions, details, summary", () => {
    const note = makeNote("cornell", {
      kind: "cornell",
      questions: ["What is X?"],
      details: ["X is Y."],
      summary: "Summary here",
    });
    render(<NoteCard note={note} />);
    expect(screen.getByText("What is X?")).toBeDefined();
    expect(screen.getByText("X is Y.")).toBeDefined();
    expect(screen.getByText("Summary here")).toBeDefined();
  });

  it("renders feynman format: explanation text", () => {
    const note = makeNote("feynman", {
      kind: "feynman",
      explanation: "Gravity pulls things down.",
      followUps: ["Why does mass matter?"],
    });
    render(<NoteCard note={note} />);
    expect(screen.getByText("Gravity pulls things down.")).toBeDefined();
    expect(screen.getByText(/1 follow-up question/)).toBeDefined();
  });

  it("renders outline format: root and child", () => {
    const note = makeNote("outline", {
      kind: "outline",
      root: {
        text: "Root",
        children: [{ text: "Child A", children: [] }],
      },
    });
    render(<NoteCard note={note} />);
    expect(screen.getByText("Root")).toBeDefined();
    expect(screen.getByText("Child A")).toBeDefined();
  });

  it("renders free format: pre-formatted text", () => {
    const note = makeNote("free", { kind: "free", text: "Some free text." });
    render(<NoteCard note={note} />);
    expect(screen.getByText("Some free text.")).toBeDefined();
  });

  it("shows error message for malformed body JSON", () => {
    const note = makeNote("cornell", {});
    // Corrupt the body
    const badNote = { ...note, body: "NOT VALID JSON {{{" };
    render(<NoteCard note={badNote as Note} />);
    expect(screen.getByText(/Unable to parse note body/)).toBeDefined();
  });

  it("shows the format badge", () => {
    const note = makeNote("free", { kind: "free", text: "hi" });
    render(<NoteCard note={note} />);
    expect(screen.getByText("free")).toBeDefined();
  });
});
