---
id: story-library-route-hygiene-pass
kind: story
stage: implementing
tags: [cleanup, perf, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: cruft
created: 2026-05-23
updated: 2026-05-23
---

# Library route hygiene pass

## Brief
Two v0.1.4 gate-cruft findings both touch `packages/ui/src/routes/library.tsx`.
Bundling into one pass — single file, single PR, two surgical fixes.

Absorbs:
- `gate-cruft-library-double-fetch-documents` (perf)
- `gate-cruft-library-handle-use-pack-orientation-comment` (cleanup)

## Fix 1: Remove double-fetch of documents list (perf win)

**Location**: `packages/ui/src/routes/library.tsx:38, 44–48`

**Current shape**:
```ts
const { data, loading, error, refresh } = useLibrary();      // calls client.documents.list()
...
const { refresh: refreshDocuments } = useDocuments();         // also calls client.documents.list()
const ingestion = useIngestion(async () => {
  await refreshDocuments();
  await refresh();                                            // refreshes documents AGAIN via useLibrary
});
```

`useLibrary` (`packages/ui/src/hooks/use-library.ts:37–43`) already loads documents
as part of its `Promise.all`, and the after-ingestion `refresh()` re-fires the same
`client.documents.list()`. The `useDocuments` hook is here solely for its `refresh`
function — the data it returns is discarded.

**Target**: Drop the redundant `useDocuments()` call. Use `useLibrary`'s `refresh`
as the single after-ingestion refresh. One round-trip per page load + one
round-trip per ingestion (down from two and two).

## Fix 2: Remove redundant orientation comment

**Location**: `packages/ui/src/routes/library.tsx:85`

**Current shape**:
```ts
// handleUsePack and importing are used by PacksSection below.
```

This adds no information not already visible from the JSX usage at
`packages/ui/src/routes/library.tsx:346-347` (`onUsePack={handleUsePack} importing={importing}`).

**Target**: Delete the comment line.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` green
- `packages/ui/src/routes/library.tsx` no longer references `useDocuments`
- Comment at line 85 removed
- Manual smoke: open `/library` → documents render once; complete an ingestion →
  document list refreshes once (verifiable in network panel or with a
  per-call log)

## Risk
Low. Both fixes are confined to one file with clear semantics. The `useLibrary`
refresh is already exercised by the existing post-ingestion path.
