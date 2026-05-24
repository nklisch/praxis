/**
 * Progress types — surfaced by ProgressService.rollup().
 *
 * Per-course progress aggregator for the /progress route. One rollup per
 * course the student has access to. Assembled from: CourseStateSnapshot,
 * studentMastery rows, sessions, gateUnlockEvents, and submitted assignments.
 */

import type { Timestamp } from "./common.js";
import type { ConceptId, CourseId, GateId, LessonId, StudentId } from "./ids.js";

export interface CourseProgressRollup {
  courseId: CourseId;
  courseTitle: string;
  /** Mean effectivePKnown across all concepts in the course. 0 when no concepts. */
  masteryPercent: number;
  /** First non-completed lesson, or null when all lessons done or none started. */
  currentLesson: {
    id: LessonId;
    title: string;
    /** 1-based index in the ordered lesson list. */
    index: number;
    /** Total lesson count for the course. */
    total: number;
  } | null;
  /** Closest locked gate the student is working toward, or null when none. */
  activeGate: {
    id: GateId;
    title: string;
    lockReason: string;
    /** 0..1 progress toward unlock. */
    progress: number;
  } | null;
  /** Bottom-3 concepts below the mastery threshold (0.7), ordered lowest-first. */
  stuckConcepts: Array<{
    conceptId: ConceptId;
    name: string;
    /** 0..1 effective decay-aware mastery. */
    mastery: number;
  }>;
  /** Top-3 recent events (sessions + gate unlocks + submitted assignments), newest first. */
  recentEvents: Array<{
    kind: "session" | "gate" | "grade";
    at: Timestamp;
    label: string;
    detail: string;
  }>;
}

export interface ProgressService {
  rollup(input: { studentId: StudentId }): Promise<CourseProgressRollup[]>;
}

// ─── Progress (client-side) ──────────────────────────────────────────────────

/**
 * Progress aggregator — renderer-side surface.
 * Returns one rollup per course for the /progress route.
 */
export interface ProgressClientApi {
  rollup(): Promise<CourseProgressRollup[]>;
}
