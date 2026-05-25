---
id: gate-tests-useingestion-duplicate-paths-spec
kind: story
stage: done
tags: [testing, ui, documentation]
parent: feature-gate-tests-v0.1.4-coverage-sweep
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-23
updated: 2026-05-25
---

# `useIngestion.startBatchWithPaths` spec is silent on duplicates / invalid characters

## Priority
Low — from gate-tests on release v0.1.4.

## Spec reference
Item: `story-inline-upload-in-attach-from-library`
Acceptance criterion:
> `startBatchWithPaths(paths: string[])` ingests the given paths
> through the same backend pipeline as `startPickBatch('files')`.

Spec is silent on duplicates and on paths the backend rejects.

## Gap type
adversarial-spec-silent (input partition)

## Suggested test or doc update
```ts
it("startBatchWithPaths with a duplicate path ingests it twice (backend dedupes, not the hook)", async () => {
  // verifies the hook is a thin pass-through; backend dedup is a separate concern.
});
```

Alternative: document the contract in the story body (hook is a
pass-through; dedup/validation is backend-owned) and skip the test.

## Test location (suggested)
`packages/ui/src/__tests__/use-ingestion.test.tsx`

## Implementation notes (2026-05-25)

Added test `"startBatchWithPaths with a duplicate path ingests it twice (hook is a pass-through; backend dedupes)"` in the `"useIngestion — startBatchWithPaths"` describe block.

The test confirms the hook is a thin pass-through: it forwards both duplicate entries to `client.ingest.start` without deduplication. `startFn` is called twice, both with the same `filePath`. The batch summary contains 2 results. This locks in the pass-through contract so a future "helpful" dedup in the hook would fail this test and surface the contract break explicitly.

Contract documentation: `useIngestion.startBatchWithPaths` makes no claim about deduplication. Backend ownership of dedup/idempotency is implicit in the pass-through design.

All tests pass (`pnpm test`). No production code changes.
