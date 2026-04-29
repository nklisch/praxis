import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { chunkMarkdown } from "./chunker.js";
import type { Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";

/**
 * MarkdownIngestor — handles `.md` and `.markdown` files.
 * Extracts the H1 as the document title (if present) and chunks at heading
 * boundaries.
 */
export class MarkdownIngestor implements Ingestor {
  readonly id = "markdown" as const;
  readonly label = "Markdown";
  readonly extensions = [".md", ".markdown"] as const;
  readonly mimeTypes = ["text/markdown", "text/x-markdown"] as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    const raw = await readFile(filePath, "utf-8");

    // Extract H1 as document title
    const h1Match = /^#\s+(.+)$/m.exec(raw);
    const title = h1Match ? h1Match[1]!.trim() : basename(filePath, extname(filePath));

    const { chunks } = chunkMarkdown(raw, {
      ...(opts.maxChars !== undefined && { maxChars: opts.maxChars }),
    });

    return {
      title,
      chunks,
      ingestorId: this.id,
    };
  }
}
