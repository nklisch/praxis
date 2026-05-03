import { documentChunks, documents } from "@praxis/artifacts/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type { PageImageStore } from "../ingestion/page-images.js";
import type { DocumentChunkRow, DocumentsReader } from "../types/tool.js";

/**
 * DrizzleDocumentsReader implements the DocumentsReader port.
 * Reads document metadata from the Drizzle DB and delegates page-image
 * retrieval to the injected PageImageStore.
 */
export class DrizzleDocumentsReader implements DocumentsReader {
  constructor(
    private readonly db: PraxisDb,
    private readonly pageImageStore: PageImageStore,
  ) {}

  async titlesByIds(ids: ReadonlyArray<string>): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();

    const rows = this.db
      .select({
        id: documents.id,
        filename: documents.filename,
        manifestJson: documents.manifestJson,
      })
      .from(documents)
      .where(inArray(documents.id, [...ids]))
      .all();

    const out = new Map<string, string>();
    for (const row of rows) {
      const manifest = row.manifestJson as { title?: string | null } | null;
      out.set(row.id, manifest?.title ?? row.filename);
    }
    return out;
  }

  async pageImage(input: { documentId: string; page: number }): Promise<Buffer | null> {
    return this.pageImageStore.read(input);
  }

  async chunksForDocument(input: {
    documentId: string;
    studentId: string;
  }): Promise<DocumentChunkRow[]> {
    // JOIN to documents for ownership verification — defense-in-depth.
    const rows = this.db
      .select({
        chunkIndex: documentChunks.chunkIndex,
        text: documentChunks.text,
        locatorJson: documentChunks.locatorJson,
      })
      .from(documentChunks)
      .innerJoin(
        documents,
        and(eq(documentChunks.documentId, documents.id), eq(documents.studentId, input.studentId)),
      )
      .where(eq(documentChunks.documentId, input.documentId))
      .orderBy(asc(documentChunks.chunkIndex))
      .all();

    return rows.map((r) => {
      const loc = r.locatorJson as { page?: number | null; section?: string | null } | null;
      return {
        chunkIndex: r.chunkIndex,
        text: r.text,
        ...(loc?.page != null && { page: loc.page }),
        ...(loc?.section != null && { section: loc.section }),
      };
    });
  }
}
