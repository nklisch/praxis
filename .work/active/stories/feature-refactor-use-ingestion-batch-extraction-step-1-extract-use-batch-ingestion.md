---
id: feature-refactor-use-ingestion-batch-extraction-step-1-extract-use-batch-ingestion
kind: story
stage: review
tags: [refactor, ui]
parent: feature-refactor-use-ingestion-batch-extraction
depends_on: []
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: Extract `useBatchIngestion` sub-hook

## What

Create `packages/ui/src/hooks/use-batch-ingestion.ts` containing all batch-specific
logic currently buried in `useIngestion`:
- The four batch refs: `tierDeferredRef`, `tierResultRef`, `cancelRequestedRef`,
  `batchCancelRef`
- The `_startBatch` loop (queue construction, tier-selection deferred, cancel race,
  result accumulation, `setState` calls for `tier_selection` / `ingesting` /
  `batch_summary`)
- `skipCurrentFile` (reads `tierDeferredRef`, writes `tierResultRef`, reads current
  `state` to produce the skip `BatchResult`)
- `cancelBatch` (sets `cancelRequestedRef`, unblocks `tierDeferredRef`, resolves
  `batchCancelRef`)

## Signature

```typescript
export interface UseBatchIngestionResult {
  /** Core batch driver — called by the facade's startPickBatch / startBatchWithPaths. */
  startBatch: (paths: string[]) => Promise<void>;
  skipCurrentFile: () => void;
  cancelBatch: () => void;
  /** Reset all batch refs before a new run starts (called by the facade). */
  resetRefs: () => void;
}

/**
 * Sub-hook that owns the batch queue loop, partial-result accumulation,
 * and per-file tier-selection / skip / cancel coordination.
 *
 * @param setState - stable `setState` from the parent `useIngestion` facade;
 *   the batch loop drives shared IngestionState transitions.
 * @param ingestOneWithResult - stable callback from `useIngestion`'s
 *   `useCallback`; used for non-PDF files and inside `confirmTier`.
 * @param getState - stable ref-getter returning the current `IngestionState`;
 *   used by `skipCurrentFile` to read the file metadata without a stale closure.
 */
export function useBatchIngestion(
  setState: React.Dispatch<React.SetStateAction<IngestionState>>,
  ingestOneWithResult: (file: PendingFile, preferIngestorId?: string) => Promise<BatchResult>,
  getState: () => IngestionState,
): UseBatchIngestionResult
```

## Design notes

### Callback pattern (mirrors `useStreamedBubbles`)
`setState` and `ingestOneWithResult` are accepted as stable function arguments
(not captured at module scope). This avoids stale-closure issues — the same pattern
used by `useStreamedBubbles(setItems, setThinking)`.

### `getState` for `skipCurrentFile`
`skipCurrentFile` needs to read the current `state` to build the skip `BatchResult`
(it reads `state.filePath` / `state.filename` when `state.status === "tier_selection"`).
The current implementation captures the React `state` variable via closure, which
causes a stale-closure warning in the `useCallback` deps array (and the existing
code captures it correctly via `[state]` dep). In the sub-hook, the facade passes
a `getStateRef.current`-based getter so the sub-hook never sees stale state.

The facade does:
```typescript
const stateRef = useRef(state);
useEffect(() => { stateRef.current = state; }, [state]);
// pass as: () => stateRef.current
```

### Ref reset discipline
The facade calls `resetRefs()` before each `startPickBatch` / `startBatchWithPaths`
call (currently inline in both entry points). `resetRefs` sets:
```typescript
cancelRequestedRef.current = false;
tierDeferredRef.current = null;
tierResultRef.current = null;
```

### No new types exported
`PendingFile`, `BatchResult`, `IngestionState` stay in `use-ingestion.ts` (the
facade is the public module). `use-batch-ingestion.ts` imports them from there.

## Files

- **New**: `packages/ui/src/hooks/use-batch-ingestion.ts`
- **Modified**: `packages/ui/src/hooks/use-ingestion.ts` — Step 2 (next story)
  will do the facade rewrite; this story only creates the new file.

## Current state

All batch logic lives inline in `useIngestion` (lines ~126–387 of the 404-line file):
four refs, `_startBatch`, `skipCurrentFile`, `cancelBatch`.

## Target state

`use-batch-ingestion.ts` exports `useBatchIngestion` + `UseBatchIngestionResult`.
`use-ingestion.ts` is unchanged in this step — the new file is a standalone addition.

## Acceptance

- `pnpm typecheck` passes (no new type errors)
- `pnpm lint` passes
- `pnpm test` passes (existing tests unchanged — facade not yet wired)
- New file compiles cleanly when imported from a test harness

## Risk

**Low.** Additive-only in this step. `use-ingestion.ts` is untouched; no consumer
is affected. Rollback: delete the new file.

## Implementation notes

- Created `packages/ui/src/hooks/use-batch-ingestion.ts` (222 lines).
- Extracted the four batch refs (`tierDeferredRef`, `tierResultRef`, `cancelRequestedRef`, `batchCancelRef`) into the sub-hook.
- `_startBatch` renamed to `startBatch`; `confirmTier`, `skipCurrentFile`, `cancelBatch`, and `resetRefs` all exported via `UseBatchIngestionResult`.
- `skipCurrentFile` uses `getState()` getter arg instead of a captured closure over `state` — avoids stale-closure issues when the facade passes `() => stateRef.current`.
- `mimeTypeFromPath` helper duplicated into the new file (Step 2 facade rewrite can deduplicate if desired).
- Types (`PendingFile`, `BatchResult`, `IngestionState`) imported from `./use-ingestion.js` as specified.
- `pnpm typecheck` passes clean; `pnpm --filter @praxis/ui test` passes (163 files / 1706 tests); new file is lint-clean (`biome check` reports no issues on the file itself).
