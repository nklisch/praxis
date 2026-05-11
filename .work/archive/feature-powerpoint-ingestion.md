---
id: feature-powerpoint-ingestion
kind: feature
stage: done
tags: [ingestion]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# PowerPoint ingestion support

## Brief

Add PowerPoint (`.pptx`, and possibly `.ppt`) to the document ingestion pipeline alongside the existing PDF / DOCX / EPUB / HTML / Markdown / plain-text ingestors. The pipeline is registry-dispatched (`packages/tools/src/runtime/ingestion/registry.ts`) on MIME type / extension, so the shape of the work is a new `pptx-ingestor.ts` registered in that registry, plus whatever upstream MIME/extension acceptance lists need to learn the new types.

Slides are typically image-heavy — diagrams, figures, equation screenshots, hand-drawn artifacts — so a text-only parse would drop most of the pedagogical signal that students and the textbook RAG pipeline care about. The feature should extract both slide text and embedded images so visual content survives ingestion. Two design paths are worth weighing in the drafting pass: (a) a dedicated `.pptx` parser (e.g. `officeparser`, `node-pptx-parser`, or direct OOXML unzip + XML walk) that yields text plus referenced media blobs; vs. (b) rendering slides to images and routing through the existing `VisionPdfIngestor`-style vision pipeline. (a) is cheaper and offline; (b) reuses an existing path and handles arbitrary slide layouts uniformly. A hybrid is plausible: text via parser, images via embedded-media extraction, with vision as a fallback for slides where parsed text density is suspiciously low.

`.ppt` (legacy binary format) is a separate question — most modern decks are `.pptx`, and parsing the binary format requires different tooling (e.g. LibreOffice headless conversion). The design pass should decide whether to scope `.ppt` in or defer it.

## Research

Full evaluation in `docs/research/pptx-parsing.md` (and reference skill at
`.claude/skills/officeparser-v6/SKILL.md`).

**Picked**: `officeparser` v6.1.x. Pure JS, MIT, actively maintained (10
releases in last 6 months), single-call API that returns a typed AST plus
Base64 attachments for images and charts. Maps cleanly onto the existing
`Ingestor` contract: text nodes → `IngestedChunk[]` keyed by slide, image
attachments → page-image store (mirrors `VisionPdfIngestor`'s
`pendingPageImageDocId` flow).

**Rejected**:
- `node-pptx-parser` — no image extraction, no speaker notes, bus factor 1 with
  no releases. Defeats the feature's main purpose.
- `pptx-content-extractor` — no declared LICENSE; unusable in OSS.
- OOXML-direct (JSZip + xml2js + relationships walker) — viable long-term but
  ~1-2k LoC of work for marginal control gain. Keep as a fallback if
  officeparser stalls.

**Deferred**: `.ppt` legacy binary format. Needs LibreOffice-headless
conversion, separate effort, and the modern world is `.pptx`.

## Design decisions

- **Slide-keyed chunking is best-effort.** `OfficeContentNode.type` values from
  officeparser's documented schema don't include `"slide"`. The implementer
  should first attempt to derive slide boundaries from the AST (top-level
  groupings or heading-level-1 nodes); if no reliable signal exists, fall
  back to `ast.toText()` + the existing `chunkMarkdown`. Either path satisfies
  acceptance — slide-level page numbers are a nice-to-have, not load-bearing
  for RAG quality.
- **Two image stores, not one.** Page-image store (`packages/core/src/ingestion/page-images.ts`)
  stays as-is — it's for "whole page rendered as PNG" (PDF vision OCR; future
  PPTX slide renders). A new sibling `EmbeddedImageStore` handles "image
  extracted from inside a slide" — different key shape (string filename vs
  numeric page), different consumer, different IPC surface when that lands.
- **Chunks reference images via `imageNames?: string[]`.** Extend
  `IngestedChunk` with an optional `imageNames` field; persist through the
  existing `locatorJson` JSON column (no schema migration needed — see
  `service.ts:160-165`).
- **Test fixtures committed.** PPTX is a binary OOXML zip — inline string
  construction (the pattern used by `markdown-ingestor.test.ts` etc.) doesn't
  work. Commit a small (5-10 KB) `.pptx` fixture under
  `packages/tools/src/runtime/ingestion/__tests__/fixtures/`. Mirrors how
  every PPTX-parsing library tests itself.
- **`.ppt` deferred.** Legacy binary format; requires LibreOffice-headless
  conversion. Out of scope.

## Architectural choice

**Two ingestors written sequentially, image work isolated behind a port.**

Alternative considered (rejected): a single ingestor that always extracts both
text and images. Rejected because text and image paths have meaningfully
different acceptance surfaces (RAG indexing vs. media storage with future UI
consumption), and gluing them together creates a "either both work or neither
ships" coupling. Separating into two stories lets the text path ship first,
validates the library choice cheaply, and isolates the embedded-image-store
introduction (a cross-cutting addition to `IngestionServiceDeps`) into its
own commit.

Alternative considered (rejected): render slides to PNG via LibreOffice
headless and route everything through `VisionPdfIngestor`-style vision OCR.
Rejected because (a) it forces a LibreOffice dependency on a tutoring app
already wrestling with native rebuild complexity (`better-sqlite3`,
`canvas`), (b) vision-OCR is more expensive per slide than parsed-text +
embedded-media, and (c) we lose the structured speaker-notes / slide-title
signal that `officeparser` exposes. Keep the rendered-slide-to-image path as
a future enhancement for image-only slides.

## Implementation Units

### Unit 1: `PptxIngestor` (text-only)
**File**: `packages/tools/src/runtime/ingestion/pptx-ingestor.ts`
**Story**: `feature-powerpoint-ingestion-text-extraction`

```typescript
import { basename, extname } from "node:path";
import { chunkMarkdown } from "./chunker.js";
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
    // Lazy import — officeparser transitively pulls in Tesseract.js and PDF.js
    // (even though we never enable them). Same lazy-import pattern as
    // DocxIngestor with mammoth, VisionPdfIngestor with pdfjs-dist.
    const { OfficeParser } = await import("officeparser");

    const ast = await OfficeParser.parseOffice(filePath, {
      extractAttachments: false,    // text-only in this unit
      ignoreNotes: false,
      putNotesAtLast: false,
    });

    const fallbackTitle = basename(filePath, extname(filePath));
    // First heading-level-1 node text becomes the title, falling back to filename.
    const title = findFirstHeadingText(ast.content, 1) ?? fallbackTitle;

    // Attempt slide-keyed chunking first. If ast.content surfaces a clear
    // per-slide grouping (top-level node per slide, or heading-1 as a slide
    // marker — to be confirmed against a fixture), emit IngestedChunk[] with
    // chunk.page = slide number. Otherwise fall back to a flat path:
    //   ast.toText() → chunkMarkdown(text, { maxChars })
    const chunks =
      tryChunkBySlide(ast.content, opts.maxChars) ??
      chunkMarkdown(ast.toText(), { ...(opts.maxChars !== undefined && { maxChars: opts.maxChars }) }).chunks;

    return { title, chunks, ingestorId: this.id };
  }
}
```

**Implementation Notes**:
- `findFirstHeadingText(nodes, level)` is a small recursive helper —
  walks `OfficeContentNode.children` looking for `type === "heading" &&
  metadata?.level === level`. Inline it in the file; not worth a separate module.
- `tryChunkBySlide(nodes, maxChars): IngestedChunk[] | null` is the spike.
  Implementer should inspect what `ast.content` actually looks like for a
  multi-slide fixture (log it during dev) before committing to a slide-detection
  heuristic. If the AST is flat with no slide signal, return `null` and the
  caller falls back to `ast.toText()`.
- Speaker notes are inline by default (`putNotesAtLast: false`). If they appear
  as their own node type in the AST, tag the resulting chunks with
  `blockType: "Body"` and append a section header like
  `section: "Slide N (notes)"` for citation clarity.
- Lazy-import: do `await import("officeparser")` inside `parse()`, never at
  the module top. This is the pattern enforced by every other ingestor in
  `packages/tools/src/runtime/ingestion/`.
- Errors from `OfficeParser.parseOffice` propagate as-is — the surrounding
  `IngestionService.ingest()` already wraps them as
  `{ code: "ingest.parse_failed", message, recoverable: false }`.

**Acceptance Criteria**:
- [ ] `PptxIngestor` registered in `packages/desktop/electron/main/services.ts:277`
      alongside the other 7 ingestors.
- [ ] `"pptx"` added to the file picker filter in
      `packages/desktop/electron/main/ingest-channel.ts:40`.
- [ ] Parsing a real `.pptx` fixture with N slides yields N or more chunks
      (depending on chunk-size and slide-text length), each with non-empty
      `text`.
- [ ] Title is extracted from the first slide heading where available,
      falls back to filename.
- [ ] Speaker notes are present in the chunk stream (not silently dropped).
- [ ] Vitest run passes; lint and typecheck clean.

---

### Unit 2: `EmbeddedImageStore` port + FS impl
**File**: `packages/core/src/ingestion/embedded-images.ts`
**Story**: `feature-powerpoint-ingestion-embedded-images`

```typescript
export interface EmbeddedImageStore {
  /** Save an embedded image and return the absolute path where it was written. */
  save(input: { documentId: string; imageName: string; bytes: Buffer; mimeType: string }): Promise<string>;
  /** Read an embedded image, or return null if not found. */
  read(input: { documentId: string; imageName: string }): Promise<Buffer | null>;
  /** Delete all embedded images for a document. Called when the document is removed. */
  deleteByDocumentId(documentId: string): Promise<void>;
  /** Absolute path where an embedded image would be (or is) stored. */
  pathFor(input: { documentId: string; imageName: string }): string;
}

export class FsEmbeddedImageStore implements EmbeddedImageStore { /* mirrors FsPageImageStore */ }
```

**Implementation Notes**:
- Mirror `FsPageImageStore` shape line-for-line, including platform-specific
  default base directory selection — only the key shape changes (string vs
  number). Layout: `<baseDir>/<documentId>/<sanitizedImageName>`.
- Sanitize `imageName` — strip path separators, normalize to a basename only.
  PPTX images come in as `image1.png`, `image2.jpeg`, etc., but officeparser
  doesn't guarantee the field is path-safe. Use
  `path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_")`.
- Env override for base dir: `PRAXIS_EMBEDDED_IMAGES_DIR`. Default on Linux:
  `~/.local/share/praxis/document-embedded-images/`.
- Export from `packages/core/src/ingestion/index.ts` alongside `PageImageStore`.
- Add to `IngestionServiceDeps` so future indexing or UI services can read
  embedded images through DI. The current `IngestionService` doesn't need it
  (the ingestor writes; consumers read later) but declaring it in `ServiceDeps`
  keeps the wiring discoverable.

**Acceptance Criteria**:
- [ ] `EmbeddedImageStore` port and `FsEmbeddedImageStore` impl exported from
      `@praxis/core/ingestion`.
- [ ] `EmbeddedImageStore` instance constructed in
      `packages/desktop/electron/main/services.ts` and passed to `PptxIngestor`
      via its constructor (mirroring how `pageImageStore` is passed to
      `VisionPdfIngestor`).
- [ ] Save/read round-trips with non-ASCII filenames (gets sanitized).
- [ ] `deleteByDocumentId` removes the directory recursively without throwing
      when the directory doesn't exist.

---

### Unit 3: `PptxIngestor` image extraction
**File**: `packages/tools/src/runtime/ingestion/pptx-ingestor.ts` (extended)
**Story**: `feature-powerpoint-ingestion-embedded-images`

```typescript
export interface PptxIngestorOptions {
  embeddedImageStore?: EmbeddedImageStore;  // when set, attachments are extracted
}

export class PptxIngestor implements Ingestor {
  constructor(private readonly opts: PptxIngestorOptions = {}) {}

  async parse(filePath: string, parseOpts: IngestorOptions = {}): Promise<IngestorResult> {
    const { OfficeParser } = await import("officeparser");

    const extractAttachments = this.opts.embeddedImageStore !== undefined;
    const ast = await OfficeParser.parseOffice(filePath, {
      extractAttachments,
      ignoreNotes: false,
      putNotesAtLast: false,
    });

    // ... text extraction as in Unit 1 ...

    // Save attachments + correlate to chunks
    if (extractAttachments && this.opts.embeddedImageStore) {
      const synthDocId = `_pending_${randomUUID()}`;  // mirrors VisionPdfIngestor pattern
      for (const att of ast.attachments) {
        if (att.type !== "image") continue;
        const bytes = Buffer.from(att.data, "base64");
        await this.opts.embeddedImageStore.save({
          documentId: synthDocId,
          imageName: att.name,
          bytes,
          mimeType: att.mimeType,
        });
      }
      // Walk ast.content again to populate chunk.imageNames from
      // node.metadata?.attachmentName references — see Unit 4 for IngestedChunk
      // extension.
      return {
        title,
        chunks: chunksWithImageRefs,
        ingestorId: this.id,
        pendingPageImageDocId: synthDocId,  // re-use existing rename hook in IngestionService
      };
    }
    // ...
  }
}
```

**Implementation Notes**:
- **Re-use the existing rename hook**: `IngestionService.ingest()` already
  renames the page-image directory from synthetic to real `documentId` via
  `pendingPageImageDocId` (`service.ts:139-153`). For embedded images, we have
  two choices: (a) re-use this same field — but it's named for page images, not
  embedded; (b) add a parallel `pendingEmbeddedImageDocId` field. **Pick (b)** —
  semantics are different, and a parallel field keeps the two stores independent.
  Extend `IngestorResult` with `pendingEmbeddedImageDocId?: string` and add
  another rename block in `IngestionService` (one block per store).
- Dedup: PPTX can reference the same `image1.png` from multiple slides. The
  attachment array probably yields it once (the file is one entry in
  `ppt/media/`), but verify on fixture. If duplicates appear, save once and
  reference from all relevant chunks.
- Image-name → chunk correlation: walk `ast.content` looking for
  `node.type === "image" && node.metadata?.attachmentName`. The slide each
  image lives on becomes its associated chunk; populate `chunk.imageNames`.

**Acceptance Criteria**:
- [ ] When `embeddedImageStore` is injected, each `OfficeAttachment` of type
      `"image"` is saved to the store under the real `documentId` (after
      `IngestionService` rename).
- [ ] When `embeddedImageStore` is NOT injected, `extractAttachments: false`
      is passed and no image work happens (regression guard for Unit 1's
      text-only path).
- [ ] Chunks that reference an image have `imageNames` populated with the
      matching filenames; chunks without images have `imageNames` undefined or
      empty.

---

### Unit 4: Extend `IngestedChunk` with `imageNames`
**File**: `packages/tools/src/runtime/ingestion/ingestor.ts`
**Story**: `feature-powerpoint-ingestion-embedded-images`

```typescript
export interface IngestedChunk {
  chunkIndex: number;
  text: string;
  page?: number;
  section?: string;
  blockType?: "SectionHeader" | "Body" | "Code" | "Table" | "Figure";
  /** Filenames of embedded images referenced by this chunk (from PPTX, future: DOCX). */
  imageNames?: string[];
}
```

**Implementation Notes**:
- Update `IngestionService.ingest()` (`packages/core/src/ingestion/service.ts:160-165`)
  to thread `imageNames` through `locatorJson`:
  ```typescript
  locatorJson: {
    page: c.page ?? null,
    section: c.section ?? null,
    blockType: c.blockType ?? null,
    imageNames: c.imageNames ?? null,
  }
  ```
- No schema migration — `locatorJson` is already a JSON column. Existing chunks
  without the field continue to work.
- This change is owned by Story 2 (it's a precondition for Unit 3's correlation
  logic), but is small enough to land in the same commit as Units 2 and 3.

**Acceptance Criteria**:
- [ ] `IngestedChunk.imageNames?: string[]` exists on the interface.
- [ ] `IngestionService` writes `imageNames` to `locatorJson` when present.
- [ ] Existing ingestors (markdown, docx, etc.) continue to pass tests
      without modification — `imageNames` is optional.

---

## Implementation Order

1. **Story 1** (`feature-powerpoint-ingestion-text-extraction`) — Unit 1:
   text-only `PptxIngestor`, file picker filter, registry wiring, fixture +
   tests. Ships and validates the library choice.
2. **Story 2** (`feature-powerpoint-ingestion-embedded-images`,
   depends on Story 1) — Units 2, 3, 4 together: `EmbeddedImageStore`,
   `IngestedChunk.imageNames`, `PptxIngestor` extended to extract attachments.

## Testing

### Fixtures
- `packages/tools/src/runtime/ingestion/__tests__/fixtures/sample.pptx` —
  small (~5-10 KB) deck with: 3 slides, at least one heading, at least one
  embedded raster image, at least one speaker note. Committed as binary.
- Generate it once locally (PowerPoint, Keynote, or LibreOffice Impress
  export), commit, and treat as immutable test data.

### Unit Tests: `packages/tools/src/runtime/ingestion/__tests__/pptx-ingestor.test.ts`

Story 1:
- Returns `ingestorId: "pptx"`.
- Title heuristic: first heading in fixture → fixture's slide-1 title.
  Filename fallback when no headings (separate fixture or PPTX-without-titles
  edge case test).
- Chunks are non-empty; chunk text covers expected fixture content
  (assert substring matches).
- Speaker notes appear in the chunk stream.
- Lazy-import safety: `parse()` doesn't throw on first call (officeparser
  resolves successfully in the test environment).
- Optional: if slide-keyed chunking is implemented, assert
  `chunks.every(c => c.page === undefined || (c.page >= 1 && c.page <= 3))`
  for the 3-slide fixture.

Story 2 (separate test file or extended file):
- `EmbeddedImageStore.save/read` round-trip in an isolated temp dir.
- `EmbeddedImageStore.deleteByDocumentId` is idempotent.
- `PptxIngestor` with injected store: attachment count matches expected
  fixture media count.
- `IngestedChunk.imageNames` populated for chunks that reference the
  fixture's embedded image.
- Regression: `PptxIngestor` without injected store still produces text-only
  output (Unit 1 unchanged).

### Integration test
- Optional: an end-to-end `IngestionService` test that ingests the fixture
  through the full pipeline and asserts the resulting `document_chunks` rows
  have populated `locatorJson.imageNames`. Add when Story 2 lands.

## Risks

- **`officeparser` AST shape for slide boundaries is unverified.** Documented
  node types don't include `"slide"`. Mitigation: implementer logs
  `ast.content[0]` on the fixture during dev; if no clean slide signal exists,
  fall back to `ast.toText()` + `chunkMarkdown`. The feature ships either way.
- **Bundle size from officeparser's transitive deps** (Tesseract.js, PDF.js).
  Mitigation: lazy-import inside `parse()` keeps them out of the cold path.
  Verify with a build size check after Story 1 lands; if regression is
  significant in the desktop bundle, investigate `optionalDependencies` or
  patch.
- **Image dedup**. PPTX can reference the same image from multiple slides;
  unknown whether officeparser yields the attachment once or N times.
  Mitigation: track a seen-set keyed on `att.name` in the save loop.
- **Fixture maintenance.** A committed binary fixture is opaque to diff
  review. Mitigation: document the fixture's intended content in a sibling
  `sample.pptx.md` describing its slides, so future tests can be reasoned
  about without opening the file in PowerPoint.

<!-- Implementation Notes accumulate here as work progresses. -->

## Implementation summary

Both child stories landed and are at `stage: review`.

- **Story 1** (`feature-powerpoint-ingestion-text-extraction`, commit
  `30d0700`): `PptxIngestor` with text-only path, registered in the desktop
  ingestor registry and the file picker filter. Unit tests mock officeparser
  with synthetic AST. 15 tests, all green.
- **Fixture + skill update** (commit `e8a95f8`): pulled officeparser's
  own MIT-licensed 89 KB `test.pptx` as `sample.pptx` (9 slides, 4 with
  speaker notes, 1 embedded image), with attribution sidecar. Updated the
  `officeparser-v6` skill with Story 1's AST-shape discoveries.
- **Story 2** (`feature-powerpoint-ingestion-embedded-images`, commit
  `65605aa`): `EmbeddedImageStore` port + `FsEmbeddedImageStore` impl
  mirroring `FsPageImageStore`. Extended `IngestedChunk` with
  `imageNames?: string[]` and `IngestorResult` with
  `pendingEmbeddedImageDocId?: string`. `IngestionService` got a parallel
  rename block and a `locatorJson.imageNames` field. `PptxIngestor` accepts
  an optional `embeddedImageStore` and correlates AST image nodes to slide
  chunks via `metadata.attachmentName`. New slow-test-gated integration
  file `pptx-ingestor-integration.test.ts` exercises the full path against
  the real fixture and passes (6/6 with `PRAXIS_RUN_SLOW_TESTS=1`).
- **Lint cleanup** (this orchestrator pass): Wave 2 left four
  `organizeImports` issues and one line-length formatter issue in the
  files it created/touched. Auto-fixed via `biome check --write` scoped to
  those files. Pre-existing lint errors in unrelated packages
  (`claude-cli-sdk`, `client/__tests__`, `core/__tests__/artifacts`,
  `tests/quiz-end-to-end`) were left alone — not in this feature's scope.

### Deviation from the design — speaker notes shape

The design (and Story 1's first-pass notes) assumed `"note"` nodes nest as
children of their `"slide"` node. Running against the real fixture in
Story 2 revealed that officeparser v6.1.x emits **note nodes as top-level
siblings** in `ast.content` with `metadata.slideNumber` linking them back
to their slide. `PptxIngestor` now builds a `Map<slideNumber, note[]>` from
the top-level note nodes; the SKILL.md was updated in place to reflect
this correction (rolling-foundation; Git carries the history).

### Verification

- `pnpm typecheck` — green workspace-wide.
- `pnpm --filter @praxis/tools test` — 511 passed / 20 skipped.
- `pnpm --filter @praxis/core test` — 708 passed.
- `PRAXIS_RUN_SLOW_TESTS=1 pnpm --filter @praxis/tools test pptx-ingestor` —
  6/6 integration tests pass against the real fixture and real library.
- `biome check` scoped to files this feature touched — clean.

### Files changed

New:
- `packages/tools/src/runtime/ingestion/pptx-ingestor.ts`
- `packages/tools/src/runtime/ingestion/__tests__/pptx-ingestor.test.ts`
- `packages/tools/src/runtime/ingestion/__tests__/pptx-ingestor-integration.test.ts`
- `packages/tools/src/runtime/ingestion/__tests__/fixtures/sample.pptx`
- `packages/tools/src/runtime/ingestion/__tests__/fixtures/sample.pptx.md`
- `packages/core/src/ingestion/embedded-images.ts`
- `packages/core/src/ingestion/__tests__/embedded-images.test.ts`

Edited:
- `packages/tools/src/runtime/ingestion/ingestor.ts` — `IngestedChunk.imageNames`, `IngestorResult.pendingEmbeddedImageDocId`
- `packages/tools/src/runtime/ingestion/index.ts` — `PptxIngestor` export
- `packages/tools/src/runtime/index.ts` — `PptxIngestor` export (also fixed a pre-existing missing export gap)
- `packages/core/src/ingestion/index.ts` — `EmbeddedImageStore`, `FsEmbeddedImageStore` exports
- `packages/core/src/ingestion/service.ts` — `IngestionServiceDeps.embeddedImageStore`, parallel rename block, `locatorJson.imageNames`
- `packages/desktop/electron/main/services.ts` — `FsEmbeddedImageStore` instance, `PptxIngestor({ embeddedImageStore })` registration
- `packages/desktop/electron/main/ingest-channel.ts` — `"pptx"` in file picker filter
- `.claude/skills/officeparser-v6/SKILL.md` — AST discoveries + dedup behaviour

## Review (2026-05-11)

**Verdict**: Approve with comments

**Blockers**: none (one was caught and fixed inline — see Notes)
**Important**: filed as backlog ideas, not in this feature's scope:
- `idea-embedded-image-store-delete-cascade` — `DocumentsServiceImpl.delete()` doesn't cascade-clean the new embedded-image store; per-document image dirs leak on delete
- `idea-image-store-dirfor-abstraction` — both image stores would benefit from a `dirFor({ documentId })` method to remove a regex-strip leak from `IngestionService`
- `idea-pptx-slide-image-map-dead-fallback` — `buildSlideImageNamesMap` has an array-index fallback that the lookup site never consults; dead path that silently loses image correlation in the edge case

**Nits**:
- Asymmetric `blockType` assignment: notes chunks get `"Body"` but body chunks get nothing (`pptx-ingestor.ts:300`). Cosmetic; downstream consumers don't currently switch on `blockType`.

**Notes**:
- Blocker caught: making `embeddedImageStore` mandatory on `IngestionServiceDeps` broke 3 `new IngestionService({...})` sites in `tests/textbook-rag-end-to-end.test.ts` that Wave 2 missed. Slipped through CI because `pnpm typecheck` runs `pnpm -r run typecheck` (per-package only) — the root `tsconfig.json` (which governs `tests/` and `scripts/`) is never typechecked. Fixed the test sites inline. Filed `idea-root-tsconfig-typecheck-coverage` because this is a real CI gap larger than this feature: several other pre-existing type errors live in root-tsconfig scope and aren't caught either.
- Review lenses applied: correctness, tests, design alignment, security (path traversal sanitization verified), breaking changes (one mandatory-field change identified above), foundation-doc alignment (no drift — ingestion architecture story unchanged by adding another format), naming/comments (clean — the "verified real AST shape" comment will save the next maintainer real time).
- Code quality is high. The Wave 2 agent's discovery that note nodes are top-level siblings (not children of slides) was correctly applied across ingestor, mock builder, integration test, and the auto-loading skill — all four stay consistent.
