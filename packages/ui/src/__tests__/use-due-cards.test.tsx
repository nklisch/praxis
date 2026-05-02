import type { Flashcard, PraxisClient, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useDueCards } from "../hooks/use-due-cards.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCard(id = "card-1"): Flashcard {
  return {
    id: brandId<"FlashcardId">(id),
    studentId: brandId("student-1"),
    front: "What is X?",
    back: "X is Y.",
    reviewState: {
      algorithm: "fsrs",
      state: {},
      nextReviewAt: (Date.now() - 1000) as Timestamp,
    },
    source: { kind: "user-created" },
  };
}

function makeClient(count: number, cards: Flashcard[]): PraxisClient {
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
      dueCount: vi.fn().mockResolvedValue(count),
      list: vi.fn().mockResolvedValue(cards),
      review: vi.fn().mockResolvedValue({
        flashcard: cards[0] ?? makeCard(),
        nextReviewAt: Date.now() + 86_400_000,
      }),
    } as unknown as PraxisClient["flashcards"],
    claudeAuth: {} as PraxisClient["claudeAuth"],
    shell: {} as PraxisClient["shell"],
  };
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useDueCards", () => {
  it("fetches dueCount and dueList on mount", async () => {
    const cards = [makeCard("c1"), makeCard("c2")];
    const client = makeClient(2, cards);
    const { result } = renderHook(() => useDueCards(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.dueCount).toBe(2);
    expect(result.current.dueList).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("reviewCard calls client.flashcards.review and removes card from list", async () => {
    const card = makeCard("c1");
    const client = makeClient(1, [card]);
    const { result } = renderHook(() => useDueCards(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.dueList).toHaveLength(1));

    await act(async () => {
      await result.current.reviewCard(card.id, "good");
    });

    expect(client.flashcards.review).toHaveBeenCalledWith({ flashcardId: card.id, rating: "good" });
    expect(result.current.dueList).toHaveLength(0);
    expect(result.current.dueCount).toBe(0);
  });
});
