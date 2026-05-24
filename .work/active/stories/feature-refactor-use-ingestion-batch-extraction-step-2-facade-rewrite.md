---
id: feature-refactor-use-ingestion-batch-extraction-step-2-facade-rewrite
kind: story
stage: implementing
tags: [refactor, ui]
parent: feature-refactor-use-ingestion-batch-extraction
depends_on: [feature-refactor-use-ingestion-batch-extraction-step-1-extract-use-batch-ingestion]
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Rewrite `useIngestion` as a thin facade

## What

Replace the monolithic body of `useIngestion` with a facade that:
1. Owns shared `state` / `setState` and `stateRef` (getter for sub-hook)
2. Defines `ingestOneWithResult` (unchanged logic, same `useCallback` deps)
3. Calls `useBatchIngestion(setState, ingestOneWithResult, () => stateRef.current)`
4. Implements `confirmTier` (reads `tierDeferredRef` — now via `batch.resetRefs`
   exposure, see notes below)
5. Implements `startPickBatch`, `startBatchWithPaths`, `dismiss` as thin wrappers
   calling `batch.resetRefs()` + `batch.startBatch(...)`

After this step `use-ingestion.ts` shrinks from ~370 lines of logic to ~120 lines.
All types and the public `UseIngestionResult` interface remain in `use-ingestion.ts`
(it stays the public entry point for consumers).

## Design notes

### `confirmTier` and `tierDeferredRef` ownership
`confirmTier` needs to read and write `tierDeferredRef` (the deferred created inside
`_startBatch` / `startBatch`). The ref lives in `useBatchIngestion`. Two options:

**Option A (chosen)**: Expose `confirmTier` directly from `useBatchIngestion`.
`UseBatchIngestionResult` adds:
```typescript
confirmTier: (
  filePath: string,
  filename: string,
  mimeType: string,
  preferIngestorId?: string,
) => Promise<void>;
```
The sub-hook's `confirmTier` already has `ingestOneWithResult` in scope (passed as
arg), so this is a natural fit. The facade just re-exports `batch.confirmTier`.

This means Step 1 must include `confirmTier` in `UseBatchIngestionResult` — update
Step 1's implementation to include it (it's a minor addition to that story).

### `stateRef` plumbing
```typescript
const [state, setState] = useState<IngestionState>({ status: "idle" });
const stateRef = useRef<IngestionState>(state);
useEffect(() => { stateRef.current = state; }, [state]);

const batch = useBatchIngestion(setState, ingestOneWithResult, () => stateRef.current);
```

### `startPickBatch` facade
```typescript
const startPickBatch = useCallback(async (mode: "files" | "folder") => {
  batch.resetRefs();
  setState({ status: "picking" });
  try {
    const paths = await client.ingest.pickPaths({ mode });
    if (paths.length === 0) { setState({ status: "idle" }); return; }
    await batch.startBatch(paths);
  } catch (err) {
    setState({ status: "error", message: errString(err) });
  }
}, [client, batch]);
```

### `startBatchWithPaths` facade
```typescript
const startBatchWithPaths = useCallback(async (paths: string[]) => {
  if (paths.length === 0) return;
  batch.resetRefs();
  try {
    await batch.startBatch(paths);
  } catch (err) {
    setState({ status: "error", message: errString(err) });
  }
}, [batch]);
```

### Picker-close fix preserved
The `006be45` fix hoisted `useIngestion` to parent components
(`CourseDetailRoute`, `CourseCreateTabBody`). That change is in the call-sites —
this refactor doesn't touch call-sites. The public API (`UseIngestionResult`)
is unchanged, so all parents keep working.

### `tab-body-isolation` preserved
`useIngestion` is called once per parent component (already hoisted). This refactor
changes none of that — the hook still lives in the parent, inactive tabs keep their
state alive via `display:none`.

### Types stay in `use-ingestion.ts`
`PendingFile`, `BatchResult`, `IngestionState`, `UseIngestionResult` remain here.
`use-batch-ingestion.ts` imports from `./use-ingestion.js`.

## Files

- **Modified**: `packages/ui/src/hooks/use-ingestion.ts` — facade rewrite (~240
  lines removed, ~15 lines of delegation added, net ~-225 lines)
- **No new files** in this step

## Current state

`useIngestion` is a 404-line monolith combining `ingestOneWithResult`, all four
batch refs, `_startBatch`, `confirmTier`, `skipCurrentFile`, `cancelBatch`,
`startPickBatch`, `startBatchWithPaths`, `dismiss`.

## Target state

`useIngestion` is ~120–140 lines:
- Type definitions (unchanged)
- `mimeTypeFromPath` / `errString` helpers (unchanged)
- `state` / `stateRef` setup
- `ingestOneWithResult` (unchanged logic)
- `const batch = useBatchIngestion(...)` (3-line delegation)
- `confirmTier` re-exported from `batch`
- `startPickBatch` / `startBatchWithPaths` as thin wrappers (~15 lines each)
- `dismiss` (unchanged)
- Return object (unchanged)

## Acceptance

- All existing `useIngestion` tests pass byte-identical (no test changes)
- `pnpm typecheck && pnpm lint && pnpm test` green
- `use-ingestion.ts` is ≤150 lines (excluding type block + helpers)
- Public `UseIngestionResult` interface unchanged (verified by type test or grep)
- Picker-close fix tests in `library-document-picker.test.tsx` still pass

## Risk

**Low–Medium.** Batch logic is moved, not rewritten. The main risk is ref timing
(stale `stateRef` in `skipCurrentFile`) — mitigated by the `useEffect` mirror and
confirmed by the existing `skipCurrentFile` test.

**Rollback**: revert `use-ingestion.ts` to the pre-step-2 snapshot; delete
`use-batch-ingestion.ts`.
