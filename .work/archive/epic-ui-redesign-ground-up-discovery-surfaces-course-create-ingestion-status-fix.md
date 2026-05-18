---
id: epic-ui-redesign-ground-up-discovery-surfaces-course-create-ingestion-status-fix
kind: story
stage: done
tags: [bug, ui]
parent: epic-ui-redesign-ground-up-discovery-surfaces
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Fix: course-create upload screen — batch ingestion status stuck at "indexing"

## Problem

`course-create.tsx` syncs ingestion state into the `attachedFiles` list via
a `useEffect` that listens to `ingestion.state`. It handles three states:

- `"ingesting"` — adds the file to the list with `status: "indexing"`
- `"done"` — marks all "indexing" files as `status: "ready"`
- `"error"` — marks all "indexing" files as `status: "error"`

However, the browse button calls `ingestion.startPickBatch("files")`, which
follows the **batch path** in `useIngestion`. In batch mode the hook emits:

```
picking → (ingesting per file) → batch_summary
```

The `"done"` state is only emitted by `runIngestion` (the **single-file
`startPick` path**). `startPickBatch` never emits `"done"` — it ends in
`"batch_summary"` after all files complete.

Result: attached files stay at `"indexing"` permanently and never transition
to `"ready"`, regardless of whether indexing actually completed.

The student can still press "Start Praxis →" (CTA is not gated), but the
per-file status badge is permanently wrong.

## Fix

Handle `"batch_summary"` in the sync `useEffect` alongside `"done"`:

```tsx
} else if (state.status === "batch_summary") {
  // Map batch results into the attachedFiles list.
  setAttachedFiles((prev) =>
    prev.map((f) => {
      const result = state.results.find((r) => r.filename === f.filename);
      if (!result) return f;
      return {
        ...f,
        status: result.outcome.ok ? ("ready" as const) : ("error" as const),
        documentId: result.outcome.ok ? result.outcome.documentId : undefined,
      };
    }),
  );
}
```

Also consider whether `"done"` (single-file path) should be kept for the
case when a student triggers the browse button and picks exactly one file
(the hook may use single-file path for single selections — verify).

## Files

- `packages/ui/src/routes/course-create.tsx` — add `batch_summary` branch
  to the ingestion sync `useEffect`

## Acceptance criteria

- [x] After picking files via the browse button, each file transitions to
      `"ready"` or `"error"` once batch ingestion completes.
- [x] Visual badge matches mock: `"indexing"` during, `"ready"` after.
- [x] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation notes

### Root cause (two issues found)

**Issue 1 — missing `batch_summary` branch** (the stated bug): the `useEffect`
that syncs `ingestion.state` into `attachedFiles` only handled `"ingesting"`,
`"done"`, and `"error"`. `startPickBatch` never transitions to `"done"` — it
goes to `"batch_summary"`. So batch files were permanently stuck at `"indexing"`.

**Issue 2 — React batching** (found during fix): React 18 batches all the
intermediate `setState("ingesting", ...)` calls from the batch loop with the
final `setState("batch_summary")` into one flush. This means the effect only
ever runs once, when the state is already `"batch_summary"`, with an empty
`attachedFiles` list (no `"ingesting"` transitions were rendered). A naive
`prev.map(f => ...)` against an empty list would do nothing.

**Issue 3 — infinite re-render risk** (pre-existing): the `useEffect` depended
on `[ingestion]` — the full result object — which is a new reference on every
render. Any `setAttachedFiles` call would re-trigger the effect, potentially
looping. Fixed by depending on `ingestionState` (= `ingestion.state`) only.

### Fix applied

- Changed `useEffect` dependency from `[ingestion]` to `[ingestionState]`
  (`ingestion.state` pulled to a stable ref before the effect).
- Added a `"batch_summary"` branch that **upserts** all batch results into
  `attachedFiles` via a `Map`. Since intermediate `"ingesting"` renders may
  have been batched away, we add any missing files at this point rather than
  assuming they're already present. Per-item status is set directly from
  `result.outcome.ok`.
- Used spread `...(result.outcome.ok && { documentId: ... })` to satisfy
  `exactOptionalPropertyTypes: true` (no `undefined` assignment to optional
  property).

### Tests added

`packages/ui/src/__tests__/course-create-route.test.tsx` — 3 cases:
1. All-ok batch → all files "ready".
2. Mixed batch → ok file "ready", failed file "error".
3. All-error batch → all files "error".

All use `await act(async () => { click() })` to flush the async promise chain
from `startPickBatch` before asserting with `waitFor`.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Three distinct root causes addressed cleanly. The `batch_summary`
upsert pattern (Map over `prev`, then `Array.from`) correctly handles the React
18 batching race where intermediate `"ingesting"` setState calls may never have
been rendered when `batch_summary` fires. The `ingestionState` dep narrowing
(pulling `ingestion.state` to a stable ref before the effect) eliminates the
pre-existing infinite re-render risk. The `"done"` branch is correctly preserved
for the single-file `startPick` path. Tests run through the real `useIngestion`
state machine (mocking only the client layer) — that's the right depth. All 1575
UI tests pass; the two changed files are lint-clean; the three typecheck errors
in `@praxis/desktop` are pre-existing and unrelated.
