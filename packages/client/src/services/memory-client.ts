import type {
  AffectiveModel,
  ConceptId,
  ConceptMastery,
  EpisodicEvent,
  MemoryClientService,
  MemoryExport,
  Misconception,
  ProceduralModel,
  SessionId,
  StrategyId,
  StrategyPreference,
  StudentModel,
  TimeRange,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  studentModel: "praxis.memory.studentModel",
  misconceptions: "praxis.memory.misconceptions",
  procedural: "praxis.memory.procedural",
  affective: "praxis.memory.affective",
  episodic: "praxis.memory.episodic",
  export: "praxis.memory.export",
  delete: "praxis.memory.delete",
} as const;

/**
 * MemoryClient — Phase 7 real implementation replacing the Phase 3 stub.
 *
 * Maps IPC channels to typed methods. The server serializes Maps as entries
 * arrays (Maps don't survive JSON.stringify over IPC); the client reconstructs
 * them here.
 */
export class MemoryClient implements MemoryClientService {
  constructor(private readonly transport: ClientTransport) {}

  async studentModel(): Promise<StudentModel> {
    const raw = await this.transport.invoke<{
      studentId: string;
      conceptMastery: [string, ConceptMastery][];
      lastUpdated: number;
    }>(C.studentModel);
    return {
      studentId: brandId<"StudentId">(raw.studentId),
      conceptMastery: new Map(
        raw.conceptMastery.map(([id, m]) => [brandId<"ConceptId">(id) as ConceptId, m]),
      ),
      lastUpdated: raw.lastUpdated as import("@praxis/core/types").Timestamp,
    };
  }

  misconceptions(): Promise<Misconception[]> {
    return this.transport.invoke<Misconception[]>(C.misconceptions);
  }

  async procedural(): Promise<ProceduralModel> {
    const raw = await this.transport.invoke<{
      studentId: string;
      strategies: [string, StrategyPreference][];
    }>(C.procedural);
    return {
      studentId: brandId<"StudentId">(raw.studentId),
      strategies: new Map(
        raw.strategies.map(([id, s]) => [brandId<"StrategyId">(id) as StrategyId, s]),
      ),
    };
  }

  affective(): Promise<AffectiveModel> {
    return this.transport.invoke<AffectiveModel>(C.affective);
  }

  episodic(opts: { sessionId?: SessionId; range?: TimeRange }): AsyncIterable<EpisodicEvent> {
    return this.transport.stream<EpisodicEvent>(C.episodic, opts);
  }

  async export(): Promise<MemoryExport> {
    const raw = await this.transport.invoke<{
      studentId: string;
      episodic: EpisodicEvent[];
      studentModel: {
        studentId: string;
        conceptMastery: [string, ConceptMastery][];
        lastUpdated: number;
      };
      procedural: {
        studentId: string;
        strategies: [string, StrategyPreference][];
      };
      affective: AffectiveModel;
      misconceptions: Misconception[];
      exportedAt: number;
      formatVersion: string;
    }>(C.export);
    return {
      studentId: brandId<"StudentId">(raw.studentId),
      episodic: raw.episodic,
      studentModel: {
        studentId: brandId<"StudentId">(raw.studentModel.studentId),
        conceptMastery: new Map(
          raw.studentModel.conceptMastery.map(([id, m]) => [
            brandId<"ConceptId">(id) as ConceptId,
            m,
          ]),
        ),
        lastUpdated: raw.studentModel.lastUpdated as import("@praxis/core/types").Timestamp,
      },
      procedural: {
        studentId: brandId<"StudentId">(raw.procedural.studentId),
        strategies: new Map(
          raw.procedural.strategies.map(([id, s]) => [brandId<"StrategyId">(id) as StrategyId, s]),
        ),
      },
      affective: raw.affective,
      misconceptions: raw.misconceptions,
      exportedAt: raw.exportedAt as import("@praxis/core/types").Timestamp,
      formatVersion: raw.formatVersion,
    };
  }

  delete(opts: { confirm: true }): Promise<void> {
    return this.transport.invoke<void>(C.delete, opts);
  }
}
