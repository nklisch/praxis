import type {
  DanglingRefsReport,
  LessonDetail,
  LessonsInUnit,
  ProposedCourse,
  UnitListEntry,
} from "../../types/index.js";

/**
 * Pure projection: maps `proposed.proposedUnits` to a flat `UnitListEntry[]`.
 * No store access, no async — accepts `ProposedCourse` directly.
 */
export function listUnitsQuery(proposed: ProposedCourse): UnitListEntry[] {
  return (proposed.proposedUnits ?? []).map((u) => ({
    draftUnitId: u.draftUnitId,
    name: u.name,
    ...(u.summary !== undefined && { summary: u.summary }),
    lessonCount: u.draftLessonIds.length,
    hasSummative: u.summative !== undefined,
  }));
}

/**
 * Pure projection: finds a unit by `draftUnitId` and joins its lessons with
 * per-lesson assessment counts from `proposed.proposedLessonAssessments`.
 * Returns `null` when the unit is not found.
 */
export function listLessonsInUnitQuery(
  proposed: ProposedCourse,
  draftUnitId: string,
): LessonsInUnit | null {
  const unit = (proposed.proposedUnits ?? []).find((u) => u.draftUnitId === draftUnitId);
  if (!unit) return null;

  // Count assessments per lesson from proposedLessonAssessments.
  const assessmentsByLesson = new Map<string, number>();
  for (const la of proposed.proposedLessonAssessments ?? []) {
    assessmentsByLesson.set(
      la.draftLessonId,
      (assessmentsByLesson.get(la.draftLessonId) ?? 0) + 1,
    );
  }

  const lessonMap = new Map(proposed.proposedLessons.map((l) => [l.draftLessonId, l]));
  const lessons = unit.draftLessonIds.flatMap((id) => {
    const lesson = lessonMap.get(id);
    if (!lesson) return [];
    return [
      {
        draftLessonId: lesson.draftLessonId,
        title: lesson.title,
        conceptCount: lesson.conceptNames.length,
        assessmentCount: assessmentsByLesson.get(id) ?? 0,
      },
    ];
  });

  return {
    draftUnitId: unit.draftUnitId,
    unitName: unit.name,
    lessons,
  };
}

/**
 * Pure projection: finds a lesson by `draftLessonId`, collects its assessments,
 * and resolves its parent unit.
 * Returns `null` when the lesson is not found.
 */
export function getLessonDetailQuery(
  proposed: ProposedCourse,
  draftLessonId: string,
): LessonDetail | null {
  const lesson = proposed.proposedLessons.find((l) => l.draftLessonId === draftLessonId);
  if (!lesson) return null;

  const assessments = (proposed.proposedLessonAssessments ?? [])
    .filter((la) => la.draftLessonId === draftLessonId)
    .map((la) => ({
      draftAssessmentId: la.draftAssessmentId,
      kind: la.kind,
      timing: la.timing,
      purpose: la.purpose,
      title: la.title,
    }));

  const parentUnit =
    (proposed.proposedUnits ?? []).find((u) => u.draftLessonIds.includes(draftLessonId)) ?? null;

  return {
    draftLessonId: lesson.draftLessonId,
    title: lesson.title,
    conceptNames: lesson.conceptNames,
    assessments,
    parentUnit: parentUnit
      ? { draftUnitId: parentUnit.draftUnitId, name: parentUnit.name }
      : null,
  };
}

/**
 * Pure projection: computes orphan concepts, dangling unit memberships,
 * dangling lesson assessments, and edges referencing unknown concepts.
 * Structural integrity check — uses bare string set comparisons (not normalized names).
 */
export function listDanglingRefsQuery(proposed: ProposedCourse): DanglingRefsReport {
  // Orphan concepts: in proposedConcepts but referenced by zero lessons.
  const conceptsInLessons = new Set<string>();
  for (const lesson of proposed.proposedLessons) {
    for (const cn of lesson.conceptNames) conceptsInLessons.add(cn);
  }
  const orphanConcepts = proposed.proposedConcepts
    .filter((c) => !conceptsInLessons.has(c.name))
    .map((c) => c.name);

  // Dangling unit memberships: unit's draftLessonIds not in proposedLessons.
  const knownLessonIds = new Set(proposed.proposedLessons.map((l) => l.draftLessonId));
  const danglingUnitMemberships = (proposed.proposedUnits ?? [])
    .map((u) => ({
      draftUnitId: u.draftUnitId,
      unitName: u.name,
      badLessonIds: u.draftLessonIds.filter((id) => !knownLessonIds.has(id)),
    }))
    .filter((u) => u.badLessonIds.length > 0);

  // Dangling lesson assessments.
  const danglingLessonAssessments = (proposed.proposedLessonAssessments ?? [])
    .filter((la) => !knownLessonIds.has(la.draftLessonId))
    .map((la) => ({
      draftAssessmentId: la.draftAssessmentId,
      badLessonId: la.draftLessonId,
    }));

  // Edges referencing unknown concepts.
  const knownConcepts = new Set(proposed.proposedConcepts.map((c) => c.name));
  const edgesReferencingUnknownConcepts = proposed.proposedEdges
    .filter((e) => !knownConcepts.has(e.fromName) || !knownConcepts.has(e.toName))
    .map((e) => ({ fromName: e.fromName, toName: e.toName }));

  return {
    orphanConcepts,
    danglingUnitMemberships,
    danglingLessonAssessments,
    edgesReferencingUnknownConcepts,
  };
}
