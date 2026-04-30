import type {
  AuthoringClient,
  BootstrapOpts,
  ConceptId,
  ConfiguratorActionRow,
  Course,
  CourseId,
  CreateCourseInput,
  DraftCourse,
  FileRef,
  Gate,
  GateId,
  GateTarget,
  Lesson,
  LessonId,
  MisconceptionId,
  Reference,
  StrategyId,
  SuccessCriteria,
  ThresholdConfig,
  Timestamp,
} from "@praxis/core/types";

/**
 * AuthoringClient stub — Phase 3 / Phase 11.
 *
 * Phase 3 methods remain as stubs; Phase 11 real implementations are wired
 * by Agent 2 via IPC transport. All methods reject until then.
 */
export class AuthoringClientImpl implements AuthoringClient {
  // ── Phase 3 surface ───────────────────────────────────────────────────────

  createCourse(_input: CreateCourseInput): Promise<Course> {
    return Promise.reject(new Error("AuthoringClient.createCourse not implemented"));
  }

  editGate(_id: GateId, _patch: Partial<Gate>): Promise<Gate> {
    return Promise.reject(new Error("AuthoringClient.editGate not implemented"));
  }

  bootstrap(_files: FileRef[], _opts: BootstrapOpts): Promise<DraftCourse> {
    return Promise.reject(new Error("AuthoringClient.bootstrap not implemented"));
  }

  customizePrompt(_modeId: string, _fragmentId: string, _override: string): Promise<void> {
    return Promise.reject(new Error("AuthoringClient.customizePrompt not implemented"));
  }

  // ── Phase 11: course / lesson / gate edits ────────────────────────────────

  updateCourse(_input: {
    courseId: CourseId;
    patch: Partial<
      Pick<Course, "title"> & { subject: string; gradeLevel: string; thresholds: ThresholdConfig }
    >;
    reason?: string;
  }): Promise<Course> {
    return Promise.reject(new Error("AuthoringClient.updateCourse not implemented"));
  }

  createLesson(_input: {
    courseId: CourseId;
    title: string;
    conceptIds: ConceptId[];
    orderIndex?: number;
    suggestedStrategy?: StrategyId;
    estimatedMinutes?: number;
    references?: Reference[];
  }): Promise<Lesson> {
    return Promise.reject(new Error("AuthoringClient.createLesson not implemented"));
  }

  updateLesson(_input: {
    lessonId: LessonId;
    patch: Partial<
      Pick<Lesson, "title" | "conceptIds" | "references" | "suggestedStrategy" | "estimatedMinutes">
    >;
  }): Promise<Lesson> {
    return Promise.reject(new Error("AuthoringClient.updateLesson not implemented"));
  }

  deleteLesson(_input: { lessonId: LessonId; reason?: string }): Promise<void> {
    return Promise.reject(new Error("AuthoringClient.deleteLesson not implemented"));
  }

  createGate(_input: {
    courseId: CourseId;
    guards: GateTarget;
    prerequisites: GateId[];
    successCriteria: SuccessCriteria;
  }): Promise<Gate> {
    return Promise.reject(new Error("AuthoringClient.createGate not implemented"));
  }

  updateGate(_input: {
    gateId: GateId;
    patch: Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">>;
    reason?: string;
  }): Promise<Gate> {
    return Promise.reject(new Error("AuthoringClient.updateGate not implemented"));
  }

  deleteGate(_input: { gateId: GateId; reason?: string }): Promise<void> {
    return Promise.reject(new Error("AuthoringClient.deleteGate not implemented"));
  }

  overrideGate(_input: { gateId: GateId; reason: string }): Promise<Gate> {
    return Promise.reject(new Error("AuthoringClient.overrideGate not implemented"));
  }

  getCourseSummary(_courseId: CourseId): Promise<{
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
    return Promise.reject(new Error("AuthoringClient.getCourseSummary not implemented"));
  }

  // ── Phase 11: prompt customization ───────────────────────────────────────

  clearFragmentOverride(_input: { modeId: string; fragmentId: string }): Promise<void> {
    return Promise.reject(new Error("AuthoringClient.clearFragmentOverride not implemented"));
  }

  setStyleSliders(_input: {
    socratic: number;
    verbosity: number;
    formality: number;
  }): Promise<void> {
    return Promise.reject(new Error("AuthoringClient.setStyleSliders not implemented"));
  }

  // ── Phase 11: memory administration ──────────────────────────────────────

  resetConcept(_input: { conceptId: ConceptId; reason: string }): Promise<void> {
    return Promise.reject(new Error("AuthoringClient.resetConcept not implemented"));
  }

  clearMisconception(_input: { misconceptionId: MisconceptionId; reason: string }): Promise<void> {
    return Promise.reject(new Error("AuthoringClient.clearMisconception not implemented"));
  }

  exportMemory(_input: { targetPath: string }): Promise<{ ok: true; bytesWritten: number }> {
    return Promise.reject(new Error("AuthoringClient.exportMemory not implemented"));
  }

  deleteAllMemory(_input: { reason: string; confirm: true }): Promise<void> {
    return Promise.reject(new Error("AuthoringClient.deleteAllMemory not implemented"));
  }

  // ── Phase 11: audit log ───────────────────────────────────────────────────

  listConfiguratorActions(_input?: {
    fromTs?: Timestamp;
    limit?: number;
  }): Promise<ConfiguratorActionRow[]> {
    return Promise.reject(new Error("AuthoringClient.listConfiguratorActions not implemented"));
  }
}
