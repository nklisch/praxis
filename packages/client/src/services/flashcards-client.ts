import type {
  ConceptId,
  Flashcard,
  FlashcardId,
  FlashcardsClient,
  Rating,
  Timestamp,
} from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
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

  async get(flashcardId: FlashcardId): Promise<Flashcard | null> {
    const result = await this.transport.invoke<IpcEnvelope<Flashcard | null> | Flashcard | null>(
      C.get,
      flashcardId,
    );
    return unwrapEnvelope(result);
  }

  list(input?: { conceptId?: ConceptId; due?: boolean; limit?: number }): Promise<Flashcard[]> {
    return this.transport.invoke<Flashcard[]>(C.list, input);
  }

  async delete(flashcardId: FlashcardId): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(C.delete, flashcardId);
    return unwrapEnvelope(result);
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

  async dueCount(): Promise<number> {
    const result = await this.transport.invoke<IpcEnvelope<number> | number>(C.dueCount);
    return unwrapEnvelope(result);
  }
}

export { FlashcardsClientImpl as FlashcardsClient };
