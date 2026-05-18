---
id: epic-ui-redesign-ground-up-discovery-surfaces-course-create-ingestion-status-fix
kind: story
stage: implementing
tags: [bug, ui]
parent: epic-ui-redesign-ground-up-discovery-surfaces
depends_on: []
release_binding: null
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

- [ ] After picking files via the browse button, each file transitions to
      `"ready"` or `"error"` once batch ingestion completes.
- [ ] Visual badge matches mock: `"indexing"` during, `"ready"` after.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.
