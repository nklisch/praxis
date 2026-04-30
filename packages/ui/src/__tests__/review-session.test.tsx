import type { Flashcard, PraxisClient, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { ReviewSessionTab } from "../routes/workspace/review-session.js";

afterEach(() => cleanup());

function makeCard(id: string): Flashcard {
  return {
    id: brandId<"FlashcardId">(id),
    studentId: brandId("student-1"),
    front: `Front of ${id}`,
    back: `Back of ${id}`,
    reviewState: {
      algorithm: "fsrs",
      state: {},
      nextReviewAt: (Date.now() - 1000) as Timestamp,
    },
    source: { kind: "user-created" },
  };
}

function makeClient(cards: Flashcard[]): PraxisClient {
  const reviewFn = vi.fn().mockImplementation(({ flashcardId }) => {
    const card = cards.find((c) => c.id === flashcardId) ?? cards[0];
    return Promise.resolve({ flashcard: card, nextReviewAt: Date.now() + 86_400_000 });
  });

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
      dueCount: vi.fn().mockResolvedValue(cards.length),
      list: vi.fn().mockResolvedValue(cards),
      review: reviewFn,
    } as unknown as PraxisClient["flashcards"],
  };
}

describe("ReviewSessionTab", () => {
  it("shows empty state when no cards are due", async () => {
    const client = makeClient([]);
    render(
      <PraxisClientProvider client={client}>
        <ReviewSessionTab />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Nothing due right now/)).toBeDefined();
    });
  });

  it("renders first due card", async () => {
    const cards = [makeCard("c1")];
    const client = makeClient(cards);
    render(
      <PraxisClientProvider client={client}>
        <ReviewSessionTab />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Front of c1")).toBeDefined();
    });
  });

  it("shows All done screen after rating all cards", async () => {
    const cards = [makeCard("c1")];
    const client = makeClient(cards);
    render(
      <PraxisClientProvider client={client}>
        <ReviewSessionTab />
      </PraxisClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("Front of c1")).toBeDefined());

    // Show answer
    fireEvent.click(screen.getByText("Show answer"));
    await waitFor(() => expect(screen.getByText("Good")).toBeDefined());

    // Rate
    fireEvent.click(screen.getByText("Good"));

    await waitFor(() => {
      expect(screen.getByText(/All done!/)).toBeDefined();
    });
  });

  it("shows progress indicator", async () => {
    const cards = [makeCard("c1"), makeCard("c2")];
    const client = makeClient(cards);
    render(
      <PraxisClientProvider client={client}>
        <ReviewSessionTab />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/0 \/ 2 reviewed/)).toBeDefined();
    });
  });
});
