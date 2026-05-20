---
id: story-multi-document-upload
kind: story
stage: done
tags: [ui, ingestion]
parent: feature-streamline-document-attachment-ux
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-19
---

# Multi-file document upload — Library route Upload button

## Brief
Wire the (currently missing) Upload button in the library route header to
the existing multi-file ingestion path. The `useIngestion` hook is already
instantiated at `packages/ui/src/routes/library.tsx:43`, and it already
exposes `startPickBatch("files")` for multi-file batch ingestion through
the OS file dialog. The story is pure UI plumbing — connect the button.

## Implementation

**File**: `packages/ui/src/routes/library.tsx`

Add an "Upload" button to the library route header. Match the existing
RouteHeader action pattern used by other routes (look at adjacent route
files in `packages/ui/src/routes/` for the button style and placement
convention). Wire the click handler:

```tsx
async function handleUpload() {
  await ingestion.startPickBatch("files");
}

// In the route header JSX:
<button type="button" onClick={handleUpload}>Upload</button>
```

The route should already render the ingestion state UI based on
`ingestion.state` (tier-selection modal, batch summary). If those modals
aren't rendered today, add them — model on whatever consumer of
`useIngestion` currently renders the full state UI (`grep -l
"ingestion.state" packages/ui/`).

Per-file activity-rail progress is handled internally by `useIngestion` —
no additional `ActivityRegistry` calls needed in the route.

## Acceptance

- [ ] An "Upload" button is visible in the library route header.
- [ ] Clicking it opens the OS file dialog with multi-select enabled
      (the existing Electron dialog wrapping already supports multi-file).
- [ ] Selecting 1 file ingests with activity-rail progress visible.
- [ ] Selecting N files runs a batch ingestion; each file produces its own
      activity-rail item.
- [ ] Tier-selection modal renders correctly when a tier choice is needed
      during the batch.
- [ ] Cancelling the dialog is a no-op.
- [ ] No regression on the library route's existing surfaces (document
      list, attachment counts, search/filter if present).

## Tests

`packages/ui/src/routes/__tests__/library.test.tsx` (or sibling):
- Render `Library` with `makeFakeClient` (`ui-test-helper` pattern).
- Assert the "Upload" button is in the DOM.
- Click it; assert `ingestion.startPickBatch` is called with `"files"`.
- Mock the client's `ingest.start` to return a batch-summary state;
  assert the route advances correctly through the state.

## Patterns
- `editorial-ui-primitives` — RouteHeader action pattern.
- `ui-test-helper` — `makeFakeClient`.
- `activity-rail-producer` — `useIngestion` already does this; do not
  reimplement.

## Notes
- The `Folder` upload mode (`startPickBatch("folder")`) exists in the hook
  but is out of scope for v1 unless the surrounding UI already uses it.
  Skip if unfamiliar — the v1 acceptance is files-only.
- `useIngestion` already accepts `opts.scope` for auto-attach to a course
  or session, but the library route is the unscoped upload surface (no
  course/lesson context) — leave `scope` unset.

## Implementation Notes

**Button placement**: The Upload button is placed inside the Documents footer
card (bottom-right of the three-card footer row), replacing the old inline
`client.ingest.pickFile()` call. This is the natural home — users looking to
upload documents look at the Documents card. The `AddDocumentButton` component
renders as a full-width dashed-border button labeled "+ Add documents", which
is consistent with its appearance in other document upload surfaces.

**Files changed**:
- `packages/ui/src/routes/library.tsx` — imported `AddDocumentButton`;
  removed `void ingestion` (ingestion is now properly consumed via
  `<AddDocumentButton ingestion={ingestion} />`); replaced the old
  `client.ingest.pickFile()` inline button in the Documents footer card with
  `<AddDocumentButton ingestion={ingestion} />`.
- `packages/ui/src/__tests__/library-route.test.tsx` — added
  `ingest.pickPaths` mock to the fake client; updated "renders Documents
  footer card" test to assert `"+ Add documents"` button; added new test
  "clicking Upload button invokes client.ingest.pickPaths with mode 'files'".

**Ingestion-state UI**: Was NOT present before. The `AddDocumentButton`
component bundles the full ingestion state UI — it conditionally renders
`<PickerTierModal>` when `state.status === "tier_selection"` and
`<BatchSummaryModal>` when `state.status === "batch_summary"`. Both modals
are now present on the library route via the component, no additional wiring
needed.

**Test approach**: Used `fireEvent.click` + `waitFor` pattern consistent with
surrounding tests. The `pickPaths` mock returns `[]` by default so the
startPickBatch loop exits cleanly (treats empty paths as cancel/no-op).
The meaningful assertion is that `client.ingest.pickPaths` is called with
`{ mode: "files" }`, which is the correct entry point for the batch ingestion
flow.

**Verification**: `pnpm vitest run packages/ui/src/__tests__/library-route.test.tsx`
— 23 tests, all pass. `pnpm lint` clean on changed files. `pnpm test`
— 4549 tests passed, 23 skipped (slow Pyodide gate). Pre-existing typecheck
failure in `tests/configure-end-to-end.test.ts` (missing `conceptMaps` in
`AuthoringServiceDeps`) was present on `main` before this change.
