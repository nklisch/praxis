---
id: gate-docs-roadmap-pptx-no-longer-deferred
kind: story
stage: done
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

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
