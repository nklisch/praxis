---
id: story-image-store-dirfor-abstraction
kind: story
stage: implementing
tags: [ingestion, cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# Refactor: add `dirFor()` to image stores

## Brief

Both `PageImageStore` and `EmbeddedImageStore` expose only
`pathFor({ documentId, ... })` returning a full file path. `IngestionService`
needs the *directory* path during the synthetic → real `documentId` rename,
so it currently invents a placeholder key (`page: 1`, `imageName: "_"`),
calls `pathFor`, then strips the trailing filename with a regex:

```typescript
// packages/core/src/ingestion/service.ts:139-153 (page images)
const synthDir = join(
  this.deps.pageImageStore
    .pathFor({ documentId: result.pendingPageImageDocId, page: 1 })
    .replace(/[\\/]1\.png$/, ""),
);
// packages/core/src/ingestion/service.ts:155-175 (embedded images)
const synthDir = join(
  this.deps.embeddedImageStore
    .pathFor({ documentId: result.pendingEmbeddedImageDocId, imageName: "_" })
    .replace(/[\\/][^/\\]+$/, ""),
);
```

That's an abstraction leak: callers shouldn't have to invent sentinel
filenames and parse the result. The stores own the directory layout — let
them expose it.

Discovered during review of `feature-powerpoint-ingestion`.

## Change

1. Add `dirFor({ documentId }): string` to both store ports:

   ```typescript
   // packages/core/src/ingestion/page-images.ts
   export interface PageImageStore {
     // …existing methods…
     dirFor(input: { documentId: string }): string;
   }
   export class FsPageImageStore implements PageImageStore {
     dirFor(input: { documentId: string }): string {
       return join(this.baseDir, input.documentId);
     }
     // pathFor can delegate: return join(this.dirFor(input), `${input.page}.png`);
   }
   ```

   Same shape for `EmbeddedImageStore` / `FsEmbeddedImageStore`. For the
   embedded store, `pathFor` becomes
   `join(this.dirFor(input), sanitizeImageName(input.imageName))`.

2. Update the two rename blocks in
   `packages/core/src/ingestion/service.ts`:

   ```typescript
   // Page images:
   const synthDir = this.deps.pageImageStore.dirFor({
     documentId: result.pendingPageImageDocId,
   });
   const realDir = this.deps.pageImageStore.dirFor({ documentId });
   await rename(synthDir, realDir);

   // Embedded images: identical shape with embeddedImageStore.
   ```

   Drop the `join(...)` wrapper, drop the regex `.replace(...)`, drop the
   placeholder keys.

3. Search the codebase for any other consumer that derives a directory by
   the same trick:
   ```
   grep -rn "pathFor.*\.replace" packages/ tests/
   ```
   Fix any other site found.

## Acceptance criteria

- [ ] `PageImageStore.dirFor` and `EmbeddedImageStore.dirFor` exist on the
      port interfaces and FS impls.
- [ ] Both rename blocks in `service.ts` use `dirFor()` directly — no
      `pathFor(...).replace(...)` regex anywhere in `service.ts`.
- [ ] Existing tests pass without modification (the store contract is
      strictly extended; nothing existing breaks).
- [ ] One new test per store (or extension of existing test files) asserts
      `dirFor({ documentId })` returns the expected layout
      (`<baseDir>/<documentId>`).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope

- Renaming `pathFor`. It's still useful for read/save call sites that need
  the full path.
- Changing the on-disk layout. `dirFor` returns the existing directory; no
  migration.
- Cleanup of the `join(...)` wrapper. After the regex is gone, the
  surrounding `join(...)` in `service.ts` becomes redundant — drop it as
  part of the change, but don't open a wider sweep of `join` usage.
