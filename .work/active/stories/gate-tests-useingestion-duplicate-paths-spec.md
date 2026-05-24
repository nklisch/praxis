---
id: gate-tests-useingestion-duplicate-paths-spec
kind: story
stage: implementing
tags: [testing, ui, documentation]
parent: feature-gate-tests-v0.1.4-coverage-sweep
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
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
