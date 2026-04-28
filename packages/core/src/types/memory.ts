import type { Timestamp } from "./common.js";
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
