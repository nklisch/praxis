import {
  assignments,
  courses,
  courseUnits,
  gates,
  lessonAssessments,
  lessons,
  lessonUnits,
} from "@praxis/artifacts/schema";
import { conceptGraphs, concepts, prerequisiteEdges } from "@praxis/curriculum/schema";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../../db/index.js";
import type { CourseId, DraftCourseState, LessonId } from "../../types/index.js";
import { brandId } from "../../types/index.js";

export interface PersistDraftTxArgs {
  tx: PraxisDb;
  draft: DraftCourseState;
  now: Date;
}

/**
 * Inner body of the confirmDraft transaction. Accepts an already-open Drizzle
 * transaction handle so that `markConfirmedTx` can run in the same tx —
 * keeping the confirm atomic with the course write.
 *
 * All writes use the provided `tx` — no nested transaction is opened here.
 */
export function persistDraftTx(args: PersistDraftTxArgs): {
  courseId: CourseId;
  lessonIds: LessonId[];
  conceptGraphId: string;
} {
  const { tx, draft, now } = args;

  // 1. ConceptGraph row.
  const conceptGraphId = uuidv7();
  tx.insert(conceptGraphs)
    .values({
      id: conceptGraphId,
      source: "extracted",
      name: `${draft.proposed.title} graph`,
      version: "1",
      createdAt: now,
    })
    .run();

  // 2. Concept rows — assign stable UUIDs keyed by name.
  const conceptIdByName = new Map<string, string>();
  const conceptRowValues = draft.proposed.proposedConcepts.map((c) => {
    const id = uuidv7();
    conceptIdByName.set(c.name, id);
    return {
      id,
      graphId: conceptGraphId,
      name: c.name,
      description: c.description,
      aliasesJson: [] as string[],
      standardsTagsJson: [] as string[],
    };
  });
  if (conceptRowValues.length > 0) {
    tx.insert(concepts).values(conceptRowValues).run();
  }

  // 3. Prerequisite edge rows.
  const edgeRowValues = draft.proposed.proposedEdges.map((e) => ({
    // biome-ignore lint/style/noNonNullAssertion: edge names validated against conceptIdByName in validateProposed
    fromId: conceptIdByName.get(e.fromName)!,
    // biome-ignore lint/style/noNonNullAssertion: edge names validated against conceptIdByName in validateProposed
    toId: conceptIdByName.get(e.toName)!,
    strengthMilli: Math.round(Math.max(0, Math.min(1, e.strength)) * 1000),
    source: "extracted" as const,
  }));
  if (edgeRowValues.length > 0) {
    tx.insert(prerequisiteEdges).values(edgeRowValues).run();
  }

  // 4. Course row.
  const courseId = uuidv7();
  tx.insert(courses)
    .values({
      id: courseId,
      studentId: draft.studentId,
      title: draft.proposed.title,
      subject: draft.proposed.subject,
      gradeLevel: draft.proposed.gradeLevel,
      sourceJson: { kind: "bootstrapped", sourceMaterials: draft.documentIds },
      conceptGraphId,
      thresholdsJson: draft.proposed.thresholds,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // 5. Lesson rows — preserve declared order.
  const lessonRowValues = draft.proposed.proposedLessons.map((l, i) => ({
    id: uuidv7(),
    courseId,
    title: l.title,
    orderIndex: i,
    // biome-ignore lint/style/noNonNullAssertion: concept names validated against conceptIdByName in validateProposed
    conceptIdsJson: l.conceptNames.map((n) => conceptIdByName.get(n)!),
    referencesJson: l.references,
    suggestedStrategy: l.suggestedStrategy,
    estimatedMinutes: l.estimatedMinutes,
  }));
  if (lessonRowValues.length > 0) {
    tx.insert(lessons).values(lessonRowValues).run();
  }

  // 6. Skeleton gates — one per lesson, chained, all initially locked.
  //    Phase 9 overwrites with proper gate evaluation. Phase 6 just persists
  //    rows so future code can find them.
  const gateIds = lessonRowValues.map(() => uuidv7());
  const gateRowValues = lessonRowValues.map((l, i) => ({
    // biome-ignore lint/style/noNonNullAssertion: gateIds is same-length as lessonRowValues; i is a valid index
    id: gateIds[i]!,
    courseId,
    guardsJson: { kind: "lesson", lessonId: l.id },
    // biome-ignore lint/style/noNonNullAssertion: gateIds[i-1] exists for i > 0
    prerequisitesJson: i > 0 ? [gateIds[i - 1]!] : [],
    successCriteriaJson: {
      kind: "mastery-threshold",
      conceptIds: l.conceptIdsJson,
      minScore: draft.proposed.thresholds.conceptMastery,
    },
    stateJson: {
      kind: "locked",
      // biome-ignore lint/style/noNonNullAssertion: gateIds[i-1] exists for i > 0
      missingPrerequisites: i > 0 ? [gateIds[i - 1]!] : [],
    },
    evidenceJson: [],
  }));
  if (gateRowValues.length > 0) {
    tx.insert(gates).values(gateRowValues).run();
  }

  // Build a map from draftLessonId → real lessonId for unit/assessment wiring.
  const draftLessonIdToLessonId = new Map<string, string>();
  draft.proposed.proposedLessons.forEach((pl, i) => {
    const row = lessonRowValues[i];
    if (row) draftLessonIdToLessonId.set(pl.draftLessonId, row.id);
  });

  // Helper: materialise an assessment shell inside the transaction.
  function materializeShell(shellInput: {
    kind: "quiz" | "homework" | "exam";
    title: string;
    conceptNames: string[];
  }): string {
    const assignmentId = uuidv7();
    const conceptIds = shellInput.conceptNames.map((n) => {
      const id = conceptIdByName.get(n);
      if (!id) throw new Error(`assessment shell refs unknown concept: "${n}"`);
      return id;
    });
    tx.insert(assignments)
      .values({
        id: assignmentId,
        courseId,
        kind: shellInput.kind,
        title: shellInput.title,
        itemsJson: [],
        conceptIdsJson: conceptIds,
        assignedAt: now,
        submittedAt: null,
        gradeJson: null,
        parentSessionId: null,
      })
      .run();
    return assignmentId;
  }

  // 7. Phase 16: materialise units, lesson_units, and summative assignment shells.
  for (const [i, proposedUnit] of (draft.proposed.proposedUnits ?? []).entries()) {
    const unitId = uuidv7();
    tx.insert(courseUnits)
      .values({
        id: unitId,
        courseId,
        name: proposedUnit.name,
        summary: proposedUnit.summary ?? null,
        orderIndex: i,
        summativeAssignmentId: null,
      })
      .run();

    // Bind lessons to this unit.
    for (const draftLessonId of proposedUnit.draftLessonIds) {
      const lessonId = draftLessonIdToLessonId.get(draftLessonId);
      if (!lessonId) {
        throw new Error(`unit "${proposedUnit.name}" refs unknown lesson id "${draftLessonId}"`);
      }
      tx.insert(lessonUnits).values({ lessonId, unitId }).run();
    }

    // Materialise summative if present.
    if (proposedUnit.summative) {
      const summativeId = materializeShell({
        kind: proposedUnit.summative.kind,
        title: proposedUnit.summative.title,
        conceptNames: proposedUnit.summative.conceptNames,
      });
      tx.update(courseUnits)
        .set({ summativeAssignmentId: summativeId })
        .where(eq(courseUnits.id, unitId))
        .run();
    }
  }

  // 8. Phase 16: materialise per-lesson assessment shells.
  for (const la of draft.proposed.proposedLessonAssessments ?? []) {
    const lessonId = draftLessonIdToLessonId.get(la.draftLessonId);
    if (!lessonId) {
      throw new Error(
        `lesson assessment "${la.title}" refs unknown lesson id "${la.draftLessonId}"`,
      );
    }
    const assignmentId = materializeShell({
      kind: la.kind,
      title: la.title,
      conceptNames: la.conceptNames,
    });
    tx.insert(lessonAssessments)
      .values({
        id: uuidv7(),
        lessonId,
        assignmentId,
        timing: la.timing,
        purpose: la.purpose,
      })
      .run();
  }

  // 9. Phase 16: write assessment plan onto the course row if present.
  if (draft.proposed.assessmentPlan !== undefined) {
    tx.update(courses)
      .set({
        assessmentPlanJson: draft.proposed.assessmentPlan as unknown as Record<string, unknown>,
      })
      .where(eq(courses.id, courseId))
      .run();
  }

  return {
    courseId: brandId<"CourseId">(courseId),
    lessonIds: lessonRowValues.map((r) => brandId<"LessonId">(r.id)),
    conceptGraphId,
  };
}
