---
id: feature-refactor-use-ingestion-batch-extraction
kind: feature
stage: drafting
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

## Next
Per-feature design via `/agile-workflow:refactor-design feature-refactor-use-ingestion-batch-extraction`.
