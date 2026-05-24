---
id: feature-streamline-document-attachment-ux
kind: feature
stage: done
tags: [ui, ux, ingestion]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Streamline document attachment UX

## Brief
The current document attachment surfaces force authors through too many clicks
to get sources into a course or session: the upload button accepts only one
file at a time, and the "Attach from Library" picker only lets you select
documents already ingested — to add a new source you must close the dialog,
navigate to the Library route, upload there, then come back and re-open the
picker. Both rough edges share the same picker / upload code path and the same
ingestion pipeline beneath it.

This feature consolidates the upload UX so a stack of sources can land in one
flow: (a) the upload button accepts multiple files in one selection and
processes them as a batch, and (b) the "Attach from Library" dialog exposes an
inline upload affordance so a brand-new document can be uploaded, ingested,
and selected without leaving the course-design surface. Feature-design will
decide whether the inline-upload affordance is a panel-within-modal, a
secondary tab, or a drop-zone overlay, and confirm the shared component
factoring across the two child stories.

## Design decisions
- **Inline upload affordance form**: Drop-zone overlay on the
  `LibraryDocumentPicker` list. The whole picker list area accepts file drops;
  a "Drop files to upload" overlay appears on dragover. A secondary "+ Upload"
  button in the picker header opens the system file picker for non-drag users.
  Native-feeling, avoids modal stacking, single visual primitive across drag
  and click paths.
- **Auto-attach on inline upload**: When the user uploads inline from the
  attach picker, pass `opts.scope` to `client.ingest.start` (already supported
  by `useIngestion`). On ingest completion the doc is already attached to the
  course/lesson scope — the picker just refreshes its "attached" state.
  Single intent, single result.
- **Multi-file behavior parity**: Both the library "Upload" button and the
  inline picker drop-zone accept multi-file selection and run the existing
  `startPickBatch` flow including the tier-selection modal. Activity-rail
  surfaces per-file ingest progress (`ActivityRegistry` is already wired into
  `useIngestion`). The tier-selection modal stacking above the picker modal
  on the inline path is accepted — brief and unavoidable for parity.

## Mockups
_Skipping production mocks for v1 — drop-zone overlay is a familiar
interaction pattern (file-drop with dim overlay + "Drop to upload" caption,
matching every modern app's pattern), and the library Upload button is a
trivial header-button addition. Implementer can model the overlay styling
on existing Modal backdrop + EmptyState typography._

## Architectural choice

**Both surfaces compose the existing `useIngestion` hook with the same
options.** The hook already implements multi-file batch (`startPickBatch`),
tier-selection state machine, activity-rail producer wiring, and
scope-based auto-attach (`opts.scope`). The two stories are pure UI
plumbing on top of that hook — no new ingestion path, no second IPC
channel, no parallel state machine.

One small extension is needed for drag-and-drop: a `startBatchWithPaths(paths:
string[])` entry that bypasses the system file dialog and feeds paths
directly into the existing batch pipeline. Electron's `File.path` extension
makes dropped browser-File objects resolvable to disk paths, so the
drag-drop path round-trips through the same backend code as the
dialog-picker path. The extension lives inside `useIngestion` so both
stories can use it if needed.

Rejected alternatives:
- *Real Blob/upload via new IPC channel* — would require a separate
  binary-blob channel and reimplementation of the ingestion pipeline. Not
  needed in the desktop-only context where the OS path is reachable.
- *Click-to-upload only (no real drag-drop)* — works mechanically but
  misses the design decision ("drop-zone overlay on the picker list").
  Real drag-drop is a small ~30 LoC extension.
- *Lift the upload affordance out of `LibraryDocumentPicker` into a
  shared `<UploadDropZone>` primitive* — premature abstraction with only
  two call sites. Two distinct call sites with the same hook is fine.

## Implementation Units

### Unit 1: Library route Upload button

**File**: `packages/ui/src/routes/library.tsx`
**Story**: `story-multi-document-upload`

The library route already instantiates `useIngestion` at line 43 but the
Upload button isn't wired (per the Explore: hook instantiated, button
missing). Acceptance:

- Add an "Upload" button to the library route header. Match the existing
  RouteHeader action pattern (look at adjacent routes for the button
  style and placement).
- Click handler:
  ```tsx
  async function handleUpload() {
    await ingestion.startPickBatch("files");
  }
  ```
- The library route already accepts the ingestion state UI (tier-selection
  modal, batch summary) — confirm those are rendered based on
  `ingestion.state`; if they're not, add them (look at
  `tab-body-isolation`-style consumers of the hook elsewhere for the
  pattern).
- Optional: also add a "Upload folder" affordance (`startPickBatch("folder")`)
  — only if a similar option already lives in the UI vocabulary. If
  unfamiliar, skip and ship files-only for v1.

**Implementation Notes**:
- Per-file activity-rail progress is already handled by `useIngestion`'s
  internal wiring — no additional `ActivityRegistry` calls needed in
  the route.
- The system file dialog accepts multi-file by default in `startPickBatch`
  — no `multiple={true}` HTML prop needed (we're not using an `<input
  type="file" multiple>`; we go through the Electron dialog).

**Acceptance Criteria**:
- [ ] An "Upload" button is visible in the library route header.
- [ ] Clicking it opens the OS file dialog with multi-select enabled.
- [ ] Selecting 1 file ingests that one file with per-file activity-rail
      progress.
- [ ] Selecting N files ingests each as a batch, with each file's
      progress surfaced via the activity rail.
- [ ] Tier-selection modal renders correctly during the batch.
- [ ] Cancelling the dialog is a no-op.
- [ ] No regression on existing library route surfaces (document list,
      attachment counts, etc.).

---

### Unit 2: Drop-zone overlay + "+ Upload" header button in LibraryDocumentPicker

**File**: `packages/ui/src/components/library-document-picker.tsx` (consumer)
**File**: `packages/ui/src/hooks/use-ingestion.ts` (one small extension —
`startBatchWithPaths`)
**Story**: `story-inline-upload-in-attach-from-library`

#### Hook extension

```ts
// In UseIngestionResult interface:
startBatchWithPaths: (paths: string[]) => Promise<void>;

// In the hook body — factor out the existing path-batch logic that
// startPickBatch calls AFTER the dialog returns paths. Expose it as
// startBatchWithPaths so drag-drop can call it directly.
const startBatchWithPaths = useCallback(
  async (paths: string[]) => {
    if (paths.length === 0) return;
    // ... existing batch start logic, parameterized on paths
  },
  [client, onDone, opts?.scope],
);
```

#### Picker integration

```tsx
// In LibraryDocumentPicker:
const ingestion = useIngestion(
  async () => {
    // onDone: refresh documents + attached set so newly-ingested
    // docs appear as attached (scope was passed to ingestion, so the
    // backend already attached them).
    await refresh();
  },
  { scope },
);

const [isDraggingOver, setIsDraggingOver] = useState(false);

function handleDragOver(e: React.DragEvent) {
  e.preventDefault();
  if (e.dataTransfer.types.includes("Files")) {
    setIsDraggingOver(true);
  }
}

function handleDragLeave(e: React.DragEvent) {
  e.preventDefault();
  // Only clear if leaving the picker root, not a child.
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

In JSX, the picker list area gets the drag handlers:

```tsx
<Modal onClose={onClose} ariaLabel="Attach document from library" maxWidth="520px">
  <header>
    {/* existing title */}
    <button type="button" onClick={handleUploadClick}>+ Upload</button>
  </header>

  <div
    className={styles.listArea}
    onDragOver={handleDragOver}
    onDragLeave={handleDragLeave}
    onDrop={handleDrop}
  >
    {/* existing document list */}
    {isDraggingOver && (
      <div className={styles.dropOverlay}>
        <p>Drop files to upload</p>
      </div>
    )}
  </div>

  {/* ingestion state modal rendering — tier selection, batch summary —
      stack above the picker. Acceptable per the feature's design
      decisions. */}
  <IngestionStateUI state={ingestion.state} ... />
</Modal>
```

The `IngestionStateUI` component (or whatever the codebase calls the
hook's UI surface — find via `grep "ingestion.state" packages/ui/`) is
already wired to render the tier modal and batch summary based on
`ingestion.state`. Reuse, don't reimplement.

**Implementation Notes**:
- Refresh the picker's documents list AND its `attached` set after
  `onDone`. The newly-ingested docs are already attached server-side (via
  `opts.scope`), so the refresh just makes the UI reflect server state.
  The picker already has a `refresh()` or equivalent via `useResource` —
  reuse it.
- Drop-overlay z-index must sit above the document list but below the
  Modal close button. Match the existing Modal backdrop conventions.
- `e.dataTransfer.types.includes("Files")` — guard against drags that
  aren't files (e.g., text drags). Don't show the overlay on those.
- Electron's `File.path` is non-standard for browsers but standard for
  the Electron renderer. Praxis is desktop-only via Electron, so this is
  safe.

**Acceptance Criteria**:
- [ ] Hovering files over the picker list shows a "Drop files to upload"
      overlay.
- [ ] Dropping 1+ files starts a batch ingestion using the picker's
      `scope` for auto-attach.
- [ ] After ingestion completes, the dropped docs appear in the picker
      list AND show as already-attached.
- [ ] The "+ Upload" header button opens the OS file dialog and runs the
      same batch ingestion + auto-attach flow.
- [ ] Tier-selection modal (when applicable) renders above the picker
      modal during ingestion — both remain dismissable.
- [ ] Dragging non-files (text, URLs) into the picker does NOT show the
      drop overlay.
- [ ] Picker still works for its primary purpose (browsing and attaching
      already-ingested documents) — no regression on the picker's
      existing flow.
- [ ] `useIngestion` exports a new `startBatchWithPaths(paths)` entry
      that round-trips through the same backend pipeline as
      `startPickBatch("files")`.

---

## Implementation Order

```
story-multi-document-upload                    (no deps)
story-inline-upload-in-attach-from-library     (no deps)
```

Both can land in parallel. Wave 1 of 2 agents.

The hook extension (`startBatchWithPaths`) lives inside
`story-inline-upload-in-attach-from-library`'s scope; if
`story-multi-document-upload` wants to add drag-drop later (not v1), it'd
pick up the extension for free.

## Testing

### Unit tests

`packages/ui/src/hooks/__tests__/use-ingestion.test.ts` (or new
sibling):
- `startBatchWithPaths([])` is a no-op.
- `startBatchWithPaths(["/path/a.pdf", "/path/b.pdf"])` calls the same
  backend code as `startPickBatch("files")` would for the same paths
  (use mocked client).
- The `opts.scope` round-trip applies to both entry points.

`packages/ui/src/components/__tests__/library-document-picker.test.tsx`
(or new):
- Drag-over with files shows the overlay; with text doesn't.
- Drop with files calls `ingestion.startBatchWithPaths(paths)`.
- "+ Upload" button calls `ingestion.startPickBatch("files")`.
- After ingestion completes (mocked), the picker refresh runs.

`packages/ui/src/routes/__tests__/library.test.tsx` (or new):
- "Upload" button calls `ingestion.startPickBatch("files")`.

Use the `ui-test-helper` pattern (`makeFakeClient`) for all UI tests.

### Manual smoke

1. Open the app. Library route → Upload → select 3 PDFs in the dialog →
   confirm all 3 appear in the library after ingest with activity-rail
   progress visible.
2. Course-create tab → Attach from Library → drag 2 PDFs onto the
   picker list → confirm overlay appears, files ingest, picker shows
   them attached.
3. Same flow but using "+ Upload" instead of drag.

## Risks

- **Electron `File.path` discontinuation.** The non-standard `File.path`
  could be removed in a future Electron release; Electron 33+ already
  recommends `webUtils.getPathForFile(file)`. If this lands on the
  current Electron version, fine. If Electron upgrades during v1's
  lifetime, the inline-upload story will need a one-line swap to
  `webUtils.getPathForFile`. Documented for the next-Electron-upgrade
  follow-up.
- **Drop targeting on nested elements.** `onDragLeave` fires when
  crossing into a child element, which would falsely clear the overlay.
  Mitigated by the `e.currentTarget === e.target` guard or by using a
  drag-counter pattern.
- **Tier-selection modal stacking.** When the user inline-uploads files
  that need tier selection, the tier modal opens above the picker
  modal. Two modals stacked is unusual but functional. Per the
  feature's design decisions, this is accepted for v1.

## Implementation summary (2026-05-19)

Both child stories landed and are at `stage: review`:
- `story-multi-document-upload` — Upload button wired in library route Documents footer card via `AddDocumentButton`; tier-selection and batch-summary modals bundled by the component (commit `c7638a1`)
- `story-inline-upload-in-attach-from-library` — `useIngestion` extended with `startBatchWithPaths(paths)`; `LibraryDocumentPicker` got drop-zone overlay + "+ Upload" header button + ingestion-state modals; CSS module updated (commit `3b315e9`)

Verification: 4579 tests pass, no regressions. The pre-existing typecheck error in `tests/configure-end-to-end.test.ts` (tracked separately) is unaffected.
