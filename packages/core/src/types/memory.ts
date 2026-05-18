import type { Logger, TimeRange, Timestamp } from "./common.js";
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

// ─── Phase 7: MemoryService (server-side) ─────────────────────────────────────
// NOTE: The client-side MemoryService lives in client.ts and has different signatures
// (no studentId — IPC handlers resolve it via getDefaultStudentId). This is the
// server-side interface; MemoryServiceImpl implements this one.

export interface MemoryService {
  studentModel(studentId: StudentId): Promise<StudentModel>;
  misconceptions(studentId: StudentId): Promise<Misconception[]>;
  /** Returns empty defaults in Phase 7; Phase 14 fills. */
  procedural(studentId: StudentId): Promise<ProceduralModel>;
  /** Returns empty defaults in Phase 7; Phase 14 fills. */
  affective(studentId: StudentId): Promise<AffectiveModel>;
  /** Stream episodic events; skips redacted rows. */
  episodic(opts: {
    studentId: StudentId;
    sessionId?: SessionId;
    range?: TimeRange;
  }): AsyncIterable<EpisodicEvent>;
  /** Full snapshot in MemoryExport format. */
  export(studentId: StudentId): Promise<MemoryExport>;
  /**
   * Wipe projection tables; mark episodic rows as redacted.
   * The episodic rows themselves are NOT deleted.
   */
  delete(opts: { studentId: StudentId; confirm: true }): Promise<void>;
  /**
   * Phase 7: apply explicit mastery signals to a concept.
   * Used by the active-path `update_mastery` tool.
   * Same BKT logic as the MasteryIndexer — single source of truth.
   */
  applySignal(opts: { studentId: StudentId; conceptId: ConceptId; signals: MasterySignal[] }): void;
  /**
   * Phase 7: upsert a misconception row (dedup by studentId+conceptId+errorForm).
   * Used by the active-path `record_misconception` tool.
   * Same logic as the MisconceptionIndexer — single source of truth.
   * Returns the misconception ID (new or existing) and whether it was a merge.
   */
  recordMisconception(opts: {
    studentId: StudentId;
    conceptId: ConceptId;
    description: string;
    errorForm: string;
    remediation: { strategyId: string; rationale: string };
    evidenceEventIds: string[];
  }): { misconceptionId: string; merged: boolean };

  // ── Phase 11: Configurator memory writes ─────────────────────────────────

  /**
   * Reset a concept to initial BKT state ("as if never observed").
   * Upserts student_mastery with BKT priors; clears evidenceJson + lastPracticedAt.
   */
  resetConcept(input: {
    studentId: StudentId;
    conceptId: ConceptId;
    reason: string;
  }): Promise<void>;

  /**
   * Flip a misconception's status to "manually-cleared".
   * Documents when it was cleared (updates lastObservedAt to now).
   */
  clearMisconception(input: { misconceptionId: MisconceptionId; reason: string }): Promise<void>;

  /**
   * Export memory snapshot to a JSON file at `targetPath`.
   * Wraps `export()` and serializes Maps to entry arrays.
   * Returns the byte count written.
   */
  exportToFile(input: {
    studentId: StudentId;
    targetPath: string;
  }): Promise<{ ok: true; bytesWritten: number }>;

  // ── Snapshot-restore helpers ─────────────────────────────────────────────
  // These thin upsert methods exist to support restoreAction's reverse-apply
  // path. They restore memory to an arbitrary prior shape.

  /**
   * Read a single mastery row for (studentId, conceptId). Returns null if not found.
   * Used by SnapshotCapturer to capture pre-mutation mastery state.
   */
  getMastery(input: { studentId: StudentId; conceptId: ConceptId }): Promise<ConceptMastery | null>;

  /**
   * Upsert a mastery row to an exact prior shape (insert if absent, overwrite if present).
   * Used by restoreAction to reverse memory.reset_concept mutations.
   * Pass null to delete the row (restoring "never seen" state).
   */
  upsertMastery(input: {
    studentId: StudentId;
    conceptId: ConceptId;
    mastery: ConceptMastery | null;
  }): Promise<void>;

  /**
   * Get a single misconception row by id. Returns null if not found.
   * Used by SnapshotCapturer to capture pre-mutation misconception state.
   */
  getMisconception(misconceptionId: MisconceptionId): Promise<Misconception | null>;

  /**
   * Upsert a misconception row to an exact prior shape (insert if absent, overwrite if present).
   * Used by restoreAction to reverse memory.clear_misconception mutations.
   */
  upsertMisconception(misconception: Misconception): Promise<void>;
}
