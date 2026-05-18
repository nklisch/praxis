import type {
  Course,
  Gate,
  GateTarget,
  Lesson,
  Reference,
  SuccessCriteria,
  ThresholdConfig,
} from "./artifacts.js";
import type { Timestamp } from "./common.js";
import type { ConfiguratorActionRow, RestoreResult } from "./configurator.js";
import type {
  ConceptId,
  CourseId,
  GateId,
  LessonId,
  MisconceptionId,
  StrategyId,
  StudentId,
} from "./ids.js";
import type { ComposedSystemPromptWithAttribution } from "./prompt-attribution.js";

// ─── Phase 11: AuthoringService (server-side) ───────────────────────────────

/**
 * A stored fragment-level override for a mode. Returned by
 * `AuthoringService.listFragmentOverrides` and the corresponding client
 * surface. Mirrors the `FragmentOverride` type from
 * `prompt-customization-service.ts` so callers don't reach into services/.
 */
export interface FragmentOverride {
  modeId: string;
  fragmentId: string;
  override: string;
}

/**
 * Server-side AuthoringService — orchestrates configurator writes to
 * artifacts + memory + prompt overrides, and appends audit log rows.
 *
 * Methods with studentId are server-side only; client-side AuthoringClient
 * in client.ts omits studentId (IPC handlers resolve it).
 */
export interface AuthoringService {
  // ── Course / lesson / gate ────────────────────────────────────────────────
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
  customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void>;
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
  resetConcept(input: {
    studentId: StudentId;
    conceptId: ConceptId;
    reason: string;
  }): Promise<void>;
  clearMisconception(input: { misconceptionId: MisconceptionId; reason: string }): Promise<void>;
  exportMemory(input: {
    studentId: StudentId;
    targetPath: string;
  }): Promise<{ ok: true; bytesWritten: number }>;
  deleteAllMemory(input: { studentId: StudentId; reason: string; confirm: true }): Promise<void>;

  // ── Audit log ─────────────────────────────────────────────────────────────
  listConfiguratorActions(input?: {
    fromTs?: Timestamp;
    limit?: number;
  }): Promise<ConfiguratorActionRow[]>;

  // ── Snapshot restore ──────────────────────────────────────────────────────
  /**
   * Reverse-apply the mutation identified by actionId.
   * Returns already_restored if the snapshot was already consumed.
   * Returns no_snapshot if no snapshot exists for the action.
   */
  restoreAction(input: { actionId: string }): Promise<RestoreResult>;
}
