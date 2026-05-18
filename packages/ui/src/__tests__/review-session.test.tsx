import type { Flashcard, PraxisClient, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { ReviewSessionTab } from "../routes/workspace/review-session.js";
import { makeFakeClient } from "./helpers/fake-client.js";

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

  return makeFakeClient({
    flashcards: {
      dueCount: vi.fn().mockResolvedValue(cards.length),
      list: vi.fn().mockResolvedValue(cards),
      review: reviewFn,
    } as unknown as PraxisClient["flashcards"],
  });
}

describe("ReviewSessionTab — queue surface", () => {
  it("shows empty state when no cards are due", async () => {
    const client = makeClient([]);
    render(
      <PraxisClientProvider client={client}>
        <ReviewSessionTab />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/All caught up/)).toBeDefined();
    });
  });

  it("shows due count and Start session CTA when cards are due", async () => {
    const cards = [makeCard("c1"), makeCard("c2")];
    const client = makeClient(cards);
    render(
      <PraxisClientProvider client={client}>
        <ReviewSessionTab />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("2")).toBeDefined();
      expect(screen.getByText(/cards due/i)).toBeDefined();
      expect(screen.getByText(/Start session/)).toBeDefined();
    });
  });
});

describe("ReviewSessionTab — per-card flow", () => {
  it("shows first card front after starting session", async () => {
    const cards = [makeCard("c1")];
    const client = makeClient(cards);
    render(
      <PraxisClientProvider client={client}>
        <ReviewSessionTab />
      </PraxisClientProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Start session/)).toBeDefined());
    fireEvent.click(screen.getByText(/Start session/));

    await waitFor(() => {
      expect(screen.getByText("Front of c1")).toBeDefined();
    });
  });

  it("renders Reveal answer button and hides back initially", async () => {
    const cards = [makeCard("c1")];
    const client = makeClient(cards);
    render(
      <PraxisClientProvider client={client}>
        <ReviewSessionTab />
      </PraxisClientProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Start session/)).toBeDefined());
    fireEvent.click(screen.getByText(/Start session/));

    await waitFor(() => expect(screen.getByText("Reveal answer")).toBeDefined());
    expect(screen.queryByText("Back of c1")).toBeNull();
  });

  it("reveals back text and outcome buttons after Reveal answer click", async () => {
    const cards = [makeCard("c1")];
    const client = makeClient(cards);
    render(
      <PraxisClientProvider client={client}>
        <ReviewSessionTab />
      </PraxisClientProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Start session/)).toBeDefined());
    fireEvent.click(screen.getByText(/Start session/));

    await waitFor(() => expect(screen.getByText("Reveal answer")).toBeDefined());
    fireEvent.click(screen.getByText("Reveal answer"));

    await waitFor(() => {
      expect(screen.getByText("Back of c1")).toBeDefined();
      expect(screen.getByText("Got it")).toBeDefined();
      expect(screen.getByText("Partial")).toBeDefined();
      expect(screen.getByText("Forgot")).toBeDefined();
    });
  });

  it("shows progress header during review", async () => {
    const cards = [makeCard("c1"), makeCard("c2")];
    const client = makeClient(cards);
    render(
      <PraxisClientProvider client={client}>
        <ReviewSessionTab />
      </PraxisClientProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Start session/)).toBeDefined());
    fireEvent.click(screen.getByText(/Start session/));

    await waitFor(() => {
      expect(screen.getByText(/0 \/ 2/)).toBeDefined();
    });
  });
});

describe("ReviewSessionTab — session-end summary", () => {
  it("shows summary after rating all cards with Got it", async () => {
    const cards = [makeCard("c1")];
    const client = makeClient(cards);
    render(
      <PraxisClientProvider client={client}>
        <ReviewSessionTab />
      </PraxisClientProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Start session/)).toBeDefined());
    fireEvent.click(screen.getByText(/Start session/));

    await waitFor(() => expect(screen.getByText("Reveal answer")).toBeDefined());
    fireEvent.click(screen.getByText("Reveal answer"));

    await waitFor(() => expect(screen.getByText("Got it")).toBeDefined());
    fireEvent.click(screen.getByText("Got it"));

    await waitFor(
      () => {
        expect(screen.getByText(/Session complete/)).toBeDefined();
      },
      { timeout: 1000 },
    );
  });

  it("surfaces got/partial/forgot counts in summary", async () => {
    const cards = [makeCard("c1")];
    const client = makeClient(cards);
    render(
      <PraxisClientProvider client={client}>
        <ReviewSessionTab />
      </PraxisClientProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Start session/)).toBeDefined());
    fireEvent.click(screen.getByText(/Start session/));

    await waitFor(() => expect(screen.getByText("Reveal answer")).toBeDefined());
    fireEvent.click(screen.getByText("Reveal answer"));

    await waitFor(() => expect(screen.getByText("Forgot")).toBeDefined());
    fireEvent.click(screen.getByText("Forgot"));

    await waitFor(
      () => {
        // "Session complete" heading
        expect(screen.getByText(/Session complete/)).toBeDefined();
        // Summary labels are shown
        expect(screen.getByText("Got it")).toBeDefined();
        expect(screen.getByText("Partial")).toBeDefined();
      },
      { timeout: 1000 },
    );
  });
});
