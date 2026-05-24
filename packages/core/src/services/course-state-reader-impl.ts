import {
  conceptProgress,
  lessonProgress,
} from "@praxis/artifacts/schema";
import { concepts } from "@praxis/curriculum/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type {
  ConceptId,
  ConceptStateRow,
  CourseId,
  CourseStateReader,
  CourseStateSnapshot,
  LessonId,
  Logger,
  StudentId,
  Timestamp,
  VisibilityWindow,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import type { CoursesServiceImpl } from "./courses-service.js";
import type { GatesServiceImpl } from "./gates-service.js";
import type { LessonsServiceImpl } from "./lessons-service.js";

export interface CourseStateReaderDeps {
  db: PraxisDb;
  log: Logger;
  courses: CoursesServiceImpl;
  lessons: LessonsServiceImpl;
  gates: GatesServiceImpl;
}

/**
 * CourseStateReaderImpl — implements the narrow `CourseStateReader` port used
 * for prompt composition (system brief assembly).
 *
 * Composes data from the three sub-services (CoursesServiceImpl,
 * LessonsServiceImpl, GatesServiceImpl) plus direct DB reads for concept and
 * lesson-progress rows that belong to the snapshot but not to any single
 * sub-service.
 *
 * Extracted from ArtifactsServiceImpl as part of the artifacts-service domain
 * decomposition refactor (Step 5). Step 6 wires this into ArtifactsServiceImpl
 * so the facade delegates `read()` here.
 */
export class CourseStateReaderImpl implements CourseStateReader {
  constructor(private readonly deps: CourseStateReaderDeps) {}

  async read(input: {
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<CourseStateSnapshot | null> {
    const course = await this.deps.courses.course(input.courseId);
    if (!course || course.studentId !== input.studentId) return null;

    const lessonsList = await this.deps.lessons.lessons(input.courseId);

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
    const gateViews = await this.deps.gates.gateView(input);
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
}
