import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { PageImageStore } from "@praxis/core/ingestion";
import type { VisionCapability } from "@praxis/core/types";
import type { IngestedChunk, Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";
import { VISION_PROMPT } from "./vision-prompt.js";

export interface VisionPdfIngestorOptions {
  /** Returns the current engine's vision capability, or undefined if unavailable. */
  visionResolver: () => VisionCapability | undefined;
  /**
   * Optional store for persisting rendered page images. When set, each rendered
   * page PNG is saved for the "View page" UI feature.
   */
  pageImageStore?: PageImageStore;
  /**
   * Render scale — higher values produce larger images with better OCR quality
   * but more tokens per page. Default: 2.0.
   */
  renderScale?: number;
}

/**
 * VisionPdfIngestor — per-page render → engine vision → markdown chunks.
 *
 * Renders each PDF page to PNG using pdfjs-dist + canvas, sends the image
 * to the engine's vision capability (one-shot, isolated from the active
 * tutoring session), and parses the resulting markdown into chunks.
 *
 * When `pageImageStore` is provided, each rendered PNG is saved to disk so
 * the UI can show a "View page" button on source cards.
 *
 * Note: both pdfjs-dist and canvas are lazy-imported inside `parse()` to
 * avoid loading native binaries in test environments.
 */
export class VisionPdfIngestor implements Ingestor {
  readonly id = "vision-pdf" as const;
  readonly label = "PDF (vision OCR)";
  readonly extensions = [".pdf"] as const;
  readonly mimeTypes = ["application/pdf"] as const;

  constructor(private readonly opts: VisionPdfIngestorOptions) {}

  async isAvailable(): Promise<boolean> {
    return this.opts.visionResolver() !== undefined;
  }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    const vision = this.opts.visionResolver();
    if (!vision) {
      throw new Error("VisionPdfIngestor: no vision capability on the active engine");
    }

    const data = await readFile(filePath);

    // Lazy imports — pdfjs-dist and canvas are large/native; keep out of module
    // graph until parse() is actually called (same pattern as IsolatedVmHost)
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // biome-ignore lint/suspicious/noExplicitAny: canvas CJS/ESM interop
    const canvasModule = (await import("canvas")) as any;
    const createCanvas =
      typeof canvasModule.createCanvas === "function"
        ? canvasModule.createCanvas
        : canvasModule.default?.createCanvas;

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;

    const renderScale = this.opts.renderScale ?? 2.0;
    const maxChars = opts.maxChars ?? 2000;
    const chunks: IngestedChunk[] = [];
    let chunkIndex = 0;
    let currentSection: string | undefined;

    // The real documentId is assigned by IngestionService after this call.
    // Use a synthetic id so page images can be saved immediately; IngestionService
    // renames the directory to the real documentId after persisting the row.
    const synthDocId = `pending-${basename(filePath, extname(filePath))}-${Date.now()}`;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      if (opts.signal?.aborted) break;

      opts.onPageProgress?.(pageNum, pdf.numPages);

      // Render to PNG
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: renderScale });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext("2d") as unknown as Parameters<
        typeof page.render
      >[0]["canvasContext"];
      // pdfjs-dist 5.x requires `canvas` in addition to canvasContext
      await page.render({
        canvasContext: ctx,
        viewport,
        canvas: canvas as unknown as Parameters<typeof page.render>[0]["canvas"],
      }).promise;
      const pngBuffer: Buffer = canvas.toBuffer("image/png");

      // Persist page image if a store is configured
      if (this.opts.pageImageStore) {
        await this.opts.pageImageStore.save({
          documentId: synthDocId,
          page: pageNum,
          pngBytes: pngBuffer,
        });
      }

      // Vision call — fresh one-shot SDK session per page (VisionCapability contract)
      const visionResult = await vision.describe({
        prompt: VISION_PROMPT,
        images: [{ data: pngBuffer.toString("base64"), mimeType: "image/png" }],
        maxTokens: 4000,
      });

      const pageMarkdown = visionResult.text.trim();
      if (pageMarkdown === "[BLANK PAGE]" || pageMarkdown === "") continue;

      // Parse the page's markdown into chunks at paragraph / heading boundaries
      let buf: string[] = [];
      let bufLen = 0;

      const flush = () => {
        if (buf.length === 0) return;
        const chunk: IngestedChunk = {
          chunkIndex: chunkIndex++,
          text: buf.join("\n\n"),
          page: pageNum,
        };
        if (currentSection !== undefined) chunk.section = currentSection;
        chunks.push(chunk);
        buf = [];
        bufLen = 0;
      };

      for (const para of pageMarkdown.split("\n\n")) {
        const stripped = para.trim();
        if (!stripped) continue;

        const headingMatch = /^(#{1,6})\s+(.+)$/.exec(stripped);
        if (headingMatch) {
          flush();
          currentSection = headingMatch[2]!.trim();
          const headerChunk: IngestedChunk = {
            chunkIndex: chunkIndex++,
            text: stripped,
            section: currentSection,
            page: pageNum,
            blockType: "SectionHeader",
          };
          chunks.push(headerChunk);
          continue;
        }

        if (bufLen + stripped.length > maxChars && buf.length > 0) {
          flush();
        }
        buf.push(stripped);
        bufLen += stripped.length;
      }
      flush();
    }

    return {
      title: basename(filePath, extname(filePath)),
      pageCount: pdf.numPages,
      chunks,
      ingestorId: this.id,
      ...(this.opts.pageImageStore && { pendingPageImageDocId: synthDocId }),
    };
  }
}
