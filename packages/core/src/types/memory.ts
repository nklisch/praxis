import type { Logger, Timestamp } from "./common.js";
import type { EngineEvent } from "./engine.js";
import type {
  ArtifactSnapshotId,
  ConceptId,
  EventId,
  MisconceptionId,
  SessionId,
  StrategyId,
  StudentId,
} from "./ids.js";

// ─── Mastery update signals ───────────────────────────────────────────────────

/**
 * Single source of truth for mastery signal kinds.
 * Add new kinds here; all derived types + switch exhaustiveness update automatically.
 */
export const MASTERY_SIGNAL_KINDS = [
  "correct",
  "incorrect",
  "slip", // student understood but made a mechanical/typo error
  "hint_requested", // student asked for help — sign of low confidence
  "timeout", // student stalled past productive-failure window
  "exam_pass", // exam-grade evidence
  "exam_fail",
] as const;

export type MasterySignalKind = (typeof MASTERY_SIGNAL_KINDS)[number];

export interface MasterySignal {
  conceptId: ConceptId;
  kind: MasterySignalKind;
  /**
   * Episodic event ID(s) this signal was derived from. Empty array allowed
   * for active-path tools that don't have a single source event.
   */
  evidenceEventIds: EventId[];
  /**
   * Optional confidence weight (0..1). Defaults to 1.
   * Phase 7.x LLM refinement uses this; deterministic indexer always emits 1.
   */
  confidence?: number;
}

// ─── Indexer port ─────────────────────────────────────────────────────────────

export interface IndexerContext {
  studentId: StudentId;
  sessionId: SessionId;
  /**
   * Episodic events the indexer should consider for this run.
   * Filter / range owned by the orchestrator.
   */
  events: ReadonlyArray<{
    id: EventId;
    turnIndex: number;
    ts: Timestamp;
    event: EngineEvent;
  }>;
  log: Logger;
}

export interface Indexer {
  /** Stable id; used in logs and to scope debouncing per (sessionId, indexerId). */
  readonly id: string;
  /** When this indexer wants to run. */
  readonly schedule: "post-turn" | "session-end";
  /** Run the indexer over the given context. Throws are caught and logged by the orchestrator. */
  run(ctx: IndexerContext): Promise<void>;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface IndexerOrchestrator {
  /**
   * Schedule a debounced post-turn indexer pass for the given session. Cancels
   * any pending pass for the same session before scheduling a new one.
   * Fire-and-forget — does not throw or return a promise the caller awaits.
   */
  scheduleAfterTurn(input: { studentId: StudentId; sessionId: SessionId }): void;

  /**
   * Run all session-end indexers synchronously for the given session. Awaits
   * completion. Used by SessionService.end() before the session row is closed.
   */
  runAtSessionEnd(input: { studentId: StudentId; sessionId: SessionId }): Promise<void>;

  /**
   * Cancel any pending debounce timer for the session (e.g., when ending the
   * session — runAtSessionEnd handles the work synchronously).
   */
  cancel(sessionId: SessionId): void;

  /** Test/observability: count active timers. */
  pendingCount(): number;

  /**
   * Tear down all pending timers. Call on host shutdown so timers don't keep
   * the process alive. After this call, no further indexer runs will fire.
   */
  shutdown(): void;
}

export interface EpisodicEvent {
  id: EventId;
  sessionId: SessionId;
  studentId: StudentId;
  ts: Timestamp;
  source: { engineId: string; modeId: string; turnIndex: number };
  event: EngineEvent;
  artifactSnapshotIds?: ArtifactSnapshotId[];
}

export interface StudentModel {
  studentId: StudentId;
  conceptMastery: Map<ConceptId, ConceptMastery>;
  lastUpdated: Timestamp;
}

export interface ConceptMastery {
  conceptId: ConceptId;
  pKnown: number; // 0..1
  uncertainty: number; // 0..1
  lastPracticedAt?: Timestamp;
  effectivePKnown: number;
  evidence: EventId[];
}

export interface ProceduralModel {
  studentId: StudentId;
  strategies: Map<StrategyId, StrategyPreference>;
}

export interface StrategyPreference {
  strategyId: StrategyId;
  preference: number; // -1..1
  evidenceCount: number;
}

export interface AffectiveModel {
  studentId: StudentId;
  recent: AffectSample[];
  baseline: { engagement: number; frustration: number; confidence: number };
}

export interface AffectSample {
  ts: Timestamp;
  source: "model-inferred" | "explicit-checkin";
  engagement: number;
  frustration: number;
  confidence: number;
}

export interface Misconception {
  id: MisconceptionId;
  studentId: StudentId;
  conceptId: ConceptId;
  description: string;
  errorForm: string;
  remediation: { strategyId: StrategyId; rationale: string };
  evidence: EventId[];
  status: "active" | "remediated" | "manually-cleared";
  firstObservedAt: Timestamp;
  lastObservedAt: Timestamp;
}

export interface MemoryExport {
  studentId: StudentId;
  episodic: EpisodicEvent[];
  studentModel: StudentModel;
  procedural: ProceduralModel;
  affective: AffectiveModel;
  misconceptions: Misconception[];
  exportedAt: Timestamp;
  formatVersion: string;
}
