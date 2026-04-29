import { extname } from "node:path";
import type { Ingestor } from "./ingestor.js";

export interface SelectInput {
  mimeType: string;
  filename: string;
  /**
   * When provided, the registry returns the ingestor with this id (if it
   * exists and is available), skipping mime/extension matching.
   */
  preferIngestorId?: string;
}

/**
 * Dispatches to the correct Ingestor based on mime type / file extension.
 *
 * Follows the discriminated-union-dispatch pattern: `Ingestor.id` is the
 * stable discriminant used for explicit override via `preferIngestorId`.
 *
 * Registration order matters: the first registered ingestor that matches
 * wins (when multiple match the same mime/extension). This lets callers
 * register a VisionPdfIngestor before JsPdfIngestor to make vision the
 * default for PDFs, or vice versa.
 */
export class IngestorRegistry {
  private readonly ingestors: Ingestor[];

  constructor(ingestors: Ingestor[]) {
    this.ingestors = ingestors;
  }

  /**
   * Return the best available ingestor for the given file. Returns null when
   * no registered ingestor matches or none are available.
   */
  async select(input: SelectInput): Promise<Ingestor | null> {
    if (input.preferIngestorId !== undefined) {
      const preferred = this.ingestors.find((i) => i.id === input.preferIngestorId);
      if (preferred && (await preferred.isAvailable())) return preferred;
    }

    const candidates = await this.candidatesFor(input);
    for (const c of candidates) {
      if (await c.isAvailable()) return c;
    }
    return null;
  }

  /**
   * Return all ingestors that match the given file by mime type or extension,
   * in registration order. Does NOT filter by availability.
   */
  candidatesFor(input: Pick<SelectInput, "mimeType" | "filename">): Ingestor[] {
    const ext = extname(input.filename).toLowerCase();
    return this.ingestors.filter(
      (i) => i.mimeTypes.includes(input.mimeType) || (ext !== "" && i.extensions.includes(ext)),
    );
  }

  /** Return all registered ingestors (for inspection / UI listing). */
  all(): Ingestor[] {
    return [...this.ingestors];
  }
}
