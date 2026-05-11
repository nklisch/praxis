# Research: PPTX parsing for the ingestion pipeline

## Context

`feature-powerpoint-ingestion` needs to add `.pptx` (and possibly `.ppt`) to the
existing document ingestion pipeline (`packages/tools/src/runtime/ingestion/`).
Slides are typically image-heavy — diagrams, figures, equation screenshots — so
text-only parsing would drop most of the pedagogical signal that the textbook
RAG pipeline cares about. The feature should extract slide text *and* embedded
image references so visual content survives ingestion.

The existing `Ingestor` port (`packages/tools/src/runtime/ingestion/ingestor.ts`)
expects each implementation to produce an `IngestorResult` of
`IngestedChunk[]`, where chunks may carry a 1-based `page` field. Slides map
naturally to pages.

## Questions

1. Which JavaScript/TypeScript library extracts both **text and embedded
   images** from `.pptx` with low integration friction?
2. Is the library actively maintained, MIT-compatible, and free of native
   dependencies (so it doesn't reintroduce the Electron rebuild dance that
   `better-sqlite3` / `canvas` already imposes)?
3. Is the API shape compatible with the existing `Ingestor` contract — i.e.
   text per slide + slide-keyed media references — or would it require
   significant glue?
4. Should the implementation also handle the legacy binary `.ppt` format, or
   defer that?

## Options Evaluated

### officeparser v6.1.1

- **Maturity**: **Active**. 55 total releases; v6.1.1 published 28 Apr 2026
  (within 2 weeks of this research). Ten releases in the last six months,
  including the v6 major bump. Healthy maintenance signal for a niche
  office-format parser.
- **License**: MIT.
- **Native deps**: **None**. Pure JS — uses `yauzl` for in-memory ZIP
  extraction (replaced `decompress` in late 2024) and ships browser-compatible
  ESM/IIFE builds alongside Node. No native rebuild needed for Electron.
- **Formats**: `.pptx`, `.docx`, `.xlsx`, `.odt`, `.odp`, `.ods`, `.pdf`,
  `.rtf` (we only need `.pptx`; the rest are ignored since Praxis already has
  dedicated ingestors for each).
- **API shape**:
  ```typescript
  import { OfficeParser } from 'officeparser';
  const ast = await OfficeParser.parseOffice(filePath, {
    extractAttachments: true,   // images and charts as Base64
    ignoreNotes: false,         // include speaker notes
    putNotesAtLast: false,      // inline with their slide
  });
  // ast.toText()            -> plain text
  // ast.content             -> OfficeContentNode[] (hierarchical AST)
  // ast.attachments         -> OfficeAttachment[] (Base64 image/chart blobs)
  // ast.metadata            -> document metadata
  ```
- **Output shape (relevant fields)**:
  ```typescript
  type OfficeAttachment = {
    name: string;                                       // e.g. "image1.png"
    type: "image" | "chart";
    data: string;                                       // Base64
    mimeType: string;
    ocrText?: string;                                   // if config.ocr=true
  };

  type OfficeContentNode = {
    type: "paragraph" | "heading" | "table" | "list" | "text" | "image" | "break";
    text: string;
    children?: OfficeContentNode[];
    metadata?: {
      level?: number;          // for headings
      attachmentName?: string; // links to OfficeAttachment.name
    };
  };
  ```
- **Pros**:
  - Single library covers text + speaker notes + embedded images (Base64) +
    embedded chart data in one parse pass.
  - Built-in `toText()` lets us flow straight into the existing
    `chunkMarkdown` path for an MVP; the hierarchical AST is there when we
    want slide-keyed chunking with image references.
  - `extractAttachments: true` produces Base64 blobs we can write to the
    existing page-image store and reference from `IngestedChunk` like the
    vision PDF path already does.
  - Optional Tesseract.js OCR is available but **off by default** — we don't
    pay for it unless we opt in, and we already have a vision pipeline so
    Tesseract is redundant.
- **Cons**:
  - Pulls in Tesseract.js and PDF.js as optional/lazy deps — install size
    grows but they're not loaded unless `ocr: true` or PDF parsing runs
    through this path (we won't route PDF through it).
  - One maintainer (Harshank Ur), so bus-factor risk exists; mitigated by
    active release cadence and the option to fall back to OOXML-direct
    later.
- **Fit**: **Strong**. AST + attachments map 1:1 onto `IngestedChunk` (text)
  + page-image store (images). Lazy-import keeps the cost off the cold path
  exactly like the existing `JsPdfIngestor` does with `pdfjs-dist`.

### node-pptx-parser

- **Maturity**: **Low**. 6 commits on `main`, 4 stars, 0 forks, 0 open
  issues, no version tags. Single maintainer; activity timeline unclear.
- **License**: MIT.
- **Native deps**: None (`unzipper` + `xml2js`).
- **API shape**: `new PptxParser(filePath).parse()` → structured slides;
  `extractText()` → `SlideTextContent[]` (text per slide as string array).
- **Pros**:
  - Smallest dependency footprint.
  - Slide-keyed text output is a natural fit for `IngestedChunk.page`.
- **Cons**:
  - **No image extraction** — defeats the feature's main purpose.
  - **No speaker notes**.
  - Bus factor 1 with minimal traction.
- **Fit**: Poor. Would force us to write our own image extraction on top,
  losing most of the "use a library" value.

### pptx-content-extractor (Paul0908)

- **Maturity**: **Low**. 5 commits, 4 stars, no releases, **no LICENSE file**.
- **API**: Granular — `extractPptx`, `extractPptxSlides`, `extractPptxMedia`,
  `extractPptxNotes`. Returns Base64 images and slide-keyed notes.
- **Pros**: Right shape — text + Base64 images + notes.
- **Cons**: **No declared license** makes it unusable in an open-source
  project. Bus factor 1 with no release tags.
- **Fit**: Disqualified on licensing.

### OOXML-direct (build it ourselves)

- **What it means**: Unzip the `.pptx` (it's an OOXML zip) with `yauzl` or
  `JSZip`, walk `ppt/slides/slide<N>.xml` with `xml2js`, resolve
  `ppt/slides/_rels/slide<N>.xml.rels` to find media references, copy
  `ppt/media/*` blobs out, and assemble `IngestedChunk` and image records.
- **Pros**:
  - Zero external library dependency on a niche office-format parser.
  - Full control over which OOXML elements we honor (lists, tables, group
    shapes, charts, SmartArt, etc.).
  - Direct ownership — no upstream maintainer to lose.
- **Cons**:
  - **Surface area**. PresentationML covers slides, layouts, masters, themes,
    notes slides, drawingML shapes, tables, charts, group shapes, and a
    relationships graph. A serious implementation is ~1-2k LoC and a
    multi-stride feature on its own.
  - We'd be reinventing what officeparser already exposes — at officeparser's
    quality bar — without the test coverage it has accumulated.
- **Fit**: Reasonable as a **future fallback** if officeparser ever stalls or
  diverges from our needs. Not the right place to start.

## Recommendation

**Use `officeparser` v6.1.x.** Wrap it in a new `pptx-ingestor.ts` that:

1. Calls `OfficeParser.parseOffice(filePath, { extractAttachments: true, ignoreNotes: false, putNotesAtLast: false })`.
2. Walks `ast.content` to emit `IngestedChunk[]` keyed by slide number (use
   the slide-boundary signal in the AST; if absent, fall back to
   `ast.toText()` + chunker for an MVP).
3. Writes each `OfficeAttachment` of `type: "image"` to the existing
   page-image store under the eventual `documentId`, mirroring the
   `pendingPageImageDocId` pattern `VisionPdfIngestor` uses.
4. References saved images from chunk metadata so the UI can show them on
   source cards.

Defer `.ppt` (legacy binary). It's a separate format requiring
LibreOffice-headless conversion; the modern PPTX universe is dominant and
solving `.pptx` first delivers the value.

Image-only slides (parsed text density very low) can still be improved later
by routing the rendered slide through the vision pipeline — same dual-ingestor
pattern as `JsPdfIngestor` vs `VisionPdfIngestor`. Out of scope for the first
cut.

## Implementation Notes

- **Lazy-import** `officeparser` inside `parse()`, the same way
  `DocxIngestor` does with `mammoth` and `VisionPdfIngestor` does with
  `pdfjs-dist`. Keeps the cold path light and matches the project pattern.
- The `Ingestor.id` should be `"pptx"` and the human-readable `label` should
  be `"PowerPoint"`. MIME type:
  `application/vnd.openxmlformats-officedocument.presentationml.presentation`.
  Extension: `.pptx`.
- `extractAttachments: true` returns images as Base64 strings. Decode with
  `Buffer.from(att.data, "base64")` before handing to the page-image store —
  don't pass Base64 through.
- `ignoreNotes: false` + `putNotesAtLast: false` keeps speaker notes inline
  with their slide. This is the right default for a tutoring system since
  notes often contain the lecturer's pedagogical commentary.
- Keep `ocr: false`. We already have a vision pipeline; Tesseract.js would
  add bundle weight for redundant capability.

## Common Pitfalls

- Don't trust slide ordering from the file listing — PPTX `.rels` files
  declare the slide sequence and it doesn't always match alphabetical order
  of `slide1.xml`, `slide2.xml`. `officeparser` handles this internally; if
  we ever switch to OOXML-direct, this is the first thing to get right.
- `OfficeContentNode.metadata.attachmentName` is what links a text node back
  to an image attachment. Use that — don't try to correlate by position.
- Speaker notes appear as their own nodes in the AST; check `node.type` to
  distinguish them from slide body text if we want to tag them with a
  different `blockType`.

## Code Examples

```typescript
// packages/tools/src/runtime/ingestion/pptx-ingestor.ts
import { basename, extname } from "node:path";
import type { Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";

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
    // Lazy import — officeparser pulls in Tesseract.js/PDF.js indirectly,
    // even though we don't activate them. Keep out of the module graph
    // until parse() actually runs.
    const { OfficeParser } = await import("officeparser");

    const ast = await OfficeParser.parseOffice(filePath, {
      extractAttachments: true,
      ignoreNotes: false,
      putNotesAtLast: false,
    });

    const fallbackTitle = basename(filePath, extname(filePath));
    // Title heuristic: first heading in ast.content, else filename.
    // Slide-keyed chunking: walk ast.content, emit IngestedChunk per slide
    // with chunk.page = slideNumber and section = slide title.
    // ...
    return { title: fallbackTitle, chunks: [], ingestorId: this.id };
  }
}
```

## References

- [officeparser README — harshankur/officeParser](https://github.com/harshankur/officeParser) — primary API reference; latest v6.1.1 (Apr 28, 2026); MIT.
- [officeparser on libraries.io](https://libraries.io/npm/officeparser) — release cadence and dependency surface.
- [node-pptx-parser — Mirza-Glitch](https://github.com/Mirza-Glitch/node-pptx-parser) — alternative considered, text-only.
- [pptx-content-extractor — Paul0908](https://github.com/Paul0908/pptx-content-extractor) — alternative considered, no license.
- [Office Open XML — PresentationML anatomy](http://officeopenxml.com/anatomyofOOXML-pptx.php) — reference for any future OOXML-direct fallback.
