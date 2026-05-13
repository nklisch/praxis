---
id: epic-test-coverage-adversarial-pass-ingestion-edges
kind: feature
stage: drafting
tags: [testing]
parent: epic-test-coverage-adversarial-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Ingestion adversarial test coverage — image boundaries and slide fallback

## Brief

Two gate-tests findings live in the ingestion subsystem. The first
exercises a spec-silent edge case: an image markdown reference that
straddles a chunk boundary. The contract is currently described as "rare
but acceptable" — neither chunk's `imageNames` may contain the image,
which is a silent data-loss path for any consumer that relies on
post-chunk image enumeration. The second covers the PPTX
`tryChunkBySlide` fallback to `ast.toText() + chunkMarkdown` when no
clean slide signal exists in the AST. Today the fallback has only mock-
AST unit coverage; no real-fixture exercises it, so an AST-shape
regression upstream in `officeparser` would slip past CI.

This feature lands both as a single design pass because they share the
ingestion test scaffolding (fixture handling, chunk assertions, the
markdown chunker config) and because deciding the spec-silent pinning
style — explicit test name + doc note vs. runtime assertion — is one
decision that applies to both.

## Epic context

- Parent epic: `epic-test-coverage-adversarial-pass`
- Position in epic: independent test additions. Parallelizable with the
  other two features in this epic.

## Scope absorbed from backlog

- `gate-tests-image-cross-chunk-boundary` — image markdown straddling a
  chunk boundary is spec-silent; the chunker may split mid-paragraph
  and neither chunk picks up the image reference.
- `gate-tests-pptx-slide-fallback-real-fixture` — `tryChunkBySlide`
  fallback path is mock-only; no real PPTX fixture without a clean
  slide signal in the suite.

## Foundation references

- `docs/ARCHITECTURE.md` — ingestion pipeline, chunking model
- `CLAUDE.md` — `slow-test-gating` pattern (Pyodide-style tests; may
  apply if fallback fixture is large)
- Skill: `officeparser-v6` (the AST shape for slide boundaries lives
  here)

## Anchors (current implementation)

- DOCX ingestor test —
  `packages/tools/src/runtime/ingestion/__tests__/docx-ingestor.test.ts`
- PPTX ingestor tests —
  `packages/tools/src/runtime/ingestion/__tests__/pptx-ingestor*.test.ts`
- Chunker — `packages/tools/src/runtime/ingestion/chunk-markdown.ts`
  (or equivalent)
- Image-name enumeration logic in chunk metadata builder
- PPTX `tryChunkBySlide` implementation —
  `packages/tools/src/runtime/ingestion/pptx-ingestor.ts`
- Existing PPTX fixture(s) —
  `packages/tools/test-fixtures/` (need to identify whether a
  no-clean-slide-signal fixture is available or must be authored)
