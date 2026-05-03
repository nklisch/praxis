/**
 * Phase 12: FsrsSchedulerImpl — wraps ts-fsrs library.
 *
 * ts-fsrs API (v5.3.2):
 *   - `fsrs(params?)` — creates an FSRS instance.
 *   - `createEmptyCard(now?)` — factory for a new Card.
 *   - `f.next(card, now, grade)` — advances a card and returns RecordLogItem.
 *   - `f.repeat(card, now)` — returns IPreview (map of Grade → RecordLogItem).
 *   - `Rating` enum: Again=1, Hard=2, Good=3, Easy=4.
 *
 * API divergence from design sketch:
 *   - `createEmptyCard` is used instead of constructing a raw Card object.
 *   - `f.next(card, now, grade)` instead of `f.repeat()[grade]`.
 *   - `f.repeat(card, now)` for preview (returns all 4 ratings simultaneously).
 *   - enable_fuzz defaults to false (deterministic; set true in production config if desired).
 */

import type { FsrsScheduler, FsrsState, Rating, Timestamp } from "@praxis/core/types";
import { type Card, createEmptyCard, fsrs, Rating as TsFsrsRating } from "ts-fsrs";
import { FSRS_DEFAULTS } from "./config.js";

/**
 * FsrsSchedulerImpl — implements the FsrsScheduler port.
 *
 * Construction accepts optional parameter overrides so tests can pass
 * `{enable_fuzz: false}` for deterministic output.
 */
export class FsrsSchedulerImpl implements FsrsScheduler {
  private readonly engine: ReturnType<typeof fsrs>;

  constructor(params?: Partial<typeof FSRS_DEFAULTS>) {
    this.engine = fsrs({ ...FSRS_DEFAULTS, ...params });
  }

  initial(now: Timestamp): FsrsState {
    const card: Card = createEmptyCard(new Date(now));
    return {
      state: card as unknown as Record<string, unknown>,
      nextReviewAt: card.due.getTime() as Timestamp,
      reps: card.reps,
      lapses: card.lapses,
    };
  }

  review(input: { state: FsrsState; rating: Rating; now: Timestamp }): FsrsState {
    const card = input.state.state as unknown as Card;
    const grade = ratingToGrade(input.rating);
    const result = this.engine.next(card, new Date(input.now), grade);
    const nextCard = result.card;
    const nextReviewAt = nextCard.due.getTime() as Timestamp;
    return {
      state: nextCard as unknown as Record<string, unknown>,
      nextReviewAt,
      lastReviewedAt: input.now,
      reps: nextCard.reps,
      lapses: nextCard.lapses,
    };
  }

  preview(input: {
    state: FsrsState;
    now: Timestamp;
  }): Record<Rating, { nextReviewAt: Timestamp }> {
    const card = input.state.state as unknown as Card;
    const previews = this.engine.repeat(card, new Date(input.now));
    return {
      again: { nextReviewAt: previews[TsFsrsRating.Again].card.due.getTime() as Timestamp },
      hard: { nextReviewAt: previews[TsFsrsRating.Hard].card.due.getTime() as Timestamp },
      good: { nextReviewAt: previews[TsFsrsRating.Good].card.due.getTime() as Timestamp },
      easy: { nextReviewAt: previews[TsFsrsRating.Easy].card.due.getTime() as Timestamp },
    };
  }
}

/**
 * Map Praxis Rating to ts-fsrs Grade (which excludes Rating.Manual=0).
 * ts-fsrs's Grade = Exclude<Rating, Rating.Manual> = 1|2|3|4.
 */
function ratingToGrade(
  r: Rating,
): TsFsrsRating.Again | TsFsrsRating.Hard | TsFsrsRating.Good | TsFsrsRating.Easy {
  switch (r) {
    case "again":
      return TsFsrsRating.Again;
    case "hard":
      return TsFsrsRating.Hard;
    case "good":
      return TsFsrsRating.Good;
    case "easy":
      return TsFsrsRating.Easy;
    default: {
      const _exhaust: never = r;
      throw new Error(`Unknown rating: ${_exhaust}`);
    }
  }
}
