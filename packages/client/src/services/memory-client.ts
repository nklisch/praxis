import type {
  AffectiveModel,
  EpisodicEvent,
  MemoryExport,
  MemoryService,
  Misconception,
  ProceduralModel,
  SessionId,
  StudentModel,
  TimeRange,
} from "@praxis/core/types";
/**
 * MemoryClient — Phase 3 stub.
 * Full implementation deferred to Phase 7 (memory inspector).
 */
export class MemoryClient implements MemoryService {
  studentModel(): Promise<StudentModel> {
    return Promise.reject(new Error("MemoryClient not implemented in Phase 3"));
  }

  misconceptions(): Promise<Misconception[]> {
    return Promise.reject(new Error("MemoryClient not implemented in Phase 3"));
  }

  procedural(): Promise<ProceduralModel> {
    return Promise.reject(new Error("MemoryClient not implemented in Phase 3"));
  }

  affective(): Promise<AffectiveModel> {
    return Promise.reject(new Error("MemoryClient not implemented in Phase 3"));
  }

  episodic(_opts: { sessionId?: SessionId; range?: TimeRange }): AsyncIterable<EpisodicEvent> {
    return {
      [Symbol.asyncIterator]() {
        return {
          next() {
            return Promise.reject(new Error("MemoryClient not implemented in Phase 3"));
          },
        };
      },
    };
  }

  export(): Promise<MemoryExport> {
    return Promise.reject(new Error("MemoryClient not implemented in Phase 3"));
  }

  delete(_opts: { confirm: true }): Promise<void> {
    return Promise.reject(new Error("MemoryClient not implemented in Phase 3"));
  }
}
