/**
 * Tests for <ArtifactCard>.
 *
 * Verifies:
 *  - Note card renders format kicker and title extracted from body.
 *  - Flashcard card renders front (title) and back (answer snippet).
 *  - Sketch note renders sketch preview area instead of text excerpt.
 *  - onClick fires when card is clicked.
 *  - Orphan note shows "orphan" tag.
 *  - Due flashcard shows "due today" tag.
 */
import type { FlashcardLibraryHit, NoteLibraryHit, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactCard } from "../components/artifact-card.js";

afterEach(() => cleanup());

// ── Factories ──────────────────────────────────────────────────────────────────

function makeNoteHit(overrides: Partial<NoteLibraryHit> = {}): NoteLibraryHit {
  return {
    kind: "note",
    id: brandId<"NoteId">("note-1"),
    studentId: brandId("student-1"),
    format: "free",
    body: JSON.stringify({ kind: "free", text: "First line title\nExcerpt content here." }),
    sessionId: null,
    linksJson: [{ kind: "course", id: "course-1" }],
    createdAt: (Date.now() - 7200000) as Timestamp, // 2h ago
    updatedAt: (Date.now() - 7200000) as Timestamp,
    ...overrides,
  };
}

function makeCornellHit(): NoteLibraryHit {
  return makeNoteHit({
    format: "cornell",
    body: JSON.stringify({
      kind: "cornell",
      questions: ["What is the chain rule?"],
      details: ["The rate of the whole is the product of the rates."],
      summary: "",
    }),
  });
}

function makeSketchHit(): NoteLibraryHit {
  return makeNoteHit({
    format: "sketch",
    body: JSON.stringify({ kind: "sketch", snapshot: {} }),
  });
}

function makeFlashcardHit(overrides: Partial<FlashcardLibraryHit> = {}): FlashcardLibraryHit {
  return {
    kind: "flashcard",
    id: brandId<"FlashcardId">("card-1"),
    studentId: brandId("student-1"),
    front: "What does the chain rule say?",
    back: "The rate of the whole is the product of the rates.",
    conceptId: "concept-chain-rule",
    nextReviewAt: null,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ArtifactCard — note", () => {
  it("renders kicker label for free note", () => {
    render(<ArtifactCard hit={makeNoteHit()} onClick={vi.fn()} />);
    expect(screen.getByText(/free note/i)).toBeDefined();
  });

  it("renders the first line as title for free note", () => {
    render(<ArtifactCard hit={makeNoteHit()} onClick={vi.fn()} />);
    expect(screen.getByText("First line title")).toBeDefined();
  });

  it("renders excerpt text", () => {
    render(<ArtifactCard hit={makeNoteHit()} onClick={vi.fn()} />);
    expect(screen.getByText(/Excerpt content here/)).toBeDefined();
  });

  it("renders cornell note kicker and question as title", () => {
    render(<ArtifactCard hit={makeCornellHit()} onClick={vi.fn()} />);
    expect(screen.getByText(/cornell note/i)).toBeDefined();
    expect(screen.getByText("What is the chain rule?")).toBeDefined();
  });

  it("renders sketch preview for sketch format", () => {
    render(<ArtifactCard hit={makeSketchHit()} onClick={vi.fn()} />);
    expect(screen.getByRole("img", { name: "Sketch preview" })).toBeDefined();
  });

  it("calls onClick when card button is clicked", () => {
    const onClick = vi.fn();
    render(<ArtifactCard hit={makeNoteHit()} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows 'orphan' tag when note has no course links", () => {
    const hit = makeNoteHit({ linksJson: [] });
    render(<ArtifactCard hit={hit} onClick={vi.fn()} />);
    expect(screen.getByText(/orphan/i)).toBeDefined();
  });

  it("does not show orphan tag when note has course links", () => {
    const hit = makeNoteHit({
      linksJson: [{ kind: "course", id: "course-1" }],
    });
    render(<ArtifactCard hit={hit} onClick={vi.fn()} />);
    expect(screen.queryByText(/orphan/i)).toBeNull();
  });
});

describe("ArtifactCard — flashcard", () => {
  it("renders flashcard kicker", () => {
    render(<ArtifactCard hit={makeFlashcardHit()} onClick={vi.fn()} />);
    expect(screen.getByText(/flashcard/i)).toBeDefined();
  });

  it("renders front text as title", () => {
    render(<ArtifactCard hit={makeFlashcardHit()} onClick={vi.fn()} />);
    expect(screen.getByText("What does the chain rule say?")).toBeDefined();
  });

  it("renders back text as answer snippet", () => {
    render(<ArtifactCard hit={makeFlashcardHit()} onClick={vi.fn()} />);
    expect(screen.getByText(/The rate of the whole/)).toBeDefined();
  });

  it("calls onClick when card is clicked", () => {
    const onClick = vi.fn();
    render(<ArtifactCard hit={makeFlashcardHit()} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows 'due today' tag when nextReviewAt is past", () => {
    const hit = makeFlashcardHit({
      nextReviewAt: (Date.now() - 60_000) as Timestamp, // 1 min ago
    });
    render(<ArtifactCard hit={hit} onClick={vi.fn()} />);
    expect(screen.getByText(/due today/i)).toBeDefined();
  });

  it("does not show 'due today' tag when nextReviewAt is null", () => {
    render(<ArtifactCard hit={makeFlashcardHit({ nextReviewAt: null })} onClick={vi.fn()} />);
    expect(screen.queryByText(/due today/i)).toBeNull();
  });

  it("shows 'orphan' tag when flashcard has no conceptId", () => {
    const hit = makeFlashcardHit({ conceptId: null });
    render(<ArtifactCard hit={hit} onClick={vi.fn()} />);
    expect(screen.getByText(/orphan/i)).toBeDefined();
  });
});
