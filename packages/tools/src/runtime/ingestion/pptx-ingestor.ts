import { basename, extname } from "node:path";
import { chunkMarkdown, chunkParagraphs } from "./chunker.js";
import type { IngestedChunk, Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";

/**
 * PptxIngestor — handles `.pptx` files via `officeparser` v6.
 *
 * PowerPoint slides surface as top-level `"slide"` nodes in the AST, each
 * carrying `SlideMetadata.slideNumber`. `tryChunkBySlide` walks these to
 * produce per-slide chunks with `chunk.page` set to the slide number.
 * Speaker notes appear as `"note"` children inside each slide node and are
 * appended inline.  If the slide structure is not detectable (e.g. an
 * unusual export), the code falls through to `ast.toText()` + `chunkMarkdown`.
 *
 * Lazy-imports `officeparser` inside `parse()` — the package transitively
 * pulls in Tesseract.js and PDF.js, so keep them off the cold path (same
 * pattern as DocxIngestor / mammoth).
 */
export class PptxIngestor implements Ingestor {
  readonly id = "pptx" as const;
  readonly label = "PowerPoint";
  readonly extensions = [".pptx"] as const;
  readonly mimeTypes = [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ] as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    // Lazy import — officeparser transitively pulls in Tesseract.js and PDF.js.
    // Same pattern as DocxIngestor with mammoth, VisionPdfIngestor with pdfjs-dist.
    const { OfficeParser } = await import("officeparser");

    const ast = await OfficeParser.parseOffice(filePath, {
      extractAttachments: false, // text-only in this story; Story 2 adds images
      ignoreNotes: false, // keep speaker notes — pedagogically valuable
      putNotesAtLast: false, // keep notes inline with their slide
      ocr: false, // vision pipeline handles images better
      outputErrorToConsole: false,
    });

    const fallbackTitle = basename(filePath, extname(filePath));
    // Prefer document metadata title, then first heading in the AST, then filename.
    const title =
      (ast.metadata.title?.trim() || undefined) ??
      findFirstHeadingText(ast.content) ??
      fallbackTitle;

    const chunks =
      tryChunkBySlide(ast.content, opts.maxChars) ??
      chunkMarkdown(ast.toText(), {
        ...(opts.maxChars !== undefined && { maxChars: opts.maxChars }),
      }).chunks;

    return { title, chunks, ingestorId: this.id };
  }
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/**
 * Recursively search `nodes` for the first heading node and return its text.
 * Used to derive a document title when document metadata doesn't supply one.
 */
function findFirstHeadingText(nodes: OfficeNodeLike[]): string | undefined {
  for (const node of nodes) {
    if (node.type === "heading" && node.text?.trim()) {
      return node.text.trim();
    }
    if (node.children) {
      const found = findFirstHeadingText(node.children);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * Minimal structural type — the ingestor only accesses a subset of the full
 * `OfficeContentNode` shape and we don't want to drag in the library's types
 * at the module level (that would defeat the lazy-import pattern).
 *
 * `metadata` is typed as `unknown` because `ContentMetadata` is a union of
 * several interfaces that don't share a common index signature — we only
 * access known keys via optional chaining and runtime typeof guards.
 */
interface OfficeNodeLike {
  type: string;
  text?: string;
  children?: OfficeNodeLike[];
  // biome-ignore lint/suspicious/noExplicitAny: officeparser ContentMetadata union has no common index signature; we access only known keys at runtime
  metadata?: any;
}

/**
 * Attempt to produce per-slide chunks from the AST.
 *
 * PPTX files parsed by officeparser v6 expose slides as top-level `"slide"`
 * nodes with `metadata.slideNumber` (1-based).  Each slide node's children
 * contain the actual content (paragraphs, headings, lists, images, …) and
 * optionally a `"note"` child that carries the speaker notes.
 *
 * Returns `null` if no `"slide"` nodes are found — the caller falls back to
 * `ast.toText()` + `chunkMarkdown` in that case.
 */
function tryChunkBySlide(
  nodes: OfficeNodeLike[],
  maxChars: number | undefined,
): IngestedChunk[] | null {
  const slideNodes = nodes.filter((n) => n.type === "slide");
  if (slideNodes.length === 0) return null;

  const chunks: IngestedChunk[] = [];
  let chunkIndex = 0;

  for (const slide of slideNodes) {
    const slideNumber =
      typeof slide.metadata?.slideNumber === "number" ? slide.metadata.slideNumber : undefined;

    const slideLabel = slideNumber !== undefined ? `Slide ${slideNumber}` : "Slide";

    // Separate content nodes from note nodes within this slide.
    const contentNodes: OfficeNodeLike[] = [];
    const noteNodes: OfficeNodeLike[] = [];

    for (const child of slide.children ?? []) {
      if (child.type === "note") {
        noteNodes.push(child);
      } else {
        contentNodes.push(child);
      }
    }

    // Build a markdown-like text block for the slide body.
    const slideText = nodesToText(contentNodes).trim();

    if (slideText) {
      const slideChunks = chunkParagraphs(slideText, {
        startIndex: chunkIndex,
        page: slideNumber,
        section: slideLabel,
        ...(maxChars !== undefined && { maxChars }),
      });
      chunks.push(...slideChunks);
      chunkIndex += slideChunks.length;
    }

    // Append speaker notes as separate chunks so they're searchable but
    // visually distinguishable from body content.  Tag each with
    // blockType:"Body" — ChunkParagraphsOptions doesn't carry blockType so we
    // set it after chunking.
    const notesText = nodesToText(noteNodes).trim();
    if (notesText) {
      const notesSection = `${slideLabel} (notes)`;
      const noteChunks = chunkParagraphs(notesText, {
        startIndex: chunkIndex,
        page: slideNumber,
        section: notesSection,
        ...(maxChars !== undefined && { maxChars }),
      });
      for (const nc of noteChunks) {
        nc.blockType = "Body";
      }
      chunks.push(...noteChunks);
      chunkIndex += noteChunks.length;
    }
  }

  // If we found slide nodes but every slide was empty, return null so the
  // fallback can try ast.toText() instead of silently returning zero chunks.
  if (chunks.length === 0) return null;

  return chunks;
}

/**
 * Flatten an array of AST nodes into a plain-text string, preserving
 * paragraph separation with blank lines so `chunkParagraphs` can split them.
 */
function nodesToText(nodes: OfficeNodeLike[]): string {
  return nodes.map(nodeToText).filter(Boolean).join("\n\n");
}

function nodeToText(node: OfficeNodeLike): string {
  return (node.text ?? "").trim();
}
