---
id: gate-tests-image-cross-chunk-boundary
kind: story
stage: backlog
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# Image markdown straddling a chunk boundary — contract is silent

## Priority
Low

## Spec reference
Items: `feature-powerpoint-ingestion-embedded-images` (Unit 3), `feature-docx-ingestor-cleanup` (design note: "Accepts edge cases where an image reference straddles a chunk boundary (markdown chunker preserves paragraph-level units, so this is rare).")
Acceptance criterion: The boundary edge case is mentioned as "rare but acceptable." If the chunker splits at an image reference, `chunk.imageNames` may be missed.

## Gap type
adversarial-spec-silent

## Suggested test
```ts
// packages/tools/src/runtime/ingestion/__tests__/docx-ingestor.test.ts
it("handles an image whose markdown straddles a chunk boundary — exactly one chunk picks it up OR neither", async () => {
  // Configure chunkMarkdown maxChars small enough to split mid-paragraph.
  // Assert the image is tagged on exactly one chunk or neither (no double-tag).
});
```

## Test location (suggested)
`packages/tools/src/runtime/ingestion/__tests__/docx-ingestor.test.ts`
