import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlashcardProposal } from "../components/flashcard-proposal.js";

afterEach(() => cleanup());

describe("FlashcardProposal", () => {
  it("shows empty state when proposed array is empty", () => {
    render(<FlashcardProposal proposed={[]} onConfirm={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText(/No flashcards could be extracted/)).toBeDefined();
  });

  it("renders cards with front and back", () => {
    render(
      <FlashcardProposal
        proposed={[
          { front: "Q1", back: "A1" },
          { front: "Q2", back: "A2" },
        ]}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText("Q1")).toBeDefined();
    expect(screen.getByText("A1")).toBeDefined();
    expect(screen.getByText("Q2")).toBeDefined();
  });

  it("shows intro text with count", () => {
    render(
      <FlashcardProposal
        proposed={[{ front: "Q", back: "A" }]}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText(/1 flashcard proposed/)).toBeDefined();
  });

  it("calls onConfirm with index when Add clicked", () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <FlashcardProposal
        proposed={[{ front: "Q", back: "A" }]}
        onConfirm={onConfirm}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Add"));
    expect(onConfirm).toHaveBeenCalledWith(0);
  });

  it("calls onSkip with index when Skip clicked", () => {
    const onSkip = vi.fn();
    render(
      <FlashcardProposal
        proposed={[{ front: "Q", back: "A" }]}
        onConfirm={vi.fn()}
        onSkip={onSkip}
      />,
    );
    fireEvent.click(screen.getByText("Skip"));
    expect(onSkip).toHaveBeenCalledWith(0);
  });
});
