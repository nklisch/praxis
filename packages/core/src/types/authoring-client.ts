import type {
  Course,
  DraftCourse,
  Gate,
  GateTarget,
  Lesson,
  Reference,
  SuccessCriteria,
  ThresholdConfig,
} from "./artifacts.js";
import type { FragmentOverride } from "./authoring-service.js";
import type { Timestamp } from "./common.js";
import type { ConfiguratorActionRow, RestoreResult } from "./configurator.js";
import type { ConceptId, CourseId, GateId, LessonId, MisconceptionId, StrategyId } from "./ids.js";
import type { ComposedSystemPromptWithAttribution } from "./prompt-attribution.js";
import type { BootstrapOpts, CreateCourseInput, FileRef } from "./session-client.js";

/**
 * Client-side authoring surface — methods for creating, editing, and
 * customizing courses, gates, lessons, and prompts. No `studentId` on methods;
 * resolved server-side via `getOrCreateDefaultStudentId` in IPC handlers.
 */
export interface AuthoringClient {
  // ── Course / draft bootstrap ──────────────────────────────────────────────
  createCourse(input: CreateCourseInput): Promise<Course>;
  editGate(id: GateId, patch: Partial<Gate>): Promise<Gate>;
  bootstrap(files: FileRef[], opts: BootstrapOpts): Promise<DraftCourse>;
  customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void>;

  // ── Course / lesson / gate edits ──────────────────────────────────────────
  updateCourse(input: {
    courseId: CourseId;
    patch: Partial<
      Pick<Course, "title"> & { subject: string; gradeLevel: string; thresholds: ThresholdConfig }
    >;
    reason?: string;
  }): Promise<Course>;

  createLesson(input: {
    courseId: CourseId;
    title: string;
    conceptIds: ConceptId[];
    orderIndex?: number;
    suggestedStrategy?: StrategyId;
    estimatedMinutes?: number;
    references?: Reference[];
  }): Promise<Lesson>;

  updateLesson(input: {
    lessonId: LessonId;
    patch: Partial<
      Pick<Lesson, "title" | "conceptIds" | "references" | "suggestedStrategy" | "estimatedMinutes">
    >;
  }): Promise<Lesson>;

  deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void>;

  createGate(input: {
    courseId: CourseId;
    guards: GateTarget;
    prerequisites: GateId[];
    successCriteria: SuccessCriteria;
  }): Promise<Gate>;

  updateGate(input: {
    gateId: GateId;
    patch: Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">>;
    reason?: string;
  }): Promise<Gate>;

  deleteGate(input: { gateId: GateId; reason?: string }): Promise<void>;

  overrideGate(input: { gateId: GateId; reason: string }): Promise<Gate>;

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
  }>;

  // ── Prompt customization ──────────────────────────────────────────────────
  clearFragmentOverride(input: { modeId: string; fragmentId: string }): Promise<void>;
  listFragmentOverrides(modeId: string): Promise<FragmentOverride[]>;
  setStyleSliders(input: { socratic: number; verbosity: number; formality: number }): Promise<void>;
  /** Set the global cross-mode fragment. Pass null to clear. */
  setGlobalPrompt(text: string | null): Promise<void>;
  /** Get the current global fragment text, or null if none is set. */
  getGlobalPrompt(): Promise<string | null>;
  /** Set the per-mode append for a specific mode. Pass null to clear. */
  setModeAppend(input: { modeId: string; text: string | null }): Promise<void>;
  /** Get the per-mode append for a specific mode, or null if none is set. */
  getModeAppend(modeId: string): Promise<string | null>;
  /**
   * Compose the full system prompt for modeId against current stored state.
   * Draft overrides substitute the stored values without persisting.
   */
  previewPrompt(input: {
    modeId: string;
    draftGlobal?: string | null;
    draftAppend?: string | null;
  }): Promise<string>;

  /**
   * Structured preview returning the composed prompt plus per-segment source
   * attribution. Used by the diff-aware preview pane. Same draft semantics as
   * `previewPrompt`.
   */
  previewPromptWithAttribution(input: {
    modeId: string;
    draftGlobal?: string | null;
    draftAppend?: string | null;
  }): Promise<ComposedSystemPromptWithAttribution>;

  // ── Memory administration ─────────────────────────────────────────────────
  resetConcept(input: { conceptId: ConceptId; reason: string }): Promise<void>;
  clearMisconception(input: { misconceptionId: MisconceptionId; reason: string }): Promise<void>;
  exportMemory(input: { targetPath: string }): Promise<{ ok: true; bytesWritten: number }>;
  deleteAllMemory(input: { reason: string; confirm: true }): Promise<void>;

  // ── Audit log ─────────────────────────────────────────────────────────────
  listConfiguratorActions(input?: {
    fromTs?: Timestamp;
    limit?: number;
  }): Promise<ConfiguratorActionRow[]>;

  // ── Snapshot restore ──────────────────────────────────────────────────────
  /**
   * Restore an artifact to its pre-mutation state for the given action id.
   * Returns a `RestoreResult` — either success with the entity kind that was
   * restored, or a failure reason (no_snapshot / already_restored / schema_drift).
   */
  restoreAction(input: { actionId: string }): Promise<RestoreResult>;
}
