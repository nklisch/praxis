import type { ConceptId, Flashcard, FlashcardId } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseFlashcardsResult {
  flashcards: Flashcard[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  deleteFlashcard: (flashcardId: FlashcardId) => Promise<void>;
}

export interface UseFlashcardsOptions {
  conceptId?: ConceptId;
  due?: boolean;
  limit?: number;
}

/**
 * Hook for loading and managing flashcards.
 * Pattern matches useNotes — loading/error/refresh state, mount-effect.
 */
export function useFlashcards(opts: UseFlashcardsOptions = {}): UseFlashcardsResult {
  const client = usePraxisClient();
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.flashcards.list({
        ...(opts.conceptId !== undefined && { conceptId: opts.conceptId }),
        ...(opts.due !== undefined && { due: opts.due }),
        ...(opts.limit !== undefined && { limit: opts.limit }),
      });
      setFlashcards(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, opts.conceptId, opts.due, opts.limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const deleteFlashcard = useCallback(
    async (flashcardId: FlashcardId): Promise<void> => {
      await client.flashcards.delete(flashcardId);
      setFlashcards((prev) => prev.filter((f) => f.id !== flashcardId));
    },
    [client],
  );

  return { flashcards, loading, error, refresh, deleteFlashcard };
}
