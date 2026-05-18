import { courses, documentScopes, documents } from "@praxis/artifacts/schema";
import { sessions } from "@praxis/memory/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type {
  DocumentId,
  DocumentScope,
  DocumentScopeAttachment,
  DocumentScopeSource,
  DocumentScopesService,
  Logger,
  StudentId,
} from "../types/index.js";
import { brandId } from "../types/index.js";

/** Optional character-level range within the document text. */
export interface PassageRange {
  startOffset: number;
  endOffset: number;
}

export interface DocumentScopesServiceDeps {
  db: PraxisDb;
  log: Logger;
}

export class DocumentScopesServiceImpl implements DocumentScopesService {
  constructor(private readonly deps: DocumentScopesServiceDeps) {}

  async listForScope(scope: DocumentScope): Promise<DocumentId[]> {
    const rows = this.deps.db
      .select({ documentId: documentScopes.documentId })
      .from(documentScopes)
      .where(and(eq(documentScopes.scopeKind, scope.kind), eq(documentScopes.scopeId, scope.id)))
      .orderBy(documentScopes.attachedAt)
      .all();
    return rows.map((r) => brandId<"DocumentId">(r.documentId));
  }

  async listForScopeDetailed(scope: DocumentScope): Promise<DocumentScopeAttachment[]> {
    const rows = this.deps.db
      .select({
        id: documents.id,
        filename: documents.filename,
        mimeType: documents.mimeType,
        chunkCount: documents.chunkCount,
        manifestJson: documents.manifestJson,
        source: documentScopes.source,
        attachedAt: documentScopes.attachedAt,
      })
      .from(documentScopes)
      .innerJoin(documents, eq(documentScopes.documentId, documents.id))
      .where(and(eq(documentScopes.scopeKind, scope.kind), eq(documentScopes.scopeId, scope.id)))
      .orderBy(documentScopes.attachedAt)
      .all();
    return rows.map((r) => {
      const manifest = r.manifestJson as { hasPageImages?: boolean } | null;
      return {
        documentId: brandId<"DocumentId">(r.id),
        filename: r.filename,
        mimeType: r.mimeType,
        chunkCount: r.chunkCount,
        hasPageImages: manifest?.hasPageImages === true,
        source: r.source as DocumentScopeSource,
        attachedAt: r.attachedAt,
      };
    });
  }

  async listOrphaned(studentId: StudentId): Promise<DocumentScopeAttachment[]> {
    // Fetch all documents for this student.
    const allDocs = this.deps.db
      .select({
        id: documents.id,
        filename: documents.filename,
        mimeType: documents.mimeType,
        chunkCount: documents.chunkCount,
        manifestJson: documents.manifestJson,
        ingestedAt: documents.ingestedAt,
      })
      .from(documents)
      .where(eq(documents.studentId, studentId))
      .all();

    const result: DocumentScopeAttachment[] = [];

    for (const doc of allDocs) {
      // Fetch all scope rows for this document.
      const scopeRows = this.deps.db
        .select({
          scopeKind: documentScopes.scopeKind,
          scopeId: documentScopes.scopeId,
          source: documentScopes.source,
          attachedAt: documentScopes.attachedAt,
        })
        .from(documentScopes)
        .where(eq(documentScopes.documentId, doc.id))
        .all();

      if (scopeRows.length === 0) {
        // Truly orphaned — no scope rows at all.
        const manifest = doc.manifestJson as { hasPageImages?: boolean } | null;
        result.push({
          documentId: brandId<"DocumentId">(doc.id),
          filename: doc.filename,
          mimeType: doc.mimeType,
          chunkCount: doc.chunkCount,
          hasPageImages: manifest?.hasPageImages === true,
          source: "ingestion",
          attachedAt: doc.ingestedAt,
        });
        continue;
      }

      // Check whether ANY scope row has a live parent.
      let hasLiveParent = false;
      let mostRecent = scopeRows[0]!;
      for (const r of scopeRows) {
        if (r.attachedAt > mostRecent.attachedAt) mostRecent = r;
        if (r.scopeKind === "course") {
          const c = this.deps.db
            .select({ id: courses.id })
            .from(courses)
            .where(eq(courses.id, r.scopeId))
            .get();
          if (c) {
            hasLiveParent = true;
            break;
          }
        } else if (r.scopeKind === "session") {
          const s = this.deps.db
            .select({ id: sessions.id })
            .from(sessions)
            .where(eq(sessions.id, r.scopeId))
            .get();
          if (s) {
            hasLiveParent = true;
            break;
          }
        }
      }

      if (!hasLiveParent) {
        // All scope rows point at deleted parents — orphaned.
        const manifest = doc.manifestJson as { hasPageImages?: boolean } | null;
        result.push({
          documentId: brandId<"DocumentId">(doc.id),
          filename: doc.filename,
          mimeType: doc.mimeType,
          chunkCount: doc.chunkCount,
          hasPageImages: manifest?.hasPageImages === true,
          source: mostRecent.source as DocumentScopeSource,
          attachedAt: mostRecent.attachedAt,
        });
      }
    }

    return result;
  }

  async attach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
    source: DocumentScopeSource;
    /** Optional character-level range; only meaningful on session-scoped attachments. */
    passageRange?: PassageRange;
  }): Promise<{ attached: boolean }> {
    if (input.passageRange !== undefined) {
      // Upsert path: write the passage range, updating if the row already exists.
      // Returns attached:true unconditionally — the caller is explicitly setting a range.
      this.deps.db
        .insert(documentScopes)
        .values({
          documentId: input.documentId,
          scopeKind: input.scope.kind,
          scopeId: input.scope.id,
          attachedAt: new Date(),
          source: input.source,
          passageRangeJson: input.passageRange,
        })
        .onConflictDoUpdate({
          target: [documentScopes.documentId, documentScopes.scopeKind, documentScopes.scopeId],
          set: { passageRangeJson: input.passageRange },
        })
        .run();
      return { attached: true };
    }

    // Standard idempotent path — no passage range.
    const result = this.deps.db
      .insert(documentScopes)
      .values({
        documentId: input.documentId,
        scopeKind: input.scope.kind,
        scopeId: input.scope.id,
        attachedAt: new Date(),
        source: input.source,
        passageRangeJson: null,
      })
      .onConflictDoNothing()
      .run();
    return { attached: result.changes > 0 };
  }

  /**
   * Retrieve the passage range recorded on a session-scoped document attachment.
   * Returns null when no passage range was stored or no scope row exists.
   */
  async getPassageRange(input: {
    scope: DocumentScope;
    documentId: DocumentId;
  }): Promise<PassageRange | null> {
    const row = this.deps.db
      .select({ passageRangeJson: documentScopes.passageRangeJson })
      .from(documentScopes)
      .where(
        and(
          eq(documentScopes.documentId, input.documentId),
          eq(documentScopes.scopeKind, input.scope.kind),
          eq(documentScopes.scopeId, input.scope.id),
        ),
      )
      .get();
    if (!row) return null;
    const raw = row.passageRangeJson as PassageRange | null;
    if (raw == null) return null;
    return { startOffset: raw.startOffset, endOffset: raw.endOffset };
  }

  async detach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
  }): Promise<{ detached: boolean }> {
    const result = this.deps.db
      .delete(documentScopes)
      .where(
        and(
          eq(documentScopes.documentId, input.documentId),
          eq(documentScopes.scopeKind, input.scope.kind),
          eq(documentScopes.scopeId, input.scope.id),
        ),
      )
      .run();
    return { detached: result.changes > 0 };
  }

  async attachMany(input: {
    scope: DocumentScope;
    documentIds: ReadonlyArray<DocumentId>;
    source: DocumentScopeSource;
  }): Promise<{ newlyAttached: DocumentId[] }> {
    if (input.documentIds.length === 0) return { newlyAttached: [] };

    const newlyAttached: DocumentId[] = [];
    this.deps.db.transaction(() => {
      const existing = this.deps.db
        .select({ documentId: documentScopes.documentId })
        .from(documentScopes)
        .where(
          and(
            eq(documentScopes.scopeKind, input.scope.kind),
            eq(documentScopes.scopeId, input.scope.id),
            inArray(documentScopes.documentId, input.documentIds as DocumentId[]),
          ),
        )
        .all();
      const existingSet = new Set(existing.map((r) => r.documentId));
      const toInsert = (input.documentIds as DocumentId[]).filter((id) => !existingSet.has(id));
      if (toInsert.length > 0) {
        const now = new Date();
        this.deps.db
          .insert(documentScopes)
          .values(
            toInsert.map((documentId) => ({
              documentId,
              scopeKind: input.scope.kind,
              scopeId: input.scope.id,
              attachedAt: now,
              source: input.source,
            })),
          )
          .run();
        newlyAttached.push(...toInsert.map((id) => brandId<"DocumentId">(id)));
      }
    });
    return { newlyAttached };
  }

  async listScopesForDocument(documentId: DocumentId): Promise<DocumentScope[]> {
    const rows = this.deps.db
      .select({
        scopeKind: documentScopes.scopeKind,
        scopeId: documentScopes.scopeId,
      })
      .from(documentScopes)
      .where(eq(documentScopes.documentId, documentId))
      .all();
    return rows.map((r) =>
      r.scopeKind === "course"
        ? { kind: "course" as const, id: brandId<"CourseId">(r.scopeId) }
        : { kind: "session" as const, id: brandId<"SessionId">(r.scopeId) },
    );
  }

  async promoteScope(input: {
    from: DocumentScope;
    to: DocumentScope;
    source: DocumentScopeSource;
  }): Promise<{ promoted: DocumentId[] }> {
    const ids = await this.listForScope(input.from);
    const result = await this.attachMany({
      scope: input.to,
      documentIds: ids,
      source: input.source,
    });
    return { promoted: result.newlyAttached };
  }
}
