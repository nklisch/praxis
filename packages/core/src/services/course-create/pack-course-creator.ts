import { courses, gates, lessons } from "@praxis/artifacts/schema";
import { concepts } from "@praxis/curriculum/schema";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../../db/index.js";
import type { ConceptGraphId, StudentId } from "../../types/index.js";
import { brandId } from "../../types/index.js";

/** Target number of concepts per lesson (5-8 range). */
const LESSON_SIZE = 7;

export interface CreateCourseFromPackInput {
  studentId: StudentId;
  packId: string;
  conceptGraphId: ConceptGraphId;
  courseTitle: string;
  gradeLevel: string;
}

/**
 * Phase 10: Create a course directly from an imported canonical pack.
 * Reads concepts from the already-imported conceptGraphId, groups them into
 * lessons (one per ~7 sequential concepts in pack order), and inserts a
 * course + lessons + skeleton gates in a single transaction.
 */
export async function createCourseFromPack(
  input: CreateCourseFromPackInput,
  db: PraxisDb,
): Promise<{ courseId: string; conceptCount: number }> {
  // Read all concepts for the given graph in order (ordered by id — pack order preserved
  // via lexicographic concept ids which encode pack sequence).
  const conceptRows = db
    .select()
    .from(concepts)
    .where(eq(concepts.graphId, input.conceptGraphId))
    .all();

  if (conceptRows.length === 0) {
    throw new Error(
      `cannot create course from pack: no concepts found for conceptGraphId '${input.conceptGraphId}'. Has pack '${input.packId}' been imported?`,
    );
  }

  const now = new Date();

  const result = db.transaction((tx) => {
    // 1. Course row.
    const courseId = uuidv7();
    tx.insert(courses)
      .values({
        id: courseId,
        studentId: input.studentId,
        title: input.courseTitle,
        subject: input.packId, // pack id used as subject key
        gradeLevel: input.gradeLevel,
        sourceJson: { kind: "canonical_pack", packId: input.packId },
        conceptGraphId: input.conceptGraphId,
        thresholdsJson: {
          conceptMastery: 0.8,
          lessonMastery: 0.75,
          decayDays: 14,
        },
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // 2. Group concepts into lessons (flat sequential grouping).
    const groups: (typeof conceptRows)[] = [];
    for (let i = 0; i < conceptRows.length; i += LESSON_SIZE) {
      groups.push(conceptRows.slice(i, i + LESSON_SIZE));
    }

    const lessonRowValues = groups.map((group, i) => {
      const firstConcept = group[0];
      return {
        id: uuidv7(),
        courseId,
        title: firstConcept ? `Lesson ${i + 1}: ${firstConcept.name}` : `Lesson ${i + 1}`,
        orderIndex: i,
        conceptIdsJson: group.map((c) => c.id),
        referencesJson: [] as string[],
        suggestedStrategy: brandId<"StrategyId">("worked-examples"),
        estimatedMinutes: group.length * 10,
      };
    });

    if (lessonRowValues.length > 0) {
      tx.insert(lessons).values(lessonRowValues).run();
    }

    // 3. Skeleton gates — one per lesson, chained.
    const gateIds = lessonRowValues.map(() => uuidv7());
    const gateRowValues = lessonRowValues.map((l, i) => ({
      // biome-ignore lint/style/noNonNullAssertion: gateIds is same-length as lessonRowValues
      id: gateIds[i]!,
      courseId,
      guardsJson: { kind: "lesson", lessonId: l.id },
      // biome-ignore lint/style/noNonNullAssertion: gateIds[i-1] exists for i > 0
      prerequisitesJson: i > 0 ? [gateIds[i - 1]!] : [],
      successCriteriaJson: {
        kind: "mastery-threshold",
        conceptIds: l.conceptIdsJson,
        minScore: 0.8,
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

    return { courseId, conceptCount: conceptRows.length };
  });

  return {
    courseId: result.courseId,
    conceptCount: result.conceptCount,
  };
}
