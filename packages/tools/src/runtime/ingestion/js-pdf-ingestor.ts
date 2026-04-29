import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { chunkParagraphs } from "./chunker.js";
import type { IngestedChunk, Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";

/**
 * JsPdfIngestor — text-layer PDF extraction via `pdfjs-dist`.
 *
 * Extracts text from each page's text layer (no rendering, no vision).
 * Each page's text is chunked independently with the page number set.
 * Works well for PDFs with embedded searchable text (most modern PDFs).
 * Falls back gracefully for pages with no text layer (scanned PDFs with
 * no OCR — those chunks will be empty and skipped).
 *
 * Use VisionPdfIngestor for scanned / math-heavy PDFs.
 */
export class JsPdfIngestor implements Ingestor {
  readonly id = "js-pdf" as const;
  readonly label = "PDF (text layer)";
  readonly extensions = [".pdf"] as const;
  readonly mimeTypes = ["application/pdf"] as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    const data = await readFile(filePath);

    // Lazy import — pdfjs-dist legacy build for Node.js
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(data),
    });
    const pdf = await loadingTask.promise;

    const chunks: IngestedChunk[] = [];
    let chunkIndex = 0;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      if (opts.signal?.aborted) break;

      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Join text items, preserving some line structure
      const pageText = textContent.items
        .map((item) => {
          // TextItem has `str` and `hasEOL`; TextMarkedContent doesn't
          if ("str" in item) {
            return item.hasEOL ? `${item.str}\n` : item.str;
          }
          return "";
        })
        .join("");

      if (!pageText.trim()) continue;

      const pageChunks = chunkParagraphs(pageText, {
        startIndex: chunkIndex,
        page: pageNum,
        ...(opts.maxChars !== undefined && { maxChars: opts.maxChars }),
      });

      chunks.push(...pageChunks);
      chunkIndex += pageChunks.length;
    }

    const title = basename(filePath, extname(filePath));

    return {
      title,
      pageCount: pdf.numPages,
      chunks,
      ingestorId: this.id,
    };
  }
}
