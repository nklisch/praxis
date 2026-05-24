import type {
  CourseId,
  DocumentScopesService,
  DraftCourseState,
  DraftId,
  LessonId,
  Logger,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import type { PraxisDb } from "../../db/index.js";
import { persistDraftTx } from "./draft-persistence.js";

export interface ConfirmDraftDeps {
  db: PraxisDb;
  documentScopes: DocumentScopesService;
  log: Logger;
}

export interface ConfirmDraftContext {
  draft: DraftCourseState;
  markConfirmedTx: (tx: PraxisDb, draftId: DraftId, courseId: CourseId) => void;
}

/**
 * Orchestrates the transactional portion of `confirmDraft`:
 * 1. Opens a Drizzle transaction, calls `persistDraftTx` then `markConfirmedTx`
 *    in the same tx — atomicity is preserved by passing both the same `tx` handle.
 * 2. After the transaction, promotes document scopes (non-fatal post-tx step).
 *
 * The service method retains ownership of:
 * - Loading + validating draft ownership.
 * - Calling `validateProposed`.
 * - Emitting the `finalized` event.
 */
export async function runConfirmDraft(
  ctx: ConfirmDraftContext,
  deps: ConfirmDraftDeps,
): Promise<{ courseId: CourseId; lessonIds: LessonId[]; conceptGraphId: string }> {
  const { draft, markConfirmedTx } = ctx;
  const { db, documentScopes, log } = deps;

  const now = new Date();

  // confirmDraft is atomic: persistDraftTx and markConfirmedTx run in the
  // same Drizzle transaction. If the persist fails, the draft row stays active.
  const result = db.transaction((tx) => {
    const r = persistDraftTx({ tx, draft, now });
    markConfirmedTx(tx, brandId<"DraftId">(draft.draftId) as DraftId, r.courseId);
    return r;
  });

  // Phase 16: attach source documents to the new course.
  // When the draft carries a sessionId (course-create-session-scoped-attachment
  // feature), promote the session-scope rows to course-scope — both survive so
  // the audit trail of "which docs this course-create session pulled in" is
  // preserved. For legacy drafts without sessionId, fall back to the original
  // attachMany path.
  if (draft.sessionId !== undefined) {
    try {
      await documentScopes.promoteScope({
        from: { kind: "session", id: draft.sessionId },
        to: { kind: "course", id: result.courseId },
        source: "course-create",
      });
    } catch (err) {
      log.warn("confirmDraft.promoteScope_failed", {
        courseId: result.courseId,
        sessionId: draft.sessionId,
        err: String(err),
      });
      // Non-fatal — course is persisted; documents can be manually re-attached.
    }
  } else if (draft.documentIds.length > 0) {
    // Legacy path: draft predates session-scoped attachment; attach directly.
    try {
      await documentScopes.attachMany({
        scope: { kind: "course", id: result.courseId },
        documentIds: draft.documentIds,
        source: "course-create",
      });
    } catch (err) {
      log.warn("confirmDraft.attachMany_failed", {
        courseId: result.courseId,
        err: String(err),
      });
      // Non-fatal: course is persisted; user can manually attach.
    }
  }

  return result;
}
