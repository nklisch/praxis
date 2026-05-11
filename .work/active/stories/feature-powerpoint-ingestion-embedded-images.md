---
id: feature-powerpoint-ingestion-embedded-images
kind: story
stage: implementing
tags: [ingestion]
parent: feature-powerpoint-ingestion
depends_on: [feature-powerpoint-ingestion-text-extraction]
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# PPTX embedded image extraction

## Scope

Extend the `PptxIngestor` from Story 1 to extract embedded images from
`.pptx` files. Introduce a new `EmbeddedImageStore` port (sibling to the
existing `PageImageStore`), correlate extracted images to the chunks that
reference them, and persist the correlation via a new optional
`IngestedChunk.imageNames` field. No UI surfacing in this story — that's a
follow-up feature.

## Units this story implements

**Units 2, 3, 4** in `feature-powerpoint-ingestion`:
- `packages/core/src/ingestion/embedded-images.ts` (new) — port + FS impl
- `packages/core/src/ingestion/index.ts` — export the new types
- `packages/tools/src/runtime/ingestion/ingestor.ts` — extend `IngestedChunk`
  with optional `imageNames?: string[]` and `IngestorResult` with
  `pendingEmbeddedImageDocId?: string`
- `packages/tools/src/runtime/ingestion/pptx-ingestor.ts` — accept optional
  `EmbeddedImageStore` in constructor; extract attachments when present
- `packages/core/src/ingestion/service.ts` — thread `imageNames` into
  `locatorJson`; rename embedded-image dir from synthetic → real
  `documentId` (parallel block to the existing page-image rename)
- `packages/desktop/electron/main/services.ts` — instantiate
  `FsEmbeddedImageStore`, pass to `PptxIngestor` constructor
- Tests: extend `pptx-ingestor.test.ts` and add
  `packages/core/src/ingestion/__tests__/embedded-images.test.ts`

## Dependency

Depends on Story 1 (`feature-powerpoint-ingestion-text-extraction`). Story 1
must land first because:
- It establishes `PptxIngestor` as the file Story 2 extends.
- It commits the test fixture this story re-uses.
- The slide-boundary spike from Story 1's implementation notes informs how
  images get correlated to chunks (which slide an image belongs to).

## Implementation outline

1. **`EmbeddedImageStore` port + `FsEmbeddedImageStore`** — mirror
   `FsPageImageStore` (`packages/core/src/ingestion/page-images.ts`) shape
   exactly, change only the key field (`imageName: string` instead of
   `page: number`). Sanitize the imageName basename before joining.
   Env override: `PRAXIS_EMBEDDED_IMAGES_DIR`. Default Linux base:
   `~/.local/share/praxis/document-embedded-images/`.
2. **Extend `IngestedChunk`** with optional `imageNames?: string[]`.
3. **Extend `IngestorResult`** with optional `pendingEmbeddedImageDocId?: string`
   (parallel to the existing `pendingPageImageDocId`).
4. **Extend `IngestionService.ingest()`** to:
   - Add a second `rename` block (mirroring `service.ts:139-153`) for
     `pendingEmbeddedImageDocId`.
   - Persist `imageNames` in `locatorJson` (extend the object literal at
     `service.ts:160-165`).
5. **Extend `PptxIngestor`** to accept
   `constructor(opts?: { embeddedImageStore?: EmbeddedImageStore })`.
   When `embeddedImageStore` is set:
   - Call `OfficeParser.parseOffice(filePath, { extractAttachments: true, ... })`.
   - For each `OfficeAttachment` of `type === "image"`: decode Base64,
     save via `embeddedImageStore.save(...)` under a synthetic
     `documentId` (e.g. `_pending_${randomUUID()}`).
   - Walk `ast.content` for `node.type === "image"` references; populate
     `chunk.imageNames` based on `node.metadata?.attachmentName`.
   - Set `pendingEmbeddedImageDocId` on the result so `IngestionService`
     renames the dir.
   - Dedup attachments by `att.name` (in case officeparser yields the
     same image multiple times).
6. **Wire `FsEmbeddedImageStore`** into `services.ts` and pass to
   `new PptxIngestor({ embeddedImageStore })`.

## Acceptance criteria

- [ ] `EmbeddedImageStore` port and `FsEmbeddedImageStore` impl exist in
      `@praxis/core/ingestion`, exported from `index.ts`.
- [ ] Round-trip save/read with a non-ASCII image filename (sanitized) works.
- [ ] `deleteByDocumentId` is idempotent (no-throw when directory absent).
- [ ] `IngestedChunk.imageNames?: string[]` exists; older ingestors
      (markdown, docx, etc.) continue to pass their existing tests
      unchanged.
- [ ] `PptxIngestor` without an injected store still passes Story 1's tests
      (no regression on the text-only path; `extractAttachments: false`
      preserved).
- [ ] `PptxIngestor` with an injected store, given the fixture from
      Story 1:
  - [ ] Saves each embedded image exactly once even if referenced from
        multiple slides.
  - [ ] Populates `imageNames` on the chunks that reference each image
        (verify against the fixture's known image-to-slide mapping
        documented in `sample.pptx.md`).
- [ ] `IngestionService` end-to-end: ingesting the fixture produces
      `document_chunks` rows with `locatorJson.imageNames` set where
      expected, and images present in the embedded-image store under the
      real `documentId`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope

- UI for showing images inline on source cards (separate feature).
- Vision-based image description / OCR (separate feature; we have a vision
  pipeline that could index image content as text in the future).
- DOCX image extraction (parked as `idea-docx-ingestor-cleanup-and-images`).
- IPC channel for the renderer to read embedded images (the store is in
  place; the channel can be added when a UI consumer exists).
