import type { Flashcard, FlashcardId, Rating, Timestamp } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

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

/**
 * Hook for the due-card review queue.
 *
 * Fetches dueCount (for nav badge) + the due list (for review session).
 * The reviewCard method wraps client.flashcards.review and removes the card
 * from the local dueList on success (optimistic update for snappy review UX).
 */
export function useDueCards(): UseDueCardsResult {
  const client = usePraxisClient();
  const [dueCount, setDueCount] = useState(0);
  const [dueList, setDueList] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [count, list] = await Promise.all([
        client.flashcards.dueCount(),
        client.flashcards.list({ due: true }),
      ]);
      setDueCount(count);
      setDueList(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const reviewCard = useCallback(
    async (
      flashcardId: FlashcardId,
      rating: Rating,
    ): Promise<{ flashcard: Flashcard; nextReviewAt: Timestamp }> => {
      const result = await client.flashcards.review({ flashcardId, rating });
      // Optimistically remove this card from the due list
      setDueList((prev) => prev.filter((c) => c.id !== flashcardId));
      setDueCount((prev) => Math.max(0, prev - 1));
      return result;
    },
    [client],
  );

  return { dueCount, dueList, loading, error, refresh, reviewCard };
}
