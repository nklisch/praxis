/**
 * AuthoringServiceImpl — server-side orchestration for all configurator writes.
 *
 * Every write method:
 *   1. Captures the pre-mutation snapshot via SnapshotCapturer.
 *   2. Calls the underlying service (artifacts / memory / prompt store).
 *   3. Appends a `configurator_actions` row with the discriminated action.
 *   4. Persists the snapshot row keyed by the new action id.
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
import { configuratorActions, configuratorSnapshots, promptOverrides } from "../schema.js";
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
  RestoreResult,
  SnapshotEntityKind,
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
import {
  type CapturedSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  SnapshotCapturer,
  type SnapshotCapturerDeps,
  type SnapshotPayload,
} from "./snapshot-capturer.js";

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
 * - Every public write method captures a snapshot, calls the underlying service
 *   write, appends an audit row (if the write succeeds), and persists the snapshot.
 * - `listConfiguratorActions` and the `get*` read methods are the only read methods.
 * - `memory.export` and `memory.delete_all` deliberately skip snapshot capture.
 */
export class AuthoringServiceImpl implements AuthoringService {
  private readonly capturer: SnapshotCapturer;

  constructor(private readonly deps: AuthoringServiceDeps) {
    const capturerDeps: SnapshotCapturerDeps = {
      db: deps.db,
      artifacts: deps.artifacts,
      memory: deps.memory,
    };
    this.capturer = new SnapshotCapturer(capturerDeps);
  }

  // ─── Course ────────────────────────────────────────────────────────────────

  async updateCourse(input: {
    courseId: CourseId;
    patch: Partial<
      Pick<Course, "title"> & { subject: string; gradeLevel: string; thresholds: ThresholdConfig }
    >;
    reason?: string;
  }): Promise<Course> {
    const captured = await this.capturer.forCourseEdit(input.courseId);
    const result = await this.deps.artifacts.updateCourse(input);
    const actionId = this.appendAction({
      kind: "course.edit",
      courseId: input.courseId,
      patch: input.patch,
      ...(input.reason !== undefined && { reason: input.reason }),
    });
    if (captured) this.appendSnapshot(actionId, captured);
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
    const captured = await this.capturer.forLessonCreate();
    const result = await this.deps.artifacts.createLesson(input);
    const actionId = this.appendAction({
      kind: "lesson.create",
      courseId: input.courseId,
      lessonId: result.id,
    });
    // Fill in entityKey with the new lesson id post-mutate.
    const capturedWithKey: CapturedSnapshot = { ...captured, entityKey: result.id };
    this.appendSnapshot(actionId, capturedWithKey);
    return result;
  }

  async updateLesson(input: {
    lessonId: LessonId;
    patch: Partial<
      Pick<Lesson, "title" | "conceptIds" | "references" | "suggestedStrategy" | "estimatedMinutes">
    >;
  }): Promise<Lesson> {
    const captured = await this.capturer.forLessonEdit(input.lessonId);
    const result = await this.deps.artifacts.updateLesson(input);
    const actionId = this.appendAction({
      kind: "lesson.edit",
      lessonId: input.lessonId,
      patch: input.patch,
    });
    if (captured) this.appendSnapshot(actionId, captured);
    return result;
  }

  async deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void> {
    const captured = await this.capturer.forLessonDelete(input.lessonId);
    await this.deps.artifacts.deleteLesson(input);
    const actionId = this.appendAction({
      kind: "lesson.delete",
      lessonId: input.lessonId,
      ...(input.reason !== undefined && { reason: input.reason }),
    });
    if (captured) this.appendSnapshot(actionId, captured);
  }

  // ─── Gate ──────────────────────────────────────────────────────────────────

  async createGate(input: {
    courseId: CourseId;
    guards: GateTarget;
    prerequisites: GateId[];
    successCriteria: SuccessCriteria;
  }): Promise<Gate> {
    const captured = await this.capturer.forGateCreate();
    const result = await this.deps.artifacts.createGate(input);
    const actionId = this.appendAction({
      kind: "gate.create",
      gateId: result.id,
      courseId: input.courseId,
    });
    // Fill in entityKey with the new gate id post-mutate.
    const capturedWithKey: CapturedSnapshot = { ...captured, entityKey: result.id };
    this.appendSnapshot(actionId, capturedWithKey);
    return result;
  }

  async updateGate(input: {
    gateId: GateId;
    patch: Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">>;
    reason?: string;
  }): Promise<Gate> {
    const captured = await this.capturer.forGateEdit(input.gateId);
    const result = await this.deps.artifacts.updateGate(input);
    const actionId = this.appendAction({
      kind: "gate.edit",
      gateId: input.gateId,
      patch: input.patch,
      ...(input.reason !== undefined && { reason: input.reason }),
    });
    if (captured) this.appendSnapshot(actionId, captured);
    return result;
  }

  async deleteGate(input: { gateId: GateId; reason?: string }): Promise<void> {
    const captured = await this.capturer.forGateDelete(input.gateId);
    await this.deps.artifacts.deleteGate(input);
    const actionId = this.appendAction({
      kind: "gate.delete",
      gateId: input.gateId,
      ...(input.reason !== undefined && { reason: input.reason }),
    });
    if (captured) this.appendSnapshot(actionId, captured);
  }

  async overrideGate(input: { gateId: GateId; reason: string }): Promise<Gate> {
    const captured = await this.capturer.forGateOverride(input.gateId);
    // Resolve courseId directly from the DB — ArtifactsService has no per-gate read.
    const courseId = this.resolveCourseForGate(input.gateId);
    const result = await this.deps.artifacts.overrideGate({
      gateId: input.gateId,
      reason: input.reason,
      configuratorId: this.deps.configuratorId(),
      studentId: this.deps.studentId(),
      courseId,
    });
    const actionId = this.appendAction({
      kind: "gate.override",
      gateId: input.gateId,
      reason: input.reason,
    });
    if (captured) this.appendSnapshot(actionId, captured);
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
    const captured = await this.capturer.forPromptOverride(modeId, fragmentId);
    const now = new Date();
    this.deps.db
      .insert(promptOverrides)
      .values({ modeId, fragmentId, override, updatedAt: now })
      .onConflictDoUpdate({
        target: [promptOverrides.modeId, promptOverrides.fragmentId],
        set: { override, updatedAt: now },
      })
      .run();
    const actionId = this.appendAction({ kind: "prompt.override_fragment", modeId, fragmentId });
    this.appendSnapshot(actionId, captured);
  }

  async clearFragmentOverride(input: { modeId: string; fragmentId: string }): Promise<void> {
    const captured = await this.capturer.forPromptClear(input.modeId, input.fragmentId);
    this.deps.db
      .delete(promptOverrides)
      .where(
        and(
          eq(promptOverrides.modeId, input.modeId),
          eq(promptOverrides.fragmentId, input.fragmentId),
        ),
      )
      .run();
    const actionId = this.appendAction({
      kind: "prompt.clear_fragment",
      modeId: input.modeId,
      fragmentId: input.fragmentId,
    });
    this.appendSnapshot(actionId, captured);
  }

  async setStyleSliders(input: {
    socratic: number;
    verbosity: number;
    formality: number;
  }): Promise<void> {
    // Capture ALL current prompt_overrides before the style batch write.
    const captured = await this.capturer.forPromptSetStyle();
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
    const actionId = this.appendAction({ kind: "prompt.set_style", level: input });
    this.appendSnapshot(actionId, captured);
  }

  // ─── Global prompt + per-mode append (prompt-customization-layers) ────────

  async setGlobalPrompt(text: string | null): Promise<void> {
    const captured = await this.capturer.forGlobalPromptSet();
    this.deps.promptCustomization.setGlobalFragment(text);
    const actionId = this.appendAction({
      kind: "prompt.set_global_fragment",
      chars: (text ?? "").trim().length,
    });
    this.appendSnapshot(actionId, captured);
  }

  async getGlobalPrompt(): Promise<string | null> {
    return this.deps.promptCustomization.getGlobalFragment();
  }

  async setModeAppend(input: { modeId: string; text: string | null }): Promise<void> {
    const captured = await this.capturer.forModeAppendSet(input.modeId);
    this.deps.promptCustomization.setModeAppend(input.modeId, input.text);
    const actionId = this.appendAction({
      kind: "prompt.set_mode_append",
      modeId: input.modeId,
      chars: (input.text ?? "").trim().length,
    });
    this.appendSnapshot(actionId, captured);
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
    const captured = await this.capturer.forMemoryResetConcept(input.studentId, input.conceptId);
    await this.deps.memory.resetConcept(input);
    const actionId = this.appendAction({
      kind: "memory.reset_concept",
      conceptId: input.conceptId,
      reason: input.reason,
    });
    this.appendSnapshot(actionId, captured);
  }

  async clearMisconception(input: {
    misconceptionId: MisconceptionId;
    reason: string;
  }): Promise<void> {
    const captured = await this.capturer.forMemoryClearMisconception(input.misconceptionId);
    await this.deps.memory.clearMisconception(input);
    const actionId = this.appendAction({
      kind: "memory.clear_misconception",
      misconceptionId: input.misconceptionId,
      reason: input.reason,
    });
    if (captured) this.appendSnapshot(actionId, captured);
  }

  async exportMemory(input: {
    studentId: StudentId;
    targetPath: string;
  }): Promise<{ ok: true; bytesWritten: number }> {
    // Deliberately no snapshot capture for export (read-only operation).
    const result = await this.deps.memory.exportToFile(input);
    this.appendAction({ kind: "memory.export" });
    return result;
  }

  async deleteAllMemory(input: {
    studentId: StudentId;
    reason: string;
    confirm: true;
  }): Promise<void> {
    // Deliberately no snapshot capture for delete_all (separate confirmation flow).
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
      .select({
        id: configuratorActions.id,
        configuratorId: configuratorActions.configuratorId,
        ts: configuratorActions.ts,
        actionJson: configuratorActions.actionJson,
        // Use the primary-key column (notNull) as the join-presence sentinel.
        // Drizzle left-join returns null for ALL selected columns when there is
        // no matching row — including for nullable columns like restoredAt. We
        // therefore cannot use restoredAt alone to distinguish "no snapshot row"
        // (null from join miss) from "snapshot row with restoredAt=null" (not
        // yet restored). Selecting actionId (notNull PK) gives us a reliable
        // sentinel: null → no snapshot row; non-null → snapshot row exists.
        snapshotActionId: configuratorSnapshots.actionId,
        snapshotRestoredAt: configuratorSnapshots.restoredAt,
      })
      .from(configuratorActions)
      .leftJoin(configuratorSnapshots, eq(configuratorSnapshots.actionId, configuratorActions.id))
      .where(whereClause)
      .orderBy(desc(configuratorActions.ts))
      .limit(limit)
      .all();

    return rows.map((r) => {
      const action = r.actionJson as ConfiguratorAction;
      // Build the base row without optional snapshot fields.
      const row: ConfiguratorActionRow = {
        id: r.id,
        configuratorId: r.configuratorId as ConfiguratorId,
        ts: r.ts.getTime() as Timestamp,
        action,
      };

      // Only populate restoredAt when a snapshot row actually exists for this
      // action (snapshotActionId is non-null). Non-snapshotted action kinds
      // (memory.export, memory.delete_all) have no snapshot row and must NOT
      // get restoredAt set — absent key signals "not restorable" to consumers.
      if (r.snapshotActionId !== null) {
        // A snapshot row exists for this action.
        row.restoredAt = r.snapshotRestoredAt
          ? (r.snapshotRestoredAt.getTime() as Timestamp)
          : null;
      }

      // For restore-kind rows, surface originalActionId from the action payload.
      if (action.kind === "restore") {
        row.originalActionId = action.originalActionId;
      }
      return row;
    });
  }

  // ─── Restore ───────────────────────────────────────────────────────────────

  async restoreAction(input: { actionId: string }): Promise<RestoreResult> {
    const snapshot = this.readSnapshot(input.actionId);
    if (!snapshot) return { ok: false, reason: "no_snapshot" };
    if (snapshot.restoredAt !== null) return { ok: false, reason: "already_restored" };

    const payload = snapshot.snapshot as SnapshotPayload;

    // Schema version guard — refuse to restore if the stored schema doesn't match.
    if (payload.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      return { ok: false, reason: "schema_drift" };
    }

    const entityKind = snapshot.entityKind as SnapshotEntityKind;
    const entityKey = snapshot.entityKey;
    const data = payload.data;

    // Capture the current state BEFORE applying the reverse.
    // This becomes the "pre-state of the restore action" for un-revert:
    // restoring the restore action will re-apply this captured (post-mutation) state.
    const preRestoreCapture = await this.captureCurrentStateForUnrevert(entityKind, entityKey);

    // Reverse-apply dispatcher — exhaustive switch on entityKind.
    switch (entityKind) {
      case "course": {
        // Restore to the full prior Course shape by applying all its fields as a patch.
        const course = data as import("../types/artifacts.js").Course;
        await this.deps.artifacts.updateCourse({
          courseId: entityKey as CourseId,
          patch: {
            title: course.title,
            subject: course.subject as unknown as string,
            gradeLevel: course.gradeLevel as unknown as string,
            thresholds: course.thresholds,
          },
        });
        break;
      }

      case "lesson.create": {
        // Sentinel: the original action CREATED a lesson — restore = delete it.
        await this.deps.artifacts.deleteLesson({ lessonId: entityKey as LessonId });
        break;
      }

      case "lesson": {
        // Upsert: re-create if deleted, or overwrite if present.
        await this.deps.artifacts.upsertLesson(data as Lesson);
        break;
      }

      case "gate.create": {
        // Sentinel: the original action CREATED a gate — restore = delete it.
        await this.deps.artifacts.deleteGate({ gateId: entityKey as GateId });
        break;
      }

      case "gate": {
        // Upsert: re-create if deleted, or overwrite if present.
        await this.deps.artifacts.upsertGate(data as Gate);
        break;
      }

      case "prompt_override": {
        // Prior data is { modeId, fragmentId, override } or null (meaning the
        // override didn't exist before and should be cleared).
        const key = entityKey as { modeId: string; fragmentId: string };
        if (data === null) {
          // Original action created a new override — restore = clear it.
          this.deps.db
            .delete(promptOverrides)
            .where(
              and(
                eq(promptOverrides.modeId, key.modeId),
                eq(promptOverrides.fragmentId, key.fragmentId),
              ),
            )
            .run();
        } else {
          // Original action changed or cleared an override — restore = put it back.
          const prior = data as { modeId: string; fragmentId: string; override: string };
          const now = new Date();
          this.deps.db
            .insert(promptOverrides)
            .values({
              modeId: prior.modeId,
              fragmentId: prior.fragmentId,
              override: prior.override,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [promptOverrides.modeId, promptOverrides.fragmentId],
              set: { override: prior.override, updatedAt: now },
            })
            .run();
        }
        break;
      }

      case "prompt_override_batch": {
        // setStyleSliders snapshot: array of all prior override rows.
        // Restore by deleting all current overrides that were produced by the
        // style composer, then re-inserting the prior set.
        // Strategy: re-insert every row from the snapshot (upsert), and
        // also delete any current overrides NOT in the snapshot that may have
        // been added by the style batch (identified by comparing with current state).
        const priorRows = data as Array<{ modeId: string; fragmentId: string; override: string }>;
        const now = new Date();
        // Build a set of (modeId, fragmentId) that existed in the snapshot.
        const priorKeys = new Set(priorRows.map((r) => `${r.modeId}:${r.fragmentId}`));
        // Get all current rows to identify any new ones added by the batch.
        const currentRows = this.deps.db.select().from(promptOverrides).all();
        for (const cur of currentRows) {
          const key = `${cur.modeId}:${cur.fragmentId}`;
          if (!priorKeys.has(key)) {
            // This row didn't exist before the style batch — delete it.
            this.deps.db
              .delete(promptOverrides)
              .where(
                and(
                  eq(promptOverrides.modeId, cur.modeId),
                  eq(promptOverrides.fragmentId, cur.fragmentId),
                ),
              )
              .run();
          }
        }
        // Restore all prior rows.
        for (const prior of priorRows) {
          this.deps.db
            .insert(promptOverrides)
            .values({
              modeId: prior.modeId,
              fragmentId: prior.fragmentId,
              override: prior.override,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [promptOverrides.modeId, promptOverrides.fragmentId],
              set: { override: prior.override, updatedAt: now },
            })
            .run();
        }
        break;
      }

      case "global_prompt": {
        const prior = data as { text: string | null };
        this.deps.promptCustomization.setGlobalFragment(prior.text);
        break;
      }

      case "mode_append": {
        const prior = data as { modeId: string; text: string | null };
        this.deps.promptCustomization.setModeAppend(prior.modeId, prior.text);
        break;
      }

      case "memory.concept": {
        const key = entityKey as { studentId: StudentId; conceptId: ConceptId };
        const mastery = data as import("../types/memory.js").ConceptMastery | null;
        await this.deps.memory.upsertMastery({
          studentId: key.studentId,
          conceptId: key.conceptId,
          mastery,
        });
        break;
      }

      case "memory.misconception": {
        const misconception = data as import("../types/memory.js").Misconception;
        await this.deps.memory.upsertMisconception(misconception);
        break;
      }

      default: {
        const _exhaustive: never = entityKind;
        throw new Error(`Unknown snapshot entityKind: ${String(_exhaustive)}`);
      }
    }

    // Mark the original snapshot consumed.
    this.markRestored(input.actionId, new Date());

    // Append a "restore" audit action so the timeline shows the undo.
    const restoreActionId = this.appendAction({
      kind: "restore",
      originalActionId: input.actionId,
    });

    // Persist the pre-restore state as the restore action's snapshot,
    // enabling un-revert: restoring the restore action re-applies the captured
    // (post-mutation) state.
    if (preRestoreCapture) {
      this.appendSnapshot(restoreActionId, preRestoreCapture);
    }

    return { ok: true, restoredEntity: entityKind, entityKey };
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  /**
   * Append a single configurator_actions row and return the new action id.
   * Called after every successful write — if the write throws, no audit row is written.
   */
  private appendAction(action: ConfiguratorAction): string {
    const id = uuidv7();
    this.deps.db
      .insert(configuratorActions)
      .values({
        id,
        configuratorId: this.deps.configuratorId(),
        ts: new Date(),
        actionJson: action,
      })
      .run();
    this.deps.log.info("author.action", { kind: action.kind });
    return id;
  }

  /**
   * Persist a snapshot row for the given action id.
   */
  private appendSnapshot(actionId: string, captured: CapturedSnapshot): void {
    this.deps.db
      .insert(configuratorSnapshots)
      .values({
        actionId,
        entityKind: captured.entityKind,
        entityKeyJson: captured.entityKey,
        snapshotJson: captured.snapshot,
        restoredAt: null,
      })
      .run();
  }

  /**
   * Read a snapshot row by action id.
   */
  private readSnapshot(actionId: string): {
    entityKind: string;
    entityKey: unknown;
    snapshot: unknown;
    restoredAt: Timestamp | null;
  } | null {
    const row = this.deps.db
      .select()
      .from(configuratorSnapshots)
      .where(eq(configuratorSnapshots.actionId, actionId))
      .get();
    if (!row) return null;
    return {
      entityKind: row.entityKind,
      entityKey: row.entityKeyJson,
      snapshot: row.snapshotJson,
      restoredAt: row.restoredAt ? (row.restoredAt.getTime() as Timestamp) : null,
    };
  }

  /**
   * Mark a snapshot row as restored (sets restoredAt timestamp).
   */
  private markRestored(actionId: string, at: Date): void {
    this.deps.db
      .update(configuratorSnapshots)
      .set({ restoredAt: at })
      .where(eq(configuratorSnapshots.actionId, actionId))
      .run();
  }

  /**
   * Capture the CURRENT state of an entity before applying the reverse.
   * Used to create the snapshot for the "restore" action itself, enabling un-revert:
   * restoring the restore action re-applies the captured (post-mutation) state.
   *
   * Called before the reverse-apply in restoreAction, so the state captured here
   * is the post-mutation state that will be "undone" by the restore.
   */
  private async captureCurrentStateForUnrevert(
    entityKind: SnapshotEntityKind,
    entityKey: unknown,
  ): Promise<CapturedSnapshot | null> {
    switch (entityKind) {
      case "course":
        return this.capturer.forCourseEdit(entityKey as CourseId);

      case "lesson.create":
        // Before restore, the lesson exists (it was created by the original action).
        // Capture it so un-revert can recreate it.
        return this.capturer.forLessonEdit(entityKey as LessonId);

      case "lesson":
        return this.capturer.forLessonEdit(entityKey as LessonId);

      case "gate.create":
        // Before restore, the gate exists. Capture it for un-revert.
        return this.capturer.forGateEdit(entityKey as GateId);

      case "gate":
        return this.capturer.forGateEdit(entityKey as GateId);

      case "prompt_override": {
        const key = entityKey as { modeId: string; fragmentId: string };
        return this.capturer.forPromptOverride(key.modeId, key.fragmentId);
      }

      case "prompt_override_batch":
        return this.capturer.forPromptSetStyle();

      case "global_prompt":
        return this.capturer.forGlobalPromptSet();

      case "mode_append":
        return this.capturer.forModeAppendSet(entityKey as string);

      case "memory.concept": {
        const key = entityKey as { studentId: StudentId; conceptId: ConceptId };
        return this.capturer.forMemoryResetConcept(key.studentId, key.conceptId);
      }

      case "memory.misconception":
        return this.capturer.forMemoryClearMisconception(entityKey as MisconceptionId);

      default: {
        const _exhaustive: never = entityKind;
        return null;
      }
    }
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
