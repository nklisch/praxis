import type { ConceptId, Flashcard, FlashcardId } from "@praxis/core/types";
import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

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
 * Uses useResource for loading/error/refresh state and mount-effect.
 */
export function useFlashcards(opts: UseFlashcardsOptions = {}): UseFlashcardsResult {
  const client = usePraxisClient();

  const loader = useCallback(
    () =>
      client.flashcards.list({
        ...(opts.conceptId !== undefined && { conceptId: opts.conceptId }),
        ...(opts.due !== undefined && { due: opts.due }),
        ...(opts.limit !== undefined && { limit: opts.limit }),
      }),
    [client, opts.conceptId, opts.due, opts.limit],
  );

  const { data: flashcards = [], loading, error, refresh, setData } = useResource(loader);

  const deleteFlashcard = useCallback(
    async (flashcardId: FlashcardId): Promise<void> => {
      await client.flashcards.delete(flashcardId);
      setData((prev) => (prev ?? []).filter((f) => f.id !== flashcardId));
    },
    [client, setData],
  );

  return { flashcards, loading, error, refresh, deleteFlashcard };
}
