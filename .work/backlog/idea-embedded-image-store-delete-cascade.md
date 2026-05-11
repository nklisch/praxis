---
id: idea-embedded-image-store-delete-cascade
created: 2026-05-11
tags: [ingestion, bug]
---

`DocumentsServiceImpl.delete(documentId)` (`packages/core/src/services/documents-service.ts:62`) cascade-removes vectors, FTS entries, and page-images, but does NOT remove embedded images saved by `EmbeddedImageStore` (introduced in `feature-powerpoint-ingestion-embedded-images`). When a user deletes a PPTX, the per-document directory under `~/.local/share/praxis/document-embedded-images/<documentId>/` persists on disk indefinitely — a slow resource leak and a privacy gap (user-facing "delete" doesn't fully delete). Fix: extend `DocumentsServiceDeps` with `embeddedImageStore: EmbeddedImageStore` (mandatory, to match the IngestionServiceDeps shape so all callers are forced to wire it), add `await this.deps.embeddedImageStore.deleteByDocumentId(documentId)` to the cascade in `delete()`, and update all 12 `new DocumentsServiceImpl(...)` sites (in `services.ts`, `documents-service.test.ts`, `textbook-rag-end-to-end.test.ts`). Originating review: `feature-powerpoint-ingestion`. Small story, no design pass needed.
