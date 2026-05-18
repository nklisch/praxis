import type { Course, Lesson } from "./artifacts.js";
import type { Timestamp } from "./common.js";
import type { GateView } from "./gate.js";
import type { ConceptId, CourseId, LessonId, StudentId } from "./ids.js";

// ─── Phase 6: CourseStateReader ───────────────────────────────────────────────

export interface CourseStateReader {
  /**
   * Resolve the active course's current lesson and concept-status map.
   * Returns null when courseId is invalid for this student.
   */
  read(input: { studentId: StudentId; courseId: CourseId }): Promise<CourseStateSnapshot | null>;
}

export interface CourseStateSnapshot {
  course: Course;
  lessons: Lesson[]; // ordered by orderIndex
  currentLesson: Lesson | null; // first non-completed lesson, or null if all done
  /** All concepts touched by the course's lessons, with study status. */
  conceptsByLesson: Map<LessonId, ConceptStateRow[]>;
  /** Quick index for ToolContext consumers. */
  conceptsById: Map<ConceptId, ConceptStateRow>;
  /** Phase 9: Enriched gates for the UI / brief composer. */
  gates: GateView[];
  /** Phase 9: The single "next gate to unlock" — the closest locked gate the student is
   *  currently working toward, or null when nothing locked. */
  activeGate: GateView | null;
  /** Phase 9: Lessons summarized for the bounded visibility window. */
  visibilityWindow: VisibilityWindow;
}

/** Phase 9: Pre-computed bounds for the brief composer's visibility window. */
export interface VisibilityWindow {
  /** Index of the current lesson in the lessons array (or 0 when none started). */
  currentLessonIndex: number;
  /** Number of lessons after the next-lesson detail (i.e. total - currentLessonIndex - 2). */
  remainingCount: number;
}

export interface ConceptStateRow {
  conceptId: ConceptId;
  name: string;
  description: string;
  studied: boolean;
  studiedAt?: Timestamp;
  lessonId: LessonId;
}
