import type {
  AuthoringClient,
  ConceptId,
  ConfiguratorActionRow,
  Course,
  CourseId,
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
import type { ClientTransport } from "../transport/types.js";

const C = "praxis.author" as const;

/**
 * AuthoringClient — Phase 11 real implementation.
 *
 * Replaces the Phase 3 stub. Backed by `praxis.author.*` IPC channels.
 * The server-side AuthoringServiceImpl enforces:
 *   1. Lock check (requireUnlocked in ipc-server.ts).
 *   2. Audit-log write after every successful mutation.
 *
 * Phase 3 surface methods (createCourse, editGate, bootstrap) are intentionally
 * not wired here — those flows use bootstrap mode tools or the agent loop.
 * They throw to surface misuse loudly.
 *
 * Channel convention: praxis.author.{method}
 */
export class AuthoringClientImpl implements AuthoringClient {
  constructor(private readonly transport: ClientTransport) {}

  // ── Phase 3 surface — not the v1 path ────────────────────────────────────

  createCourse(): Promise<Course> {
    return Promise.reject(
      new Error(
        "createCourse: use bootstrap mode (course.start_exploration flow) or course.use_canonical_pack. Phase 11 AuthoringClient does not expose this directly.",
      ),
    );
  }

  editGate(id: GateId, patch: Partial<Gate>): Promise<Gate> {
    // Delegate to the Phase 11 updateGate path.
    return this.updateGate({
      gateId: id,
      patch: patch as Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">>,
    });
  }

  bootstrap(): Promise<never> {
    return Promise.reject(
      new Error(
        "bootstrap: use bootstrap mode agent loop or course.use_canonical_pack. Phase 11 AuthoringClient does not expose this directly.",
      ),
    );
  }

  customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void> {
    return this.transport.invoke<void>(`${C}.customizePrompt`, { modeId, fragmentId, override });
  }

  // ── Phase 11: course / lesson / gate edits ────────────────────────────────

  updateCourse(input: {
    courseId: CourseId;
    patch: Partial<
      Pick<Course, "title"> & { subject: string; gradeLevel: string; thresholds: ThresholdConfig }
    >;
    reason?: string;
  }): Promise<Course> {
    return this.transport.invoke<Course>(`${C}.updateCourse`, input);
  }

  createLesson(input: {
    courseId: CourseId;
    title: string;
    conceptIds: ConceptId[];
    orderIndex?: number;
    suggestedStrategy?: StrategyId;
    estimatedMinutes?: number;
    references?: Reference[];
  }): Promise<Lesson> {
    return this.transport.invoke<Lesson>(`${C}.createLesson`, input);
  }

  updateLesson(input: {
    lessonId: LessonId;
    patch: Partial<
      Pick<Lesson, "title" | "conceptIds" | "references" | "suggestedStrategy" | "estimatedMinutes">
    >;
  }): Promise<Lesson> {
    return this.transport.invoke<Lesson>(`${C}.updateLesson`, input);
  }

  deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void> {
    return this.transport.invoke<void>(`${C}.deleteLesson`, input);
  }

  createGate(input: {
    courseId: CourseId;
    guards: GateTarget;
    prerequisites: GateId[];
    successCriteria: SuccessCriteria;
  }): Promise<Gate> {
    return this.transport.invoke<Gate>(`${C}.createGate`, input);
  }

  updateGate(input: {
    gateId: GateId;
    patch: Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">>;
    reason?: string;
  }): Promise<Gate> {
    return this.transport.invoke<Gate>(`${C}.updateGate`, input);
  }

  deleteGate(input: { gateId: GateId; reason?: string }): Promise<void> {
    return this.transport.invoke<void>(`${C}.deleteGate`, input);
  }

  overrideGate(input: { gateId: GateId; reason: string }): Promise<Gate> {
    return this.transport.invoke<Gate>(`${C}.overrideGate`, input);
  }

  getCourseSummary(courseId: CourseId): Promise<{
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
    return this.transport.invoke(`${C}.getCourseSummary`, courseId);
  }

  // ── Phase 11: prompt customization ───────────────────────────────────────

  clearFragmentOverride(input: { modeId: string; fragmentId: string }): Promise<void> {
    return this.transport.invoke<void>(`${C}.clearFragmentOverride`, input);
  }

  setStyleSliders(input: {
    socratic: number;
    verbosity: number;
    formality: number;
  }): Promise<void> {
    return this.transport.invoke<void>(`${C}.setStyleSliders`, input);
  }

  // ── Phase 11: memory administration ──────────────────────────────────────

  resetConcept(input: { conceptId: ConceptId; reason: string }): Promise<void> {
    return this.transport.invoke<void>(`${C}.resetConcept`, input);
  }

  clearMisconception(input: { misconceptionId: MisconceptionId; reason: string }): Promise<void> {
    return this.transport.invoke<void>(`${C}.clearMisconception`, input);
  }

  exportMemory(input: { targetPath: string }): Promise<{ ok: true; bytesWritten: number }> {
    return this.transport.invoke<{ ok: true; bytesWritten: number }>(`${C}.exportMemory`, input);
  }

  deleteAllMemory(input: { reason: string; confirm: true }): Promise<void> {
    return this.transport.invoke<void>(`${C}.deleteAllMemory`, input);
  }

  // ── Phase 11: audit log ───────────────────────────────────────────────────

  listConfiguratorActions(input?: {
    fromTs?: Timestamp;
    limit?: number;
  }): Promise<ConfiguratorActionRow[]> {
    return this.transport.invoke<ConfiguratorActionRow[]>(`${C}.listConfiguratorActions`, input);
  }
}
