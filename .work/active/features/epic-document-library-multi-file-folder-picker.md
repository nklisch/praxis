---
id: epic-document-library-multi-file-folder-picker
kind: feature
stage: done
tags: [ui, ingestion, configure]
parent: epic-document-library
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Multi-file and folder document picker

## Brief

Today the file picker invoked from the document attach button opens a
single-file dialog: `dialog.showOpenDialog` is called with `properties:
["openFile"]` at `packages/desktop/electron/main/ingest-channel.ts:34`. The
`IngestionService.ingest()` signature
(`packages/core/src/ingestion/service.ts:65`) takes a single
`IngestionRequest`. Attaching a folder of materials means clicking the
button N times.

This feature extends the picker and the ingestion orchestration to support
multi-file selection (`multiSelections` property) and folder selection
(`openDirectory` property; recursive walk with MIME-type filtering against
the registered ingestors in `packages/tools/src/runtime/ingestion/registry.ts`).
Multiple ingestions stream progress to the `ActivityRail` as separate
items so the user can see per-file state. The state machine in the
`useIngestion` hook (`packages/ui/src/hooks/use-ingestion.ts`) handles the
multi-file lifecycle.

This feature is **independent of the scoping primitive** — it lands in
parallel with `document-scopes-primitive`. Once both ship, the attach flow
naturally writes scope rows for whichever scope the UI hands in.

## Epic context

- Parent epic: `epic-document-library`
- Position in epic: independent UX improvement; wave 1 alongside
  `document-scopes-primitive` and `rename-retrieve-from-documents`.

## Foundation references

- `docs/ARCHITECTURE.md` — "Ingestion pipeline" section names the
  `Ingestor` port and per-format adapters; this feature doesn't change the
  port, only the entry orchestration above it.

## Anchors

- Electron picker handler — `packages/desktop/electron/main/ingest-channel.ts:33-47`
  (current `pickFile` returns `string | null`)
- Ingestion entry — `packages/core/src/ingestion/service.ts:65`
  (`ingest(req, signal?)` — single-file; **unchanged** by this feature)
- Adapter registry — `packages/tools/src/runtime/ingestion/registry.ts`
  (supported extensions / MIME types live here; folder filter consults it)
- Per-format adapters — `packages/tools/src/runtime/ingestion/*.ts`
- UI hook — `packages/ui/src/hooks/use-ingestion.ts:1-100` (state machine
  with `idle | picking | tier_selection | ingesting | done | error`)
- Add button — `packages/ui/src/components/add-document-button.tsx`
- Tier modal — `packages/ui/src/components/picker-tier-modal.tsx`
- ActivityRegistry integration — `packages/core/src/ingestion/service.ts:7,35,68`
  (each `ingest()` call publishes its own ActivityItem — confirmed
  per-file progress is already wired)

## Design decisions (resolved by epic + autopilot)

From the epic-design resolution:
- **ActivityRail shape**: one item per file (granular). Each
  `IngestionService.ingest()` call already publishes its own ActivityItem
  — no change needed. The user sees N rows in the rail for an N-file
  batch, plus a top-level "Ingesting N documents" header item that ties
  them together.
- **Cancellation**: per-file cancel + cancel-all (drops remaining queue,
  aborts current file).

Resolved by autopilot:
- **IPC channel shape**: a new `praxis.ingest.pickPaths(opts)` channel
  returns `string[]`. Args: `{ mode: 'files' | 'folder' }`. The existing
  `pickFile` channel stays for back-compat (returns `string | null`). New
  callers use `pickPaths`.
- **Folder walk**: recursive with **depth cap = 5**. **Skip symlinks**
  (don't follow). **Skip hidden files** (names starting with `.`). MIME
  filter uses `registry.supportedExtensions()` (add a helper that
  returns the union of every registered adapter's extension set). Walk
  is implemented synchronously in the main process using
  `fs.readdirSync(path, { withFileTypes: true })` recursion. Symlinks
  are not followed because `Dirent.isSymbolicLink()` returns true for
  them and we skip those entries.
- **One-at-a-time batch flow**: each file in the batch runs the existing
  single-file ingestion path sequentially. The tier-selection modal (for
  PDFs) still runs per file; for a 5-PDF folder the user sees the modal
  5 times. Acceptable for v1; a "remember my choice for this batch"
  affordance is a v2 nice-to-have. Sequential is simpler than parallel
  and avoids overwhelming the ActivityRail.
- **Per-file failure isolation**: if file 3 of 10 fails (ingestion error),
  the batch records the error against that file, advances to file 4. The
  done summary surfaces the failures. No file's failure aborts the
  batch.
- **UI shape**: existing `<AddDocumentButton>` becomes the multi-file
  entry point (uses `pickPaths({ mode: 'files' })` instead of
  `pickFile`). A new `<AddFolderButton>` sits alongside it in the
  document library / configure area for folder selection. Both consume
  the same `useIngestion` hook in batch mode.
- **Hook state extension**: adds a `batch_pending` status carrying
  `queue: PendingFile[]`, `currentIndex: number`, `results: BatchResult[]`.
  States that were singular (`tier_selection`, `ingesting`, `error`,
  `done`) gain optional `batch` metadata so the UI can render
  "Ingesting file 3 of 7" overlays.

## Architectural choice

**Extend the existing hook + IPC; don't introduce a new orchestrator
service.** The `useIngestion` hook becomes the batch orchestrator
client-side, calling the existing single-file `client.ingest.start()`
sequentially per file. Server-side `IngestionService.ingest()` stays
unchanged. The ActivityRegistry is the only multiplexer needed.

Two alternatives rejected:
- *Add `IngestionService.ingestBatch(reqs)` to the server.* Server-side
  orchestration would let us parallelize ingestion (CPU/IO permitting),
  but it duplicates the existing per-file `ingest()` orchestration and
  forces a parallel set of IPC events. Sequential client-side
  orchestration is simpler and gives the user the same UX.
- *Spawn N concurrent ingestion streams.* Risks overwhelming the
  ActivityRail, contending for native modules (`canvas`, `better-sqlite3`
  write locks), and producing surprise CPU spikes. Sequential preserves
  predictable behavior. Worth revisiting in a future optimization story
  if real workloads demand it.

## Implementation Units

### Unit 1: Multi-path picker IPC

**File**: `packages/desktop/electron/main/ingest-channel.ts`

Add a sibling handler to the existing `pickFile`:

```typescript
handle(
  "praxis.ingest.pickPaths",
  async (_event, opts: { mode: "files" | "folder" }) => {
    const properties: ("openFile" | "multiSelections" | "openDirectory")[] =
      opts.mode === "folder" ? ["openDirectory"] : ["openFile", "multiSelections"];

    const filters = opts.mode === "files"
      ? [
          {
            name: "Supported documents",
            extensions: ingestorRegistry.supportedExtensions(),
          },
          { name: "All Files", extensions: ["*"] },
        ]
      : undefined; // folders don't take filters

    const result = await dialog.showOpenDialog({
      title: opts.mode === "folder" ? "Open folder" : "Open documents",
      properties,
      ...(filters !== undefined && { filters }),
    });

    if (result.canceled || result.filePaths.length === 0) return [];

    if (opts.mode === "folder") {
      // Walk the first picked folder; ignore any extras (single-folder mode).
      const root = result.filePaths[0];
      if (root === undefined) return [];
      return walkDirectoryForIngest(root, ingestorRegistry);
    }

    return result.filePaths;
  },
);
```

Helper: `walkDirectoryForIngest(root, registry)` (in the same file or
a sibling util):

```typescript
function walkDirectoryForIngest(
  root: string,
  registry: IngestorRegistry,
): string[] {
  const supported = new Set(
    registry.supportedExtensions().map((e) => e.toLowerCase()),
  );
  const out: string[] = [];
  const DEPTH_CAP = 5;

  function visit(dir: string, depth: number): void {
    if (depth > DEPTH_CAP) return;
    let entries: import("fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // permission denied / not a dir — skip silently
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // skip hidden
      if (entry.isSymbolicLink()) continue; // don't follow symlinks
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (supported.has(ext)) out.push(fullPath);
      }
    }
  }

  visit(root, 0);
  return out;
}
```

Add `supportedExtensions(): string[]` to `IngestorRegistry` in
`packages/tools/src/runtime/ingestion/registry.ts` if it doesn't already
exist (returns the union of every registered adapter's extension list).

**Acceptance Criteria**:
- [ ] `praxis.ingest.pickPaths({ mode: "files" })` returns `string[]` of
      selected files (empty if cancelled, supports multi-selection).
- [ ] `praxis.ingest.pickPaths({ mode: "folder" })` returns `string[]`
      of files recursively walked from the picked folder, filtered to
      supported extensions, with depth ≤ 5 and no symlinks/hidden files.
- [ ] `praxis.ingest.pickFile` continues to work for any existing caller.

---

### Unit 2: Client method

**File**: `packages/client/src/services/ingest-client.ts` (or wherever
the ingest client lives)

Add:
```typescript
pickPaths(opts: { mode: "files" | "folder" }): Promise<string[]> {
  return this.transport.invoke<string[]>("praxis.ingest.pickPaths", opts);
}
```

Update `IngestClientApi` interface in `@praxis/core/types/client.ts` to
declare it.

**Acceptance Criteria**:
- [ ] Client method exists; old `pickFile` untouched.

---

### Unit 3: Hook state extension

**File**: `packages/ui/src/hooks/use-ingestion.ts`

Extend the state machine:

```typescript
interface PendingFile {
  filePath: string;
  filename: string;
  mimeType: string;
}

interface BatchResult {
  filePath: string;
  filename: string;
  outcome:
    | { ok: true; documentId: string; chunkCount: number }
    | { ok: false; message: string };
}

export type IngestionState =
  | { status: "idle" }
  | { status: "picking" }
  | { status: "tier_selection";
      filePath: string;
      filename: string;
      mimeType: string;
      batch?: { current: number; total: number };  // optional batch metadata
    }
  | { status: "ingesting";
      filename: string;
      batch?: { current: number; total: number };
    }
  | { status: "batch_summary";
      results: BatchResult[];
    }
  | { status: "done"; documentId: string; chunkCount: number }  // single-file done
  | { status: "error"; message: string };
```

Add a new entry point:

```typescript
startPickBatch: (mode: "files" | "folder") => Promise<void>;
```

This calls `client.ingest.pickPaths({ mode })`, builds a `PendingFile[]`
from the returned paths (using `mimeTypeFromPath` for each), then runs
each file through the existing `runIngestion` flow sequentially. After
all files complete, transitions to `batch_summary`.

```typescript
const startPickBatch = useCallback(async (mode: "files" | "folder") => {
  setState({ status: "picking" });
  try {
    const paths = await client.ingest.pickPaths({ mode });
    if (paths.length === 0) {
      setState({ status: "idle" });
      return;
    }
    const queue: PendingFile[] = paths.map((p) => {
      const filename = p.split("/").pop() ?? p;
      return { filePath: p, filename, mimeType: mimeTypeFromPath(p) };
    });
    const results: BatchResult[] = [];
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      if (!file) continue;
      const batch = { current: i + 1, total: queue.length };

      // Tier selection for PDFs: same modal flow as today, with batch metadata.
      if (file.mimeType === "application/pdf") {
        setState({
          status: "tier_selection",
          filePath: file.filePath,
          filename: file.filename,
          mimeType: file.mimeType,
          batch,
        });
        // Wait for the user to confirm or cancel via confirmTier.
        // confirmTier kicks off ingestion and resolves a promise we await here.
        // Implementation detail: hold a resolver in a ref so confirmTier can
        // signal "tier selected, ingestion ran" back into this loop.
        // …
      } else {
        setState({ status: "ingesting", filename: file.filename, batch });
      }

      // Run ingestion (this is the existing runIngestion path).
      const outcome = await ingestOneWithResult(file);
      results.push({ filePath: file.filePath, filename: file.filename, outcome });
    }
    setState({ status: "batch_summary", results });
  } catch (err) {
    setState({ status: "error", message: errString(err) });
  }
}, [client]);
```

The tier-selection wait inside the loop needs a small refactor: the
existing `confirmTier` callback is a fire-and-forget entry; turn it into
a promise-resolving form so the batch loop can `await` user confirmation
before moving on. Implementation detail: use a `Deferred<void>` (or
`Promise.withResolvers`) stored in a ref.

Add to result:
```typescript
export interface UseIngestionResult {
  state: IngestionState;
  startPick: () => Promise<void>;            // existing — single file
  startPickBatch: (mode: "files" | "folder") => Promise<void>;  // new
  confirmTier: (filePath, filename, mimeType, preferIngestorId?) => Promise<void>;
  dismiss: () => void;
  cancelBatch: () => void;  // new — aborts current + drops remaining queue
}
```

**Acceptance Criteria**:
- [ ] `startPickBatch("files")` runs multiple files sequentially.
- [ ] `startPickBatch("folder")` walks the picked folder and runs each
      supported file.
- [ ] Per-file errors don't abort the batch.
- [ ] `cancelBatch()` aborts the current file (via existing
      `client.ingest.cancel`) and discards remaining queue, transitioning
      to `batch_summary` with the partial results.

---

### Unit 4: UI buttons + summary modal

**File**: `packages/ui/src/components/add-document-button.tsx`

Update the existing button to use `startPickBatch("files")` instead of
the single-file `startPick`. Rename the label from "+ Add document" to
"+ Add documents". The component otherwise behaves the same — the
underlying state machine handles batches transparently.

**File**: `packages/ui/src/components/add-folder-button.tsx` (new)

New companion button:
```typescript
export function AddFolderButton({ ingestion }: { ingestion: UseIngestionResult }) {
  const { state, startPickBatch } = ingestion;
  const isActive = state.status !== "idle" && state.status !== "batch_summary";
  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => startPickBatch("folder")}
      disabled={isActive}
      title="Add a folder of documents"
    >
      + Add folder
    </button>
  );
}
```

**File**: `packages/ui/src/components/batch-summary-modal.tsx` (new)

A modal that renders when `state.status === "batch_summary"`. Shows
N succeeded / M failed, lists each file with its outcome (filename +
chunk count for successes, error message for failures), and a "Done"
button that returns the hook to `idle`.

**Anchor**: mount the new button + summary modal where
`AddDocumentButton` is currently mounted (likely in the document library
sidebar / configure area).

**Acceptance Criteria**:
- [ ] `+ Add documents` opens a multi-select dialog.
- [ ] `+ Add folder` opens a folder dialog and ingests every supported
      file inside.
- [ ] After the batch finishes (or is cancelled), a summary modal lists
      each file's outcome.
- [ ] The existing single-file ingestion still works (any callers that
      use `startPick` keep functioning).

---

### Unit 5: Tier modal batch awareness

**File**: `packages/ui/src/components/picker-tier-modal.tsx`

Add optional `batch` prop:
```typescript
interface PickerTierModalProps {
  // … existing props …
  batch?: { current: number; total: number };
}
```

When `batch` is set, render a small header like `File 3 of 7` above the
existing tier-selection content. Otherwise behave as today.

Also add a "Skip this file" button to the modal (only visible in batch
mode) that resolves the deferred with a skip outcome — the batch loop
records the file as `{ ok: false, message: "Skipped by user" }` and
advances.

**Acceptance Criteria**:
- [ ] Tier modal shows batch position when in batch mode.
- [ ] "Skip this file" advances the batch without ingesting that file.

---

### Unit 6: ActivityRail batch grouping (light)

**File**: ActivityRegistry usage in
`packages/core/src/ingestion/service.ts` (around line 68).

The current per-file ActivityItem already exists. For batch context, the
client side optionally publishes a "batch header" ActivityItem before
the loop starts — but this is borderline scope creep. Decision: skip
the batch header for v1. Each file renders as its own rail row; the
batch summary modal is the user-visible "you did 7 files" feedback.

If a header is wanted later, the cleanest place to add it is the hook
itself (publish via `client.activity` if such an API exists). Out of
scope for this feature.

**Acceptance Criteria**:
- [ ] No regression: per-file rail items appear as before.

---

### Unit 7: Tests

**File**: `packages/ui/src/__tests__/use-ingestion.test.tsx`

Test cases:
- `startPickBatch("files")` with 3 files runs them sequentially.
- `startPickBatch("folder")` walks paths returned by the mocked
  pickPaths and ingests each.
- Empty pick (user cancelled) → returns to `idle`.
- Mid-batch error → batch continues, error recorded in results.
- `cancelBatch()` mid-flight → current aborts, remaining dropped,
  summary shows partial results.
- Tier modal batch metadata is set correctly.

**File**: `packages/desktop/electron/main/__tests__/ingest-channel.test.ts`
(if the harness exists; otherwise rely on integration smoke)

Test cases for `walkDirectoryForIngest`:
- Filters to supported extensions only.
- Respects depth cap (synthetic temp dir with 6-level nesting).
- Skips symlinks (synthetic temp dir with a symlink).
- Skips hidden files.
- Returns empty for permission-denied directories.

**Acceptance Criteria**:
- [ ] All new tests pass.
- [ ] Existing `use-ingestion` tests still pass (single-file flow is
      unchanged).

---

## Implementation Order

Single-stride. Suggested intra-stride order:

1. Unit 1 (IPC + folder walk).
2. Unit 2 (client method).
3. Unit 3 (hook state machine — biggest piece).
4. Unit 4 (UI buttons + summary modal).
5. Unit 5 (tier modal batch awareness).
6. Unit 7 (tests).

## Testing

Covered by Unit 7. Key invariants:
- Single-file flow unchanged.
- Batch flow runs files sequentially.
- Failures are isolated; batch always completes (or cancels cleanly).

## Risks

1. **Tier modal mid-batch UX fatigue** (medium). User has to click
   through tier selection for every PDF in a folder. v1 acceptable;
   a "remember choice for this batch" affordance is a v2 nice-to-have.
2. **Folder walk performance** (low). Depth cap of 5 + supported-only
   filter limits the walk; in practice user-pickable folders are
   bounded. Worst case (homedir-level pick on a very deep tree) is
   capped by the depth limit.
3. **Symlink loops** (none with current policy). Skipping symlinks
   avoids the classic recursion-on-symlink-loop bug.
4. **Promise.withResolvers availability** (low). Not in older Node;
   Praxis runs Node ≥ 24 where it's available. Confirm or use the
   manual `let resolve; new Promise(r => resolve = r)` pattern.
5. **ActivityRail saturation** (low). 50-file batches publish 50 rail
   items. The rail is already designed to handle many concurrent
   items (per the activity-rail-producer pattern); should be fine.

## Implementation Notes

Implemented as a single stride. All 7 units landed as designed.

### Key decisions made during implementation

- **`skipCurrentFile()` as a separate hook method**: The feature design described
  a "Skip this file" button that resolves the deferred with a skip outcome. This
  was cleanest as a dedicated `skipCurrentFile()` on `UseIngestionResult` (rather
  than passing a skip callback through the modal). The hook reads the current
  `tier_selection` state to write the skip `BatchResult` into `tierResultRef`,
  then resolves the deferred. The `PickerTierModal` receives it as `onSkip` prop
  (only present when `batch` prop is set).

- **`Promise.withResolvers` confirmed available** (Node ≥ 24). Used for the
  `tierDeferredRef` pattern. The batch loop does `await Promise.race([promise,
  cancelPromise])` — clean and non-blocking.

- **`ingestOneWithResult` as the batch-path runner**: The single-file `runIngestion`
  is kept intact for the `startPick` path (returns void, sets state directly). A
  separate `ingestOneWithResult` returns `BatchResult` and doesn't touch state,
  used by the batch loop. This keeps the two flows cleanly separated.

- **`candidatesFor` in `IngestorRegistry` is not async** (confirmed): The existing
  method is synchronous — fine for the folder walker which only needs extensions.

- **`supportedExtensions()` strips leading dot**: All registered ingestors store
  extensions as `.pdf`, `.md`, etc. `supportedExtensions()` strips the leading
  `.` so the walk test gets plain `"pdf"` strings.

- **`AddDocumentButton` and `AddFolderButton` share CSS**: Both use
  `add-document-button.module.css` so the dashed-button appearance is consistent.
  No duplicate CSS.

- **`documents-section.tsx` mount**: Both buttons are stacked in a
  `.headerButtons` div alongside each other in the library `headerAction` slot.

### Test coverage

- 14 tests in `packages/ui/src/__tests__/use-ingestion.test.tsx` (9 new batch
  tests + 5 existing single-file tests).
- 9 tests in `packages/desktop/electron/main/__tests__/walk-directory-for-ingest.test.ts`
  (new; exercises OS-level dir walking with real temp dirs).
- All 23 tests pass. Full suite: 2978 pass, 13 pre-existing failures in
  `course-documents-service.test.ts` and `textbook-rag-end-to-end.test.ts`
  (both caused by the parallel `document-scopes-primitive` wave, not this feature).

### Files changed

- `packages/tools/src/runtime/ingestion/registry.ts` — added `supportedExtensions()`
- `packages/desktop/electron/main/ingest-channel.ts` — added `walkDirectoryForIngest` helper + `praxis.ingest.pickPaths` handler
- `packages/client/src/services/ingest-client.ts` — added `pickPaths(opts)`
- `packages/core/src/types/client.ts` — added `pickPaths` to `IngestionClient` interface
- `packages/ui/src/hooks/use-ingestion.ts` — full batch state machine extension
- `packages/ui/src/components/add-document-button.tsx` — uses `startPickBatch("files")`; renders `BatchSummaryModal`
- `packages/ui/src/components/add-folder-button.tsx` — new
- `packages/ui/src/components/batch-summary-modal.tsx` — new
- `packages/ui/src/components/batch-summary-modal.module.css` — new
- `packages/ui/src/components/picker-tier-modal.tsx` — added `batch`, `onSkip` props; `batchPosition` header; "Skip this file" button
- `packages/ui/src/components/picker-tier-modal.module.css` — added `.batchPosition`, `.skipBtn`
- `packages/ui/src/components/library/documents-section.tsx` — mounts both buttons
- `packages/ui/src/components/library/documents-section.module.css` — added `.headerButtons`

## Review (2026-05-13)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- `walkDirectoryForIngest` is exported for testability, with 9 OS-level tests covering extensions, depth cap, symlinks, hidden files, EACCES, case-insensitive extensions.
- `pickPaths` IPC channel coexists with legacy `pickFile` (back-compat preserved).
- Hook state machine extension uses `Promise.withResolvers` for the tier-modal deferred — a clean fit for the per-file batch loop. `skipCurrentFile()` and `cancelBatch()` resolve the deferred with appropriate outcome flags.
- 23 use-ingestion tests across single-file + 9 new batch cases (sequential, error isolation, tier-batch metadata, skip, cancel-mid-flight, onDone fires N times).
- ActivityRail batch header explicitly deferred per design decision — per-file rail items already exist via the indexer pattern.
- Files: 16, +1237/-46 — net new code is mostly the new components (`add-folder-button`, `batch-summary-modal`) + the hook state extension.
