import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import { drafts } from "../schema.js";
import type { DraftCourseState, StudentId } from "../types/index.js";

/**
 * Port: durable CRUD over the bootstrap draft store. BootstrapServiceImpl
 * stays the owner of mutation logic (pure functions on DraftCourseState);
 * this port handles the read/write halves so the service can be a thin
 * read-mutate-write wrapper rather than a stateful Map.
 */
export interface DraftStore {
  /** Load a draft by id. Returns null if missing, confirmed, or discarded. */
  load(draftId: string): DraftCourseState | null;
  /** Insert or replace the draft state. Preserves `createdAt` on conflict. */
  save(draft: DraftCourseState): void;
  /** Active drafts for one student, lastTouchedAt DESC. */
  listForStudent(studentId: StudentId): readonly DraftCourseState[];
  /** Active drafts for all students. Used by the IPC outline subscribers. */
  listActive(): readonly DraftCourseState[];
  /** Bump lastTouchedAt without re-serializing the blob. */
  touch(draftId: string): void;
  /**
   * Mark confirmed in the SAME transaction as persistDraft (see the
   * integration story). Caller passes the open transaction handle so the
   * confirmation is atomic with the course write.
   */
  markConfirmedTx(tx: PraxisDb, draftId: string, courseId: string): void;
  /** Mark discarded (manual or sweep). Out-of-tx because no other write follows. */
  markDiscarded(draftId: string): void;
  /**
   * Sweep stale active rows (`lastTouchedAt < cutoff`). Marks each
   * discarded with `discardedAt = now`. Returns the ids that were swept
   * so the caller can emit `discarded` events.
   */
  sweepStale(cutoff: number): readonly string[];
}

/** Filter condition: both confirmedAt and discardedAt are null (i.e., active). */
const isActive = and(isNull(drafts.confirmedAt), isNull(drafts.discardedAt));

/** Map a database row's stateJson to a typed DraftCourseState. */
function rowToState(row: { stateJson: DraftCourseState }): DraftCourseState {
  // stateJson is already parsed by Drizzle's mode:"json" driver round-trip.
  return row.stateJson;
}

export class SqliteDraftStore implements DraftStore {
  constructor(private readonly db: PraxisDb) {}

  load(draftId: string): DraftCourseState | null {
    const row = this.db
      .select({ stateJson: drafts.stateJson })
      .from(drafts)
      .where(and(eq(drafts.id, draftId), isActive))
      .get();
    return row ? rowToState(row) : null;
  }

  save(draft: DraftCourseState): void {
    // The caller supplies the complete state including lastTouchedAt.
    // The column mirrors the state's value — touch() handles column-only bumps.
    this.db
      .insert(drafts)
      .values({
        id: draft.draftId,
        studentId: draft.studentId,
        createdAt: new Date(draft.createdAt),
        lastTouchedAt: new Date(draft.lastTouchedAt),
        confirmedAt: null,
        discardedAt: null,
        courseId: null,
        stateJson: draft,
      })
      .onConflictDoUpdate({
        target: drafts.id,
        set: {
          // Preserve createdAt — never overwrite on upsert.
          lastTouchedAt: new Date(draft.lastTouchedAt),
          stateJson: draft,
        },
      })
      .run();
  }

  listForStudent(studentId: StudentId): readonly DraftCourseState[] {
    const rows = this.db
      .select({ stateJson: drafts.stateJson })
      .from(drafts)
      .where(and(eq(drafts.studentId, studentId), isActive))
      .orderBy(desc(drafts.lastTouchedAt))
      .all();
    return rows.map(rowToState);
  }

  listActive(): readonly DraftCourseState[] {
    const rows = this.db
      .select({ stateJson: drafts.stateJson })
      .from(drafts)
      .where(isActive)
      .orderBy(desc(drafts.lastTouchedAt))
      .all();
    return rows.map(rowToState);
  }

  touch(draftId: string): void {
    const now = new Date();
    this.db.update(drafts).set({ lastTouchedAt: now }).where(eq(drafts.id, draftId)).run();
  }

  markConfirmedTx(tx: PraxisDb, draftId: string, courseId: string): void {
    tx.update(drafts)
      .set({ confirmedAt: new Date(), courseId })
      .where(eq(drafts.id, draftId))
      .run();
  }

  markDiscarded(draftId: string): void {
    this.db.update(drafts).set({ discardedAt: new Date() }).where(eq(drafts.id, draftId)).run();
  }

  sweepStale(cutoff: number): readonly string[] {
    const cutoffDate = new Date(cutoff);
    const now = new Date();

    // Find stale active rows.
    const staleRows = this.db
      .select({ id: drafts.id })
      .from(drafts)
      .where(and(isActive, lt(drafts.lastTouchedAt, cutoffDate)))
      .all();

    if (staleRows.length === 0) return [];

    const ids = staleRows.map((r) => r.id);

    // Mark all stale rows discarded in one statement.
    this.db.update(drafts).set({ discardedAt: now }).where(inArray(drafts.id, ids)).run();

    return ids;
  }
}
