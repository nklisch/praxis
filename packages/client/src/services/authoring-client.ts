import type {
  AuthoringClient,
  ComposedSystemPromptWithAttribution,
  ConceptId,
  ConfiguratorActionRow,
  Course,
  CourseId,
  FragmentOverride,
  Gate,
  GateId,
  GateTarget,
  Lesson,
  LessonId,
  MisconceptionId,
  Reference,
  RestoreResult,
  StrategyId,
  SuccessCriteria,
  ThresholdConfig,
  Timestamp,
} from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
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

  async customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(`${C}.customizePrompt`, {
      modeId,
      fragmentId,
      override,
    });
    unwrapEnvelope(result);
  }

  // ── Phase 11: course / lesson / gate edits ────────────────────────────────

  async updateCourse(input: {
    courseId: CourseId;
    patch: Partial<
      Pick<Course, "title"> & { subject: string; gradeLevel: string; thresholds: ThresholdConfig }
    >;
    reason?: string;
  }): Promise<Course> {
    const result = await this.transport.invoke<IpcEnvelope<Course> | Course>(
      `${C}.updateCourse`,
      input,
    );
    return unwrapEnvelope(result);
  }

  async createLesson(input: {
    courseId: CourseId;
    title: string;
    conceptIds: ConceptId[];
    orderIndex?: number;
    suggestedStrategy?: StrategyId;
    estimatedMinutes?: number;
    references?: Reference[];
  }): Promise<Lesson> {
    const result = await this.transport.invoke<IpcEnvelope<Lesson> | Lesson>(
      `${C}.createLesson`,
      input,
    );
    return unwrapEnvelope(result);
  }

  async updateLesson(input: {
    lessonId: LessonId;
    patch: Partial<
      Pick<Lesson, "title" | "conceptIds" | "references" | "suggestedStrategy" | "estimatedMinutes">
    >;
  }): Promise<Lesson> {
    const result = await this.transport.invoke<IpcEnvelope<Lesson> | Lesson>(
      `${C}.updateLesson`,
      input,
    );
    return unwrapEnvelope(result);
  }

  async deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${C}.deleteLesson`,
      input,
    );
    unwrapEnvelope(result);
  }

  async createGate(input: {
    courseId: CourseId;
    guards: GateTarget;
    prerequisites: GateId[];
    successCriteria: SuccessCriteria;
  }): Promise<Gate> {
    const result = await this.transport.invoke<IpcEnvelope<Gate> | Gate>(`${C}.createGate`, input);
    return unwrapEnvelope(result);
  }

  async updateGate(input: {
    gateId: GateId;
    patch: Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">>;
    reason?: string;
  }): Promise<Gate> {
    const result = await this.transport.invoke<IpcEnvelope<Gate> | Gate>(`${C}.updateGate`, input);
    return unwrapEnvelope(result);
  }

  async deleteGate(input: { gateId: GateId; reason?: string }): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(`${C}.deleteGate`, input);
    unwrapEnvelope(result);
  }

  async overrideGate(input: { gateId: GateId; reason: string }): Promise<Gate> {
    const result = await this.transport.invoke<IpcEnvelope<Gate> | Gate>(
      `${C}.overrideGate`,
      input,
    );
    return unwrapEnvelope(result);
  }

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
    const result = await this.transport.invoke<
      | IpcEnvelope<{
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
        }>
      | {
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
        }
    >(`${C}.getCourseSummary`, courseId);
    return unwrapEnvelope(result);
  }

  // ── Phase 11: prompt customization ───────────────────────────────────────

  async clearFragmentOverride(input: { modeId: string; fragmentId: string }): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${C}.clearFragmentOverride`,
      input,
    );
    unwrapEnvelope(result);
  }

  async listFragmentOverrides(modeId: string): Promise<FragmentOverride[]> {
    const result = await this.transport.invoke<
      IpcEnvelope<FragmentOverride[]> | FragmentOverride[]
    >(`${C}.listFragmentOverrides`, { modeId });
    return unwrapEnvelope(result);
  }

  async setStyleSliders(input: {
    socratic: number;
    verbosity: number;
    formality: number;
  }): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${C}.setStyleSliders`,
      input,
    );
    unwrapEnvelope(result);
  }

  // ── Prompt customization layers ───────────────────────────────────────────

  async setGlobalPrompt(text: string | null): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(`${C}.setGlobalPrompt`, {
      text,
    });
    unwrapEnvelope(result);
  }

  async getGlobalPrompt(): Promise<string | null> {
    const result = await this.transport.invoke<IpcEnvelope<string | null> | string | null>(
      `${C}.getGlobalPrompt`,
    );
    return unwrapEnvelope(result);
  }

  async setModeAppend(input: { modeId: string; text: string | null }): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${C}.setModeAppend`,
      input,
    );
    unwrapEnvelope(result);
  }

  async getModeAppend(modeId: string): Promise<string | null> {
    const result = await this.transport.invoke<IpcEnvelope<string | null> | string | null>(
      `${C}.getModeAppend`,
      { modeId },
    );
    return unwrapEnvelope(result);
  }

  async previewPrompt(input: {
    modeId: string;
    draftGlobal?: string | null;
    draftAppend?: string | null;
  }): Promise<string> {
    const result = await this.transport.invoke<IpcEnvelope<string> | string>(
      `${C}.previewPrompt`,
      input,
    );
    return unwrapEnvelope(result);
  }

  async previewPromptWithAttribution(input: {
    modeId: string;
    draftGlobal?: string | null;
    draftAppend?: string | null;
  }): Promise<ComposedSystemPromptWithAttribution> {
    const result = await this.transport.invoke<
      IpcEnvelope<ComposedSystemPromptWithAttribution> | ComposedSystemPromptWithAttribution
    >(`${C}.previewPromptWithAttribution`, input);
    return unwrapEnvelope(result);
  }

  // ── Phase 11: memory administration ──────────────────────────────────────

  async resetConcept(input: { conceptId: ConceptId; reason: string }): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${C}.resetConcept`,
      input,
    );
    unwrapEnvelope(result);
  }

  async clearMisconception(input: {
    misconceptionId: MisconceptionId;
    reason: string;
  }): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${C}.clearMisconception`,
      input,
    );
    unwrapEnvelope(result);
  }

  async exportMemory(input: { targetPath: string }): Promise<{ ok: true; bytesWritten: number }> {
    const result = await this.transport.invoke<
      IpcEnvelope<{ ok: true; bytesWritten: number }> | { ok: true; bytesWritten: number }
    >(`${C}.exportMemory`, input);
    return unwrapEnvelope(result);
  }

  async deleteAllMemory(input: { reason: string; confirm: true }): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${C}.deleteAllMemory`,
      input,
    );
    unwrapEnvelope(result);
  }

  // ── Phase 11: audit log ───────────────────────────────────────────────────

  async listConfiguratorActions(input?: {
    fromTs?: Timestamp;
    limit?: number;
  }): Promise<ConfiguratorActionRow[]> {
    const result = await this.transport.invoke<
      IpcEnvelope<ConfiguratorActionRow[]> | ConfiguratorActionRow[]
    >(`${C}.listConfiguratorActions`, input);
    return unwrapEnvelope(result);
  }

  // ── Snapshot restore ──────────────────────────────────────────────────────

  async restoreAction(input: { actionId: string }): Promise<RestoreResult> {
    const result = await this.transport.invoke<IpcEnvelope<RestoreResult> | RestoreResult>(
      `${C}.restoreAction`,
      input,
    );
    return unwrapEnvelope(result);
  }
}
