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
  | { kind: "memory.reset_concept"; conceptId: ConceptId; reason: string }
  | { kind: "memory.clear_misconception"; misconceptionId: MisconceptionId; reason: string }
  | { kind: "memory.export" }
  | { kind: "memory.delete_all"; reason: string };

export interface ConfiguratorActionRow {
  id: string;
  configuratorId: ConfiguratorId;
  ts: Timestamp;
  action: ConfiguratorAction;
}
