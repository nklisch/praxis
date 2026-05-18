/**
 * Recommendation types — surfaced by RecommendationService.next().
 *
 * Each variant carries a `score` (used for priority ordering) and a `reason`
 * string (user-visible; English-only in v1).
 *
 * Discriminated on `kind` (stored/computed domain object, per conventions).
 */

import type { Timestamp } from "./common.js";
import type { ConceptId, CourseId, LessonId, SessionId, StudentId } from "./ids.js";

/** A branded string for a course-create draft id. */
export type DraftId = string & { readonly __brand: "DraftId" };

/** A mode id — the string key from the modes map (e.g. "teach", "quiz"). */
export type ModeId = string;

export type Recommendation =
  | {
      kind: "resume_session";
      sessionId: SessionId;
      mode: ModeId;
      lastTouchedAt: Timestamp;
      reason: string;
      score: number;
    }
  | {
      kind: "review_cards";
      courseId: CourseId | null;
      dueNow: number;
      dueIn24h: number;
      reason: string;
      score: number;
    }
  | {
      kind: "practice_concept";
      conceptId: ConceptId;
      courseId: CourseId;
      mastery: number;
      threshold: number;
      reason: string;
      score: number;
    }
  | {
      kind: "resume_draft";
      draftId: DraftId;
      lastTouchedAt: Timestamp;
      reason: string;
      score: number;
    }
  | {
      kind: "quick_check";
      lessonId: LessonId;
      reason: string;
      score: number;
    };

export interface RecommendationService {
  next(input: { studentId: StudentId; limit?: number }): Promise<Recommendation[]>;
}

// ─── Recommendations (client-side) ───────────────────────────────────────────

/**
 * Workbench recommendation engine — renderer-side surface.
 * Returns the priority-ordered "what's next" list for the front door.
 */
export interface RecommendationsClientApi {
  next(input?: { limit?: number }): Promise<Recommendation[]>;
}
