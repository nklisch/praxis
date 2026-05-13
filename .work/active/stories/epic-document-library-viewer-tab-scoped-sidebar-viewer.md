---
id: epic-document-library-viewer-tab-scoped-sidebar-viewer
kind: story
stage: implementing
tags: [ui, documents]
parent: epic-document-library-viewer-tab-scoped-sidebar
depends_on: [epic-document-library-viewer-tab-scoped-sidebar-tab-kind]
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Document viewer body

## Scope

The multi-format document viewer that mounts inside a `kind: "document"` tab. A top-level `<DocumentTabBody>` dispatches on `documents.mimeType` to per-format renderers (PDF, markdown/text, HTML, PPTX/DOCX outline).

## Units in this story (per parent feature's Story 2)

- `<DocumentTabBody>` top-level component
- `<PdfRenderer>`, `<MarkdownRenderer>`, `<HtmlRenderer>`, `<StructuredRenderer>`
- `format-router.ts` (mimeType → renderer)
- Edit tab-body dispatcher to route `tab.kind === "document"` to `<DocumentTabBody>`
- IPC `pageImages.listForDocument` if missing
- Per-renderer tests + dispatcher test

## Acceptance Criteria

- [ ] Opening a document tab via `openDocumentInTab` renders the viewer.
- [ ] PDF docs render paginated from `PageImageStore` rasters.
- [ ] Markdown / plain text docs render readable.
- [ ] HTML docs render sanitized (no XSS via tooling test).
- [ ] PPTX / DOCX docs render outline-shaped (text + embedded images grouped by section).
- [ ] `pnpm test` passes.

## Out of scope

- Per-mimeType plugin registry (v2 idea)
- Native-fidelity PPTX (v2 idea)
