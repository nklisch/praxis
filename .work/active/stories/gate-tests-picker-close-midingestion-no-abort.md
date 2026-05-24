---
id: gate-tests-picker-close-midingestion-no-abort
kind: story
stage: drafting
tags: [testing, ui]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
---

# Closing the picker modal mid-ingestion not asserted to leave the batch running

## Priority
Medium

## Spec reference
Item: `story-inline-upload-in-attach-from-library`
Acceptance criterion:
> Tier-selection modal (when applicable) renders above the picker
> modal during ingestion. Both remain dismissable; **closing the
> picker mid-ingestion does not cancel the in-flight batch.**

## Gap type
missing test for spec criterion

## Suggested test
```ts
it("closing the picker modal mid-ingestion does NOT abort the batch", async () => {
  // Start a 3-file batch via drop with .path. While in tier_selection
  // for file 2, call onClose (escape or close button). Assert the
  // remaining files still ingest (startFn called 3 times eventually).
});
```

## Test location (suggested)
`packages/ui/src/__tests__/library-document-picker.test.tsx`
