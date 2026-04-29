/**
 * Unit tests for the SourceCard component.
 *
 * Verifies:
 *  - "View page" button only rendered when hasPageImage is true AND onViewPage is provided
 *  - Clicking "View page" calls onViewPage with correct documentId and page
 *  - Section and page number shown when present
 *  - Chunk text is displayed
 *  - citation.index in the card id (for citation chip scroll-to behavior)
 */
import type { RetrievalCitation } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceCard } from "../components/source-card.js";

afterEach(() => {
  cleanup();
});

function makeCitation(overrides: Partial<RetrievalCitation> = {}): RetrievalCitation {
  return {
    index: 1,
    documentId: "doc-1",
    documentTitle: "Biology Textbook",
    chunkId: "chunk-abc",
    chunkText: "ATP synthase catalyzes the formation of ATP from ADP and inorganic phosphate.",
    score: 0.8,
    ...overrides,
  };
}

describe("SourceCard", () => {
  it("renders document title and chunk text", () => {
    const citation = makeCitation();
    render(<SourceCard citation={citation} />);

    expect(screen.getByText("Biology Textbook")).toBeDefined();
    expect(screen.getByText(/ATP synthase/)).toBeDefined();
  });

  it("renders the citation index", () => {
    const citation = makeCitation({ index: 3 });
    render(<SourceCard citation={citation} />);

    expect(screen.getByText("[3]")).toBeDefined();
  });

  it("shows section when provided", () => {
    const citation = makeCitation({ section: "Chapter 7" });
    render(<SourceCard citation={citation} />);

    expect(screen.getByText("Chapter 7")).toBeDefined();
  });

  it("shows page number when provided", () => {
    const citation = makeCitation({ page: 42 });
    render(<SourceCard citation={citation} />);

    expect(screen.getByText("p.42")).toBeDefined();
  });

  it("does NOT show 'View page' button when hasPageImage is false", () => {
    const citation = makeCitation({ page: 5, hasPageImage: false });
    const onViewPage = vi.fn();
    render(<SourceCard citation={citation} onViewPage={onViewPage} />);

    expect(screen.queryByRole("button", { name: /View page/i })).toBeNull();
  });

  it("does NOT show 'View page' button when hasPageImage is true but onViewPage is not provided", () => {
    const citation = makeCitation({ page: 5, hasPageImage: true });
    render(<SourceCard citation={citation} />);

    expect(screen.queryByRole("button", { name: /View page/i })).toBeNull();
  });

  it("does NOT show 'View page' button when hasPageImage is true but page is absent", () => {
    const citation = makeCitation({ hasPageImage: true });
    // page is undefined in makeCitation — no page field
    const onViewPage = vi.fn();
    render(<SourceCard citation={citation} onViewPage={onViewPage} />);

    expect(screen.queryByRole("button", { name: /View page/i })).toBeNull();
  });

  it("shows 'View page' button when hasPageImage is true, page is set, and onViewPage is provided", () => {
    const citation = makeCitation({ page: 7, hasPageImage: true });
    const onViewPage = vi.fn();
    render(<SourceCard citation={citation} onViewPage={onViewPage} />);

    const btn = screen.getByRole("button", { name: /View page 7/i });
    expect(btn).toBeDefined();
  });

  it("clicking 'View page' calls onViewPage with documentId and page", () => {
    const citation = makeCitation({ documentId: "doc-xyz", page: 12, hasPageImage: true });
    const onViewPage = vi.fn();
    render(<SourceCard citation={citation} onViewPage={onViewPage} />);

    const btn = screen.getByRole("button", { name: /View page/i });
    fireEvent.click(btn);

    expect(onViewPage).toHaveBeenCalledOnce();
    expect(onViewPage).toHaveBeenCalledWith("doc-xyz", 12);
  });

  it("card element has id citation-{index} for scroll targeting", () => {
    const citation = makeCitation({ index: 4 });
    const { container } = render(<SourceCard citation={citation} />);

    const card = container.querySelector("#citation-4");
    expect(card).not.toBeNull();
  });
});
