import type { Flashcard, FlashcardId, Rating, Timestamp } from "@praxis/core/types";
import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

export interface UseDueCardsResult {
  dueCount: number;
  dueList: Flashcard[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  reviewCard: (
    flashcardId: FlashcardId,
    rating: Rating,
  ) => Promise<{ flashcard: Flashcard; nextReviewAt: Timestamp }>;
}

interface DueCardsData {
  count: number;
  list: Flashcard[];
}

/**
 * Hook for the due-card review queue.
 * Uses useResource with a Promise.all loader that fetches dueCount + due list
 * together. The reviewCard method removes the card from the local list on
 * success (optimistic update for snappy review UX).
 */
export function useDueCards(): UseDueCardsResult {
  const client = usePraxisClient();

  const loader = useCallback(async (): Promise<DueCardsData> => {
    const [count, list] = await Promise.all([
      client.flashcards.dueCount(),
      client.flashcards.list({ due: true }),
    ]);
    return { count, list };
  }, [client]);

  const { data, loading, error, refresh, setData } = useResource(loader);

  const dueCount = data?.count ?? 0;
  const dueList = data?.list ?? [];

  const reviewCard = useCallback(
    async (
      flashcardId: FlashcardId,
      rating: Rating,
    ): Promise<{ flashcard: Flashcard; nextReviewAt: Timestamp }> => {
      const result = await client.flashcards.review({ flashcardId, rating });
      // Optimistically remove this card from the due list and decrement count.
      setData((prev) => ({
        count: Math.max(0, (prev?.count ?? 0) - 1),
        list: (prev?.list ?? []).filter((c) => c.id !== flashcardId),
      }));
      return result;
    },
    [client, setData],
  );

  return { dueCount, dueList, loading, error, refresh, reviewCard };
}
