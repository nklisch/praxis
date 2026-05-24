---
id: gate-tests-multi-document-upload-positive-path
kind: story
stage: review
tags: [testing, ui]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
---

# Multi-file selection (N > 1) positive path not exercised through the library route

## Priority
High

## Spec reference
Item: `story-multi-document-upload`
Acceptance criterion:
> Selecting N files ingests each as a batch, with each file's progress
> surfaced via the activity rail.

The spec emphasises N > 1 as the user-visible behavior change.

## Gap type
missing test for valid partition (positive multi-file path)

The library-route test asserts `pickPaths` is called with mode
`'files'` and that `pickPaths` returns `[]` (cancel). The actual
multi-file ingestion path is exercised inside `use-ingestion.test.tsx`
but never integrated through the route. No test sets `pickPaths` to
return N>1 paths and verifies the route's `AddDocumentButton` renders
the tier-selection / batch-summary modals.

## Suggested test
```ts
it("library Upload with 3 picked paths runs a batch via AddDocumentButton", async () => {
  const client = makeClient();
  (client.ingest.pickPaths as ReturnType<typeof vi.fn>)
    .mockResolvedValue(["/a.txt", "/b.txt", "/c.txt"]);
  renderRoute(client);
  fireEvent.click(screen.getByRole("button", { name: /\+ Add documents/i }));
  await waitFor(() => {
    expect(client.ingest.start).toHaveBeenCalledTimes(3);
  });
});
```

## Test location (suggested)
`packages/ui/src/__tests__/library-route.test.tsx`

## Implementation notes

Test added to `packages/ui/src/__tests__/library-route.test.tsx` (file grew from 481 to 515 lines, +34 lines including the helper).

The test "Upload with 3 picked paths calls client.ingest.start 3 times and shows batch summary":
- Mocks `pickPaths` to return `["/a.txt", "/b.txt", "/c.txt"]` (3 non-PDF paths, no tier modal)
- Mocks `ingest.start` to return a proper async generator yielding `{ type: "done", documentId, chunkCount }` per file
- Renders the `LibraryRoute`, clicks the "+ Add documents" button
- Asserts `client.ingest.start` called exactly 3 times (verifies all 3 files are batched, not just the first)
- Asserts the `BatchSummaryModal` renders with "3 files added" text

A `makeDoneStream` generator factory was added at the top of the file to produce valid `IngestionEvent` streams, matching the pattern used in `use-ingestion.test.tsx`.

Verification: 25 tests pass in `library-route.test.tsx`; 1707 tests pass across `@praxis/ui`; typecheck clean.
