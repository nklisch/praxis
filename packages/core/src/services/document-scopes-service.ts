import { documentScopes, documents } from "@praxis/artifacts/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type {
  DocumentId,
  DocumentScope,
  DocumentScopeAttachment,
  DocumentScopeSource,
  DocumentScopesService,
  Logger,
} from "../types/index.js";
import { brandId } from "../types/index.js";

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
      .where(
        and(
          eq(documentScopes.scopeKind, scope.kind),
          eq(documentScopes.scopeId, scope.id),
        ),
      )
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
      .where(
        and(
          eq(documentScopes.scopeKind, scope.kind),
          eq(documentScopes.scopeId, scope.id),
        ),
      )
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

  async attach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
    source: DocumentScopeSource;
  }): Promise<{ attached: boolean }> {
    const result = this.deps.db
      .insert(documentScopes)
      .values({
        documentId: input.documentId,
        scopeKind: input.scope.kind,
        scopeId: input.scope.id,
        attachedAt: new Date(),
        source: input.source,
      })
      .onConflictDoNothing()
      .run();
    return { attached: result.changes > 0 };
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
            inArray(
              documentScopes.documentId,
              input.documentIds as DocumentId[],
            ),
          ),
        )
        .all();
      const existingSet = new Set(existing.map((r) => r.documentId));
      const toInsert = (input.documentIds as DocumentId[]).filter(
        (id) => !existingSet.has(id),
      );
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
