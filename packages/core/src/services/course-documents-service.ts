import { courseDocuments, documents } from "@praxis/artifacts/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type {
  CourseDocumentsService,
  CourseId,
  DocumentId,
  DocumentSummaryItem,
  Logger,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface CourseDocumentsServiceDeps {
  db: PraxisDb;
  log: Logger;
}

export class CourseDocumentsServiceImpl implements CourseDocumentsService {
  constructor(private readonly deps: CourseDocumentsServiceDeps) {}

  async listForCourse(courseId: CourseId): Promise<DocumentId[]> {
    const rows = this.deps.db
      .select({ documentId: courseDocuments.documentId })
      .from(courseDocuments)
      .where(eq(courseDocuments.courseId, courseId))
      .orderBy(courseDocuments.attachedAt)
      .all();
    return rows.map((r) => brandId<"DocumentId">(r.documentId));
  }

  async listForCourseDetailed(courseId: CourseId): Promise<DocumentSummaryItem[]> {
    // INNER JOIN course_documents to documents, filtered to courseId.
    // Shape matches ArtifactsServiceImpl.listDocuments for consistency.
    const rows = this.deps.db
      .select({
        id: documents.id,
        filename: documents.filename,
        mimeType: documents.mimeType,
        chunkCount: documents.chunkCount,
        manifestJson: documents.manifestJson,
      })
      .from(courseDocuments)
      .innerJoin(documents, eq(courseDocuments.documentId, documents.id))
      .where(eq(courseDocuments.courseId, courseId))
      .orderBy(courseDocuments.attachedAt)
      .all();

    return rows.map((r) => {
      const manifest = r.manifestJson as { hasPageImages?: boolean } | null;
      return {
        documentId: brandId<"DocumentId">(r.id),
        filename: r.filename,
        mimeType: r.mimeType,
        chunkCount: r.chunkCount,
        hasPageImages: manifest?.hasPageImages === true,
      };
    });
  }

  async attach(input: {
    courseId: CourseId;
    documentId: DocumentId;
    source: "bootstrap" | "manual" | "ingestion";
  }): Promise<{ attached: boolean }> {
    const result = this.deps.db
      .insert(courseDocuments)
      .values({
        courseId: input.courseId,
        documentId: input.documentId,
        attachedAt: new Date(),
        source: input.source,
      })
      .onConflictDoNothing()
      .run();
    return { attached: result.changes > 0 };
  }

  async detach(input: {
    courseId: CourseId;
    documentId: DocumentId;
  }): Promise<{ detached: boolean }> {
    const result = this.deps.db
      .delete(courseDocuments)
      .where(
        and(
          eq(courseDocuments.courseId, input.courseId),
          eq(courseDocuments.documentId, input.documentId),
        ),
      )
      .run();
    return { detached: result.changes > 0 };
  }

  async attachMany(input: {
    courseId: CourseId;
    documentIds: ReadonlyArray<DocumentId>;
    source: "bootstrap" | "manual" | "ingestion";
  }): Promise<{ newlyAttached: DocumentId[] }> {
    if (input.documentIds.length === 0) {
      return { newlyAttached: [] };
    }

    const newlyAttached: DocumentId[] = [];

    // Use a transaction: select existing, compute diff, insert diff
    this.deps.db.transaction(() => {
      const existing = this.deps.db
        .select({ documentId: courseDocuments.documentId })
        .from(courseDocuments)
        .where(
          and(
            eq(courseDocuments.courseId, input.courseId),
            inArray(courseDocuments.documentId, input.documentIds as DocumentId[]),
          ),
        )
        .all();

      const existingSet = new Set(existing.map((r) => r.documentId));
      const toInsert = (input.documentIds as DocumentId[]).filter((id) => !existingSet.has(id));

      if (toInsert.length > 0) {
        const now = new Date();
        this.deps.db
          .insert(courseDocuments)
          .values(
            toInsert.map((documentId) => ({
              courseId: input.courseId,
              documentId,
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
}
