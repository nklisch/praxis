import { rename } from "node:fs/promises";
import { documentChunks, documents } from "@praxis/artifacts/schema";
import type { IngestorRegistry } from "@praxis/tools/runtime/ingestion";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  ActivityRegistry,
  DocumentId,
  DocumentScopesService,
  EmbeddingService,
  FtsStore,
  IngestionEvent,
  IngestionRequest,
  Logger,
  VectorStore,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import type { EmbeddedImageStore } from "./embedded-images.js";
import type { PageImageStore } from "./page-images.js";

export interface IngestionServiceDeps {
  db: PraxisDb;
  log: Logger;
  vectorStore: VectorStore;
  ftsStore: FtsStore;
  embeddings: EmbeddingService;
  ingestorRegistry: IngestorRegistry;
  pageImageStore: PageImageStore;
  /** Store for embedded images extracted from PPTX (and future: DOCX) files. */
  embeddedImageStore: EmbeddedImageStore;
  /** When provided, auto-attaches ingested documents to the scope specified in IngestionRequest.scope. */
  documentScopes?: DocumentScopesService;
  /** Activity registry for ambient progress reporting via the activity rail. */
  activity?: ActivityRegistry;
}

/**
 * Derive an editorial-friendly label from a filename.
 * Strips extension, replaces dashes/underscores with spaces, lowercases.
 * Example: "Sullivan_Algebra-Trigonometry.pdf" -> "sullivan algebra trigonometry"
 */
function friendlyDocumentLabel(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .toLowerCase();
}

const EMBED_BATCH_SIZE = 32;

class IngestionCancelledError extends Error {
  constructor() {
    super("Cancelled by user");
    this.name = "IngestionCancelledError";
  }
}

/**
 * IngestionService — orchestrates the full ingestion pipeline.
 *
 * Yields IngestionEvents as an async generator:
 * start -> ingestor_selected -> parsing -> [vision_page...] -> parsed ->
 * indexing (one per batch) -> done
 *
 * On error: yields an error event and returns early.
 * On cancellation (via signal): yields an error event and returns early.
 */
export class IngestionService {
  constructor(private readonly deps: IngestionServiceDeps) {}

  async *ingest(req: IngestionRequest, signal?: AbortSignal): AsyncIterable<IngestionEvent> {
    const documentId = uuidv7();
    const prettyName = friendlyDocumentLabel(req.filename);
    const actHandle = this.deps.activity?.start({ label: `reading ${prettyName}` });
    let activityFinished = false;
    let documentPersisted = false;

    const finishActivity = (status: "done" | "failed", err?: { message: string }) => {
      if (activityFinished) return;
      activityFinished = true;
      actHandle?.finish(status, err);
    };

    try {
      yield { type: "start", documentId, filename: req.filename };

      // 1. Select ingestor
      const ingestor = await this.deps.ingestorRegistry.select({
        mimeType: req.mimeType,
        filename: req.filename,
        ...(req.preferIngestorId !== undefined && { preferIngestorId: req.preferIngestorId }),
      });
      if (!ingestor) {
        const message = `No ingestor available for ${req.mimeType} / ${req.filename}`;
        finishActivity("failed", { message });
        yield {
          type: "error",
          error: {
            code: "ingest.no_ingestor",
            message,
            recoverable: false,
          },
        };
        return;
      }
      actHandle?.update({ detail: `using ${ingestor.label}` });
      yield { type: "ingestor_selected", ingestorId: ingestor.id, ingestorLabel: ingestor.label };

      // 2. Parse
      actHandle?.update({ detail: "reading text" });
      yield { type: "parsing", message: `Parsing with ${ingestor.label}...` };

      let result: Awaited<ReturnType<typeof ingestor.parse>>;
      try {
        result = await ingestor.parse(req.filePath, {
          ...(signal !== undefined && { signal }),
          onPageProgress: (page, totalPages) => {
            this.deps.log.debug("vision_page", { page, totalPages });
            actHandle?.update({
              detail: `vision page ${page} of ${totalPages}`,
              progress: { value: page, total: totalPages },
            });
          },
        });
      } catch (cause) {
        if (signal?.aborted) throw new IngestionCancelledError();
        const message = cause instanceof Error ? cause.message : String(cause);
        finishActivity("failed", { message });
        yield {
          type: "error",
          error: { code: "ingest.parse_failed", message, recoverable: false },
        };
        return;
      }

      if (signal?.aborted) throw new IngestionCancelledError();

      actHandle?.update({ label: `indexing ${prettyName}` });
      yield { type: "parsed", chunkCount: result.chunks.length };

      // 3. Persist document row
      const ingestedAt = new Date();
      this.deps.db
        .insert(documents)
        .values({
          id: documentId,
          studentId: req.studentId,
          filename: req.filename,
          mimeType: req.mimeType,
          ingestedAt,
          manifestJson: {
            title: result.title,
            pageCount: result.pageCount ?? null,
            ingestorId: result.ingestorId,
          },
          chunkCount: result.chunks.length,
        })
        .run();
      documentPersisted = true;

      // 4. Rename page-image directory from synthetic -> real documentId
      if (result.pendingPageImageDocId) {
        try {
          const synthDir = this.deps.pageImageStore.dirFor({
            documentId: result.pendingPageImageDocId,
          });
          const realDir = this.deps.pageImageStore.dirFor({ documentId });
          await rename(synthDir, realDir);
        } catch (e) {
          this.deps.log.warn("page-image rename failed", { error: String(e) });
        }
      }

      // 4b. Rename embedded-image directory from synthetic -> real documentId
      if (result.pendingEmbeddedImageDocId) {
        try {
          const synthDir = this.deps.embeddedImageStore.dirFor({
            documentId: result.pendingEmbeddedImageDocId,
          });
          const realDir = this.deps.embeddedImageStore.dirFor({ documentId });
          await rename(synthDir, realDir);
        } catch (e) {
          this.deps.log.warn("embedded-image rename failed", { error: String(e) });
        }
      }

      // 5. Persist chunk rows
      const chunkRows = result.chunks.map((c) => ({
        id: uuidv7(),
        documentId,
        chunkIndex: c.chunkIndex,
        text: c.text,
        locatorJson: {
          page: c.page ?? null,
          section: c.section ?? null,
          blockType: c.blockType ?? null,
          imageNames: c.imageNames ?? null,
        },
      }));

      if (chunkRows.length > 0) {
        this.deps.db.insert(documentChunks).values(chunkRows).run();
      }

      // 6. Embed + dual-index in batches
      let processed = 0;
      for (let start = 0; start < result.chunks.length; start += EMBED_BATCH_SIZE) {
        if (signal?.aborted) throw new IngestionCancelledError();

        const batch = result.chunks.slice(start, start + EMBED_BATCH_SIZE);
        const vectors = await this.deps.embeddings.embedBatch(batch.map((c) => c.text));

        const vectorUpserts = batch.flatMap((c, i) => {
          // biome-ignore lint/style/noNonNullAssertion: indices are guaranteed by batch slicing
          const row = chunkRows[start + i]!;
          // biome-ignore lint/style/noNonNullAssertion: vectors array length matches batch length
          const vec = vectors[i]!;
          return [
            {
              chunkId: row.id,
              documentId,
              embedding: vec,
              chunkText: c.text,
              ...(c.page !== undefined && { page: c.page }),
              ...(c.section !== undefined && { section: c.section }),
            },
          ];
        });

        const ftsUpserts = batch.flatMap((c, i) => {
          // biome-ignore lint/style/noNonNullAssertion: indices are guaranteed by batch slicing
          const row = chunkRows[start + i]!;
          return [
            {
              chunkId: row.id,
              documentId,
              chunkText: c.text,
              ...(c.page !== undefined && { page: c.page }),
              ...(c.section !== undefined && { section: c.section }),
            },
          ];
        });

        // Dual-write in parallel
        await Promise.all([
          this.deps.vectorStore.upsertBatch(vectorUpserts),
          this.deps.ftsStore.upsertBatch(ftsUpserts),
        ]);

        processed += batch.length;
        actHandle?.update({
          progress: { value: processed, total: result.chunks.length },
        });
        yield { type: "indexing", chunksProcessed: processed, totalChunks: result.chunks.length };
      }

      // Auto-attach to scope when scope is set (best-effort).
      if (req.scope !== undefined && this.deps.documentScopes !== undefined) {
        try {
          await this.deps.documentScopes.attach({
            scope: req.scope,
            documentId: brandId<"DocumentId">(documentId) as DocumentId,
            source: "ingestion",
          });
        } catch (err) {
          this.deps.log.warn("auto-attach to scope failed; document still persisted", {
            scope: req.scope,
            error: String(err),
          });
        }
      }

      finishActivity("done");
      yield { type: "done", documentId, chunkCount: result.chunks.length };
    } catch (cause) {
      if (documentPersisted) {
        await this.cleanupPartialDocument(documentId);
        documentPersisted = false;
      }
      const cancelled = cause instanceof IngestionCancelledError;
      const message = cause instanceof Error ? cause.message : String(cause);
      finishActivity("failed", { message });
      yield {
        type: "error",
        error: {
          code: cancelled ? "ingest.cancelled" : "ingest.index_failed",
          message,
          recoverable: false,
        },
      };
    } finally {
      if (!activityFinished) {
        if (documentPersisted) {
          await this.cleanupPartialDocument(documentId);
        }
        finishActivity("failed", { message: "Ingestion stopped before completion" });
      }
    }
  }

  private async cleanupPartialDocument(documentId: string): Promise<void> {
    try {
      this.deps.db.delete(documents).where(eq(documents.id, documentId)).run();
    } catch (err) {
      this.deps.log.warn("ingest.cleanup.document_failed", {
        documentId,
        error: String(err),
      });
    }

    await Promise.all([
      Promise.resolve(this.deps.vectorStore.deleteByDocumentId(documentId)).catch(
        (err: unknown) => {
          this.deps.log.warn("ingest.cleanup.vector_failed", { documentId, error: String(err) });
        },
      ),
      Promise.resolve(this.deps.ftsStore.deleteByDocumentId(documentId)).catch((err: unknown) => {
        this.deps.log.warn("ingest.cleanup.fts_failed", { documentId, error: String(err) });
      }),
    ]);
  }
}
