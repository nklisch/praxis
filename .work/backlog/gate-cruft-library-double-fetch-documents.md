---
id: gate-cruft-library-double-fetch-documents
kind: story
stage: backlog
tags: [cleanup, perf]
parent: null
depends_on: []
release_binding: null
gate_origin: cruft
created: 2026-05-23
updated: 2026-05-23
---

# Double-fetch of document list on Library route mount

## Confidence
Low — from gate-cruft on release v0.1.4.

## Category
over-abstraction / wasted work

## Location
`packages/ui/src/routes/library.tsx:38, 44-48`

## Evidence
```ts
const { data, loading, error, refresh } = useLibrary();      // calls client.documents.list()
...
const { refresh: refreshDocuments } = useDocuments();         // also calls client.documents.list()
const ingestion = useIngestion(async () => {
  await refreshDocuments();
  await refresh();                                            // refreshes documents AGAIN via useLibrary
});
```

## Verification
`useLibrary` (`packages/ui/src/hooks/use-library.ts:37-43`) loads
documents as part of its `Promise.all`, and the after-ingestion
callback already calls `refresh()` which re-fires the same
`client.documents.list()`. The `useDocuments` hook here exists solely
to obtain a `refresh` that becomes a no-op given the immediately-
following `await refresh()` from `useLibrary`. Two on-mount fetches +
two refreshes per ingestion.

Downgraded to Low because there's a small chance another component
composition expected `useDocuments` to perform a sort or transform —
but reading the hook (line 22: `client.documents.list()` returned
directly), it doesn't.

## Removal
Drop the `useDocuments` hook + its import; just call `refresh()`
(from `useLibrary`) in the `useIngestion` callback.
