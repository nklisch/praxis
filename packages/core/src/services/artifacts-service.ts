import {
  conceptProgress,
  courses,
  documents,
  gates as gatesTable,
  gateUnlockEvents,
  lessonProgress,
  lessons,
} from "@praxis/artifacts/schema";
import { GateEvaluatorImpl } from "@praxis/curriculum/gates";
import { concepts } from "@praxis/curriculum/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  ArtifactsService,
  ConceptId,
  ConceptStateRow,
  Course,
  CourseId,
  CourseStateReader,
  CourseStateSnapshot,
  CourseSummary,
  DocumentSummaryItem,
  Gate,
  GateId,
  GateState,
  GateTarget,
  GateView,
  Lesson,
  LessonId,
  Logger,
  MasteryReader,
  GradeReader,
  ProgressSnapshot,
  StudentId,
  SuccessCriteria,
  Timestamp,
  VisibilityWindow,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface ArtifactsServiceDeps {
  db: PraxisDb;
  log: Logger;
  /** Phase 9: Injected by buildServices — same instance as MemoryServiceImpl. */
  masteryReader: MasteryReader;
  /** Phase 9: Injected by buildServices — same instance as AssignmentServiceImpl. */
  gradeReader: GradeReader;
}

/**
 * ArtifactsServiceImpl — server-side reads + progress writes for courses,
 * lessons, gates, and concept/lesson progress.
 *
 * Implements both ArtifactsService (full mutation + read surface for tools)
 * and CourseStateReader (narrow read-only handle for prompt composition).
 *
 * Phase 3 dependency exception does NOT apply here — this service lives in
 * @praxis/core/services and only imports from @praxis/artifacts and @praxis/curriculum,
 * which are downstream-of-core (correct direction per CLAUDE.md).
 */
export class ArtifactsServiceImpl implements ArtifactsService, CourseStateReader {
  constructor(private readonly deps: ArtifactsServiceDeps) {}

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

  async lessons(courseId: CourseId): Promise<Lesson[]> {
    const rows = this.deps.db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, courseId))
      .orderBy(asc(lessons.orderIndex))
      .all();
    return rows.map(rowToLesson);
  }

  async gates(courseId: CourseId): Promise<Gate[]> {
    const rows = this.deps.db.select().from(gatesTable).where(eq(gatesTable.courseId, courseId)).all();
    return rows.map(rowToGate);
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

  // ── Phase 9: Gate methods ────────────────────────────────────────────────

  /**
   * Computed enriched view of all gates for a course.
   * Pure read — runs the evaluator against current state but does NOT persist.
   */
  async gateView(input: { studentId: StudentId; courseId: CourseId }): Promise<GateView[]> {
    const gatesList = await this.gates(input.courseId);
    if (gatesList.length === 0) return [];

    const evaluator = new GateEvaluatorImpl();
    const result = await evaluator.evaluate({
      studentId: input.studentId,
      gates: gatesList,
      masteryReader: this.deps.masteryReader,
      gradeReader: this.deps.gradeReader,
      now: Date.now() as Timestamp,
      log: this.deps.log,
    });

    // Identify the active gate: first locked gate whose prerequisites are all unlocked.
    // A gate is "active" when it's the one the student is currently working toward.
    let activeGateIdx = -1;
    for (let i = 0; i < result.perGate.length; i++) {
      const e = result.perGate[i]!;
      const isLocked = e.afterState.kind === "locked";
      // Active = locked and NOT blocked by prerequisite gates (i.e., its prereqs are all unlocked).
      const blockedByPrereqs =
        isLocked &&
        (e.afterState as Extract<typeof e.afterState, { kind: "locked" }>).missingPrerequisites
          .length > 0;
      if (isLocked && !blockedByPrereqs) {
        activeGateIdx = i;
        break;
      }
    }

    return result.perGate.map((entry, i) => ({
      gate: gatesList[i]!,
      summaryText: entry.summaryText,
      lockReason: entry.lockReason,
      progress: entry.progress,
      isActive: i === activeGateIdx,
    }));
  }

  /**
   * Run gate evaluation for the course, persist transitions atomically,
   * write gate_unlock_events for newly-unlocked gates.
   * Returns the unlocked gate IDs from this evaluation.
   * Idempotent: evaluating the same state twice produces no new transitions.
   */
  async evaluateAndPersistGates(input: {
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<{ unlockedGateIds: GateId[] }> {
    const gatesList = await this.gates(input.courseId);
    if (gatesList.length === 0) return { unlockedGateIds: [] };

    const evaluator = new GateEvaluatorImpl();
    const result = await evaluator.evaluate({
      studentId: input.studentId,
      gates: gatesList,
      masteryReader: this.deps.masteryReader,
      gradeReader: this.deps.gradeReader,
      now: Date.now() as Timestamp,
      log: this.deps.log,
    });

    if (result.transitions.length === 0) {
      // No-op: no state changes — avoid unnecessary writes.
      return { unlockedGateIds: [] };
    }

    // Atomic write: all state changes + unlock event rows in one transaction.
    return this.deps.db.transaction((tx) => {
      const unlockedGateIds: GateId[] = [];

      // Update gate state rows that changed.
      for (const entry of result.perGate) {
        if (entry.beforeState.kind === entry.afterState.kind) continue;
        tx.update(gatesTable)
          .set({ stateJson: entry.afterState })
          .where(eq(gatesTable.id, entry.gateId))
          .run();
      }

      // Write gate_unlock_events for each newly unlocked gate.
      for (const transition of result.transitions) {
        if (transition.kind !== "unlocked") continue;
        tx
          .insert(gateUnlockEvents)
          .values({
            id: uuidv7(),
            studentId: input.studentId,
            courseId: input.courseId,
            gateId: transition.gateId,
            unlockedAt: new Date(transition.at),
            evidenceJson: transition.evidence as Array<{
              kind: "event" | "assignment" | "manual";
              id: string;
            }>,
          })
          .run();
        unlockedGateIds.push(transition.gateId);
      }

      return { unlockedGateIds };
    });
  }

  /**
   * Mark all unviewed unlock events for a (student, course) pair as viewed.
   * Used by the courses-list UI to clear the "newly unlocked" badge.
   */
  async markGatesViewed(input: { studentId: StudentId; courseId: CourseId }): Promise<void> {
    this.deps.db
      .update(gateUnlockEvents)
      .set({ viewedAt: new Date() })
      .where(
        and(
          eq(gateUnlockEvents.studentId, input.studentId),
          eq(gateUnlockEvents.courseId, input.courseId),
          isNull(gateUnlockEvents.viewedAt),
        ),
      )
      .run();
  }

  /**
   * Count of unlock events for a course that the student hasn't viewed yet.
   * Returns 0 when all events have been viewed or none exist.
   */
  async newlyUnlockedCount(input: { studentId: StudentId; courseId: CourseId }): Promise<number> {
    const rows = this.deps.db
      .select()
      .from(gateUnlockEvents)
      .where(
        and(
          eq(gateUnlockEvents.studentId, input.studentId),
          eq(gateUnlockEvents.courseId, input.courseId),
          isNull(gateUnlockEvents.viewedAt),
        ),
      )
      .all();
    return rows.length;
  }

  // ── CourseStateReader ─────────────────────────────────────────────────────

  async read(input: {
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<CourseStateSnapshot | null> {
    const course = await this.course(input.courseId);
    if (!course || course.studentId !== input.studentId) return null;
    const lessonsList = await this.lessons(input.courseId);

    // Concept rows for every concept referenced by this course's lessons.
    const allConceptIds = lessonsList.flatMap((l) => l.conceptIds);
    const conceptRows =
      allConceptIds.length === 0
        ? []
        : this.deps.db.select().from(concepts).where(inArray(concepts.id, allConceptIds)).all();
    const conceptById = new Map(conceptRows.map((c) => [c.id, c]));

    // Studied concept set for this student.
    const studiedRows =
      allConceptIds.length === 0
        ? []
        : this.deps.db
            .select()
            .from(conceptProgress)
            .where(
              and(
                eq(conceptProgress.studentId, input.studentId),
                inArray(conceptProgress.conceptId, allConceptIds),
              ),
            )
            .all();
    const studiedById = new Map(studiedRows.map((s) => [s.conceptId, s]));

    // Build per-lesson + flat indexes.
    const conceptsByLesson = new Map<LessonId, ConceptStateRow[]>();
    const conceptsById = new Map<ConceptId, ConceptStateRow>();
    for (const lesson of lessonsList) {
      const rows: ConceptStateRow[] = lesson.conceptIds.map((conceptId) => {
        const c = conceptById.get(conceptId);
        const s = studiedById.get(conceptId);
        const row: ConceptStateRow = {
          conceptId,
          name: c?.name ?? "(unknown)",
          description: c?.description ?? "",
          studied: !!s,
          ...(s?.studiedAt && { studiedAt: s.studiedAt.getTime() as Timestamp }),
          lessonId: lesson.id,
        };
        conceptsById.set(conceptId, row);
        return row;
      });
      conceptsByLesson.set(lesson.id, rows);
    }

    // Current lesson = first lesson whose progress.status != "completed".
    const lessonStatusRows =
      lessonsList.length === 0
        ? []
        : this.deps.db
            .select()
            .from(lessonProgress)
            .where(
              and(
                eq(lessonProgress.studentId, input.studentId),
                inArray(
                  lessonProgress.lessonId,
                  lessonsList.map((l) => l.id),
                ),
              ),
            )
            .all();
    const lessonStatusById = new Map(lessonStatusRows.map((r) => [r.lessonId, r.status]));
    const currentLesson =
      lessonsList.find((l) => (lessonStatusById.get(l.id) ?? "not_started") !== "completed") ??
      null;

    // Phase 9: gate views and visibility window.
    const gateViews = await this.gateView(input);
    const activeGate = gateViews.find((g) => g.isActive) ?? null;

    const currentLessonIndex = lessonsList.findIndex((l) => l.id === currentLesson?.id);
    const visibilityWindow: VisibilityWindow = {
      currentLessonIndex: currentLessonIndex >= 0 ? currentLessonIndex : 0,
      remainingCount: Math.max(0, lessonsList.length - (currentLessonIndex + 2)),
    };

    return {
      course,
      lessons: lessonsList,
      currentLesson,
      conceptsByLesson,
      conceptsById,
      gates: gateViews,
      activeGate,
      visibilityWindow,
    };
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

function rowToCourse(row: typeof courses.$inferSelect): Course {
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

function rowToGate(row: typeof gatesTable.$inferSelect): Gate {
  const gateIdBrand = (id: string) => brandId<"GateId">(id);
  return {
    id: gateIdBrand(row.id),
    courseId: brandId<"CourseId">(row.courseId),
    guards: row.guardsJson as GateTarget,
    prerequisites: (row.prerequisitesJson as string[]).map(gateIdBrand) as GateId[],
    successCriteria: row.successCriteriaJson as SuccessCriteria,
    state: row.stateJson as GateState,
    evidence: row.evidenceJson as Array<{ kind: "event" | "assignment" | "manual"; id: string }>,
  };
}
