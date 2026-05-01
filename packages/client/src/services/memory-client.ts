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
  Timestamp,
} from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

// Local brand helper. `@praxis/client` is a type-only dependent of
// `@praxis/core/types`; we can't import the runtime `brandId` function.
// The cast is identical — branded ids are nominal compile-time tags with no
// runtime representation.
const asId = <B extends string>(s: string): string & { readonly __brand: B } =>
  s as string & { readonly __brand: B };

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
      studentId: asId<"StudentId">(raw.studentId),
      conceptMastery: new Map(
        raw.conceptMastery.map(([id, m]) => [asId<"ConceptId">(id) as ConceptId, m]),
      ),
      lastUpdated: raw.lastUpdated as Timestamp,
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
      studentId: asId<"StudentId">(raw.studentId),
      strategies: new Map(
        raw.strategies.map(([id, s]) => [asId<"StrategyId">(id) as StrategyId, s]),
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
      studentId: asId<"StudentId">(raw.studentId),
      episodic: raw.episodic,
      studentModel: {
        studentId: asId<"StudentId">(raw.studentModel.studentId),
        conceptMastery: new Map(
          raw.studentModel.conceptMastery.map(([id, m]) => [asId<"ConceptId">(id) as ConceptId, m]),
        ),
        lastUpdated: raw.studentModel.lastUpdated as Timestamp,
      },
      procedural: {
        studentId: asId<"StudentId">(raw.procedural.studentId),
        strategies: new Map(
          raw.procedural.strategies.map(([id, s]) => [asId<"StrategyId">(id) as StrategyId, s]),
        ),
      },
      affective: raw.affective,
      misconceptions: raw.misconceptions,
      exportedAt: raw.exportedAt as Timestamp,
      formatVersion: raw.formatVersion,
    };
  }

  delete(opts: { confirm: true }): Promise<void> {
    return this.transport.invoke<void>(C.delete, opts);
  }
}
