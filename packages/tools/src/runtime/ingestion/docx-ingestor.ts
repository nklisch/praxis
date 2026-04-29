import { basename, extname } from "node:path";
import { chunkMarkdown } from "./chunker.js";
import type { Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";

/**
 * DocxIngestor — handles `.docx` files via `mammoth`.
 * Converts DOCX to HTML (preserving heading structure), then walks the HTML
 * to produce markdown-like text for heading-aware chunking.
 */
export class DocxIngestor implements Ingestor {
  readonly id = "docx" as const;
  readonly label = "DOCX";
  readonly extensions = [".docx"] as const;
  readonly mimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ] as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    // Lazy import — mammoth is only needed when DOCX is being parsed
    const mammoth = await import("mammoth");

    const result = await mammoth.convertToHtml({ path: filePath });
    const html = result.value;
    const fallbackTitle = basename(filePath, extname(filePath));

    const markdown = docxHtmlToMarkdown(html);

    // Extract H1 as title
    const h1Match = /^#\s+(.+)$/m.exec(markdown);
    const title = h1Match ? h1Match[1]!.trim() : fallbackTitle;

    const { chunks } = chunkMarkdown(markdown, {
      ...(opts.maxChars !== undefined && { maxChars: opts.maxChars }),
    });

    return {
      title,
      chunks,
      ingestorId: this.id,
    };
  }
}

/**
 * Convert mammoth's HTML output to markdown-like text.
 * Mammoth produces clean, semantic HTML — we only need to handle
 * headings (h1-h6), paragraphs, lists, and code.
 */
function docxHtmlToMarkdown(html: string): string {
  const result = html
    // Headings
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_, t) => `\n\n# ${stripTags(t)}\n\n`)
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_, t) => `\n\n## ${stripTags(t)}\n\n`)
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_, t) => `\n\n### ${stripTags(t)}\n\n`)
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, (_, t) => `\n\n#### ${stripTags(t)}\n\n`)
    .replace(/<h5[^>]*>(.*?)<\/h5>/gi, (_, t) => `\n\n##### ${stripTags(t)}\n\n`)
    .replace(/<h6[^>]*>(.*?)<\/h6>/gi, (_, t) => `\n\n###### ${stripTags(t)}\n\n`)
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
