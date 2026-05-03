import type { Brand } from "./common.js";

export type StudentId = Brand<string, "StudentId">;
export type SessionId = Brand<string, "SessionId">;
export type EventId = Brand<string, "EventId">;
export type ArtifactSnapshotId = Brand<string, "ArtifactSnapshotId">;

export type CourseId = Brand<string, "CourseId">;
export type LessonId = Brand<string, "LessonId">;
export type TopicId = Brand<string, "TopicId">;
export type AssignmentId = Brand<string, "AssignmentId">;
export type GateId = Brand<string, "GateId">;
export type FlashcardId = Brand<string, "FlashcardId">;
export type NoteId = Brand<string, "NoteId">;
export type ConceptMapId = Brand<string, "ConceptMapId">;
export type DocumentId = Brand<string, "DocumentId">;
/** Phase 16: course unit (an ordered band of lessons within a course). */
export type UnitId = Brand<string, "UnitId">;
/** Phase 16: per-lesson assessment schedule row. */
export type LessonAssessmentId = Brand<string, "LessonAssessmentId">;

export type ConceptId = Brand<string, "ConceptId">;
export type ConceptGraphId = Brand<string, "ConceptGraphId">;
export type StrategyId = Brand<string, "StrategyId">;
export type TechniqueId = Brand<string, "TechniqueId">;
export type SubjectId = Brand<string, "SubjectId">;
export type SubjectPackId = Brand<string, "SubjectPackId">;
export type MisconceptionId = Brand<string, "MisconceptionId">;
export type ConfiguratorId = Brand<string, "ConfiguratorId">;

export type GradeBand = "K-2" | "3-5" | "6-8" | "9-12" | "undergrad" | "grad";

/**
 * Construct a new branded ID from a UUID v7 string. Caller responsible for
 * generating the UUID — this helper just brands it. Lives here (type module)
 * because it's a pure type-level coercion.
 */
export function brandId<B extends string>(value: string): Brand<string, B> {
  return value as Brand<string, B>;
}
