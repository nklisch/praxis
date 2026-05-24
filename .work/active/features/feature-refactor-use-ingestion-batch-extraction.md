---
id: feature-refactor-use-ingestion-batch-extraction
kind: feature
stage: review
tags: [refactor, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Extract batch-loop logic from `useIngestion` into `useBatchIngestion`

## Brief
`packages/ui/src/hooks/use-ingestion.ts` (~404 lines after this session's
dead-code removal + comment fixes + picker-close bug fix) combines two
distinct flows:
- (a) Single-file ingestion with optional tier-selection modal (~lines 110–327:
  state machine + `tierDeferred`/`tierResult` refs)
- (b) Batch orchestration with parallel tier-confirmation + per-file cancellation
  (~lines 229–307: queue loop + partial results)

Both are callable as independent exports (`startPickBatch`, `startBatchWithPaths`,
`skipCurrentFile`, `cancelBatch`).

## Refactor target
Extract batch-loop logic into a separate `useBatchIngestion()` hook owning:
- `_startBatch` driver
- Batch state transitions
- Partial-result accumulation
- `skipCurrentFile` / `cancelBatch`

`useIngestion` becomes a facade wrapper layering single-file + batch modes on
top of a shared `ingestOneWithResult` callback. Mirrors the just-shipped
`use-streamed-send` decomposition pattern.

## Constraints
- Public `useIngestion` API unchanged (every consumer keeps working)
- Streaming behavior preserved
- The picker-close fix shipped this session (`useIngestion` lifted to parent
  components) must keep working
- `tab-body-isolation` semantics (dormant tabs keep hook running) preserved

## Discovery evidence
- File length: 404 lines (verified, after this session's cleanups)
- Two distinct flows bundled in one hook
- Smaller impact than the just-shipped 5 god-files — borderline candidate
- Discovered by autopilot refactor cadence; flagged as **lower priority**

## Refactor Overview

Split `packages/ui/src/hooks/use-ingestion.ts` (~404 lines) into:

- **`use-batch-ingestion.ts`** — new sub-hook owning the batch queue loop, four
  batch refs, partial-result accumulation, `confirmTier`, `skipCurrentFile`,
  `cancelBatch`. Accepts `setState`, `ingestOneWithResult`, and a `getState`
  getter as stable callbacks (mirrors the `useStreamedBubbles(setItems, setThinking)`
  pattern from the `use-streamed-send` decomposition).
- **`use-ingestion.ts`** — rewritten as a thin facade: owns `state`/`stateRef`,
  `ingestOneWithResult`, delegates batch coordination to `useBatchIngestion`, and
  re-exports `confirmTier`/`skipCurrentFile`/`cancelBatch` from the sub-hook.

Public `UseIngestionResult` API unchanged. All consumers (`chat.tsx`,
`course-detail.tsx`, `course-create.tsx`, `library.tsx`,
`library-document-picker.tsx`, `add-document-button.tsx`,
`add-folder-button.tsx`) keep working without modification.

### Key design decisions

1. **`confirmTier` lives in `useBatchIngestion`** — it needs `tierDeferredRef`
   (owned by the sub-hook) and `ingestOneWithResult` (passed as an arg), so it's
   a natural fit there rather than in the facade.

2. **`getState` getter for `skipCurrentFile`** — `skipCurrentFile` reads
   `state.filePath`/`state.filename` when `state.status === "tier_selection"`.
   Passing `() => stateRef.current` (a `useEffect`-mirrored ref from the facade)
   avoids stale-closure capture inside the sub-hook without introducing a dep on
   the React state object.

3. **`resetRefs()` exposed** — the facade calls this before each
   `startPickBatch`/`startBatchWithPaths` run (currently inline; centralised into
   the sub-hook's return value).

4. **Types stay in `use-ingestion.ts`** — `PendingFile`, `BatchResult`,
   `IngestionState`, `UseIngestionResult` remain in the facade module;
   `use-batch-ingestion.ts` imports from `./use-ingestion.js`.

## Refactor Steps

### Step 1 — Extract `useBatchIngestion`
**Priority**: High | **Risk**: Low (additive only)

**Story**: `feature-refactor-use-ingestion-batch-extraction-step-1-extract-use-batch-ingestion`

Create `packages/ui/src/hooks/use-batch-ingestion.ts`. Move:
- `tierDeferredRef`, `tierResultRef`, `cancelRequestedRef`, `batchCancelRef`
- `_startBatch` → renamed `startBatch`
- `confirmTier`
- `skipCurrentFile` (uses `getState` getter arg instead of captured `state`)
- `cancelBatch`
- `resetRefs()` (replaces inline ref resets in `startPickBatch`/`startBatchWithPaths`)

Exports: `UseBatchIngestionResult` interface + `useBatchIngestion` function.
`use-ingestion.ts` is untouched in this step.

Acceptance: `pnpm typecheck && pnpm lint && pnpm test` pass; new file compiles
cleanly.

### Step 2 — Rewrite `useIngestion` facade
**Priority**: High | **Risk**: Low–Medium (logic moved, not rewritten)

**Story**: `feature-refactor-use-ingestion-batch-extraction-step-2-facade-rewrite`

Rewrite `use-ingestion.ts` body:
- Keep: type definitions, `mimeTypeFromPath`, `errString`, `ingestOneWithResult`,
  `startPickBatch`, `startBatchWithPaths`, `dismiss`, return object
- Add: `stateRef` mirror, `const batch = useBatchIngestion(setState, ingestOneWithResult, () => stateRef.current)`
- Replace: inline batch refs/logic with delegation to `batch.*`
- Re-export: `confirmTier`, `skipCurrentFile`, `cancelBatch` from `batch`

Target: `use-ingestion.ts` shrinks to ≤150 lines of logic (excluding type block +
helpers). All existing tests pass without modification.

Acceptance: all `use-ingestion.test.tsx` and `library-document-picker.test.tsx`
tests pass; `pnpm typecheck && pnpm lint` clean.

## Implementation Order

```
Step 1 (extract sub-hook)  →  Step 2 (facade rewrite)
```

Sequential — Step 2 imports from Step 1's new file. No parallelism possible.

## Implementation summary

Both child stories complete (stage: done).

- **Step 1** (`f17cd9d`): New `packages/ui/src/hooks/use-batch-ingestion.ts` (253 lines). Extracts all four batch refs, `startBatch`, `confirmTier`, `skipCurrentFile`, `cancelBatch`, `resetRefs` into `useBatchIngestion`. Types remain in `use-ingestion.ts`. Additive-only — no consumer impact.
- **Step 2** (`f8e8953`): `use-ingestion.ts` rewritten as a thin facade. Line count 404 → 230 (174 lines removed). Four batch refs, `_startBatch`, `confirmTier`, `skipCurrentFile`, `cancelBatch` replaced by `const batch = useBatchIngestion(...)` delegation. Public `UseIngestionResult` API unchanged. `stateRef` + `useEffect` mirror provides stale-closure-free `getState` getter to sub-hook.
- Picker-close fix (call-sites hoisting `useIngestion` to parent components) preserved — untouched by this refactor.
- All 163 UI test files / 1706 tests pass; `pnpm typecheck` clean across all packages.
