import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import type { EmbeddedImageStore } from "@praxis/core/ingestion";
import { chunkMarkdown, chunkParagraphs } from "./chunker.js";
import type { IngestedChunk, Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";

export interface PptxIngestorOptions {
  /**
   * When provided, embedded images in the PPTX are extracted and saved to
   * this store under a synthetic documentId. The result will include
   * `pendingEmbeddedImageDocId` so IngestionService can rename the directory
   * to the real documentId after the document row is persisted.
   */
  embeddedImageStore?: EmbeddedImageStore;
}

/**
 * PptxIngestor — handles `.pptx` files via `officeparser` v6.
 *
 * PowerPoint slides surface as top-level `"slide"` nodes in the AST, each
 * carrying `metadata.slideNumber` (1-based). `tryChunkBySlide` walks these to
 * produce per-slide chunks with `chunk.page` set to the slide number.
 *
 * **Verified real-world AST shape** (from running against the fixture): in
 * officeparser v6.1.x, speaker notes appear as **top-level `"note"` sibling
 * nodes** in `ast.content` alongside slides, NOT as children inside the slide
 * node. Each note node has `metadata.slideNumber` linking it to its slide.
 * Slide nodes have `text: undefined`; their textual content lives in
 * `children` (paragraphs, headings, etc.).
 *
 * If no `"slide"` nodes are found the code falls through to
 * `ast.toText()` + `chunkMarkdown`.
 *
 * When `opts.embeddedImageStore` is provided, embedded images (PNG, JPEG,
 * etc.) are extracted from `ast.attachments`, decoded from Base64, and saved
 * to the store. Each slide's chunks are tagged with the image names that
 * appear in that slide's child subtree via `chunk.imageNames`.
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

  constructor(private readonly opts: PptxIngestorOptions = {}) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async parse(filePath: string, parseOpts: IngestorOptions = {}): Promise<IngestorResult> {
    // Lazy import — officeparser transitively pulls in Tesseract.js and PDF.js.
    // Same pattern as DocxIngestor with mammoth, VisionPdfIngestor with pdfjs-dist.
    const { OfficeParser } = await import("officeparser");

    const extractAttachments = this.opts.embeddedImageStore !== undefined;

    const ast = await OfficeParser.parseOffice(filePath, {
      extractAttachments,
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

    // Build a map from slide index to image names appearing in that slide's
    // AST subtree. We do this before chunking so chunk production can tag each
    // slide's chunks with the right names.
    const slideImageNames = extractAttachments
      ? buildSlideImageNamesMap(ast.content)
      : new Map<number, string[]>();

    const chunks =
      tryChunkBySlide(ast.content, parseOpts.maxChars, slideImageNames) ??
      chunkMarkdown(ast.toText(), {
        ...(parseOpts.maxChars !== undefined && { maxChars: parseOpts.maxChars }),
      }).chunks;

    // Extract and save image attachments when a store is provided.
    let pendingEmbeddedImageDocId: string | undefined;
    if (this.opts.embeddedImageStore !== undefined && ast.attachments.length > 0) {
      const store = this.opts.embeddedImageStore;
      const syntheticDocId = `_pending_${randomUUID()}`;
      const seen = new Set<string>();

      for (const att of ast.attachments) {
        if (att.type !== "image") continue;
        if (seen.has(att.name)) continue; // dedup — same image can be referenced from multiple slides
        seen.add(att.name);

        const bytes = Buffer.from(att.data, "base64");
        await store.save({
          documentId: syntheticDocId,
          imageName: att.name,
          bytes,
          mimeType: att.mimeType,
        });
      }

      if (seen.size > 0) {
        pendingEmbeddedImageDocId = syntheticDocId;
      }
    }

    return {
      title,
      chunks,
      ingestorId: this.id,
      ...(pendingEmbeddedImageDocId !== undefined && { pendingEmbeddedImageDocId }),
    };
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
 * Walk the top-level slide nodes and collect, per slideNumber, all
 * `attachmentName` values found in `"image"` child nodes. Returns a Map
 * keyed by `slideNumber` (1-based, from `metadata.slideNumber`).
 *
 * We key by slideNumber because the real AST has note nodes interleaved as
 * siblings of slides, so array indices are not a stable per-slide key.
 * Slides without a numeric `slideNumber` are skipped — image correlation is
 * silently absent for them, which is an honest signal that the AST shape
 * changed. officeparser v6 always emits slideNumber for PPTX; a missing
 * value would indicate an unusual export where silent degradation beats a
 * misleading index-keyed entry that nothing can ever read.
 */
function buildSlideImageNamesMap(nodes: OfficeNodeLike[]): Map<number, string[]> {
  const result = new Map<number, string[]>();
  for (const node of nodes) {
    if (node.type !== "slide") continue;
    if (typeof node.metadata?.slideNumber !== "number") continue;
    const names = collectImageNames(node.children ?? []);
    if (names.length > 0) {
      result.set(node.metadata.slideNumber, names);
    }
  }
  return result;
}

/**
 * Recursively collect all `attachmentName` strings from `"image"` nodes
 * within a subtree. Returns deduplicated names in encounter order.
 */
function collectImageNames(nodes: OfficeNodeLike[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  function walk(ns: OfficeNodeLike[]): void {
    for (const n of ns) {
      if (n.type === "image") {
        const attName: unknown = n.metadata?.attachmentName;
        if (typeof attName === "string" && attName.length > 0 && !seen.has(attName)) {
          seen.add(attName);
          names.push(attName);
        }
      }
      if (n.children) walk(n.children);
    }
  }

  walk(nodes);
  return names;
}

/**
 * Attempt to produce per-slide chunks from the AST.
 *
 * **Real officeparser v6 AST shape (verified)**: slides are top-level nodes in
 * `ast.content` with `type === "slide"` and `metadata.slideNumber` (1-based).
 * Speaker notes are **separate top-level `"note"` nodes** (NOT children of the
 * slide) with their own `metadata.slideNumber` linking them to the slide.
 * Slide body text lives in the slide's `children` array.
 *
 * When `slideImageNames` is provided (image extraction path), each slide's
 * body and notes chunks are tagged with the image names from that slide's
 * subtree via `chunk.imageNames`.
 *
 * Returns `null` if no `"slide"` nodes are found — the caller falls back to
 * `ast.toText()` + `chunkMarkdown` in that case.
 *
 * Spec-silent contract pinned by: pptx-ingestor-integration.test.ts —
 * "falls back to ast.toText() + chunkMarkdown when officeparser produces
 *  no slide nodes (real fixture)".
 */
function tryChunkBySlide(
  nodes: OfficeNodeLike[],
  maxChars: number | undefined,
  slideImageNames: Map<number, string[]> = new Map(),
): IngestedChunk[] | null {
  const slideNodes = nodes.filter((n) => n.type === "slide");
  if (slideNodes.length === 0) return null;

  // Build a Map from slideNumber → note node(s) so we can look them up
  // efficiently. Real AST: notes are top-level siblings with metadata.slideNumber.
  const notesBySlideNumber = new Map<number, OfficeNodeLike[]>();
  for (const node of nodes) {
    if (node.type !== "note") continue;
    const slideNum =
      typeof node.metadata?.slideNumber === "number" ? node.metadata.slideNumber : -1;
    if (slideNum < 0) continue;
    const existing = notesBySlideNumber.get(slideNum) ?? [];
    existing.push(node);
    notesBySlideNumber.set(slideNum, existing);
  }

  const chunks: IngestedChunk[] = [];
  let chunkIndex = 0;

  for (const slide of slideNodes) {
    const slideNumber =
      typeof slide.metadata?.slideNumber === "number" ? slide.metadata.slideNumber : undefined;

    const slideLabel = slideNumber !== undefined ? `Slide ${slideNumber}` : "Slide";

    // Look up image names by slideNumber (the stable per-slide key).
    const imageNames = slideNumber !== undefined ? slideImageNames.get(slideNumber) : undefined;

    // Slide children are the body content (paragraphs, headings, images, etc.).
    // No "note" children appear here in the real AST — notes are siblings.
    const slideText = nodesToText(slide.children ?? []).trim();

    if (slideText) {
      const slideChunks = chunkParagraphs(slideText, {
        startIndex: chunkIndex,
        page: slideNumber,
        section: slideLabel,
        ...(maxChars !== undefined && { maxChars }),
      });
      if (imageNames !== undefined) {
        for (const c of slideChunks) {
          c.imageNames = imageNames;
        }
      }
      chunks.push(...slideChunks);
      chunkIndex += slideChunks.length;
    }

    // Append speaker notes as separate chunks so they're searchable but
    // visually distinguishable from body content.
    const noteNodes = slideNumber !== undefined ? (notesBySlideNumber.get(slideNumber) ?? []) : [];
    const notesText = noteNodes
      .flatMap((note) => note.children ?? [])
      .map(nodeToText)
      .filter(Boolean)
      .join("\n\n")
      .trim();

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
        if (imageNames !== undefined) {
          nc.imageNames = imageNames;
        }
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
 *
 * Uses `node.text` for leaf nodes. Recurses into children when `node.text`
 * is absent (e.g. slide-level container nodes in officeparser v6).
 */
function nodesToText(nodes: OfficeNodeLike[]): string {
  return nodes.map(nodeToText).filter(Boolean).join("\n\n");
}

function nodeToText(node: OfficeNodeLike): string {
  // Image nodes have no displayable text — skip them.
  if (node.type === "image") return "";
  // Prefer node.text (set for paragraphs, headings, text nodes, etc.).
  if (node.text) return node.text.trim();
  // For container nodes where text is absent (unusual), fall back to children.
  if (node.children) {
    return node.children.map(nodeToText).filter(Boolean).join(" ");
  }
  return "";
}
