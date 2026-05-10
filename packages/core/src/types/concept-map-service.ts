import type {
  ConceptLink,
  ConceptMapDivergence,
  ConceptMapDrawing,
  ConceptMapSummary,
  ConceptMapVersion,
} from "./artifacts.js";
import type { TldrawSnapshot } from "./common.js";
import type { ConceptMapId, CourseId, SessionId, StudentId } from "./ids.js";

export interface ConceptMapService {
  /** Create a new empty map for (student, course). Title required. */
  create(input: {
    studentId: StudentId;
    courseId: CourseId;
    title: string;
  }): Promise<ConceptMapDrawing>;

  /** Read by id. Returns null if not found. */
  get(id: ConceptMapId): Promise<ConceptMapDrawing | null>;

  /**
   * List summaries for a (student, course) — many-maps-per-course model.
   * Ordered by updatedAt descending.
   */
  list(input: { studentId: StudentId; courseId: CourseId }): Promise<ConceptMapSummary[]>;

  /** Rename a map. Bumps updatedAt. */
  rename(id: ConceptMapId, title: string): Promise<ConceptMapDrawing>;

  /** Delete map + cascading versions. */
  delete(id: ConceptMapId): Promise<void>;

  /**
   * Update the live scene + conceptLinks. Bumps updatedAt. Does NOT create a
   * version snapshot — versions only happen at session-end.
   */
  updateScene(input: {
    id: ConceptMapId;
    scene: TldrawSnapshot;
    conceptLinks: ConceptLink[];
  }): Promise<ConceptMapDrawing>;

  /**
   * List all version snapshots for a map, oldest first.
   */
  listVersions(id: ConceptMapId): Promise<ConceptMapVersion[]>;

  /**
   * Snapshot the current scene+links of a single map. Called by the
   * IndexerOrchestrator at session-end. Idempotent: if the live scene equals
   * the most recent version, no new row is written.
   */
  snapshotIfDirty(input: {
    id: ConceptMapId;
    sessionId: SessionId;
  }): Promise<{ snapshotted: boolean; versionId?: string }>;

  /**
   * Persist divergences (output of the indexer) onto the live row.
   */
  setDivergences(id: ConceptMapId, divergences: ConceptMapDivergence[]): Promise<void>;
}
