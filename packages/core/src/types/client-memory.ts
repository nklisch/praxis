import type { TimeRange } from "./common.js";
import type { SessionId } from "./ids.js";
import type {
  AffectiveModel,
  EpisodicEvent,
  MemoryExport,
  Misconception,
  ProceduralModel,
  StudentModel,
} from "./memory.js";

/**
 * Client-side MemoryService (no studentId on methods — resolved server-side
 * via getOrCreateDefaultStudentId in IPC handlers).
 *
 * Distinct from the server-side MemoryService in memory.ts which takes
 * studentId parameters. Re-exported from the barrel as `MemoryClientService`
 * to avoid ambiguity.
 */
export interface MemoryService {
  studentModel(): Promise<StudentModel>;
  misconceptions(): Promise<Misconception[]>;
  procedural(): Promise<ProceduralModel>;
  affective(): Promise<AffectiveModel>;
  episodic(opts: { sessionId?: SessionId; range?: TimeRange }): AsyncIterable<EpisodicEvent>;
  export(): Promise<MemoryExport>;
  delete(opts: { confirm: true }): Promise<void>;
}
