import { basename, extname } from "node:path";
import { chunkMarkdown } from "./chunker.js";
import type { IngestedChunk, Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";

/**
 * EpubIngestor — handles `.epub` files via `epub2`.
 * Processes chapter-by-chapter; each chapter becomes a section in the output.
 * HTML content is converted to markdown-like text for heading-aware chunking.
 */
export class EpubIngestor implements Ingestor {
  readonly id = "epub" as const;
  readonly label = "EPUB";
  readonly extensions = [".epub"] as const;
  readonly mimeTypes = ["application/epub+zip"] as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    // Lazy import — epub2 only loaded when EPUB is being parsed
    // epub2 exports EPub as a named export and as the default
    const epub2 = await import("epub2");
    // EPub is the class; prefer the named export which has the static createAsync
    const EpubClass = epub2.EPub ?? epub2.default;

    const epub = await EpubClass.createAsync(filePath);
    const title: string =
      (epub.metadata as { title?: string })?.title ?? basename(filePath, extname(filePath));

    const chunks: IngestedChunk[] = [];
    let chunkIndex = 0;

    // epub.flow is the spine (ordered list of chapter refs)
    const flow = (epub as { flow?: Array<{ id?: string; title?: string }> }).flow ?? [];

    for (const chapter of flow) {
      if (opts.signal?.aborted) break;
      if (!chapter.id) continue;

      let chapterHtml: string;
      try {
        chapterHtml = await epub.getChapterAsync(chapter.id);
      } catch {
        continue;
      }

      if (!chapterHtml.trim()) continue;

      const markdown = epubHtmlToMarkdown(chapterHtml);
      if (!markdown.trim()) continue;

      const chapterTitle: string | undefined = chapter.title ?? undefined;

      const { chunks: sectionChunks, nextIndex } = chunkMarkdown(markdown, {
        startIndex: chunkIndex,
        ...(opts.maxChars !== undefined && { maxChars: opts.maxChars }),
      });

      // If chunker didn't find a section from headings, assign chapter title
      if (chapterTitle) {
        for (const c of sectionChunks) {
          if (c.section === undefined) {
            c.section = chapterTitle;
          }
        }
      }

      chunks.push(...sectionChunks);
      chunkIndex = nextIndex;
    }

    return {
      title,
      chunks,
      ingestorId: this.id,
    };
  }
}

/**
 * Convert EPUB chapter HTML to markdown-like text.
 * Strips EPUB-specific markup, preserves heading structure.
 */
function epubHtmlToMarkdown(html: string): string {
  const result = html
    // Extract body content if present
    .replace(/^[\s\S]*?<body[^>]*>([\s\S]*?)<\/body>[\s\S]*$/i, "$1")
    // Headings
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_, t) => `\n\n# ${stripTags(t)}\n\n`)
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_, t) => `\n\n## ${stripTags(t)}\n\n`)
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_, t) => `\n\n### ${stripTags(t)}\n\n`)
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, (_, t) => `\n\n#### ${stripTags(t)}\n\n`)
    // Paragraphs
    .replace(/<p[^>]*>(.*?)<\/p>/gi, (_, t) => `\n\n${stripTags(t)}\n\n`)
    // List items
    .replace(/<li[^>]*>(.*?)<\/li>/gi, (_, t) => `\n- ${stripTags(t)}`)
    // Line breaks
    .replace(/<br\s*\/?>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}
