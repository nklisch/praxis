/**
 * Phase 9: Lock-check helpers shared by start_lesson, mark_studied, and
 * assignment.create tool handlers.
 *
 * Pure functions over CourseStateSnapshot — no DB reads. The snapshot already
 * carries gate state (populated by ArtifactsServiceImpl.read via gateView).
 */
import type { ConceptId, CourseStateSnapshot, LessonId } from "@praxis/core/types";

export type LockCheckResult = { ok: true } | { ok: false; reason: string };

/**
 * Check whether a lesson can be acted on (started, concept marked as studied).
 * A lesson is locked if its lesson-guarding gate is in `locked` state.
 * Returns `{ ok: true }` when no gate guards the lesson (open course section).
 */
export function checkLessonNotLocked(
  snapshot: CourseStateSnapshot,
  lessonId: LessonId,
): LockCheckResult {
  const gate = snapshot.gates.find(
    (g) => g.gate.guards.kind === "lesson" && g.gate.guards.lessonId === lessonId,
  );
  if (!gate) return { ok: true }; // no gate guards this lesson
  const state = gate.gate.state;
  if (state.kind === "unlocked" || state.kind === "overridden") return { ok: true };
  return {
    ok: false,
    reason: `Lesson is locked: ${gate.lockReason || "prerequisites not met"}.`,
  };
}

/**
 * Check whether a concept can be acted on. Looks up the concept's lesson via
 * the snapshot's conceptsById index, then delegates to checkLessonNotLocked.
 */
export function checkConceptNotLocked(
  snapshot: CourseStateSnapshot,
  conceptId: ConceptId,
): LockCheckResult {
  const conceptRow = snapshot.conceptsById.get(conceptId);
  if (!conceptRow) return { ok: false, reason: `Concept not found in this course.` };
  return checkLessonNotLocked(snapshot, conceptRow.lessonId);
}
