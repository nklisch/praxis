---
id: feature-docx-ingestor-cleanup
kind: feature
stage: implementing
tags: [ingestion]
parent: null
depends_on: [feature-powerpoint-ingestion]
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
---

# DocxIngestor cleanup and embedded-image extraction

## Brief

Clean up `DocxIngestor` (`packages/tools/src/runtime/ingestion/docx-ingestor.ts`)
and add embedded-image extraction. The current implementation calls
`mammoth.convertToHtml()` and then strips the HTML back down to markdown via a
chain of regex `.replace()` calls (`docx-ingestor.ts:53-91`) — clunky and brittle
for any HTML mammoth produces that isn't h1-h6 / p / li / br. Embedded images in
the source `.docx` are dropped entirely.

Two paths worth weighing in the design pass:
- **(a)** Switch to `mammoth.convertToMarkdown()` (mammoth has one) and drop the
  HTML-to-markdown regex pipeline. Lowest-risk cleanup; no image work.
- **(b)** Keep mammoth but use its `convertImage` option to extract embedded
  images into the same `EmbeddedImageStore` that the PPTX ingestor populates.
  Reuses the infrastructure that `feature-powerpoint-ingestion` introduces; the
  ingest pipeline gets two ingestors that produce embedded images by the same
  contract.

Both improve the same ingestor and are likely best done together: clean the text
path with `convertToMarkdown` *and* wire image extraction through
`EmbeddedImageStore`.

**Broader question deferred to the design pass.** Once PPTX is on
`officeparser`, evaluate whether `mammoth` → `officeparser` for DOCX is worth
it. Free image extraction, single library across office formats, unlocks `.rtf`
/ `.odt` / `.odp` for future ingestion. Tradeoff is regression risk on
already-ingested DOCX content. That evaluation needs a side-by-side
fixture-comparison harness *before* any swap is committed to. The design pass
should decide whether to (i) ship the mammoth-based cleanup + image extraction
now and leave the swap for a future feature, or (ii) build the comparison
harness and swap in this feature if the result is clean. Lean toward (i) — the
cleanup is independently valuable and the swap is a separable decision.

## Scope notes

`depends_on: [feature-powerpoint-ingestion]` because this feature reuses the
`EmbeddedImageStore` port and the `IngestedChunk.imageNames` field introduced
there. Cleaner to land PPTX first, validate the embedded-image contract on a
single ingestor, then bring DOCX onto the same path.

If the design pass picks (b) — image extraction via mammoth's `convertImage` —
the wiring is: extend the `DocxIngestor` constructor with an optional
`embeddedImageStore` (mirroring `PptxIngestor`); when present, configure
mammoth's `convertImage` to write each embedded image through the store and
emit a placeholder `<img>` tag that the markdown converter renders as an image
reference; populate `chunk.imageNames` on the chunk that contains that
reference.

Origin: `.work/backlog/idea-docx-ingestor-cleanup-and-images.md`.

<!-- Design and Implementation Notes accumulate here as work progresses. -->

## Design decisions

Ambiguities resolved during this design pass:

- **Path (a) + (b) together**: yes, ship both — `mammoth.convertToMarkdown()`
  for the text path AND `convertImage` wiring for embedded image extraction.
  The body's brief already endorses doing them together; they share the call
  site (the single `mammoth.convert*` invocation).
- **(i) mammoth cleanup vs (ii) officeparser swap evaluation**: pick (i) —
  ship the bounded cleanup now, defer the officeparser swap to a separate
  future feature. The brief leans this way explicitly. The comparison
  harness is out of scope.
- **Image-to-chunk correlation strategy**: scan each post-chunked
  `IngestedChunk.text` for markdown image references via the standard
  `![alt](src)` regex, look up imageName from a `src → imageName` map
  populated by `convertImage`, and write `chunk.imageNames` only on the
  chunks containing those references. Accepts edge cases where an image
  reference straddles a chunk boundary (markdown chunker preserves
  paragraph-level units, so this is rare).
- **Constructor shape**: `DocxIngestor` gains a constructor accepting
  `{ embeddedImageStore?: EmbeddedImageStore }` — same shape as
  `PptxIngestor`. Keeps the two ingestors consistent so the next reader
  (or the future officeparser swap) finds the same surface.

## Architectural choice

**Use mammoth's native markdown converter + `convertImage` option, retain
mammoth as the DOCX engine for now.**

Rationale over rejected alternatives:

- **Drop-in `convertToMarkdown` swap (chosen)**: mammoth ships a markdown
  converter that produces clean output for the structures we care about
  (h1-h6, p, ul/ol/li, br, inline emphasis). It also accepts the
  `convertImage` option directly, so image extraction plugs in at the same
  call site. Smallest change, lowest risk, single library, no fixture-level
  rewrites required for non-image DOCX content.
- **Replace mammoth with officeparser**: rejected for this feature.
  officeparser is now in-tree for PPTX (per `feature-powerpoint-ingestion`)
  and a future feature can evaluate the swap with a side-by-side fixture
  harness. Premature here — the cleanup is independently valuable.
- **Keep mammoth + HTML pipeline + add convertImage**: rejected. The HTML
  regex chain at the current implementation (`docx-ingestor.ts:53-91`) is
  the smell that scopes this feature; half-measures don't kill it.

## Implementation Units

Tight cohesion across units (one ingestor, one call site, one test file).
Implement as a single stride; no child stories. The orchestrator runs this
as a one-agent wave when the feature is at `stage: implementing`.

### Unit 1: Switch text path to `mammoth.convertToMarkdown()`

**File**: `packages/tools/src/runtime/ingestion/docx-ingestor.ts`

```typescript
import { basename, extname } from "node:path";
import type { EmbeddedImageStore } from "@praxis/core/ingestion";
import { chunkMarkdown } from "./chunker.js";
import type { IngestedChunk, Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";

export interface DocxIngestorOptions {
  /**
   * When provided, embedded images in the DOCX are extracted and saved to
   * this store under a synthetic documentId. The result will include
   * `pendingEmbeddedImageDocId` so IngestionService can rename the directory
   * to the real documentId after the document row is persisted. Mirrors
   * `PptxIngestorOptions.embeddedImageStore`.
   */
  embeddedImageStore?: EmbeddedImageStore;
}

export class DocxIngestor implements Ingestor {
  readonly id = "docx" as const;
  readonly label = "DOCX";
  readonly extensions = [".docx"] as const;
  readonly mimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ] as const;

  constructor(private readonly opts: DocxIngestorOptions = {}) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async parse(filePath: string, parseOpts: IngestorOptions = {}): Promise<IngestorResult> {
    // Lazy import — mammoth is only loaded when DOCX is being parsed
    const mammoth = await import("mammoth");

    // Unit 2 attaches convertImage here when the store is present (see below).
    const { result: markdown, srcToImageName } = await this.runMammoth(mammoth, filePath);

    const fallbackTitle = basename(filePath, extname(filePath));
    const h1Match = /^#\s+(.+)$/m.exec(markdown);
    const title = h1Match ? h1Match[1]!.trim() : fallbackTitle;

    const { chunks } = chunkMarkdown(markdown, {
      ...(parseOpts.maxChars !== undefined && { maxChars: parseOpts.maxChars }),
    });

    // Unit 2 populates chunk.imageNames here based on srcToImageName.
    const chunksWithImages = tagChunksWithImages(chunks, srcToImageName);

    return {
      title,
      chunks: chunksWithImages,
      ingestorId: this.id,
      // pendingEmbeddedImageDocId set by Unit 2 when images were saved.
      ...(this.pendingDocId !== undefined && { pendingEmbeddedImageDocId: this.pendingDocId }),
    };
  }
}
```

**Implementation Notes**:
- Delete the `docxHtmlToMarkdown` and `stripTags` helper functions — they're
  the entire HTML-stripping regex chain and are no longer needed.
- `mammoth.convertToMarkdown({ path: filePath })` returns
  `{ value: string, messages: Message[] }`. We use `value` directly.
- Run mammoth's output through the existing fixture(s) and compare against
  the prior implementation's output structurally. Minor formatting
  differences (extra `\n`, ordered list numbering style) are acceptable as
  long as the chunker's heading-aware grouping still works.
- The `IngestedChunk.text` field carries the chunk's markdown verbatim, so
  the image references survive into Unit 2's correlation step.

**Acceptance Criteria**:
- [ ] `mammoth.convertToHtml` and the `docxHtmlToMarkdown` / `stripTags`
      helpers are gone.
- [ ] `mammoth.convertToMarkdown` is called instead.
- [ ] Existing DOCX fixtures produce structurally-equivalent chunks
      (heading-aware grouping preserved; chunk count within ±1 of baseline).
- [ ] No regression in the existing test suite.

---

### Unit 2: Wire `convertImage` for embedded-image extraction

**Files**: `packages/tools/src/runtime/ingestion/docx-ingestor.ts`,
`packages/tools/src/runtime/ingestion/__tests__/docx-ingestor.test.ts`,
plus a new fixture `__tests__/fixtures/with-images.docx`

```typescript
// In DocxIngestor — runMammoth helper:
private pendingDocId: string | undefined;

private async runMammoth(
  mammoth: typeof import("mammoth"),
  filePath: string,
): Promise<{ result: string; srcToImageName: Map<string, string> }> {
  const store = this.opts.embeddedImageStore;
  const srcToImageName = new Map<string, string>();

  if (store === undefined) {
    const { value } = await mammoth.convertToMarkdown({ path: filePath });
    return { result: value, srcToImageName };
  }

  // Synthetic documentId — IngestionService renames the dir post-persist.
  const syntheticDocId = `_pending_${randomUUID()}`;
  let imageCounter = 0;
  let anySaved = false;

  const { value } = await mammoth.convertToMarkdown(
    { path: filePath },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const contentType: string = await image.contentType ?? "image/png";
        const ext = mimeToExt(contentType);
        const imageName = `image-${++imageCounter}${ext}`;
        const bytes = Buffer.from(await image.readAsBase64String(), "base64");

        await store.save({
          documentId: syntheticDocId,
          imageName,
          bytes,
          mimeType: contentType,
        });
        anySaved = true;

        // src is a stable per-image marker the chunker keeps inline; we map
        // it back to imageName during chunk tagging.
        const src = `praxis://embedded/${imageName}`;
        srcToImageName.set(src, imageName);
        return { src };
      }),
    },
  );

  if (anySaved) this.pendingDocId = syntheticDocId;
  return { result: value, srcToImageName };
}

// After chunking — tag chunks whose text contains image refs:
function tagChunksWithImages(
  chunks: IngestedChunk[],
  srcToImageName: Map<string, string>,
): IngestedChunk[] {
  if (srcToImageName.size === 0) return chunks;
  const imageRefRe = /!\[[^\]]*\]\((praxis:\/\/embedded\/[^)]+)\)/g;
  return chunks.map((c) => {
    const names: string[] = [];
    for (const m of c.text.matchAll(imageRefRe)) {
      const name = srcToImageName.get(m[1]!);
      if (name !== undefined && !names.includes(name)) names.push(name);
    }
    return names.length > 0 ? { ...c, imageNames: names } : c;
  });
}

function mimeToExt(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/svg+xml") return ".svg";
  return ".bin";
}
```

**Implementation Notes**:
- mammoth's `images.imgElement` factory takes an async function and returns
  the `convertImage` option correctly. The function receives a mammoth
  `Image` with `contentType` (Promise<string>) and `readAsBase64String()`.
- `image-1.png`, `image-2.png`, etc. — sequential naming inside the
  synthetic-docId scope. DOCX doesn't expose stable per-image names the way
  PPTX does; sequential is fine and matches the user's expectation that
  "image 1 of the document" is meaningful.
- The `praxis://embedded/<imageName>` URI scheme is a private marker — the
  chunker preserves it as-is, and `tagChunksWithImages` finds it via regex.
  Not exposed externally; the renderer never sees this URI because
  embedded-image read paths use `{ documentId, imageName }`.
- The `pendingDocId` lives as a private mutable on the ingestor instance.
  Reset to `undefined` at the start of each `parse()` call (each ingest is
  a fresh document).

**Acceptance Criteria**:
- [ ] `new DocxIngestor({ embeddedImageStore }).parse(filePath)` saves
      embedded images via the store.
- [ ] Result includes `pendingEmbeddedImageDocId` when at least one image
      was saved; absent when the document had no embedded images.
- [ ] Chunks containing image references have `chunk.imageNames` populated
      with the saved image names; chunks without image references do NOT.
- [ ] When the constructor option is omitted, behavior is identical to the
      pre-feature state (no images saved, no `pendingEmbeddedImageDocId`,
      no `chunk.imageNames`).
- [ ] Markdown chunks render with the `praxis://embedded/...` reference
      stripped (or kept — verify with the chunker's behavior; if kept,
      that's fine because the consumer reads images via `documentId +
      imageName`, not the URI).

---

### Unit 3: Wire `embeddedImageStore` in the composition root

**File**: `packages/desktop/electron/main/services.ts`

```typescript
// services.ts:295 — change:
new DocxIngestor(),
// to:
new DocxIngestor({ embeddedImageStore }),
```

**Implementation Notes**:
- Reuse the same `embeddedImageStore` instance already passed to
  `PptxIngestor` at line 298. One store instance backs both ingestors —
  documents from either source live under the same per-documentId
  directory layout (`<baseDir>/<documentId>/<imageName>`).
- The cascade-delete path in `DocumentsServiceImpl.delete()` already calls
  `embeddedImageStore.deleteByDocumentId(documentId)` (landed by
  `story-embedded-image-store-delete-cascade`), so DOCX-extracted images
  participate in the cascade for free.

**Acceptance Criteria**:
- [ ] `services.ts` wires the shared `embeddedImageStore` instance into
      `new DocxIngestor(...)`.
- [ ] End-to-end ingest of a DOCX with images writes the images to the
      embedded store, persists with the real documentId after the rename,
      and the resulting document's chunks carry `imageNames`.

## Implementation Order

1. Unit 1 (`mammoth.convertToMarkdown` swap) — establishes the new call
   site. Removes the regex chain.
2. Unit 2 (`convertImage` wiring + chunk tagging) — adds the embedded-image
   extraction path. Builds on Unit 1's call site.
3. Unit 3 (composition root) — flips the wiring on; the change isn't
   user-visible until this lands.

All three should land in one commit since they're tightly coupled. Treat
the feature as a single implementation unit; no child story files.

## Testing

### Unit tests: `packages/tools/src/runtime/ingestion/__tests__/docx-ingestor.test.ts`

Existing tests should still pass with Unit 1 in place (golden tests on
already-ingested fixtures; verify chunk count and structure stay
equivalent). Add:

- **Text-only fixture**: same fixture as today; assert the new
  `convertToMarkdown` output produces a chunk count and per-chunk text
  that matches (or is within tolerance of) the prior implementation.
- **With-images fixture**: new minimal DOCX with one paragraph + one
  embedded image. Assert: `result.chunks[N].imageNames` includes the saved
  image name; `result.pendingEmbeddedImageDocId` is set; the store's
  `save()` was called with the synthetic doc id.
- **No-store fallback**: omit `embeddedImageStore`; assert no images saved,
  no `pendingEmbeddedImageDocId`, chunks have no `imageNames`.

A minimal `.docx` fixture with one image can be generated via the
`docx` npm package or carried as a binary fixture; either is fine. Match
the PPTX fixture's approach.

### Integration: `tests/textbook-rag-end-to-end.test.ts` or a new file

If a DOCX path through the IngestionService → DocumentsService cascade
isn't already exercised, add one fresh test asserting:

- DOCX with images ingests cleanly
- `delete()` cascades through the embedded-image store
- Re-ingesting the same DOCX produces a fresh `documentId` and saves
  images under the new id

If existing tests cover this for PPTX, the DOCX path is structurally
identical and a smaller assertion (the imageNames are present on a chunk
after ingest) is enough.

## Risks

1. **Mammoth markdown output differs subtly from the regex-stripped HTML
   output.** Mitigation: golden tests against existing fixtures verify
   the chunker still sees the same heading structure. If the new output
   produces different chunk boundaries (rare; heading detection is robust),
   we accept the diff — chunks are an internal artifact, not a contract.
2. **`mammoth.images.imgElement` API surface or `image.contentType` shape
   differs from the doc.** Verify against the installed version's actual
   types during implementation. If `contentType` is sync-only or named
   differently, adapt at the call site.
3. **DOCX with no images shouldn't pay any IO cost.** When
   `embeddedImageStore` is undefined, we skip `convertImage` entirely (no
   filesystem activity). Tested by the no-store fallback case.
4. **`praxis://embedded/...` URI scheme could leak to external consumers if
   the chunker preserves it verbatim.** It's not a stable contract.
   Mitigation: the embedded-image read API uses `{ documentId, imageName }`;
   no consumer parses the URI. If we want to strip it from rendered text
   later, a post-chunk-text-sanitizer can do that without changing the
   ingestor contract.

## Out of scope

- The officeparser-vs-mammoth swap evaluation (deferred to a future feature
  per the brief).
- `.rtf` / `.odt` / `.odp` ingestion (unlocked by the officeparser swap; not
  by this feature).
- A side-by-side fixture-comparison harness (deferred with the swap).
- Refactoring the `chunkMarkdown` to know about image references natively;
  the post-chunking regex scan is enough for this feature's scope.
