---
id: bug-picker-close-aborts-ingestion
kind: story
stage: review
tags: [bug, ui, ingestion]
parent: null
depends_on: []
release_binding: v0.1.4
created: 2026-05-23
updated: 2026-05-24
---

# Bug: closing the picker modal mid-ingestion aborts the in-flight batch

## Summary

Closing `LibraryDocumentPicker` (via Escape, Close button, or backdrop click)
while an ingestion is in progress causes the batch to be silently aborted.

## Root cause

`useIngestion` is mounted inside `LibraryDocumentPicker`. When the parent
unmounts the picker on `onClose` (e.g. `setPickerOpen(false)`), React tears
down the component tree. The `for await` loop inside `ingestOneWithResult`
is abandoned at the next microtask tick, which triggers the async generator's
`finally` block — effectively killing the in-flight HTTP/IPC stream.

The `onClose` prop does not call `ingestion.cancelBatch()` (correct), but
component unmounting achieves the same destructive outcome.

## Spec requirement violated

From `story-inline-upload-in-attach-from-library`:
> Both remain dismissable; **closing the picker mid-ingestion does not cancel
> the in-flight batch.**

## Reproduction

Skipped test in
`packages/ui/src/__tests__/library-document-picker.test.tsx`:
`"closing the picker modal mid-ingestion does NOT abort the in-flight batch"`

Running with `.skip` removed reproduces `expected true to be false` —
`generatorAborted` is `true` immediately after `onClose` fires.

## Fix direction

Decouple ingestion lifetime from the picker's mount lifetime. Two options:

1. **Hoist `useIngestion` to the parent** (`CourseDetailRoute`,
   `CourseCreateTabBody`, etc.) so the hook survives unmounting the picker.
   Pass `ingestion` down as a prop. The picker renders modals but doesn't own
   the state machine.

2. **Keep the picker mounted with `display:none`** (same `tab-body-isolation`
   pattern) while an ingestion is in-flight. Only unmount after reaching
   `idle`, `done`, `error`, or `batch_summary`. This is simpler but leaks
   picker state into the parent.

Option 1 is architecturally cleaner and matches the Activity Rail design
intent (background work survives UI dismissal).

## Acceptance

The skipped test in `library-document-picker.test.tsx` passes (un-skipped).

## Implementation notes

**Approach used**: Option 1 — hoisted `useIngestion` to parent components.

**Parents updated**:
- `packages/ui/src/routes/course-detail.tsx` — added `pickerIngestion` (`useIngestion` with course scope + `courseDocsRefresh` as `onDone`), passed as `ingestion` prop to `LibraryDocumentPicker`
- `packages/ui/src/components/course-create-tab-body.tsx` — imported `useIngestion`, added `pickerIngestion` (session scope + `refreshAttached` as `onDone`), passed as `ingestion` prop to `LibraryDocumentPicker`

**Picker changes** (`packages/ui/src/components/library-document-picker.tsx`):
- Removed internal `useIngestion()` call
- Added `ingestion: UseIngestionResult` as a required prop (type-only import from `use-ingestion.js`)
- Added `useEffect` that watches `ingestion.state.status` for transitions into `batch_summary` or `done` and calls the picker's internal `refresh()` — this replaces the `onDone → refresh` coupling that existed when the hook was internal

**Test changes** (`packages/ui/src/__tests__/library-document-picker.test.tsx`):
- Imported `useIngestion`
- Added `PickerWithIngestion` wrapper component (calls `useIngestion` inside `PraxisClientProvider`, passes result as `ingestion` prop) used by `renderPicker`
- Un-skipped the acceptance test (`it.skip` → `it`)
- Updated the acceptance test's `Wrapper` to hoist `useIngestion` into an `Inner` component (inside the provider) so it survives picker unmount — this is the pattern being tested
- Corrected the assertion ordering: `expect(generatorAborted).toBe(false)` now fires BEFORE `resolveIngestion()` (the generator is still alive at that point in the fixed implementation; it was being aborted synchronously on close in the buggy implementation)

**Un-skipped test passing**: yes — all 20 tests in the file pass; 1711 total UI tests pass.

**Typecheck**: clean.
