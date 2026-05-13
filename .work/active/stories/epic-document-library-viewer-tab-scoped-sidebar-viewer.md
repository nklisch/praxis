---
id: epic-document-library-viewer-tab-scoped-sidebar-viewer
kind: story
stage: review
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

## Implementation Notes

### Files added

**Core types / service / IPC** (not in original scope, but required):
- `packages/core/src/types/client.ts` — added `DocumentDetail` interface extending `DocumentSummary` with `title`, `pageCount`, `text`; added `get(documentId)` to `DocumentsClient`
- `packages/core/src/types/index.ts` — exported `DocumentDetail`
- `packages/core/src/services/documents-service.ts` — added `get(documentId)` that fetches the row + joins all chunks as `text`; title/pageCount pulled from `manifestJson`
- `packages/desktop/electron/main/ipc-server.ts` — added `praxis.documents.get` handler
- `packages/client/src/services/documents-client.ts` — added `get(documentId)` method

**Document viewer components** (all new under `packages/ui/src/components/document-viewer/`):
- `format-router.ts` — `pickRenderer(mimeType)` pure function dispatching to per-format component
- `pdf-renderer.tsx` + `pdf-renderer.module.css` — paginated renderer using IntersectionObserver for lazy loading; blob URL lifecycle managed (revoked on unmount)
- `markdown-renderer.tsx` + `markdown-renderer.module.css` — `react-markdown` with `remark-gfm`
- `html-renderer.tsx` + `html-renderer.module.css` — DOMPurify sanitization before `dangerouslySetInnerHTML`
- `structured-renderer.tsx` + `structured-renderer.module.css` — heuristic heading/body section cards for PPTX/DOCX text
- `fallback-renderer.tsx` + `fallback-renderer.module.css` — graceful "Preview not available" message

**Tab body** (new):
- `packages/ui/src/components/document-tab-body.tsx` + `document-tab-body.module.css` — `useResource` to load `DocumentDetail`; dispatches to `pickRenderer`

**Wiring**:
- `packages/ui/src/components/chat-tab-body.tsx` — routes `tab.kind === "document"` to `<DocumentTabBody>`

**Tests** (all new):
- `packages/ui/src/components/document-viewer/__tests__/format-router.test.ts`
- `packages/ui/src/components/document-viewer/__tests__/pdf-renderer.test.tsx`
- `packages/ui/src/components/document-viewer/__tests__/markdown-renderer.test.tsx`
- `packages/ui/src/components/document-viewer/__tests__/html-renderer.test.tsx`
- `packages/ui/src/components/__tests__/document-tab-body.test.tsx`

**Test infrastructure**:
- `packages/ui/src/__tests__/setup.ts` — added `IntersectionObserver` stub (jsdom doesn't provide it)
- `packages/ui/src/__tests__/chat-route.test.tsx` — added `document` tab test

### Divergences from design

1. **`documents.get` added** — The story listed `pageImages.listForDocument` as the IPC call to add if missing. That IPC route doesn't exist and page images already flow via `praxis.documents.pageImage`. What was actually missing was `documents.get` (fetch a single document's detail including full text). Added `DocumentDetail` type and `praxis.documents.get` end-to-end.

2. **`text` field on `DocumentDetail`** — Document text is returned by joining all chunk rows in order rather than a separate IPC call. This keeps the viewer self-contained without a second round-trip.

3. **Pre-existing `listOrphaned` mock gaps fixed** — The in-flight sidebar story had added `listOrphaned` to `DocumentScopesService` but 12+ test mock objects hadn't been updated. Fixed across all affected test files to keep `pnpm test` green.

### Verification

- `pnpm typecheck` — all packages Done, 0 errors
- `pnpm lint` — 7 pre-existing errors in `claude-cli-sdk` only, 0 new errors
- `pnpm test` — 330 passed | 3 skipped | 0 failed
