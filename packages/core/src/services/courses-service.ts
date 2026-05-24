import {
  conceptProgress,
  courses,
  documents,
  lessonProgress,
  lessons,
} from "@praxis/artifacts/schema";
import { concepts } from "@praxis/curriculum/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type {
  ConceptId,
  Course,
  CourseId,
  CourseSummary,
  DocumentSummaryItem,
  LessonId,
  Logger,
  ProgressSnapshot,
  StudentId,
  ThresholdConfig,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import { loadOrThrow } from "./db-helpers.js";

export interface CoursesServiceDeps {
  db: PraxisDb;
  log: Logger;
}

/**
 * CoursesServiceImpl — course-domain reads and writes extracted from
 * ArtifactsServiceImpl as part of the domain-decomposition refactor.
 *
 * Covers: course reads, progress reads, document listing, course metadata
 * updates, concept queries, and lesson/concept progress writes whose
 * roll-up belongs in the course domain.
 *
 * Constructed with just `{ db, log }` — no cross-service deps needed.
 */
export class CoursesServiceImpl {
  constructor(private readonly deps: CoursesServiceDeps) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  async course(id: CourseId): Promise<Course | null> {
    const row = this.deps.db.select().from(courses).where(eq(courses.id, id)).get();
    if (!row) return null;
    return rowToCourse(row);
  }

  async courses(studentId: StudentId): Promise<CourseSummary[]> {
    const rows = this.deps.db.select().from(courses).where(eq(courses.studentId, studentId)).all();
    return Promise.all(rows.map((c) => this.summarizeCourse(c, studentId)));
  }

  async progress(studentId: StudentId): Promise<ProgressSnapshot> {
    const cs = this.deps.db.select().from(courses).where(eq(courses.studentId, studentId)).all();
    const courseProgress = await Promise.all(
      cs.map(async (c) => {
        const summary = await this.summarizeCourse(c, studentId);
        return {
          courseId: brandId<"CourseId">(c.id),
          masteredConceptCount: 0, // Phase 7
          inProgressConceptCount: summary.studiedConcepts,
          lockedConceptCount: Math.max(0, summary.conceptCount - summary.studiedConcepts),
          // nextRecommended computed in Phase 9 router; omitted in Phase 6.
        };
      }),
    );
    return { studentId, courseProgress, recentUnlocks: [] };
  }

  async listDocuments(studentId: StudentId): Promise<DocumentSummaryItem[]> {
    const rows = this.deps.db
      .select()
      .from(documents)
      .where(eq(documents.studentId, studentId))
      .all();
    return rows.map((r) => {
      const manifest = r.manifestJson as { hasPageImages?: boolean } | null;
      return {
        documentId: brandId<"DocumentId">(r.id),
        filename: r.filename,
        mimeType: r.mimeType,
        chunkCount: r.chunkCount,
        hasPageImages: manifest?.hasPageImages === true,
      };
    });
  }

  // ── Phase 10: Concept list ────────────────────────────────────────────────

  /**
   * Return all concepts for a course, joined via the course's conceptGraphId.
   * Concept ids are prefixed for canonical packs ("<graphId>:pack-id.concept-id")
   * and are plain UUIDs for extracted courses. Treat as opaque strings.
   */
  async concepts(courseId: CourseId): Promise<
    Array<{
      id: string;
      graphId: string;
      name: string;
      description: string;
      aliases: string[];
      standardsTags: string[];
    }>
  > {
    const course = await this.course(courseId);
    if (!course) return [];

    const rows = this.deps.db
      .select()
      .from(concepts)
      .where(eq(concepts.graphId, course.conceptGraphId))
      .all();

    return rows.map((r) => ({
      id: r.id,
      graphId: r.graphId,
      name: r.name,
      description: r.description,
      aliases: r.aliasesJson as string[],
      standardsTags: r.standardsTagsJson as string[],
    }));
  }

  // ── Phase 11: Configurator write methods ─────────────────────────────────

  /**
   * Update course metadata. Returns the updated Course.
   * `patch` fields are applied selectively — omitted fields are unchanged.
   */
  async updateCourse(input: {
    courseId: CourseId;
    patch: Partial<
      Pick<Course, "title"> & { subject: string; gradeLevel: string; thresholds: ThresholdConfig }
    >;
    reason?: string;
  }): Promise<Course> {
    const now = new Date();
    this.deps.db
      .update(courses)
      .set({
        ...(input.patch.title !== undefined && { title: input.patch.title }),
        ...(input.patch.subject !== undefined && { subject: input.patch.subject }),
        ...(input.patch.gradeLevel !== undefined && { gradeLevel: input.patch.gradeLevel }),
        ...(input.patch.thresholds !== undefined && { thresholdsJson: input.patch.thresholds }),
        updatedAt: now,
      })
      .where(eq(courses.id, input.courseId))
      .run();
    return loadOrThrow(() => this.course(input.courseId), {
      entity: "course",
      op: "update",
      id: input.courseId,
      log: this.deps.log,
    });
  }

  // ── Progress writes ───────────────────────────────────────────────────────

  async markLessonStarted(input: { studentId: StudentId; lessonId: LessonId }): Promise<void> {
    const now = new Date();
    this.deps.db
      .insert(lessonProgress)
      .values({
        studentId: input.studentId,
        lessonId: input.lessonId,
        status: "in_progress",
        startedAt: now,
      })
      .onConflictDoUpdate({
        target: [lessonProgress.studentId, lessonProgress.lessonId],
        set: { status: "in_progress", startedAt: now },
      })
      .run();
  }

  async markConceptStudied(input: {
    studentId: StudentId;
    conceptId: ConceptId;
    evidenceEventId?: string;
  }): Promise<{ lessonComplete: boolean; lessonId: LessonId | null }> {
    const now = new Date();
    const evidence: string[] = input.evidenceEventId ? [input.evidenceEventId] : [];

    // Append-merge evidence on conflict (idempotent re-marks).
    const existing = this.deps.db
      .select()
      .from(conceptProgress)
      .where(
        and(
          eq(conceptProgress.studentId, input.studentId),
          eq(conceptProgress.conceptId, input.conceptId),
        ),
      )
      .get();

    const merged = existing
      ? Array.from(new Set([...(existing.evidenceJson as string[]), ...evidence]))
      : evidence;

    this.deps.db
      .insert(conceptProgress)
      .values({
        studentId: input.studentId,
        conceptId: input.conceptId,
        studiedAt: now,
        evidenceJson: merged,
      })
      .onConflictDoUpdate({
        target: [conceptProgress.studentId, conceptProgress.conceptId],
        set: { studiedAt: now, evidenceJson: merged },
      })
      .run();

    // Find the lesson that contains this concept and check completion.
    const lessonRow = this.findLessonContainingConcept(input.conceptId);
    if (!lessonRow) return { lessonComplete: false, lessonId: null };

    const conceptIds = lessonRow.conceptIdsJson as string[];
    if (conceptIds.length === 0)
      return { lessonComplete: false, lessonId: brandId<"LessonId">(lessonRow.id) };

    const studied = this.deps.db
      .select()
      .from(conceptProgress)
      .where(
        and(
          eq(conceptProgress.studentId, input.studentId),
          inArray(conceptProgress.conceptId, conceptIds),
        ),
      )
      .all();

    const lessonComplete = studied.length === conceptIds.length;
    if (lessonComplete) {
      this.deps.db
        .update(lessonProgress)
        .set({ status: "completed", completedAt: now })
        .where(
          and(
            eq(lessonProgress.studentId, input.studentId),
            eq(lessonProgress.lessonId, lessonRow.id),
          ),
        )
        .run();
    }
    return { lessonComplete, lessonId: brandId<"LessonId">(lessonRow.id) };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Scan small lessons table; conceptIdsJson is JSON-stored. */
  private findLessonContainingConcept(conceptId: ConceptId): typeof lessons.$inferSelect | null {
    const rows = this.deps.db.select().from(lessons).all();
    return (
      rows.find(
        (l) =>
          Array.isArray(l.conceptIdsJson) && (l.conceptIdsJson as string[]).includes(conceptId),
      ) ?? null
    );
  }

  private async summarizeCourse(
    row: typeof courses.$inferSelect,
    studentId: StudentId,
  ): Promise<CourseSummary> {
    const lessonRows = this.deps.db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, row.id))
      .all();
    const conceptIds = new Set<string>();
    for (const lr of lessonRows) {
      for (const c of lr.conceptIdsJson as string[]) {
        conceptIds.add(c);
      }
    }
    const studiedRows =
      conceptIds.size === 0
        ? []
        : this.deps.db
            .select()
            .from(conceptProgress)
            .where(
              and(
                eq(conceptProgress.studentId, studentId),
                inArray(conceptProgress.conceptId, [...conceptIds]),
              ),
            )
            .all();
    return {
      courseId: brandId<"CourseId">(row.id),
      title: row.title,
      subject: row.subject,
      gradeLevel: row.gradeLevel,
      lessonCount: lessonRows.length,
      conceptCount: conceptIds.size,
      studiedConcepts: studiedRows.length,
      createdAt: row.createdAt.getTime() as Timestamp,
    };
  }
}

// ── Row-to-domain helpers ──────────────────────────────────────────────────────

export function rowToCourse(row: typeof courses.$inferSelect): Course {
  return {
    id: brandId<"CourseId">(row.id),
    studentId: brandId<"StudentId">(row.studentId),
    title: row.title,
    subject: brandId<"SubjectId">(row.subject),
    gradeLevel: row.gradeLevel as Course["gradeLevel"],
    // biome-ignore lint/suspicious/noExplicitAny: JSON column parsed at runtime
    source: row.sourceJson as any,
    lessons: [], // callers use ArtifactsService.lessons(courseId) for the lesson list
    conceptGraphId: brandId<"ConceptGraphId">(row.conceptGraphId),
    gates: [], // callers use ArtifactsService.gates(courseId)
    // biome-ignore lint/suspicious/noExplicitAny: JSON column parsed at runtime
    thresholds: row.thresholdsJson as any,
    createdAt: row.createdAt.getTime() as Timestamp,
    updatedAt: row.updatedAt.getTime() as Timestamp,
  };
}
