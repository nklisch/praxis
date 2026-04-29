import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { chunkMarkdown } from "./chunker.js";
import type { Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";

/**
 * HtmlIngestor — handles `.html` and `.htm` files.
 * Uses `@mozilla/readability` via `linkedom` to strip page chrome (nav, ads,
 * sidebars, scripts) and extract the article body, then converts headings +
 * paragraphs to a markdown-like structure for the shared chunker.
 */
export class HtmlIngestor implements Ingestor {
  readonly id = "html" as const;
  readonly label = "HTML";
  readonly extensions = [".html", ".htm"] as const;
  readonly mimeTypes = ["text/html"] as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    const raw = await readFile(filePath, "utf-8");
    const fallbackTitle = basename(filePath, extname(filePath));

    // Lazy imports — keeps test load fast and avoids native deps in unrelated tests
    const { parseHTML } = await import("linkedom");
    const { Readability } = await import("@mozilla/readability");

    const { document } = parseHTML(raw);

    // Readability requires a URL for relative link resolution; use a dummy
    // biome-ignore lint/suspicious/noExplicitAny: linkedom/Readability cross-type interop
    const article = new Readability(document as any).parse();

    const title = (article?.title || fallbackTitle) as string;
    const content = article?.content ?? raw;

    // Convert HTML content to markdown-like text via DOM walking
    const markdown = htmlToMarkdown(content);

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
 * Minimal HTML → Markdown converter for Readability article output.
 * Handles headings, paragraphs, lists, code blocks, and plain text.
 * Not a full converter — targets the subset Readability produces.
 */
function htmlToMarkdown(html: string): string {
  const lines: string[] = [];

  // Replace block-level tags with markdown equivalents
  const normalized = html
    // Headings
    .replace(/<h1[^>]*>(.*?)<\/h1>/gis, (_, t) => `\n\n# ${stripTags(t)}\n\n`)
    .replace(/<h2[^>]*>(.*?)<\/h2>/gis, (_, t) => `\n\n## ${stripTags(t)}\n\n`)
    .replace(/<h3[^>]*>(.*?)<\/h3>/gis, (_, t) => `\n\n### ${stripTags(t)}\n\n`)
    .replace(/<h4[^>]*>(.*?)<\/h4>/gis, (_, t) => `\n\n#### ${stripTags(t)}\n\n`)
    .replace(/<h5[^>]*>(.*?)<\/h5>/gis, (_, t) => `\n\n##### ${stripTags(t)}\n\n`)
    .replace(/<h6[^>]*>(.*?)<\/h6>/gis, (_, t) => `\n\n###### ${stripTags(t)}\n\n`)
    // Code blocks
    .replace(
      /<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis,
      (_, t) => `\n\n\`\`\`\n${t}\n\`\`\`\n\n`,
    )
    // Paragraphs and divs
    .replace(/<(p|div)[^>]*>(.*?)<\/(p|div)>/gis, (_, _tag, t) => `\n\n${stripTags(t)}\n\n`)
    // List items
    .replace(/<li[^>]*>(.*?)<\/li>/gis, (_, t) => `\n- ${stripTags(t)}`)
    // Line breaks
    .replace(/<br\s*\/?>/gi, "\n")
    // Remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse excessive blank lines (>2 consecutive)
  const collapsed = normalized.replace(/\n{3,}/g, "\n\n").trim();
  lines.push(collapsed);
  return lines.join("");
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
