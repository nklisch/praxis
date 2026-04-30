import type { ConceptId, CourseStateSnapshot, LessonId, Timestamp } from "@praxis/core/types";

/** Inputs the router needs to make a suggestion. */
export interface RouterInput {
  snapshot: CourseStateSnapshot;
  /** Per-concept effective decay-aware mastery (0..1). Concepts not in the map default to 0. */
  masteryByConceptId: ReadonlyMap<string, number>;
  /** Per-concept BKT uncertainty (0..1). Concepts not in the map default to 0.5 (max uncertainty). */
  uncertaintyByConceptId: ReadonlyMap<string, number>;
  /** Per-concept last-practiced timestamp (ms). Concepts not in the map have never been practiced. */
  lastPracticedByConceptId: ReadonlyMap<string, Timestamp>;
  /** Wall clock now — caller supplies so the router stays a pure function. */
  now: Timestamp;
  /** Decay constant from the active course's threshold config (days). */
  decayDays: number;
}

export type RouterReason =
  | "next-in-order" // current lesson, next un-studied concept
  | "frontier" // current lesson, highest uncertainty among partially-known concepts
  | "review" // earlier concept whose mastery has decayed below threshold
  | "interleave" // earlier concept at high mastery, due for practice to maintain retention
  | "all-complete"; // course-wide nothing remains

/** A specific concept the router recommends. */
export interface ConceptCandidate {
  conceptId: ConceptId;
  name: string;
  description: string;
  lessonId: LessonId;
  reason: RouterReason;
  /** Numeric score the router used to pick this; useful for debugging + Phase 14 evals. */
  score: number;
  masteryNow: number;
  uncertainty: number;
}

export interface RouterSuggestion {
  /**
   * The single concept the router recommends teaching/practicing now.
   * Null when the course is fully complete or has no current lesson.
   */
  primary: ConceptCandidate | null;
  /** Up to N decayed concepts to review before / during the primary. */
  reviews: ConceptCandidate[];
  /** Up to N earlier concepts to interleave during practice. */
  interleaves: ConceptCandidate[];
}
