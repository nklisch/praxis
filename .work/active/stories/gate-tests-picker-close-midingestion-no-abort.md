---
id: gate-tests-picker-close-midingestion-no-abort
kind: story
stage: done
tags: [testing, ui]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-24
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

## Review

Verdict: **approved → done**.

The agent added the test correctly as `it.skip(...)` with a detailed comment
linking to `.work/active/stories/bug-picker-close-aborts-ingestion.md`. The
skip is the right call: the spec criterion is genuinely violated in current
code and the agent confirmed it (running without `.skip` produces `expected
true to be false` on `generatorAborted`). Filing the bug and skipping rather
than inverting the assertion or deleting the test is exactly the
test-integrity principle in action.

Bug story: `.work/active/stories/bug-picker-close-aborts-ingestion.md`
- Root cause clearly identified (unmounting `LibraryDocumentPicker` tears down
  the `for await` loop inside `useIngestion`, triggering the generator
  `finally` block mid-stream).
- Fix direction documented (hoist `useIngestion` to parent; Option 1 preferred
  as architecturally cleaner).
- Acceptance criterion is the skipped test itself — unskip when the bug is
  fixed and it must pass green.

Verified: `pnpm vitest run packages/ui/src/__tests__/library-document-picker.test.tsx`
→ 19 passed | 1 skipped. All pre-existing tests green.
