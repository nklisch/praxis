import {
  courseUnits,
  gates as gatesTable,
  lessonProgress,
  lessons,
  lessonUnits,
} from "@praxis/artifacts/schema";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  AssignmentId,
  ConceptId,
  CourseId,
  Lesson,
  LessonId,
  Logger,
  Reference,
  StrategyId,
  Unit,
  UnitId,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import { loadOrThrow } from "./db-helpers.js";

export interface LessonsServiceDeps {
  db: PraxisDb;
  log: Logger;
}

/**
 * LessonsServiceImpl — CRUD and query methods for lessons, units, and lesson
 * assessments. Extracted from ArtifactsServiceImpl as part of the artifacts-
 * service domain decomposition refactor.
 *
 * `deleteLesson` touches the gates table inside a single DB transaction (JSON
 * guard scan — no FK). This cross-table write is acceptable because it is
 * fully atomic and does not call GatesServiceImpl (avoiding a circular dep).
 */
export class LessonsServiceImpl {
  constructor(private readonly deps: LessonsServiceDeps) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  async lessons(courseId: CourseId): Promise<Lesson[]> {
    const rows = this.deps.db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, courseId))
      .orderBy(asc(lessons.orderIndex))
      .all();
    return rows.map(rowToLesson);
  }

  async units(courseId: CourseId): Promise<Unit[]> {
    const unitRows = this.deps.db
      .select()
      .from(courseUnits)
      .where(eq(courseUnits.courseId, courseId))
      .orderBy(asc(courseUnits.orderIndex))
      .all();

    // For each unit, collect its lesson IDs from the join table, preserving lesson order.
    const result: Unit[] = await Promise.all(
      unitRows.map(async (u) => {
        const memberRows = this.deps.db
          .select({ lessonId: lessonUnits.lessonId })
          .from(lessonUnits)
          .innerJoin(lessons, eq(lessonUnits.lessonId, lessons.id))
          .where(eq(lessonUnits.unitId, u.id))
          .orderBy(asc(lessons.orderIndex))
          .all();
        const unit: Unit = {
          id: brandId<"UnitId">(u.id) as UnitId,
          courseId: brandId<"CourseId">(u.courseId) as CourseId,
          name: u.name,
          orderIndex: u.orderIndex,
          lessonIds: memberRows.map((r) => brandId<"LessonId">(r.lessonId) as LessonId),
        };
        if (u.summary != null) unit.summary = u.summary;
        if (u.summativeAssignmentId != null) {
          unit.summativeAssignmentId = brandId<"AssignmentId">(
            u.summativeAssignmentId,
          ) as AssignmentId;
        }
        return unit;
      }),
    );
    return result;
  }

  // ── Snapshot-restore helpers ─────────────────────────────────────────────

  async getLesson(lessonId: LessonId): Promise<Lesson | null> {
    const row = this.deps.db.select().from(lessons).where(eq(lessons.id, lessonId)).get();
    return row ? rowToLesson(row) : null;
  }

  // ── Mutation methods ──────────────────────────────────────────────────────

  /**
   * Create a new lesson in a course.
   * If `orderIndex` is omitted, the lesson is appended at the end (max + 1).
   */
  async createLesson(input: {
    courseId: CourseId;
    title: string;
    conceptIds: ConceptId[];
    orderIndex?: number;
    suggestedStrategy?: StrategyId;
    estimatedMinutes?: number;
    references?: Reference[];
  }): Promise<Lesson> {
    const id = uuidv7();
    const orderIndex = input.orderIndex ?? (await this.nextLessonOrderIndex(input.courseId));
    this.deps.db
      .insert(lessons)
      .values({
        id,
        courseId: input.courseId,
        title: input.title,
        orderIndex,
        conceptIdsJson: input.conceptIds,
        referencesJson: input.references ?? [],
        suggestedStrategy: input.suggestedStrategy ?? brandId<"StrategyId">("default"),
        estimatedMinutes: input.estimatedMinutes ?? 30,
      })
      .run();
    return loadOrThrow(
      async () => {
        const row = this.deps.db.select().from(lessons).where(eq(lessons.id, id)).get();
        return row ? rowToLesson(row) : null;
      },
      { entity: "lesson", op: "create", id, log: this.deps.log },
    );
  }

  /**
   * Patch an existing lesson. Returns the updated Lesson.
   */
  async updateLesson(input: {
    lessonId: LessonId;
    patch: Partial<
      Pick<Lesson, "title" | "conceptIds" | "references" | "suggestedStrategy" | "estimatedMinutes">
    >;
  }): Promise<Lesson> {
    this.deps.db
      .update(lessons)
      .set({
        ...(input.patch.title !== undefined && { title: input.patch.title }),
        ...(input.patch.conceptIds !== undefined && { conceptIdsJson: input.patch.conceptIds }),
        ...(input.patch.references !== undefined && { referencesJson: input.patch.references }),
        ...(input.patch.suggestedStrategy !== undefined && {
          suggestedStrategy: input.patch.suggestedStrategy,
        }),
        ...(input.patch.estimatedMinutes !== undefined && {
          estimatedMinutes: input.patch.estimatedMinutes,
        }),
      })
      .where(eq(lessons.id, input.lessonId))
      .run();
    return loadOrThrow(
      async () => {
        const row = this.deps.db.select().from(lessons).where(eq(lessons.id, input.lessonId)).get();
        return row ? rowToLesson(row) : null;
      },
      { entity: "lesson", op: "update", id: input.lessonId, log: this.deps.log },
    );
  }

  /**
   * Delete a lesson and cascade:
   *   1. Delete lesson_progress rows for this lesson (FK cascades already, but explicit for clarity).
   *   2. Delete gates whose guards.kind === "lesson" and guards.lessonId === lessonId.
   *   3. Delete the lesson row.
   *
   * Note: concept_progress rows are NOT deleted here because concepts may be shared
   * across lessons. Orphan cleanup (if needed) is a Phase 14+ concern.
   *
   * All steps run in a single transaction.
   */
  async deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void> {
    this.deps.db.transaction((tx) => {
      // 1. lesson_progress rows are cascade-deleted via FK, but we run explicitly
      //    for clarity and to ensure any future FK removal doesn't silently miss this.
      tx.delete(lessonProgress).where(eq(lessonProgress.lessonId, input.lessonId)).run();

      // 2. Gates whose guards.lessonId === lessonId (no FK — stored in JSON).
      const allGates = tx.select().from(gatesTable).all();
      const gatesToDelete = allGates
        .filter((g) => {
          const guards = g.guardsJson as { kind: string; lessonId?: string };
          return guards.kind === "lesson" && guards.lessonId === input.lessonId;
        })
        .map((g) => g.id);
      if (gatesToDelete.length > 0) {
        tx.delete(gatesTable).where(inArray(gatesTable.id, gatesToDelete)).run();
      }

      // 3. Delete the lesson row (FK cascade handles lesson_progress if somehow missed).
      tx.delete(lessons).where(eq(lessons.id, input.lessonId)).run();
    });
  }

  /**
   * Upsert a lesson to an exact prior shape. Restores both the lesson row and
   * its courseId linkage. Used by restoreAction to handle re-create-after-delete.
   * The orderIndex from the snapshot is preserved verbatim.
   */
  async upsertLesson(lesson: Lesson): Promise<void> {
    // We need the orderIndex — not part of the Lesson type. We infer it from
    // the current max and use 0 as fallback when the lesson doesn't exist.
    // For restore purposes we use the id as the key and upsert the shape.
    // orderIndex is stored in the DB row; the Lesson type omits it.
    // We preserve the existing orderIndex if the row already exists, otherwise append.
    const existingRow = this.deps.db.select().from(lessons).where(eq(lessons.id, lesson.id)).get();
    const orderIndex =
      existingRow?.orderIndex ?? (await this.nextLessonOrderIndex(lesson.courseId));

    this.deps.db
      .insert(lessons)
      .values({
        id: lesson.id,
        courseId: lesson.courseId,
        title: lesson.title,
        orderIndex,
        conceptIdsJson: lesson.conceptIds,
        referencesJson: lesson.references,
        suggestedStrategy: lesson.suggestedStrategy,
        estimatedMinutes: lesson.estimatedMinutes,
      })
      .onConflictDoUpdate({
        target: lessons.id,
        set: {
          courseId: lesson.courseId,
          title: lesson.title,
          conceptIdsJson: lesson.conceptIds,
          referencesJson: lesson.references,
          suggestedStrategy: lesson.suggestedStrategy,
          estimatedMinutes: lesson.estimatedMinutes,
        },
      })
      .run();
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Next available orderIndex for a lesson in a course.
   * Returns 0 for the first lesson, max(orderIndex) + 1 for subsequent.
   */
  private async nextLessonOrderIndex(courseId: CourseId): Promise<number> {
    const result = this.deps.db
      .select({ maxIndex: max(lessons.orderIndex) })
      .from(lessons)
      .where(eq(lessons.courseId, courseId))
      .get();
    const current = result?.maxIndex ?? null;
    return current === null ? 0 : current + 1;
  }
}

// ── Row-to-domain helpers ──────────────────────────────────────────────────────

function rowToLesson(row: typeof lessons.$inferSelect): Lesson {
  return {
    id: brandId<"LessonId">(row.id),
    courseId: brandId<"CourseId">(row.courseId),
    title: row.title,
    conceptIds: (row.conceptIdsJson as string[]).map((id) => brandId<"ConceptId">(id)),
    // biome-ignore lint/suspicious/noExplicitAny: JSON column parsed at runtime
    references: row.referencesJson as any,
    suggestedStrategy: brandId<"StrategyId">(row.suggestedStrategy),
    estimatedMinutes: row.estimatedMinutes,
  };
}
