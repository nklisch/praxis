import type {
  ConceptId,
  Flashcard,
  FlashcardId,
  FlashcardsClient,
  Rating,
  Timestamp,
} from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

/** Canonical channel names for the flashcards IPC surface. */
const C = {
  create: "praxis.flashcards.create",
  update: "praxis.flashcards.update",
  get: "praxis.flashcards.get",
  list: "praxis.flashcards.list",
  delete: "praxis.flashcards.delete",
  review: "praxis.flashcards.review",
  dueCount: "praxis.flashcards.dueCount",
} as const;

/**
 * FlashcardsClient — Phase 12 implementation.
 * Thin wrappers over the praxis.flashcards.* IPC channels.
 *
 * Implements the client-side FlashcardsClient from @praxis/core/types/client.
 */
class FlashcardsClientImpl implements FlashcardsClient {
  constructor(private readonly transport: ClientTransport) {}

  create(input: {
    front: string;
    back: string;
    conceptId?: ConceptId;
    source?: { kind: "authored" | "extracted" | "user-created"; ref?: string };
  }): Promise<Flashcard> {
    return this.transport.invoke<Flashcard>(C.create, input);
  }

  update(input: {
    flashcardId: FlashcardId;
    patch: Partial<Pick<Flashcard, "front" | "back" | "conceptId">>;
  }): Promise<Flashcard> {
    return this.transport.invoke<Flashcard>(C.update, input);
  }

  get(flashcardId: FlashcardId): Promise<Flashcard | null> {
    return this.transport.invoke<Flashcard | null>(C.get, flashcardId);
  }

  list(input?: { conceptId?: ConceptId; due?: boolean; limit?: number }): Promise<Flashcard[]> {
    return this.transport.invoke<Flashcard[]>(C.list, input);
  }

  delete(flashcardId: FlashcardId): Promise<void> {
    return this.transport.invoke<void>(C.delete, flashcardId);
  }

  review(input: {
    flashcardId: FlashcardId;
    rating: Rating;
  }): Promise<{ flashcard: Flashcard; nextReviewAt: Timestamp }> {
    return this.transport.invoke<{ flashcard: Flashcard; nextReviewAt: Timestamp }>(
      C.review,
      input,
    );
  }

  dueCount(): Promise<number> {
    return this.transport.invoke<number>(C.dueCount);
  }
}

export { FlashcardsClientImpl as FlashcardsClient };
