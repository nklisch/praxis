---
id: gate-docs-architecture-pptx-ingestor-image-stores
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# ARCHITECTURE.md ingestor list omits `PptxIngestor` and the embedded-image / page-image stores

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/ARCHITECTURE.md:360`
- Code: `packages/tools/src/runtime/ingestion/index.ts:3-20`, `packages/core/src/ingestion/embedded-images.ts`, `packages/core/src/ingestion/page-images.ts`

## Current doc text
> "Ingestion is TS-native. The `Ingestor` port in `@praxis/tools/runtime/ingestion/` dispatches to per-format adapters: `PlainTextIngestor`, `MarkdownIngestor`, `HtmlIngestor`, `DocxIngestor`, `EpubIngestor`, `JsPdfIngestor`, `VisionPdfIngestor`."

## Reality
A `PptxIngestor` ships via `feature-powerpoint-ingestion`, using `officeparser` for the AST and the new `EmbeddedImageStore` for extracted figures (alongside the existing `PageImageStore` used by `VisionPdfIngestor`). DocxIngestor was cleaned up to share the same image-store abstraction.

## Required edit
Add `PptxIngestor` to the per-format adapter list. Append a sentence describing the `EmbeddedImageStore` / `PageImageStore` ports for storing extracted figures, content-addressed under the document.
