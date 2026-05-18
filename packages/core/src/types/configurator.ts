import type { Timestamp } from "./common.js";
import type {
  ConceptId,
  ConfiguratorId,
  CourseId,
  GateId,
  LessonId,
  MisconceptionId,
} from "./ids.js";

/**
 * A single configurator action — append-only audit row.
 * Discriminated by `kind` (stored domain object convention per CLAUDE.md).
 */
export type ConfiguratorAction =
  | { kind: "course.edit"; courseId: CourseId; patch: unknown; reason?: string }
  | { kind: "lesson.create"; courseId: CourseId; lessonId: LessonId }
  | { kind: "lesson.edit"; lessonId: LessonId; patch: unknown }
  | { kind: "lesson.delete"; lessonId: LessonId; reason?: string }
  | { kind: "gate.create"; gateId: GateId; courseId: CourseId }
  | { kind: "gate.edit"; gateId: GateId; patch: unknown; reason?: string }
  | { kind: "gate.delete"; gateId: GateId; reason?: string }
  | { kind: "gate.override"; gateId: GateId; reason: string }
  | { kind: "prompt.override_fragment"; modeId: string; fragmentId: string }
  | { kind: "prompt.clear_fragment"; modeId: string; fragmentId: string }
  | {
      kind: "prompt.set_style";
      level: { socratic: number; verbosity: number; formality: number };
    }
  /**
   * Char count only — content NOT logged to avoid storing prompt text long-term
   * in case it contains personal information. Zero chars means the row was cleared.
   */
  | { kind: "prompt.set_global_fragment"; chars: number }
  | { kind: "prompt.set_mode_append"; modeId: string; chars: number }
  | { kind: "memory.reset_concept"; conceptId: ConceptId; reason: string }
  | { kind: "memory.clear_misconception"; misconceptionId: MisconceptionId; reason: string }
  | { kind: "memory.export" }
  | { kind: "memory.delete_all"; reason: string }
  /** Reverse-apply of a prior mutation. The restore action itself is snapshotted for un-revert. */
  | { kind: "restore"; originalActionId: string };

export interface ConfiguratorActionRow {
  id: string;
  configuratorId: ConfiguratorId;
  ts: Timestamp;
  action: ConfiguratorAction;
  /**
   * Set when this action's snapshot has been consumed by a restoreAction call.
   * Null or absent when the snapshot has not been restored (or the action kind
   * is not snapshottable, e.g. memory.export / memory.delete_all).
   */
  restoredAt?: Timestamp | null;
  /**
   * For restore-kind action rows: the id of the original action that was
   * reversed. Carried from inside `actionJson` for convenience.
   * Absent on non-restore rows.
   */
  originalActionId?: string;
}

// ─── Snapshot / restore domain types ─────────────────────────────────────────

/**
 * Discriminates the reverse-apply path in restoreAction.
 * One value per snapshottable mutation surface in AuthoringServiceImpl.
 */
export type SnapshotEntityKind =
  | "course"
  | "lesson"
  | "lesson.create" // sentinel: reverse-apply = deleteLesson(entityKey as LessonId)
  | "gate"
  | "gate.create" // sentinel: reverse-apply = deleteGate(entityKey as GateId)
  | "prompt_override" // single fragment override (customizePrompt / clearFragmentOverride)
  | "prompt_override_batch" // setStyleSliders — snapshot is an array of prior rows
  | "global_prompt"
  | "mode_append"
  | "memory.concept"
  | "memory.misconception";

export interface ConfiguratorSnapshotRow {
  actionId: string;
  entityKind: SnapshotEntityKind;
  entityKey: unknown; // JSON-decoded (string id, { modeId, fragmentId }, etc.)
  snapshot: unknown; // JSON-decoded full prior shape; includes schemaVersion: 1
  restoredAt: Timestamp | null;
}

/**
 * Return value of AuthoringServiceImpl.restoreAction.
 */
export type RestoreResult =
  | { ok: true; restoredEntity: SnapshotEntityKind; entityKey: unknown }
  | { ok: false; reason: "not_found" | "already_restored" | "no_snapshot" | "schema_drift" };
