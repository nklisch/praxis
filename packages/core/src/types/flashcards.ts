/**
 * Phase 12: FSRS flashcard scheduling types.
 */

import type { Flashcard } from "./artifacts.js";
import type { Timestamp } from "./common.js";
import type { ConceptId, FlashcardId, StudentId } from "./ids.js";

/** Rating per FSRS-5 — four ratings the user picks during review. */
export type Rating = "again" | "hard" | "good" | "easy";

/**
 * Wrapper over the algorithm-specific state. Phase 1 declared the shape
 * (`ReviewState`); Phase 12 implements it for FSRS.
 *
 * `state` stores ts-fsrs's internal Card object opaquely. If Phase 14 swaps
 * schedulers, the wrapper survives; only the inner shape changes per algorithm.
 */
export interface FsrsState {
  /** ts-fsrs's internal Card object — opaque to Praxis core. */
  state: Record<string, unknown>;
  nextReviewAt?: Timestamp;
  lastReviewedAt?: Timestamp;
  /** Total reviews logged. Useful for UI ("first review!" badges). */
  reps: number;
  /** Total times the card was rated "again". */
  lapses: number;
}

/**
 * Pure-function port. Wraps ts-fsrs (or a future custom impl).
 * Phase 14 may A/B-test alternate implementations.
 *
 * All methods are pure: same inputs produce same outputs
 * (when enable_fuzz is false, which implementations should offer in test mode).
 */
export interface FsrsScheduler {
  /**
   * Initial state for a new card.
   * lastReviewedAt is undefined; nextReviewAt is `now` (immediately due).
   */
  initial(now: Timestamp): FsrsState;

  /**
   * Apply a rating and compute the new state.
   * `now` is the wall clock at the moment of review (caller passes Date.now()).
   */
  review(input: { state: FsrsState; rating: Rating; now: Timestamp }): FsrsState;

  /**
   * Predict the four next intervals (one per rating) without committing.
   * Used by the UI to show "Easy → 14 days" labels on rating buttons.
   */
  preview(input: { state: FsrsState; now: Timestamp }): Record<Rating, { nextReviewAt: Timestamp }>;
}

// ─── Phase 12: FlashcardsService ─────────────────────────────────────────────

/** Server-side FlashcardsService. */
export interface FlashcardsService {
  create(input: {
    studentId: StudentId;
    front: string;
    back: string;
    conceptId?: ConceptId;
    source?: { kind: "authored" | "extracted" | "user-created"; ref?: string };
  }): Promise<Flashcard>;

  update(input: {
    studentId: StudentId;
    flashcardId: FlashcardId;
    patch: Partial<Pick<Flashcard, "front" | "back" | "conceptId">>;
  }): Promise<Flashcard>;

  get(input: { studentId: StudentId; flashcardId: FlashcardId }): Promise<Flashcard | null>;

  list(input: {
    studentId: StudentId;
    conceptId?: ConceptId;
    due?: boolean;
    limit?: number;
  }): Promise<Flashcard[]>;

  delete(input: { studentId: StudentId; flashcardId: FlashcardId }): Promise<void>;

  /**
   * Record a rating; compute the new FSRS state; persist; return the new card row.
   */
  review(input: {
    studentId: StudentId;
    flashcardId: FlashcardId;
    rating: Rating;
  }): Promise<{ flashcard: Flashcard; nextReviewAt: Timestamp }>;

  /** Total count of cards currently due (`nextReviewAt <= now`). */
  dueCount(input: { studentId: StudentId }): Promise<number>;
}

// ─── Phase 12: FlashcardsClient (client-side) ────────────────────────────────

/** Client-side FlashcardsClient. */
export interface FlashcardsClient {
  create(input: {
    front: string;
    back: string;
    conceptId?: ConceptId;
    source?: { kind: "authored" | "extracted" | "user-created"; ref?: string };
  }): Promise<Flashcard>;

  update(input: {
    flashcardId: FlashcardId;
    patch: Partial<Pick<Flashcard, "front" | "back" | "conceptId">>;
  }): Promise<Flashcard>;

  get(flashcardId: FlashcardId): Promise<Flashcard | null>;

  list(input?: { conceptId?: ConceptId; due?: boolean; limit?: number }): Promise<Flashcard[]>;

  delete(flashcardId: FlashcardId): Promise<void>;

  review(input: {
    flashcardId: FlashcardId;
    rating: Rating;
  }): Promise<{ flashcard: Flashcard; nextReviewAt: Timestamp }>;

  dueCount(): Promise<number>;
}
