---
id: idea-image-store-dirfor-abstraction
created: 2026-05-11
tags: [ingestion, cleanup]
---

Both `PageImageStore` and `EmbeddedImageStore` expose only `pathFor({ documentId, ... })` which returns a full file path. `IngestionService` needs the *directory* path during the synthetic → real `documentId` rename, so it currently does `pathFor({...placeholderKey})` then `.replace(/[\\/][^/\\]+$/, "")` to strip the trailing filename (see `packages/core/src/ingestion/service.ts:139-153` for page images and `:155-175` for embedded images — both use this hack). Cleaner: add a `dirFor({ documentId }): string` method to both stores and use it directly. Removes the regex-strip leak from the service and stops requiring callers to invent placeholder keys (`page: 1`, `imageName: "_"`) just to derive a directory. Originating review: `feature-powerpoint-ingestion`. Trivial mechanical change.
