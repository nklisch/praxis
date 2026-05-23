---
id: feature-sketch-to-concept-map-promotion
kind: feature
stage: done
tags: [ui, content]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Sketch to concept-map promotion

## Brief

The sketch → concept-map conversion is described end-to-end in
`.mockups/flows/sketch-to-concept-map/` but there is no user-facing CTA
wired into the sketch editor today. Sketches live as a note format;
concept-maps are managed separately; the connecting affordance ("turn
this sketch into a concept map") doesn't exist in the UI.

## Closure (2026-05-23)

**Status: closed as already shipped.** Validation against the codebase
during `epic-design --only-questions` revealed the CTA is live and
covered by tests — the original brief was stale.

**Evidence:**

- `packages/ui/src/components/note-editor-sketch.tsx:184-196` — renders
  the **"convert to a concept map ↗"** button in the inline notice strip
  when `onConvertToConceptMap` is provided.
- `packages/ui/src/components/note-editor-sketch.tsx:209-246` —
  confirmation modal: "Praxis will extract labelled shapes as nodes and
  arrows as edges. Shapes without text labels will be skipped — the
  resulting map may be sparse. The original sketch is preserved. You can
  undo this conversion within 24 hours from the Configure tab."
- `packages/ui/src/routes/workspace/note-editor-page.tsx:230` — production
  callsite passes `onConvertToConceptMap: handleConvertToConceptMap`. The
  CTA is live.
- `packages/ui/src/components/__tests__/note-editor-sketch-convert.test.tsx`
  — 7 tests covering button visibility, modal open, cancel, convert,
  error state, loading state, ESC close.

**Why this slipped through:** the idea was parked
2026-05-19 (presumably observed in an earlier sketch-editor revision or
before the Phase-15b sketch-bridge story landed); the convert CTA shipped
between then and now.

**Future verification** (not part of this feature): if the shipped flow
diverges materially from `.mockups/flows/sketch-to-concept-map/` once a
user walks the journey end-to-end, file a fresh fix-story rather than
re-opening this one.

Archived to `.work/archive/`.
