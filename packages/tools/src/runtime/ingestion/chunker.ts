import type { IngestedChunk } from "./ingestor.js";

export interface ChunkParagraphsOptions {
  /** Starting chunk index (for multi-section chunking). Default: 0. */
  startIndex?: number;
  /** Page number (1-based) to assign to all produced chunks. */
  page?: number;
  /** Section heading to assign to all produced chunks. */
  section?: string;
  /** Soft max characters per chunk. Won't break mid-paragraph. Default: 2000. */
  maxChars?: number;
}

/**
 * Split a block of text into chunks at paragraph boundaries.
 *
 * Rules:
 * - Paragraphs are separated by one or more blank lines.
 * - A new chunk is started when adding the next paragraph would exceed `maxChars`
 *   (unless the current chunk is empty, in which case the oversized paragraph
 *   forms its own chunk — no mid-paragraph breaks).
 * - Empty/whitespace-only paragraphs are skipped.
 */
export function chunkParagraphs(text: string, opts: ChunkParagraphsOptions = {}): IngestedChunk[] {
  const maxChars = opts.maxChars ?? 2000;
  let chunkIndex = opts.startIndex ?? 0;
  const chunks: IngestedChunk[] = [];

  let buf: string[] = [];
  let bufLen = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const chunk: IngestedChunk = {
      chunkIndex: chunkIndex++,
      text: buf.join("\n\n"),
      ...(opts.page !== undefined && { page: opts.page }),
      ...(opts.section !== undefined && { section: opts.section }),
    };
    chunks.push(chunk);
    buf = [];
    bufLen = 0;
  };

  for (const para of text.split(/\n\n+/)) {
    const stripped = para.trim();
    if (!stripped) continue;
    // If adding this para would exceed the cap and we already have content,
    // flush first. If the buf is empty (single oversized para), include anyway.
    if (bufLen + stripped.length > maxChars && buf.length > 0) {
      flush();
    }
    buf.push(stripped);
    bufLen += stripped.length;
  }
  flush();

  return chunks;
}

export interface HeadingChunkOptions {
  /** Starting chunk index. Default: 0. */
  startIndex?: number;
  /** Page number to assign to all chunks. */
  page?: number;
  /** Soft max characters per content chunk. Default: 2000. */
  maxChars?: number;
}

/**
 * Split markdown text into chunks that respect heading boundaries.
 *
 * Each heading starts a new section. The heading itself is emitted as a
 * "SectionHeader" chunk (so it's searchable), then the following paragraphs
 * are chunked within that section via `chunkParagraphs`.
 *
 * Returns the chunks and the final section name (useful for callers that
 * want to continue chunking across multiple pages under the same section).
 */
export function chunkMarkdown(
  markdown: string,
  opts: HeadingChunkOptions = {},
): { chunks: IngestedChunk[]; nextIndex: number; lastSection: string | undefined } {
  const maxChars = opts.maxChars ?? 2000;
  let chunkIndex = opts.startIndex ?? 0;
  const chunks: IngestedChunk[] = [];
  let currentSection: string | undefined;

  let bodyBuf: string[] = [];
  let bodyLen = 0;

  const flushBody = () => {
    if (bodyBuf.length === 0) return;
    const bodyChunks = chunkParagraphs(bodyBuf.join("\n\n"), {
      startIndex: chunkIndex,
      ...(opts.page !== undefined && { page: opts.page }),
      ...(currentSection !== undefined && { section: currentSection }),
      ...(maxChars !== undefined && { maxChars }),
    });
    chunks.push(...bodyChunks);
    chunkIndex += bodyChunks.length;
    bodyBuf = [];
    bodyLen = 0;
  };

  for (const para of markdown.split(/\n\n+/)) {
    const stripped = para.trim();
    if (!stripped) continue;

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(stripped);
    if (headingMatch) {
      flushBody();
      currentSection = headingMatch[2]!.trim();
      const headerChunk: IngestedChunk = {
        chunkIndex: chunkIndex++,
        text: stripped,
        blockType: "SectionHeader",
        section: currentSection,
        ...(opts.page !== undefined && { page: opts.page }),
      };
      chunks.push(headerChunk);
      continue;
    }

    if (bodyLen + stripped.length > maxChars && bodyBuf.length > 0) {
      flushBody();
    }
    bodyBuf.push(stripped);
    bodyLen += stripped.length;
  }
  flushBody();

  return { chunks, nextIndex: chunkIndex, lastSection: currentSection };
}
