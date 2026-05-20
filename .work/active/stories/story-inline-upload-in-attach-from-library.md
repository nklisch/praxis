---
id: story-inline-upload-in-attach-from-library
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

# Inline upload inside the "Attach from Library" picker — drop-zone overlay + "+ Upload" button

## Brief
Add inline file-upload capability to `LibraryDocumentPicker` (the modal
used by course-create's "Attach from Library" affordance). Two interaction
paths:

1. **Drop-zone** — drag files onto the picker list area; an overlay
   appears on dragover; on drop, files ingest via the existing
   `useIngestion` hook and auto-attach to the picker's scope.
2. **"+ Upload" header button** — click opens the OS file dialog; same
   ingest + auto-attach.

Includes a small extension to `useIngestion`: a `startBatchWithPaths(paths:
string[])` entry that lets drag-drop feed paths directly into the existing
batch pipeline (bypassing the OS dialog).

## Implementation

### Part A: `useIngestion` extension

**File**: `packages/ui/src/hooks/use-ingestion.ts`

Add a new public entry to the hook's result interface:

```ts
export interface UseIngestionResult {
  // ... existing fields ...
  startBatchWithPaths: (paths: string[]) => Promise<void>;
}
```

Implement `startBatchWithPaths` by factoring out the path-based batch
logic that `startPickBatch` runs AFTER the OS dialog returns. The new
entry takes paths directly. Both entries call into the same underlying
batch helper:

```ts
const _startBatch = useCallback(
  async (paths: string[]) => {
    if (paths.length === 0) return;
    // ... existing batch-start logic that's currently inside startPickBatch ...
  },
  [client, onDone, opts?.scope],
);

const startPickBatch = useCallback(
  async (mode: "files" | "folder") => {
    const paths = await client.ingest.pickPaths(mode);  // or whatever the existing call is
    await _startBatch(paths);
  },
  [_startBatch],
);

const startBatchWithPaths = _startBatch;  // direct export of the internal helper
```

The `opts.scope` round-trip continues to work for both entries (it's
captured in the closure used by `_startBatch`).

### Part B: `LibraryDocumentPicker` integration

**File**: `packages/ui/src/components/library-document-picker.tsx`

Add a `useIngestion` instance scoped to the picker:

```tsx
const ingestion = useIngestion(
  async () => {
    // onDone: refresh documents + attached set. The newly-ingested docs
    // are already attached server-side via opts.scope; refresh just
    // syncs the UI.
    await refresh();  // or whatever the existing data-reload trigger is
  },
  { scope },
);
```

Drag-and-drop state and handlers:

```tsx
const [isDraggingOver, setIsDraggingOver] = useState(false);

function handleDragOver(e: React.DragEvent) {
  e.preventDefault();
  if (e.dataTransfer.types.includes("Files")) {
    setIsDraggingOver(true);
  }
}

function handleDragLeave(e: React.DragEvent) {
  e.preventDefault();
  // Guard against false leaves on child elements:
  if (e.currentTarget === e.target) setIsDraggingOver(false);
}

async function handleDrop(e: React.DragEvent) {
  e.preventDefault();
  setIsDraggingOver(false);
  // Electron's File extension exposes .path on dropped files.
  const paths = Array.from(e.dataTransfer.files)
    .map((f) => (f as File & { path?: string }).path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (paths.length > 0) {
    await ingestion.startBatchWithPaths(paths);
  }
}

async function handleUploadClick() {
  await ingestion.startPickBatch("files");
}
```

JSX additions:

```tsx
<Modal onClose={onClose} ariaLabel="Attach document from library" maxWidth="520px">
  <header className={styles.header}>
    {/* existing title */}
    <button type="button" className={styles.uploadBtn} onClick={handleUploadClick}>
      + Upload
    </button>
  </header>

  <div
    className={styles.listArea}
    onDragOver={handleDragOver}
    onDragLeave={handleDragLeave}
    onDrop={handleDrop}
  >
    {/* existing document list */}
    {isDraggingOver && (
      <div className={styles.dropOverlay} role="presentation">
        <p>Drop files to upload</p>
      </div>
    )}
  </div>

  {/* Render whatever ingestion-state UI the rest of the app uses
      (tier-selection modal, batch summary). Find via:
      grep -l "ingestion.state" packages/ui/ */}
  <IngestionStateUI state={ingestion.state} ... />

  {/* existing close button etc. */}
</Modal>
```

### Part C: CSS

**File**: `packages/ui/src/components/library-document-picker.module.css`
(or wherever the picker's CSS module lives)

Add `.dropOverlay` styling — full-cover of the list area, dim backdrop,
centered "Drop files to upload" text. Match Modal backdrop conventions
for z-index (above list rows, below the Modal's close affordance).

Add `.uploadBtn` styling — header-action button matching adjacent button
primitives in the design system.

## Acceptance

- [ ] `useIngestion` exports `startBatchWithPaths(paths: string[])` that
      ingests the given paths through the same backend pipeline as
      `startPickBatch("files")`.
- [ ] `startBatchWithPaths([])` is a no-op.
- [ ] `startBatchWithPaths(paths)` respects `opts.scope` for auto-attach.
- [ ] LibraryDocumentPicker shows a "Drop files to upload" overlay when
      files are dragged over the picker list area.
- [ ] Dragging non-files (text, URLs) does NOT show the overlay.
- [ ] Dropping 1+ files starts a batch ingestion that auto-attaches to
      the picker's `scope`.
- [ ] After ingestion completes, the dropped docs appear in the picker
      list AND show as already-attached.
- [ ] Clicking the "+ Upload" header button opens the OS file dialog and
      runs the same batch + auto-attach flow.
- [ ] Tier-selection modal (when applicable) renders above the picker
      modal during ingestion. Both remain dismissable; closing the
      picker mid-ingestion does not cancel the in-flight batch.
- [ ] Picker still works for its primary purpose (browsing and
      attaching already-ingested documents) — no regression on the
      existing attach flow.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass.

## Tests

`packages/ui/src/hooks/__tests__/use-ingestion.test.ts` (or new):
- `startBatchWithPaths([])` returns without calling backend.
- `startBatchWithPaths(["/a.pdf", "/b.pdf"])` calls
  `client.ingest.start` (or equivalent) with those paths and respects
  `opts.scope`.

`packages/ui/src/components/__tests__/library-document-picker.test.tsx`
(or new):
- Drag-over with a `DataTransfer` containing `Files` → overlay appears.
- Drag-over with only text → overlay does NOT appear.
- Drop with file paths (use `Object.defineProperty` to set `.path` on
  the mock File objects) → `ingestion.startBatchWithPaths` is called.
- "+ Upload" button → `ingestion.startPickBatch("files")` is called.
- After `onDone` fires → picker `refresh` is called.

Use the `ui-test-helper` pattern (`makeFakeClient`) for the picker
tests.

## Patterns
- `modal-primitive` — `<Modal>` already used by the picker; reuse, don't
  reimplement backdrop / ESC / click-outside.
- `editorial-ui-primitives` — header-button styling for "+ Upload".
- `activity-rail-producer` — `useIngestion` already wires this; do not
  reimplement.
- `ui-test-helper` — `makeFakeClient`.

## Notes
- Electron's `File.path` is non-standard for browsers but works in the
  Electron renderer. Praxis is desktop-only, so safe for v1. If Electron
  upgrades and deprecates `File.path` (Electron 33+ already recommends
  `webUtils.getPathForFile(file)`), the swap is a one-line change here.
- The `onDragLeave` `e.currentTarget === e.target` guard prevents false
  leaves when crossing into child elements. Alternative is a
  drag-counter; the guard is simpler.

## Implementation Notes

### Hook extension (`useIngestion`)
Factored the batch loop body out of `startPickBatch` into a private `_startBatch(paths: string[])` `useCallback`. `startPickBatch` calls `client.ingest.pickPaths` then delegates to `_startBatch`. The new `startBatchWithPaths(paths)` is just `_startBatch` with ref resets and error handling — same shape as `startPickBatch` but no dialog step. The `opts.scope` closure is in `ingestOneWithResult` (the inner callback), so both entries naturally inherit it. `UseIngestionResult` interface updated with the new entry.

### Picker changes (`LibraryDocumentPicker`)
- Added `useIngestion` instance scoped to `scope`, with `onDone → refresh()` callback using `useCallback([refresh])`.
- Extracted `refresh` from `useResource` return (already existed as `refreshExternal`).
- Wrapped the document list in `<div className={styles.listArea}>` with `onDragOver/onDragLeave/onDrop` handlers.
- Added an empty-library drop zone (`<div className={styles.emptyDropZone}>`) for the case where the library has no docs yet.
- Added `+ Upload` button in a `<div className={styles.pickerHeader}>` wrapper alongside the existing title block.
- Ingestion state UI (tier modal + batch summary) rendered outside the `<Modal>` but inside the fragment, so they stack above the picker modal without being clipped.

### CSS additions
- `.pickerHeader`: flex row, space-between, aligns title block and upload button.
- `.uploadBtn`: matches `.attachBtn` styling — `color-accent` border, transparent background.
- `.listArea`: `position: relative; margin: 0 0 1rem` — wrapper for the drop overlay.
- `.emptyDropZone`: same but for empty-library state.
- `.dropOverlay`: `position: absolute; inset: 0` with dashed accent border, semi-transparent fill, centered "Drop files to upload" text. `pointer-events: none` so the underlying div still receives the `onDrop` event.
- `.list` bottom margin removed (now owned by `.listArea`).

### Ingestion-state UI reuse
Rendered `<PickerTierModal>` and `<BatchSummaryModal>` directly (not via `AddDocumentButton`) because `AddDocumentButton` bundles its own trigger button which doesn't fit inside the picker header. The modals are identical to what `AddDocumentButton` uses internally — same props pattern.

### Test approach
- `use-ingestion.test.tsx`: Added 4 tests in a new `startBatchWithPaths` describe block: empty-paths no-op, 2-file ingestion calls backend twice with correct paths, `opts.scope` round-trips, `onDone` fires per file.
- `library-document-picker.test.tsx`: Updated `makeClient` to include `ingest` stub (with `pickPaths` and `start` mocks). Added 7 tests in an `inline upload` describe block: renders `+ Upload` button, drag-over Files shows overlay, drag-over text-only doesn't, drop with `.path`-injected Files calls backend, drop with path-less Files is no-op, `+ Upload` click calls `pickPaths`, `onDone` triggers `listFn` refresh.
- **jsdom `File.path` workaround**: jsdom's `File` lacks Electron's `.path` extension. Used `Object.defineProperty(file, "path", { value: "/docs/a.txt" })` to inject it for positive tests; tested the path-less case separately to verify the filter guard works correctly.
- **Refresh timing**: `onDone` in `useIngestion` calls `onDone?.()` without awaiting (fire-and-forget). The "refresh after onDone" test uses `waitFor(..., { timeout: 3000 })` with `toBeGreaterThanOrEqual(2)` on `listFn.mock.calls.length` to tolerate the async gap.

### Verification
- `pnpm vitest run packages/ui/src/__tests__/use-ingestion.test.tsx`: 18 tests pass (14 pre-existing + 4 new)
- `pnpm vitest run packages/ui/src/__tests__/library-document-picker.test.tsx`: 19 tests pass (12 pre-existing + 7 new)
- `pnpm test`: 4579 passed | 23 skipped — no regressions
- `pnpm typecheck`: passes for all `@praxis/ui` packages (pre-existing error in `tests/configure-end-to-end.test.ts` unrelated to this story)
- `pnpm lint` (on modified files only): 0 errors, 5 style warnings (`noNonNullAssertion` for `parentElement!` in tests, consistent with project conventions)
