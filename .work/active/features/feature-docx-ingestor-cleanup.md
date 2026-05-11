---
id: feature-docx-ingestor-cleanup
kind: feature
stage: drafting
tags: [ingestion]
parent: null
depends_on: [feature-powerpoint-ingestion]
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
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
