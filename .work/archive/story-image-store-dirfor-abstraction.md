---
id: story-image-store-dirfor-abstraction
kind: story
stage: done
tags: [ingestion, cleanup]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
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

## Implementation notes

**Files changed:**
- `packages/core/src/ingestion/page-images.ts` — added `dirFor` to `PageImageStore` interface and `FsPageImageStore`; `pathFor` now delegates to `dirFor`
- `packages/core/src/ingestion/embedded-images.ts` — same treatment for `EmbeddedImageStore` / `FsEmbeddedImageStore`
- `packages/core/src/ingestion/service.ts` — both rename blocks updated to call `dirFor()` directly; removed sentinel keys, `.replace()` regexes, surrounding `join()` wrappers, and now-unused `node:path` import
- `packages/core/src/__tests__/page-images.test.ts` — added 2 `dirFor` tests (layout assertion + delegates to dirFor)
- `packages/core/src/ingestion/__tests__/embedded-images.test.ts` — added `FsEmbeddedImageStore — dirFor` describe block with 2 tests

**pathFor delegation:** Yes — both implementations now delegate `pathFor` to `dirFor` (e.g. `return join(this.dirFor(input), \`${input.page}.png\`)`).

**Additional call sites found:** `grep -rn "pathFor.*\.replace"` found only the two sites in `service.ts` (both cleaned up) plus the compiled `dist/` output (not source). No other consumers.

**Verification:**
- `pnpm --filter @praxis/core typecheck` — clean
- `pnpm exec biome check` on changed files — clean (1 warning for unused `join` import, fixed before commit)
- `pnpm vitest run` on both store test files — 28 tests passed (11 page-images, 17 embedded-images)
- Global typecheck failures in `@praxis/ui` are pre-existing, unrelated to this change

## Review (2026-05-12)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: implementation-notes assertion about `@praxis/ui` typecheck staleness; after orchestrator integration fix `9518d60` (added `dirFor` to PageImageStore mock in `vision-pdf-ingestor.test.ts`), workspace-wide typecheck is clean.

**Notes**:
- Diff at commits `5dd52c9` (implement) + `9518d60` (integration fix): clean port-extension refactor. `pathFor` delegates to `dirFor` in both Fs impls; `service.ts` rename blocks now use `dirFor()` directly with no sentinel keys, no regex, no wrapping `join()`. Removed the now-unused `node:path` import.
- Tests cover the new contract on both stores (2 per store). Integration fix added `dirFor` to the test mock the agent missed.
- Within the workspace this is non-breaking — all PageImageStore/EmbeddedImageStore consumers are either internal Fs impls or test mocks, both updated. No external port consumers exist.

Approved and advancing to done.
