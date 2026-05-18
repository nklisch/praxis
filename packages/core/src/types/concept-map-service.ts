import type {
  ConceptLink,
  ConceptMapDivergence,
  ConceptMapDrawing,
  ConceptMapSummary,
  ConceptMapVersion,
  RippleSummary,
} from "./artifacts.js";
import type { TldrawSnapshot } from "./common.js";
import type { ConceptId, ConceptMapId, CourseId, NoteId, SessionId, StudentId } from "./ids.js";

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

  /**
   * Update the `linkState` and optional selected `candidateId` on a concept-map
   * node (identified by its tldraw `elementId`). When `candidateId` is non-null
   * and `state` is `"linked"`, also sets `conceptId` to the candidate's
   * canonical concept id, raising confidence to 1.0.
   *
   * Pass `candidateId: null` with `state: "unlinked"` to clear a link.
   */
  setNodeLink(input: {
    mapId: ConceptMapId;
    /** tldraw shape id — matches ConceptLink.elementId. */
    elementId: string;
    candidateId: string | null;
    state: "linked" | "best_guess" | "unlinked";
  }): Promise<ConceptMapDrawing>;

  /**
   * Compute the downstream consequences of confirming the link from
   * `elementId` to `candidateId` (a canonical concept id). Returns a
   * `RippleSummary` quantifying concept-count delta, notes that would be
   * re-tagged, and tutor sessions that would resolve the node differently.
   *
   * The computation is hypothetical — nothing is persisted.
   */
  computeRipples(input: {
    mapId: ConceptMapId;
    elementId: string;
    candidateId: ConceptId;
  }): Promise<RippleSummary>;

  /**
   * Convert a sketch note (format: "sketch") into a new concept-map artifact.
   *
   * Extraction logic:
   *   - Labelled text shapes → candidate nodes (label = shape text, trimmed).
   *   - Arrows between shapes → edges; arrow label mapped to canonical relation
   *     kind where possible; defaults to "related".
   *
   * The original sketch note is preserved (no mutation, no deletion).
   * The conversion is recorded as a configurator action so the 24h undo window
   * works: restoring the action deletes the newly-created concept map.
   *
   * The `courseId` and `studentId` are resolved from the sketch note's context.
   * If `courseId` is absent from the context, the call throws an error.
   *
   * Returns `{ conceptMapId, originalSketchNoteId, nodeCount }` for the UI to
   * surface candidate count in the confirmation dialog.
   */
  convertFromSketch(
    noteId: NoteId,
    studentId: StudentId,
  ): Promise<{ conceptMapId: ConceptMapId; originalSketchNoteId: NoteId; nodeCount: number }>;
}

// ─── Phase 15b: ConceptMapClientApi ──────────────────────────────────────────

/**
 * Phase 15b: Client-facing concept map API. Drops `studentId` — server resolves
 * the active student from the single-student v1 install context.
 */
export interface ConceptMapClientApi {
  create(input: { courseId: CourseId; title: string }): Promise<ConceptMapDrawing>;
  get(id: ConceptMapId): Promise<ConceptMapDrawing | null>;
  list(input: { courseId: CourseId }): Promise<ConceptMapSummary[]>;
  rename(id: ConceptMapId, title: string): Promise<ConceptMapDrawing>;
  delete(id: ConceptMapId): Promise<void>;
  updateScene(input: {
    id: ConceptMapId;
    scene: TldrawSnapshot;
    conceptLinks: ConceptLink[];
  }): Promise<ConceptMapDrawing>;
  listVersions(id: ConceptMapId): Promise<ConceptMapVersion[]>;
  /**
   * Update the three-state link status on a single concept-map node.
   * Returns the updated ConceptMapDrawing.
   */
  setNodeLink(input: {
    mapId: ConceptMapId;
    elementId: string;
    candidateId: string | null;
    state: "linked" | "best_guess" | "unlinked";
  }): Promise<ConceptMapDrawing>;
  /**
   * Compute the downstream ripple summary for hypothetically linking
   * `elementId` → `candidateId` (canonical concept id) on the given map.
   */
  computeRipples(input: {
    mapId: ConceptMapId;
    elementId: string;
    candidateId: ConceptId;
  }): Promise<RippleSummary>;

  /**
   * Convert a sketch note (format: "sketch") into a new concept-map artifact.
   * The original sketch note is preserved. Returns the new concept map id,
   * the original note id, and the extracted node count (for the confirmation UI).
   *
   * The conversion is recorded as an undoable configurator action — use
   * `authoring.restoreAction(actionId)` within the 24h window to delete the map.
   */
  convertFromSketch(input: {
    sketchNoteId: NoteId;
  }): Promise<{ conceptMapId: ConceptMapId; originalSketchNoteId: NoteId; nodeCount: number }>;
}
