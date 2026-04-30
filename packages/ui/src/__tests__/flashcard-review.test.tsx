import type { Flashcard, PraxisClient, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewCard } from "../components/flashcard-review.js";
import { FlashcardReview, WorkspaceFlashcardReview } from "../components/flashcard-review.js";
import { PraxisClientProvider } from "../context/client-context.js";

afterEach(() => cleanup());

function makeFullCard(id = "card-1"): Flashcard {
  return {
    id: brandId<"FlashcardId">(id),
    studentId: brandId("student-1"),
    front: "What is gravity?",
    back: "A force of attraction between masses.",
    reviewState: { algorithm: "fsrs", state: {}, nextReviewAt: (Date.now() - 1) as Timestamp },
    source: { kind: "user-created" },
  };
}

function makeReviewCard(id = "card-1"): ReviewCard {
  return {
    flashcardId: id,
    front: "What is gravity?",
    preview: {
      again: { nextReviewAt: (Date.now() + 60_000) as Timestamp },
      hard: { nextReviewAt: (Date.now() + 3_600_000) as Timestamp },
      good: { nextReviewAt: (Date.now() + 86_400_000) as Timestamp },
      easy: { nextReviewAt: (Date.now() + 7 * 86_400_000) as Timestamp },
    },
  };
}

function makeClient(back: string): PraxisClient {
  return {
    session: {} as PraxisClient["session"],
    artifacts: {} as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {} as PraxisClient["packs"],
    notes: {} as PraxisClient["notes"],
    flashcards: {
      dueCount: vi.fn().mockResolvedValue(0),
      get: vi.fn().mockResolvedValue({ ...makeFullCard(), back }),
      review: vi
        .fn()
        .mockResolvedValue({ flashcard: makeFullCard(), nextReviewAt: Date.now() + 86_400_000 }),
    } as unknown as PraxisClient["flashcards"],
  };
}

function wrap(client: PraxisClient, children: React.ReactNode) {
  return render(<PraxisClientProvider client={client}>{children}</PraxisClientProvider>);
}

describe("FlashcardReview (inline chat variant)", () => {
  it("shows question and Show answer button initially", () => {
    const client = makeClient("A force.");
    wrap(client, <FlashcardReview card={makeReviewCard()} onRate={vi.fn()} />);
    expect(screen.getByText("What is gravity?")).toBeDefined();
    expect(screen.getByText("Show answer")).toBeDefined();
    expect(screen.queryByText("Again")).toBeNull();
  });

  it("fetches back and shows rating buttons after Show answer click", async () => {
    const client = makeClient("A force of attraction.");
    wrap(client, <FlashcardReview card={makeReviewCard()} onRate={vi.fn()} />);
    fireEvent.click(screen.getByText("Show answer"));

    await waitFor(() => {
      expect(screen.getByText("A force of attraction.")).toBeDefined();
    });

    expect(screen.getByText("Again")).toBeDefined();
    expect(screen.getByText("Good")).toBeDefined();
    expect(screen.getByText("Easy")).toBeDefined();
  });

  it("calls onRate when a rating button is clicked", async () => {
    const client = makeClient("A force.");
    const onRate = vi.fn().mockResolvedValue(undefined);
    wrap(client, <FlashcardReview card={makeReviewCard()} onRate={onRate} />);
    fireEvent.click(screen.getByText("Show answer"));

    await waitFor(() => expect(screen.getByText("Good")).toBeDefined());

    fireEvent.click(screen.getByText("Good"));
    await waitFor(() => expect(onRate).toHaveBeenCalledWith("good"));
  });
});

describe("WorkspaceFlashcardReview", () => {
  it("renders front and show answer button", () => {
    const client = makeClient("irrelevant");
    wrap(client, <WorkspaceFlashcardReview card={makeFullCard()} onRate={vi.fn()} />);
    expect(screen.getByText("What is gravity?")).toBeDefined();
    expect(screen.getByText("Show answer")).toBeDefined();
  });

  it("reveals back text after clicking Show answer", () => {
    const client = makeClient("irrelevant");
    wrap(client, <WorkspaceFlashcardReview card={makeFullCard()} onRate={vi.fn()} />);
    fireEvent.click(screen.getByText("Show answer"));
    expect(screen.getByText("A force of attraction between masses.")).toBeDefined();
  });
});
