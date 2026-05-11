---
id: story-embedded-image-store-delete-cascade
kind: story
stage: implementing
tags: [ingestion, bug]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# Fix: cascade-delete embedded images

## Brief

`DocumentsServiceImpl.delete(documentId)`
(`packages/core/src/services/documents-service.ts:62-68`) cascade-removes
vectors, FTS entries, and page images, but it does NOT remove embedded
images saved by `EmbeddedImageStore` (introduced in
`feature-powerpoint-ingestion-embedded-images`). When a user deletes an
ingested PPTX, the per-document directory under
`~/.local/share/praxis/document-embedded-images/<documentId>/` persists on
disk indefinitely. That's a slow resource leak and a privacy gap —
user-facing "delete" doesn't fully delete.

Discovered during review of `feature-powerpoint-ingestion`.

## Change

1. Extend `DocumentsServiceDeps` in
   `packages/core/src/services/documents-service.ts:8-13` with
   `embeddedImageStore: EmbeddedImageStore` (mandatory — matches
   `IngestionServiceDeps`'s shape so every caller is forced to wire it at
   compile time).

   ```typescript
   import type { EmbeddedImageStore } from "../ingestion/embedded-images.js";

   export interface DocumentsServiceDeps {
     db: PraxisDb;
     vectorStore: VectorStore;
     ftsStore: FtsStore;
     pageImageStore: PageImageStore;
     embeddedImageStore: EmbeddedImageStore;
   }
   ```

2. Add the cleanup call to `delete()`:

   ```typescript
   async delete(documentId: string): Promise<void> {
     await this.deps.vectorStore.deleteByDocumentId(documentId);
     await this.deps.ftsStore.deleteByDocumentId(documentId);
     await this.deps.pageImageStore.deleteByDocumentId(documentId);
     await this.deps.embeddedImageStore.deleteByDocumentId(documentId);
     this.deps.db.delete(documents).where(eq(documents.id, documentId)).run();
   }
   ```

   Update the class-level comment block (`documents-service.ts:15-23`) to
   include the new cascade step.

3. Update every `new DocumentsServiceImpl(...)` construction site to pass
   `embeddedImageStore`. Grep result at scope time:

   ```
   packages/core/src/__tests__/documents-service.test.ts  (8 sites)
   packages/desktop/electron/main/services.ts             (1 site)
   tests/textbook-rag-end-to-end.test.ts                  (2 sites)
   ```

   The desktop wiring already constructs an `FsEmbeddedImageStore` for the
   ingestion service — reuse the same instance. Tests should construct a
   per-test instance with a temp `baseDir` (mirror the existing
   `pageImageStore` setup in each file).

4. Add a regression test in `documents-service.test.ts` verifying that
   `delete()` calls `embeddedImageStore.deleteByDocumentId(documentId)`
   (spy or call-tracking on the store). One small test is enough — the
   point is to lock the cascade.

## Acceptance criteria

- [ ] `DocumentsServiceDeps.embeddedImageStore` is mandatory.
- [ ] `delete()` calls `embeddedImageStore.deleteByDocumentId` in addition
      to the existing three deletion calls. Documented in the class doc
      comment.
- [ ] All 11 construction sites updated; typecheck green.
- [ ] Regression test asserts the new cascade call.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green workspace-wide.

## Out of scope

- Refactoring the cascade to use a transactional / atomic-rollback pattern.
  The current sequence is best-effort and that's fine for now.
- Adding an IPC channel for reading embedded images. Separate concern.
- Cleaning up legacy leaked directories on existing user machines. This fix
  is forward-looking; users with prior PPTX deletes will retain stale dirs
  until the relevant document IDs would have been re-used (which they
  won't since UUIDv7). A separate migration could sweep them; not in
  scope.
