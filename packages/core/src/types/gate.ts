import type { Gate, GateState, SuccessCriteria } from "./artifacts.js";
import type { Logger, Timestamp } from "./common.js";
import type { ConceptId, GateId, StudentId } from "./ids.js";

/**
 * Enriched gate view used by UI and brief composer. Server-side helpers compute
 * display strings so the UI / brief don't have to walk the SuccessCriteria tree.
 */
export interface GateView {
  gate: Gate;
  /** Short human-readable summary of the gate's success criteria. */
  summaryText: string;
  /** Reason the gate is locked (or empty when unlocked). */
  lockReason: string;
  /** Progress fraction toward unlock (0..1). 1.0 if already unlocked. */
  progress: number;
  /** Whether this gate is the active "next to unlock" gate for the student. */
  isActive: boolean;
}

/**
 * Pure-function port. Takes the inputs needed to evaluate gate states and
 * returns the evaluation result. No DB writes; persistence is the caller's job.
 */
export interface GateEvaluator {
  evaluate(input: GateEvaluatorInput): Promise<GateEvaluation>;
}

export interface GateEvaluatorInput {
  studentId: StudentId;
  gates: ReadonlyArray<Gate>;
  /** Read mastery by concept id, decay applied. Returns 0 when no record. */
  masteryReader: MasteryReader;
  /** Read assignment grades for a list of assignment ids. */
  gradeReader: GradeReader;
  now: Timestamp;
  log?: Logger;
}

export interface GateEvaluation {
  /** Per-gate result. Same length / order as input.gates. */
  perGate: GateEvaluationEntry[];
  /** Subset of perGate where state changed in this evaluation. */
  transitions: GateTransition[];
}

export interface GateEvaluationEntry {
  gateId: GateId;
  beforeState: GateState;
  afterState: GateState;
  progress: number;
  lockReason: string;
  summaryText: string;
}

export type GateTransition =
  | {
      kind: "unlocked";
      gateId: GateId;
      at: Timestamp;
      evidence: ReadonlyArray<{ kind: "event" | "assignment" | "manual"; id: string }>;
    }
  | { kind: "re-locked"; gateId: GateId; at: Timestamp; reason: string }; // not produced in v1; type exists for future

/**
 * Narrow port for reading current mastery during gate evaluation. Implemented
 * by MemoryServiceImpl. The port keeps GateEvaluator pure and easy to test.
 */
export interface MasteryReader {
  /** Effective decay-aware mastery for a concept. Returns 0 when no record. */
  read(input: { studentId: StudentId; conceptId: ConceptId }): Promise<number>;
}

/**
 * Narrow port for reading assignment grades during gate evaluation. Implemented
 * by AssignmentServiceImpl.
 */
export interface GradeReader {
  /** Get the grade total for an assignment, or null when unsubmitted / not found. */
  readGrade(input: { assignmentId: string }): Promise<{ total: number; submittedAt: Timestamp } | null>;
}

// Re-export SuccessCriteria for evaluator convenience (avoids double imports).
export type { SuccessCriteria };
