---
id: gate-docs-roadmap-pptx-no-longer-deferred
kind: story
stage: review
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# ROADMAP.md "Future enhancements" still lists PPTX as deferred, but PPTX shipped in v0.1.1

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/ROADMAP.md:418`
- Code: `packages/tools/src/runtime/ingestion/pptx-ingestor.ts`, `packages/tools/src/runtime/ingestion/index.ts:15-16`

## Current doc text
> "- **EPUB-with-images, PPTX, RTF**: skipped in Phase 5 by deliberate format-set choice; revisit if user demand emerges."

## Reality
PPTX shipped as `PptxIngestor` via `feature-powerpoint-ingestion` (text extraction + embedded images stories) in v0.1.1.

## Required edit
Remove `PPTX` from the bullet — leave `EPUB-with-images, RTF`.

## Implementation notes
Edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Rolling-foundation discipline: stale assertions replaced in place; no "previously" prose.
