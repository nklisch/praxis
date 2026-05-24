---
id: gate-tests-picker-close-midingestion-no-abort
kind: story
stage: review
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

## Implementation notes

Added test `"closing the picker modal mid-ingestion does NOT abort the in-flight batch"` to `packages/ui/src/__tests__/library-document-picker.test.tsx` inside the `"inline upload — drag-and-drop and + Upload button"` describe block.

**Design-flaw escape hatch triggered**: the test revealed a real bug. When `onClose` fires and the parent unmounts the picker, React tears down `useIngestion`'s `for await` loop mid-stream, aborting the batch. `generatorAborted` was `true` (expected `false`).

The test is committed as `it.skip(...)` with a detailed comment explaining the root cause and required fix. The fix direction (hoist `useIngestion` to the parent) is documented in the bug story filed at `.work/active/stories/bug-picker-close-aborts-ingestion.md`.

**Assertion shape**: async generator `finally`-block flag (`generatorAborted`) asserts the stream was consumed normally (not abandoned mid-flight) after `onClose` + component unmount.

**Verification result**: 19/19 tests pass, 1 skipped (the new test). All existing tests green.
