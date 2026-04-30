/**
 * Phase 12: FlashcardsServiceImpl — creates, updates, reads, deletes, and reviews
 * flashcards. Uses FsrsScheduler for scheduling.
 */

import { flashcards } from "@praxis/artifacts/schema";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  ConceptId,
  Flashcard,
  FlashcardId,
  FlashcardsService,
  FsrsScheduler,
  FsrsState,
  Logger,
  Rating,
  StudentId,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface FlashcardsServiceDeps {
  db: PraxisDb;
  log: Logger;
  scheduler: FsrsScheduler;
}

export class FlashcardsServiceImpl implements FlashcardsService {
  constructor(private readonly deps: FlashcardsServiceDeps) {}

  async create(input: {
    studentId: StudentId;
    front: string;
    back: string;
    conceptId?: ConceptId;
    source?: { kind: "authored" | "extracted" | "user-created"; ref?: string };
  }): Promise<Flashcard> {
    const id = uuidv7();
    const now = Date.now() as Timestamp;
    const initialState = this.deps.scheduler.initial(now);
    const reviewState = {
      algorithm: "fsrs" as const,
      state: initialState.state,
      nextReviewAt: initialState.nextReviewAt,
      lastReviewedAt: initialState.lastReviewedAt,
      reps: initialState.reps,
      lapses: initialState.lapses,
    };
    this.deps.db
      .insert(flashcards)
      .values({
        id,
        studentId: input.studentId,
        conceptId: input.conceptId ?? null,
        front: input.front,
        back: input.back,
        reviewStateJson: reviewState,
        sourceJson: input.source ?? { kind: "user-created" },
        nextReviewAt: new Date(now),
      })
      .run();
    const created = await this.get({
      studentId: input.studentId,
      flashcardId: brandId<"FlashcardId">(id),
    });
    if (!created) throw new Error("flashcard disappeared after insert");
    return created;
  }

  async update(input: {
    studentId: StudentId;
    flashcardId: FlashcardId;
    patch: Partial<Pick<Flashcard, "front" | "back" | "conceptId">>;
  }): Promise<Flashcard> {
    // biome-ignore lint/suspicious/noExplicitAny: patch fields are type-checked individually
    const setFields: Record<string, any> = {};
    if (input.patch.front !== undefined) setFields.front = input.patch.front;
    if (input.patch.back !== undefined) setFields.back = input.patch.back;
    if (input.patch.conceptId !== undefined) setFields.conceptId = input.patch.conceptId;

    if (Object.keys(setFields).length > 0) {
      this.deps.db
        .update(flashcards)
        .set(setFields)
        .where(and(eq(flashcards.id, input.flashcardId), eq(flashcards.studentId, input.studentId)))
        .run();
    }
    const updated = await this.get({
      studentId: input.studentId,
      flashcardId: input.flashcardId,
    });
    if (!updated) throw new Error(`flashcard not found: ${input.flashcardId}`);
    return updated;
  }

  async get(input: { studentId: StudentId; flashcardId: FlashcardId }): Promise<Flashcard | null> {
    const row = this.deps.db
      .select()
      .from(flashcards)
      .where(and(eq(flashcards.id, input.flashcardId), eq(flashcards.studentId, input.studentId)))
      .get();
    if (!row) return null;
    return rowToFlashcard(row);
  }

  async list(input: {
    studentId: StudentId;
    conceptId?: ConceptId;
    due?: boolean;
    limit?: number;
  }): Promise<Flashcard[]> {
    const limit = input.limit ?? 100;
    const now = new Date();
    const conditions = [eq(flashcards.studentId, input.studentId)];
    if (input.conceptId !== undefined) conditions.push(eq(flashcards.conceptId, input.conceptId));
    if (input.due === true) conditions.push(lte(flashcards.nextReviewAt, now));

    const rows = this.deps.db
      .select()
      .from(flashcards)
      .where(and(...conditions))
      .orderBy(asc(flashcards.nextReviewAt))
      .limit(limit)
      .all();
    return rows.map(rowToFlashcard);
  }

  async delete(input: { studentId: StudentId; flashcardId: FlashcardId }): Promise<void> {
    this.deps.db
      .delete(flashcards)
      .where(and(eq(flashcards.id, input.flashcardId), eq(flashcards.studentId, input.studentId)))
      .run();
  }

  async review(input: {
    studentId: StudentId;
    flashcardId: FlashcardId;
    rating: Rating;
  }): Promise<{ flashcard: Flashcard; nextReviewAt: Timestamp }> {
    const card = await this.get({
      studentId: input.studentId,
      flashcardId: input.flashcardId,
    });
    if (!card) throw new Error(`flashcard not found: ${input.flashcardId}`);

    const now = Date.now() as Timestamp;

    // Reconstruct the FsrsState from the stored reviewState.
    // reviewState.state is the opaque ts-fsrs Card object.
    // Use conditional spread to satisfy exactOptionalPropertyTypes.
    const reviewStateTyped = card.reviewState as {
      state: Record<string, unknown>;
      nextReviewAt?: Timestamp;
      lastReviewedAt?: Timestamp;
      reps?: number;
      lapses?: number;
    };
    const currentFsrsState: FsrsState = {
      state: reviewStateTyped.state,
      reps: reviewStateTyped.reps ?? 0,
      lapses: reviewStateTyped.lapses ?? 0,
      ...(reviewStateTyped.nextReviewAt !== undefined && {
        nextReviewAt: reviewStateTyped.nextReviewAt,
      }),
      ...(reviewStateTyped.lastReviewedAt !== undefined && {
        lastReviewedAt: reviewStateTyped.lastReviewedAt,
      }),
    };

    const newFsrsState = this.deps.scheduler.review({
      state: currentFsrsState,
      rating: input.rating,
      now,
    });

    const scheduledNextReviewAt = newFsrsState.nextReviewAt;
    if (scheduledNextReviewAt === undefined) {
      throw new Error("scheduler.review() returned FsrsState without nextReviewAt");
    }

    const newReviewState = {
      algorithm: "fsrs" as const,
      state: newFsrsState.state,
      nextReviewAt: scheduledNextReviewAt,
      lastReviewedAt: newFsrsState.lastReviewedAt,
      reps: newFsrsState.reps,
      lapses: newFsrsState.lapses,
    };

    this.deps.db
      .update(flashcards)
      .set({
        reviewStateJson: newReviewState,
        nextReviewAt: new Date(scheduledNextReviewAt),
      })
      .where(and(eq(flashcards.id, input.flashcardId), eq(flashcards.studentId, input.studentId)))
      .run();

    const updated = await this.get({
      studentId: input.studentId,
      flashcardId: input.flashcardId,
    });
    if (!updated) throw new Error("flashcard disappeared after review");
    return { flashcard: updated, nextReviewAt: scheduledNextReviewAt };
  }

  async dueCount(input: { studentId: StudentId }): Promise<number> {
    const now = new Date();
    const row = this.deps.db
      .select({ count: sql<number>`count(*)` })
      .from(flashcards)
      .where(and(eq(flashcards.studentId, input.studentId), lte(flashcards.nextReviewAt, now)))
      .get();
    return row?.count ?? 0;
  }
}

function rowToFlashcard(row: typeof flashcards.$inferSelect): Flashcard {
  return {
    id: row.id as FlashcardId,
    studentId: row.studentId as StudentId,
    ...(row.conceptId !== null ? { conceptId: row.conceptId as ConceptId } : {}),
    front: row.front,
    back: row.back,
    reviewState: row.reviewStateJson as Flashcard["reviewState"],
    source: row.sourceJson as Flashcard["source"],
  };
}
