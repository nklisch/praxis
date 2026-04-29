import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { chunkParagraphs } from "./chunker.js";
import type { Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";

/**
 * PlainTextIngestor — handles `.txt` files and generic `text/plain` content.
 * Splits on paragraph boundaries (double newlines).
 */
export class PlainTextIngestor implements Ingestor {
  readonly id = "plain-text" as const;
  readonly label = "Plain Text";
  readonly extensions = [".txt"] as const;
  readonly mimeTypes = ["text/plain"] as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    const raw = await readFile(filePath, "utf-8");
    const title = basename(filePath, extname(filePath));

    const chunks = chunkParagraphs(raw, {
      ...(opts.maxChars !== undefined && { maxChars: opts.maxChars }),
    });

    return {
      title,
      chunks,
      ingestorId: this.id,
    };
  }
}
