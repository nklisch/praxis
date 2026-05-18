import { documentChunks, documents } from "@praxis/artifacts/schema";
import { asc, eq } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import { assertSafeDocumentId } from "../ingestion/document-id-guard.js";
import type { EmbeddedImageStore } from "../ingestion/embedded-images.js";
import type { PageImageStore } from "../ingestion/page-images.js";
import type { DocumentDetail, DocumentSummary } from "../types/client.js";
import type { FtsStore, VectorStore } from "../types/rag-service.js";

export interface DocumentsServiceDeps {
  db: PraxisDb;
  vectorStore: VectorStore;
  ftsStore: FtsStore;
  pageImageStore: PageImageStore;
  embeddedImageStore: EmbeddedImageStore;
}

/**
 * DocumentsServiceImpl — server-side service for listing and deleting documents.
 *
 * Delete cascades through all four stores:
 *   vectorStore.deleteByDocumentId       → removes embeddings
 *   ftsStore.deleteByDocumentId          → removes FTS index rows
 *   pageImageStore.deleteByDocumentId    → removes saved page PNGs
 *   embeddedImageStore.deleteByDocumentId → removes PPTX-embedded images
 *   db.delete(documents)                 → removes document row + chunks (FK cascade)
 */
export class DocumentsServiceImpl {
  constructor(private readonly deps: DocumentsServiceDeps) {}

  async list(): Promise<DocumentSummary[]> {
    const rows = this.deps.db
      .select({
        id: documents.id,
        filename: documents.filename,
        mimeType: documents.mimeType,
        ingestedAt: documents.ingestedAt,
        manifestJson: documents.manifestJson,
        chunkCount: documents.chunkCount,
      })
      .from(documents)
      .all();

    return rows.map((row) => {
      const manifest = row.manifestJson as {
        title?: string | null;
        ingestorId?: string | null;
        ingestorLabel?: string | null;
        pageCount?: number | null;
        hasPageImages?: boolean | null;
      } | null;

      return {
        documentId: row.id,
        filename: row.filename,
        mimeType: row.mimeType,
        ingestorId: manifest?.ingestorId ?? "unknown",
        ingestorLabel: manifest?.ingestorLabel ?? manifest?.ingestorId ?? "Unknown",
        chunkCount: row.chunkCount,
        createdAt: row.ingestedAt.toISOString(),
        hasPageImages: manifest?.hasPageImages ?? false,
      };
    });
  }

  async get(documentId: string): Promise<DocumentDetail | null> {
    assertSafeDocumentId(documentId);

    const row = this.deps.db
      .select({
        id: documents.id,
        filename: documents.filename,
        mimeType: documents.mimeType,
        ingestedAt: documents.ingestedAt,
        manifestJson: documents.manifestJson,
        chunkCount: documents.chunkCount,
      })
      .from(documents)
      .where(eq(documents.id, documentId))
      .get();

    if (!row) return null;

    const manifest = row.manifestJson as {
      title?: string | null;
      ingestorId?: string | null;
      ingestorLabel?: string | null;
      pageCount?: number | null;
      hasPageImages?: boolean | null;
    } | null;

    // Fetch all chunks ordered by index — join the text as the document's full text.
    const chunkRows = this.deps.db
      .select({ text: documentChunks.text })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId))
      .orderBy(asc(documentChunks.chunkIndex))
      .all();

    const text = chunkRows.map((c) => c.text).join("\n\n");

    return {
      documentId: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      ingestorId: manifest?.ingestorId ?? "unknown",
      ingestorLabel: manifest?.ingestorLabel ?? manifest?.ingestorId ?? "Unknown",
      chunkCount: row.chunkCount,
      createdAt: row.ingestedAt.toISOString(),
      hasPageImages: manifest?.hasPageImages ?? false,
      title: manifest?.title ?? null,
      pageCount: manifest?.pageCount ?? null,
      text,
    };
  }

  async delete(documentId: string): Promise<void> {
    assertSafeDocumentId(documentId);
    // Clean up all external stores first, then remove the DB row + chunks (FK cascade)
    await this.deps.vectorStore.deleteByDocumentId(documentId);
    await this.deps.ftsStore.deleteByDocumentId(documentId);
    await this.deps.pageImageStore.deleteByDocumentId(documentId);
    await this.deps.embeddedImageStore.deleteByDocumentId(documentId);
    this.deps.db.delete(documents).where(eq(documents.id, documentId)).run();
  }

  async pageImage(input: { documentId: string; page: number }): Promise<Buffer | null> {
    assertSafeDocumentId(input.documentId);
    return this.deps.pageImageStore.read(input);
  }
}
