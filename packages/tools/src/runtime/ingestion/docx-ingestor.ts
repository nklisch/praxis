import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import type { EmbeddedImageStore } from "@praxis/core/ingestion";
import { chunkMarkdown } from "./chunker.js";
import type { IngestedChunk, Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";

export interface DocxIngestorOptions {
  /**
   * When provided, embedded images in the DOCX are extracted and saved to
   * this store under a synthetic documentId. The result will include
   * `pendingEmbeddedImageDocId` so IngestionService can rename the directory
   * to the real documentId after the document row is persisted. Mirrors
   * `PptxIngestorOptions.embeddedImageStore`.
   */
  embeddedImageStore?: EmbeddedImageStore;
}

/**
 * DocxIngestor — handles `.docx` files via `mammoth`.
 *
 * Uses `mammoth.convertToMarkdown()` to produce markdown chunks. When
 * `opts.embeddedImageStore` is provided, embedded images are extracted via
 * mammoth's `convertImage` option and saved to the store under a synthetic
 * documentId, mirroring the `PptxIngestor` embedded-image contract.
 */
export class DocxIngestor implements Ingestor {
  readonly id = "docx" as const;
  readonly label = "DOCX";
  readonly extensions = [".docx"] as const;
  readonly mimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ] as const;

  constructor(private readonly opts: DocxIngestorOptions = {}) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async parse(filePath: string, parseOpts: IngestorOptions = {}): Promise<IngestorResult> {
    // Lazy import — mammoth is only loaded when DOCX is being parsed.
    // convertToMarkdown is present at runtime (mammoth@1.12.0) but absent from
    // the bundled .d.ts; cast to the extended type.
    const mammoth = (await import("mammoth")) as unknown as MammothWithMarkdown;

    // Reset per-parse state so the same ingestor instance is reusable.
    let pendingEmbeddedImageDocId: string | undefined;

    const { result: markdown, srcToImageName } = await this.runMammoth(mammoth, filePath);

    const fallbackTitle = basename(filePath, extname(filePath));
    const h1Match = /^#\s+(.+)$/m.exec(markdown);
    const title = h1Match ? h1Match[1]!.trim() : fallbackTitle;

    const { chunks } = chunkMarkdown(markdown, {
      ...(parseOpts.maxChars !== undefined && { maxChars: parseOpts.maxChars }),
    });

    const chunksWithImages = tagChunksWithImages(chunks, srcToImageName);

    if (this._pendingDocId !== undefined) {
      pendingEmbeddedImageDocId = this._pendingDocId;
      this._pendingDocId = undefined;
    }

    return {
      title,
      chunks: chunksWithImages,
      ingestorId: this.id,
      ...(pendingEmbeddedImageDocId !== undefined && { pendingEmbeddedImageDocId }),
    };
  }

  // Mutable slot reset at the start of each parse() call via this._pendingDocId check.
  private _pendingDocId: string | undefined;

  private async runMammoth(
    mammoth: MammothWithMarkdown,
    filePath: string,
  ): Promise<{ result: string; srcToImageName: Map<string, string> }> {
    const store = this.opts.embeddedImageStore;
    const srcToImageName = new Map<string, string>();

    // Fast path — no store, no image IO.
    if (store === undefined) {
      const { value } = await mammoth.convertToMarkdown({ path: filePath });
      return { result: value, srcToImageName };
    }

    // Synthetic documentId — IngestionService renames the dir post-persist
    // (same pattern as PptxIngestor).
    const syntheticDocId = `_pending_${randomUUID()}`;
    let imageCounter = 0;
    let anySaved = false;

    const { value } = await mammoth.convertToMarkdown(
      { path: filePath },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          // contentType is a sync string in mammoth@1.12.0 (not a Promise).
          const contentType: string = image.contentType ?? "image/png";
          const ext = mimeToExt(contentType);
          const imageName = `image-${++imageCounter}${ext}`;
          const bytes = Buffer.from(await image.readAsBase64String(), "base64");

          await store.save({
            documentId: syntheticDocId,
            imageName,
            bytes,
            mimeType: contentType,
          });
          anySaved = true;

          // praxis://embedded/<imageName> is a stable per-image marker the
          // chunker preserves inline; tagChunksWithImages maps it back to
          // imageName. Not exposed externally — read paths use {documentId,imageName}.
          const src = `praxis://embedded/${imageName}`;
          srcToImageName.set(src, imageName);
          return { src };
        }),
      },
    );

    if (anySaved) this._pendingDocId = syntheticDocId;
    return { result: value, srcToImageName };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Tag chunks whose text contains `![alt](praxis://embedded/<name>)` references
 * with the corresponding `imageNames`. Chunks without image references are
 * returned unchanged.
 */
function tagChunksWithImages(
  chunks: IngestedChunk[],
  srcToImageName: Map<string, string>,
): IngestedChunk[] {
  if (srcToImageName.size === 0) return chunks;
  const imageRefRe = /!\[[^\]]*\]\((praxis:\/\/embedded\/[^)]+)\)/g;
  return chunks.map((c) => {
    const names: string[] = [];
    for (const m of c.text.matchAll(imageRefRe)) {
      const name = srcToImageName.get(m[1]!);
      if (name !== undefined && !names.includes(name)) names.push(name);
    }
    return names.length > 0 ? { ...c, imageNames: names } : c;
  });
}

function mimeToExt(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/svg+xml") return ".svg";
  return ".bin";
}

// ---------------------------------------------------------------------------
// mammoth type augmentation
// ---------------------------------------------------------------------------

/**
 * mammoth@1.12.0 ships `convertToMarkdown` at runtime but its bundled .d.ts
 * only declares `convertToHtml`. Extend the import type locally rather than
 * patching node_modules.
 */
interface MammothWithMarkdown {
  convertToMarkdown(
    input: { path: string },
    options?: {
      convertImage?: { __mammothBrand: "ImageConverter" };
      [key: string]: unknown;
    },
  ): Promise<{ value: string; messages: unknown[] }>;
  images: {
    imgElement: (
      f: (image: {
        contentType: string;
        readAsBase64String: () => Promise<string>;
        readAsBuffer: () => Promise<Buffer>;
      }) => Promise<{ src: string }>,
    ) => { __mammothBrand: "ImageConverter" };
  };
}
