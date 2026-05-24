import type {
  ArtifactsService,
  Course,
  CourseId,
  CourseStateReader,
  CourseStateSnapshot,
  CourseSummary,
  DocumentSummaryItem,
  Gate,
  GateId,
  GateView,
  Lesson,
  LessonAssessment,
  LessonId,
  ProgressSnapshot,
  StudentId,
  ThresholdConfig,
} from "../types/index.js";
import type { CourseStateReaderImpl } from "./course-state-reader-impl.js";
import type { CoursesServiceImpl } from "./courses-service.js";
import type { GatesServiceImpl } from "./gates-service.js";
import type { LessonAssessmentsServiceImpl } from "./lesson-assessments-service.js";
import type { LessonsServiceImpl } from "./lessons-service.js";

export interface ArtifactsServiceDeps {
  courses: CoursesServiceImpl;
  lessons: LessonsServiceImpl;
  gates: GatesServiceImpl;
  lessonAssessments: LessonAssessmentsServiceImpl;
  courseStateReader: CourseStateReaderImpl;
}

/**
 * ArtifactsServiceImpl — thin facade that delegates every public method to
 * one of the five domain sub-services.
 *
 * Implements both ArtifactsService (full mutation + read surface for tools)
 * and CourseStateReader (narrow read-only handle for prompt composition).
 *
 * `getCourseSummary` is the only cross-domain aggregator retained at the
 * facade layer — it fans out to courses, lessons, gates, and concepts in
 * parallel, which would require circular deps if delegated to a single
 * sub-service.
 *
 * Phase 3 dependency exception does NOT apply here — this service lives in
 * @praxis/core/services and only imports from @praxis/artifacts and @praxis/curriculum,
 * which are downstream-of-core (correct direction per CLAUDE.md).
 */
export class ArtifactsServiceImpl implements ArtifactsService, CourseStateReader {
  constructor(private readonly deps: ArtifactsServiceDeps) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  course(id: CourseId): Promise<Course | null> {
    return this.deps.courses.course(id);
  }

  courses(studentId: StudentId): Promise<CourseSummary[]> {
    return this.deps.courses.courses(studentId);
  }

  lessons(courseId: CourseId): Promise<Lesson[]> {
    return this.deps.lessons.lessons(courseId);
  }

  units(courseId: CourseId) {
    return this.deps.lessons.units(courseId);
  }

  lessonAssessments(lessonId: LessonId): Promise<LessonAssessment[]> {
    return this.deps.lessonAssessments.lessonAssessments(lessonId);
  }

  gates(courseId: CourseId): Promise<Gate[]> {
    return this.deps.gates.gates(courseId);
  }

  progress(studentId: StudentId): Promise<ProgressSnapshot> {
    return this.deps.courses.progress(studentId);
  }

  listDocuments(studentId: StudentId): Promise<DocumentSummaryItem[]> {
    return this.deps.courses.listDocuments(studentId);
  }

  // ── Progress writes ───────────────────────────────────────────────────────

  markLessonStarted(input: { studentId: StudentId; lessonId: LessonId }): Promise<void> {
    return this.deps.courses.markLessonStarted(input);
  }

  markConceptStudied(input: {
    studentId: StudentId;
    conceptId: Parameters<CoursesServiceImpl["markConceptStudied"]>[0]["conceptId"];
    evidenceEventId?: string;
  }): ReturnType<CoursesServiceImpl["markConceptStudied"]> {
    return this.deps.courses.markConceptStudied(input);
  }

  // ── Phase 9: Gate methods ─────────────────────────────────────────────────

  gateView(input: { studentId: StudentId; courseId: CourseId }): Promise<GateView[]> {
    return this.deps.gates.gateView(input);
  }

  evaluateAndPersistGates(input: {
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<{ unlockedGateIds: GateId[] }> {
    return this.deps.gates.evaluateAndPersistGates(input);
  }

  markGatesViewed(input: { studentId: StudentId; courseId: CourseId }): Promise<void> {
    return this.deps.gates.markGatesViewed(input);
  }

  newlyUnlockedCount(input: { studentId: StudentId; courseId: CourseId }): Promise<number> {
    return this.deps.gates.newlyUnlockedCount(input);
  }

  // ── Phase 10: Concept list ────────────────────────────────────────────────

  concepts(courseId: CourseId): ReturnType<CoursesServiceImpl["concepts"]> {
    return this.deps.courses.concepts(courseId);
  }

  // ── Phase 11: Configurator write methods ─────────────────────────────────

  updateCourse(input: {
    courseId: CourseId;
    patch: Partial<
      Pick<Course, "title"> & { subject: string; gradeLevel: string; thresholds: ThresholdConfig }
    >;
    reason?: string;
  }): Promise<Course> {
    return this.deps.courses.updateCourse(input);
  }

  createLesson(input: Parameters<LessonsServiceImpl["createLesson"]>[0]): Promise<Lesson> {
    return this.deps.lessons.createLesson(input);
  }

  updateLesson(input: Parameters<LessonsServiceImpl["updateLesson"]>[0]): Promise<Lesson> {
    return this.deps.lessons.updateLesson(input);
  }

  deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void> {
    return this.deps.lessons.deleteLesson(input);
  }

  createGate(input: Parameters<GatesServiceImpl["createGate"]>[0]): Promise<Gate> {
    return this.deps.gates.createGate(input);
  }

  updateGate(input: Parameters<GatesServiceImpl["updateGate"]>[0]): Promise<Gate> {
    return this.deps.gates.updateGate(input);
  }

  deleteGate(input: { gateId: GateId; reason?: string }): Promise<void> {
    return this.deps.gates.deleteGate(input);
  }

  overrideGate(input: Parameters<GatesServiceImpl["overrideGate"]>[0]): Promise<Gate> {
    return this.deps.gates.overrideGate(input);
  }

  /**
   * Full course snapshot for the configure UI's editor pane.
   * Cross-domain aggregator — fans out to courses, lessons, gates, and
   * concepts in parallel. Retained at the facade because it spans all four
   * sub-services.
   */
  async getCourseSummary(courseId: CourseId): Promise<{
    course: Course;
    lessons: Lesson[];
    gates: Gate[];
    concepts: Array<{
      id: string;
      graphId: string;
      name: string;
      description: string;
      aliases: string[];
      standardsTags: string[];
    }>;
  }> {
    const course = await this.deps.courses.course(courseId);
    if (!course) throw new Error(`Course not found: ${courseId}`);
    const [lessonsList, gatesList, conceptsList] = await Promise.all([
      this.deps.lessons.lessons(courseId),
      this.deps.gates.gates(courseId),
      this.deps.courses.concepts(courseId),
    ]);
    return { course, lessons: lessonsList, gates: gatesList, concepts: conceptsList };
  }

  // ── Snapshot-restore helpers ─────────────────────────────────────────────

  getLesson(lessonId: LessonId): Promise<Lesson | null> {
    return this.deps.lessons.getLesson(lessonId);
  }

  getGate(gateId: GateId): Promise<Gate | null> {
    return this.deps.gates.getGate(gateId);
  }

  upsertLesson(lesson: Lesson): Promise<void> {
    return this.deps.lessons.upsertLesson(lesson);
  }

  upsertGate(gate: Gate): Promise<void> {
    return this.deps.gates.upsertGate(gate);
  }

  // ── CourseStateReader ─────────────────────────────────────────────────────

  read(input: {
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<CourseStateSnapshot | null> {
    return this.deps.courseStateReader.read(input);
  }
}
