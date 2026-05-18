/**
 * SnapshotCapturer — captures the pre-mutation state of an entity before
 * each AuthoringServiceImpl write. Returns the captured payload that the
 * caller persists to `configurator_snapshots` once it has an action id.
 *
 * Capture methods do NOT write to the DB — they only read.
 * The capturer never throws on missing entities: it returns null so the
 * caller can still proceed with the mutation (fail-fast at the mutate step).
 */
import { eq } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import { configKv, modePromptAppends, promptOverrides } from "../schema.js";
import type {
  ArtifactsService,
  ConceptId,
  CourseId,
  GateId,
  LessonId,
  MemoryService,
  MisconceptionId,
  SnapshotEntityKind,
  StudentId,
} from "../types/index.js";

/** CURRENT_SCHEMA_VERSION: bump when any snapshotted entity schema changes. */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/** Shape embedded in every snapshot JSON. */
export interface SnapshotPayload {
  schemaVersion: number;
  data: unknown;
}

/** The return type of each capture method. */
export interface CapturedSnapshot {
  entityKind: SnapshotEntityKind;
  /** Null for sentinel-create kinds; filled in post-mutate by the caller. */
  entityKey: unknown;
  snapshot: SnapshotPayload;
}

export interface SnapshotCapturerDeps {
  db: PraxisDb;
  artifacts: ArtifactsService;
  memory: MemoryService;
}

export class SnapshotCapturer {
  constructor(private readonly deps: SnapshotCapturerDeps) {}

  // ─── Course ────────────────────────────────────────────────────────────────

  async forCourseEdit(courseId: CourseId): Promise<CapturedSnapshot | null> {
    const course = await this.deps.artifacts.course(courseId);
    if (!course) return null;
    return {
      entityKind: "course",
      entityKey: courseId,
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data: course },
    };
  }

  // ─── Lesson ────────────────────────────────────────────────────────────────

  /**
   * Sentinel for lesson.create — no pre-state exists yet.
   * The caller must set entityKey to the new lesson id post-mutate.
   */
  async forLessonCreate(): Promise<CapturedSnapshot> {
    return {
      entityKind: "lesson.create",
      entityKey: null,
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data: { kind: "create" } },
    };
  }

  async forLessonEdit(lessonId: LessonId): Promise<CapturedSnapshot | null> {
    const lesson = await this.deps.artifacts.getLesson(lessonId);
    if (!lesson) return null;
    return {
      entityKind: "lesson",
      entityKey: lessonId,
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data: lesson },
    };
  }

  async forLessonDelete(lessonId: LessonId): Promise<CapturedSnapshot | null> {
    const lesson = await this.deps.artifacts.getLesson(lessonId);
    if (!lesson) return null;
    return {
      entityKind: "lesson",
      entityKey: lessonId,
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data: lesson },
    };
  }

  // ─── Gate ──────────────────────────────────────────────────────────────────

  /**
   * Sentinel for gate.create — no pre-state exists yet.
   * The caller must set entityKey to the new gate id post-mutate.
   */
  async forGateCreate(): Promise<CapturedSnapshot> {
    return {
      entityKind: "gate.create",
      entityKey: null,
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data: { kind: "create" } },
    };
  }

  async forGateEdit(gateId: GateId): Promise<CapturedSnapshot | null> {
    const gate = await this.deps.artifacts.getGate(gateId);
    if (!gate) return null;
    return {
      entityKind: "gate",
      entityKey: gateId,
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data: gate },
    };
  }

  async forGateDelete(gateId: GateId): Promise<CapturedSnapshot | null> {
    const gate = await this.deps.artifacts.getGate(gateId);
    if (!gate) return null;
    return {
      entityKind: "gate",
      entityKey: gateId,
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data: gate },
    };
  }

  async forGateOverride(gateId: GateId): Promise<CapturedSnapshot | null> {
    const gate = await this.deps.artifacts.getGate(gateId);
    if (!gate) return null;
    return {
      entityKind: "gate",
      entityKey: gateId,
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data: gate },
    };
  }

  // ─── Prompt overrides ──────────────────────────────────────────────────────

  /**
   * For prompt.override_fragment (customizePrompt): capture the existing
   * override row for this (modeId, fragmentId). If none exists, capture a
   * sentinel so restore knows to call clearFragmentOverride.
   */
  async forPromptOverride(modeId: string, fragmentId: string): Promise<CapturedSnapshot> {
    const row = this.deps.db
      .select()
      .from(promptOverrides)
      .where(eq(promptOverrides.modeId, modeId))
      .all()
      .find((r) => r.fragmentId === fragmentId);

    // Capture the prior override, or null if none existed (new override being set).
    const data = row
      ? { modeId: row.modeId, fragmentId: row.fragmentId, override: row.override }
      : null;
    return {
      entityKind: "prompt_override",
      entityKey: { modeId, fragmentId },
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data },
    };
  }

  /**
   * For prompt.clear_fragment (clearFragmentOverride): capture the current
   * override row so restore can reinstate it.
   */
  async forPromptClear(modeId: string, fragmentId: string): Promise<CapturedSnapshot> {
    return this.forPromptOverride(modeId, fragmentId);
  }

  /**
   * For prompt.set_style (setStyleSliders): capture ALL current prompt_overrides rows.
   * The style composer may touch many fragments; we need to restore all of them.
   */
  async forPromptSetStyle(): Promise<CapturedSnapshot> {
    const rows = this.deps.db.select().from(promptOverrides).all();
    const data = rows.map((r) => ({
      modeId: r.modeId,
      fragmentId: r.fragmentId,
      override: r.override,
    }));
    return {
      entityKind: "prompt_override_batch",
      entityKey: null,
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data },
    };
  }

  /**
   * For prompt.set_global_fragment (setGlobalPrompt): capture the current
   * global fragment text (or null if none).
   */
  async forGlobalPromptSet(): Promise<CapturedSnapshot> {
    const row = this.deps.db
      .select()
      .from(configKv)
      .where(eq(configKv.key, "prompt.global_fragment"))
      .get();
    const data: { text: string | null } = {
      text: row ? ((row.valueJson as { text: string }).text ?? null) : null,
    };
    return {
      entityKind: "global_prompt",
      entityKey: "global",
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data },
    };
  }

  /**
   * For prompt.set_mode_append (setModeAppend): capture the current
   * per-mode append text for this modeId.
   */
  async forModeAppendSet(modeId: string): Promise<CapturedSnapshot> {
    const row = this.deps.db
      .select()
      .from(modePromptAppends)
      .where(eq(modePromptAppends.modeId, modeId))
      .get();
    const data: { modeId: string; text: string | null } = { modeId, text: row?.text ?? null };
    return {
      entityKind: "mode_append",
      entityKey: modeId,
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data },
    };
  }

  // ─── Memory ────────────────────────────────────────────────────────────────

  /**
   * For memory.reset_concept: capture the current mastery row (may be null
   * if the concept was never observed — a null snapshot restores "never seen").
   */
  async forMemoryResetConcept(
    studentId: StudentId,
    conceptId: ConceptId,
  ): Promise<CapturedSnapshot> {
    const mastery = await this.deps.memory.getMastery({ studentId, conceptId });
    return {
      entityKind: "memory.concept",
      entityKey: { studentId, conceptId },
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data: mastery },
    };
  }

  /**
   * For memory.clear_misconception: capture the misconception row's current state.
   */
  async forMemoryClearMisconception(
    misconceptionId: MisconceptionId,
  ): Promise<CapturedSnapshot | null> {
    const misconception = await this.deps.memory.getMisconception(misconceptionId);
    if (!misconception) return null;
    return {
      entityKind: "memory.misconception",
      entityKey: misconceptionId,
      snapshot: { schemaVersion: SNAPSHOT_SCHEMA_VERSION, data: misconception },
    };
  }
}
