/**
 * AuthoringServiceImpl — server-side orchestration for all configurator writes.
 *
 * Every write method:
 *   1. Calls the underlying service (artifacts / memory / prompt store).
 *   2. Appends a `configurator_actions` row with the discriminated action.
 *
 * Lock enforcement happens in the IPC layer (requireUnlocked guard), not here.
 * This service is the audit-log boundary: every configurator mutation goes through it.
 *
 * Phase 3 dependency exception: this file lives in @praxis/core/services and
 * imports from @praxis/artifacts/schema — same direction as artifacts-service.ts.
 */
import { gates as gatesTable } from "@praxis/artifacts/schema";
import { composeStyleOverrides } from "@praxis/curriculum/style-composer";
import { and, desc, eq, gte } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import { configuratorActions, promptOverrides } from "../schema.js";
import type {
  ArtifactsService,
  AuthoringService,
  ConceptId,
  ConfiguratorAction,
  ConfiguratorActionRow,
  ConfiguratorId,
  Course,
  CourseId,
  FragmentOverride,
  Gate,
  GateId,
  GateTarget,
  Lesson,
  LessonId,
  Logger,
  MemoryService,
  MisconceptionId,
  Reference,
  StrategyId,
  StudentId,
  SuccessCriteria,
  ThresholdConfig,
  Timestamp,
} from "../types/index.js";
import type { ComposedSystemPromptWithAttribution } from "../types/prompt-attribution.js";
import type {
  PreviewPromptInput,
  PromptCustomizationService,
} from "./prompt-customization-service.js";

export interface AuthoringServiceDeps {
  db: PraxisDb;
  log: Logger;
  artifacts: ArtifactsService;
  memory: MemoryService;
  /**
   * ConfiguratorId factory — v1 always returns `"default" as ConfiguratorId`.
   * Phase 14+ may resolve from the active configurator session.
   */
  configuratorId: () => ConfiguratorId;
  /**
   * Default student resolver — v1: `getOrCreateDefaultStudentId(db)` cast.
   * Provided by buildServices so AuthoringServiceImpl stays dependency-free.
   */
  studentId: () => StudentId;
  /** Prompt customization service — handles global fragment + per-mode appends. */
  promptCustomization: PromptCustomizationService;
}

/**
 * AuthoringServiceImpl implements the server-side AuthoringService interface.
 *
 * Architectural contract:
 * - Every public write method calls `appendAction` after the underlying service
 *   write succeeds. If the underlying write throws, no audit row is written
 *   (fail-fast — the action didn't land).
 * - `listConfiguratorActions` is the only read method.
 */
export class AuthoringServiceImpl implements AuthoringService {
  constructor(private readonly deps: AuthoringServiceDeps) {}

  // ─── Course ────────────────────────────────────────────────────────────────

  async updateCourse(input: {
    courseId: CourseId;
    patch: Partial<
      Pick<Course, "title"> & { subject: string; gradeLevel: string; thresholds: ThresholdConfig }
    >;
    reason?: string;
  }): Promise<Course> {
    const result = await this.deps.artifacts.updateCourse(input);
    this.appendAction({
      kind: "course.edit",
      courseId: input.courseId,
      patch: input.patch,
      ...(input.reason !== undefined && { reason: input.reason }),
    });
    return result;
  }

  // ─── Lesson ────────────────────────────────────────────────────────────────

  async createLesson(input: {
    courseId: CourseId;
    title: string;
    conceptIds: ConceptId[];
    orderIndex?: number;
    suggestedStrategy?: StrategyId;
    estimatedMinutes?: number;
    references?: Reference[];
  }): Promise<Lesson> {
    const result = await this.deps.artifacts.createLesson(input);
    this.appendAction({
      kind: "lesson.create",
      courseId: input.courseId,
      lessonId: result.id,
    });
    return result;
  }

  async updateLesson(input: {
    lessonId: LessonId;
    patch: Partial<
      Pick<Lesson, "title" | "conceptIds" | "references" | "suggestedStrategy" | "estimatedMinutes">
    >;
  }): Promise<Lesson> {
    const result = await this.deps.artifacts.updateLesson(input);
    this.appendAction({
      kind: "lesson.edit",
      lessonId: input.lessonId,
      patch: input.patch,
    });
    return result;
  }

  async deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void> {
    await this.deps.artifacts.deleteLesson(input);
    this.appendAction({
      kind: "lesson.delete",
      lessonId: input.lessonId,
      ...(input.reason !== undefined && { reason: input.reason }),
    });
  }

  // ─── Gate ──────────────────────────────────────────────────────────────────

  async createGate(input: {
    courseId: CourseId;
    guards: GateTarget;
    prerequisites: GateId[];
    successCriteria: SuccessCriteria;
  }): Promise<Gate> {
    const result = await this.deps.artifacts.createGate(input);
    this.appendAction({
      kind: "gate.create",
      gateId: result.id,
      courseId: input.courseId,
    });
    return result;
  }

  async updateGate(input: {
    gateId: GateId;
    patch: Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">>;
    reason?: string;
  }): Promise<Gate> {
    const result = await this.deps.artifacts.updateGate(input);
    this.appendAction({
      kind: "gate.edit",
      gateId: input.gateId,
      patch: input.patch,
      ...(input.reason !== undefined && { reason: input.reason }),
    });
    return result;
  }

  async deleteGate(input: { gateId: GateId; reason?: string }): Promise<void> {
    await this.deps.artifacts.deleteGate(input);
    this.appendAction({
      kind: "gate.delete",
      gateId: input.gateId,
      ...(input.reason !== undefined && { reason: input.reason }),
    });
  }

  async overrideGate(input: { gateId: GateId; reason: string }): Promise<Gate> {
    // Resolve courseId directly from the DB — ArtifactsService has no per-gate read.
    const courseId = this.resolveCourseForGate(input.gateId);
    const result = await this.deps.artifacts.overrideGate({
      gateId: input.gateId,
      reason: input.reason,
      configuratorId: this.deps.configuratorId(),
      studentId: this.deps.studentId(),
      courseId,
    });
    this.appendAction({
      kind: "gate.override",
      gateId: input.gateId,
      reason: input.reason,
    });
    return result;
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
    // No audit row — this is a pure read.
    return this.deps.artifacts.getCourseSummary(courseId);
  }

  // ─── Prompt customization ──────────────────────────────────────────────────

  async listFragmentOverrides(modeId: string): Promise<FragmentOverride[]> {
    return this.deps.promptCustomization.listFragmentOverrides(modeId);
  }

  async customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void> {
    const now = new Date();
    this.deps.db
      .insert(promptOverrides)
      .values({ modeId, fragmentId, override, updatedAt: now })
      .onConflictDoUpdate({
        target: [promptOverrides.modeId, promptOverrides.fragmentId],
        set: { override, updatedAt: now },
      })
      .run();
    this.appendAction({ kind: "prompt.override_fragment", modeId, fragmentId });
  }

  async clearFragmentOverride(input: { modeId: string; fragmentId: string }): Promise<void> {
    this.deps.db
      .delete(promptOverrides)
      .where(
        and(
          eq(promptOverrides.modeId, input.modeId),
          eq(promptOverrides.fragmentId, input.fragmentId),
        ),
      )
      .run();
    this.appendAction({
      kind: "prompt.clear_fragment",
      modeId: input.modeId,
      fragmentId: input.fragmentId,
    });
  }

  async setStyleSliders(input: {
    socratic: number;
    verbosity: number;
    formality: number;
  }): Promise<void> {
    // Compose the three slider values into per-fragment overrides.
    // `composeStyleOverrides` is a pure function — same inputs → same outputs.
    const overrides = composeStyleOverrides(input);
    const now = new Date();
    for (const o of overrides) {
      // Direct DB write (same as customizePrompt but without per-fragment audit rows).
      this.deps.db
        .insert(promptOverrides)
        .values({
          modeId: o.modeId,
          fragmentId: o.fragmentId,
          override: o.template,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [promptOverrides.modeId, promptOverrides.fragmentId],
          set: { override: o.template, updatedAt: now },
        })
        .run();
    }
    // ONE audit row for the whole batch — not one per fragment.
    this.appendAction({ kind: "prompt.set_style", level: input });
  }

  // ─── Global prompt + per-mode append (prompt-customization-layers) ────────

  async setGlobalPrompt(text: string | null): Promise<void> {
    this.deps.promptCustomization.setGlobalFragment(text);
    this.appendAction({
      kind: "prompt.set_global_fragment",
      chars: (text ?? "").trim().length,
    });
  }

  async getGlobalPrompt(): Promise<string | null> {
    return this.deps.promptCustomization.getGlobalFragment();
  }

  async setModeAppend(input: { modeId: string; text: string | null }): Promise<void> {
    this.deps.promptCustomization.setModeAppend(input.modeId, input.text);
    this.appendAction({
      kind: "prompt.set_mode_append",
      modeId: input.modeId,
      chars: (input.text ?? "").trim().length,
    });
  }

  async getModeAppend(modeId: string): Promise<string | null> {
    return this.deps.promptCustomization.getModeAppend(modeId);
  }

  async previewPrompt(input: PreviewPromptInput): Promise<string> {
    // No audit row — this is a pure read; content must not be logged.
    return this.deps.promptCustomization.previewPrompt(input);
  }

  async previewPromptWithAttribution(
    input: PreviewPromptInput,
  ): Promise<ComposedSystemPromptWithAttribution> {
    // No audit row — pure read; content must not be logged.
    return this.deps.promptCustomization.previewPromptWithAttribution(input);
  }

  // ─── Memory administration ─────────────────────────────────────────────────

  async resetConcept(input: {
    studentId: StudentId;
    conceptId: ConceptId;
    reason: string;
  }): Promise<void> {
    await this.deps.memory.resetConcept(input);
    this.appendAction({
      kind: "memory.reset_concept",
      conceptId: input.conceptId,
      reason: input.reason,
    });
  }

  async clearMisconception(input: {
    misconceptionId: MisconceptionId;
    reason: string;
  }): Promise<void> {
    await this.deps.memory.clearMisconception(input);
    this.appendAction({
      kind: "memory.clear_misconception",
      misconceptionId: input.misconceptionId,
      reason: input.reason,
    });
  }

  async exportMemory(input: {
    studentId: StudentId;
    targetPath: string;
  }): Promise<{ ok: true; bytesWritten: number }> {
    const result = await this.deps.memory.exportToFile(input);
    this.appendAction({ kind: "memory.export" });
    return result;
  }

  async deleteAllMemory(input: {
    studentId: StudentId;
    reason: string;
    confirm: true;
  }): Promise<void> {
    await this.deps.memory.delete({ studentId: input.studentId, confirm: input.confirm });
    this.appendAction({ kind: "memory.delete_all", reason: input.reason });
  }

  // ─── Audit log ─────────────────────────────────────────────────────────────

  async listConfiguratorActions(input?: {
    fromTs?: Timestamp;
    limit?: number;
  }): Promise<ConfiguratorActionRow[]> {
    const limit = input?.limit ?? 100;
    const whereClause =
      input?.fromTs !== undefined ? gte(configuratorActions.ts, new Date(input.fromTs)) : undefined;

    const rows = this.deps.db
      .select()
      .from(configuratorActions)
      .where(whereClause)
      .orderBy(desc(configuratorActions.ts))
      .limit(limit)
      .all();

    return rows.map((r) => ({
      id: r.id,
      configuratorId: r.configuratorId as ConfiguratorId,
      ts: r.ts.getTime() as Timestamp,
      action: r.actionJson as ConfiguratorAction,
    }));
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  /**
   * Append a single configurator_actions row.
   * Called after every successful write — if the write throws, no audit row is written.
   */
  private appendAction(action: ConfiguratorAction): void {
    this.deps.db
      .insert(configuratorActions)
      .values({
        id: uuidv7(),
        configuratorId: this.deps.configuratorId(),
        ts: new Date(),
        actionJson: action,
      })
      .run();
    this.deps.log.info("author.action", { kind: action.kind });
  }

  /**
   * Resolve the courseId for a gate directly from the DB.
   * Needed by `overrideGate` to write the gate_unlock_events row.
   * ArtifactsService has no per-gate read; direct DB query is appropriate here
   * since both services share the same DB handle and package boundary.
   */
  private resolveCourseForGate(gateId: GateId): CourseId {
    const row = this.deps.db.select().from(gatesTable).where(eq(gatesTable.id, gateId)).get();
    if (!row) throw new Error(`Gate not found: ${gateId}`);
    return row.courseId as CourseId;
  }
}
