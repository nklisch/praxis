/**
 * ConceptMapSnapshotter — session-end Indexer that snapshots every concept map
 * for the session's (student, course) if it has changed since the last snapshot.
 *
 * Ordered BEFORE ConceptMapDivergenceIndexer in the orchestrator so the
 * divergence pass always sees the latest persisted scene.
 */

import type {
  ConceptMapService,
  CourseId,
  Indexer,
  IndexerContext,
  Logger,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface ConceptMapSnapshotterDeps {
  readonly log: Logger;
  readonly conceptMaps: ConceptMapService;
  /**
   * Resolves the courseId for the given sessionId.
   * Returns null when the session has no associated course.
   * Matches the callback pattern used by MisconceptionIndexer.
   */
  readonly sessionCourseId: (sessionId: string) => string | null;
}

/**
 * Indexer that runs at session-end and snapshots every concept map for the
 * session's course if dirty. Failures per-map are caught and logged — the
 * indexer continues to the next map and never throws.
 */
export class ConceptMapSnapshotter implements Indexer {
  readonly id = "concept-map-snapshotter";
  readonly schedule = "session-end" as const;

  constructor(private readonly deps: ConceptMapSnapshotterDeps) {}

  async run(ctx: IndexerContext): Promise<void> {
    const rawCourseId = this.deps.sessionCourseId(ctx.sessionId);
    if (!rawCourseId) return; // sessions without a course don't have concept maps

    const courseId = brandId<"CourseId">(rawCourseId) as CourseId;

    let maps: Awaited<ReturnType<ConceptMapService["list"]>>;
    try {
      maps = await this.deps.conceptMaps.list({
        studentId: ctx.studentId,
        courseId,
      });
    } catch (err) {
      this.deps.log.warn("conceptMap.snapshotter.list_failed", {
        courseId,
        error: String(err),
      });
      return;
    }

    if (maps.length === 0) return;

    for (const summary of maps) {
      try {
        const result = await this.deps.conceptMaps.snapshotIfDirty({
          id: summary.id,
          sessionId: ctx.sessionId,
        });
        if (result.snapshotted) {
          this.deps.log.info("conceptMap.snapshotted", {
            mapId: summary.id,
            versionId: result.versionId,
          });
        }
      } catch (err) {
        this.deps.log.warn("conceptMap.snapshot_failed", {
          mapId: summary.id,
          error: String(err),
        });
        // Continue to the next map — one failure should not block others.
      }
    }
  }
}
