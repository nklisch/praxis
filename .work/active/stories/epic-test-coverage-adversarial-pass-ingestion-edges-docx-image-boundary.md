---
id: epic-test-coverage-adversarial-pass-ingestion-edges-docx-image-boundary
kind: story
stage: done
tags: [testing, ingestion]
parent: epic-test-coverage-adversarial-pass-ingestion-edges
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Story: DOCX image-paragraph chunk-boundary pinning

## Scope

Pin the spec-silent contract for the DOCX ingestion path: when an
image-only paragraph lands at a chunk-boundary edge, **at most one
chunk** picks up the image reference in `imageNames` (the documented
rare-but-acceptable case is zero; the never-allowed case is two). Test-
only — no production behavior change.

See parent feature `epic-test-coverage-adversarial-pass-ingestion-edges`
for the full design (Unit 1, including the test code, the source-side
"pinned by:" comment, and acceptance criteria).

## Files

- **Test (modify)**:
  `packages/tools/src/runtime/ingestion/__tests__/docx-ingestor.test.ts`
  — append a new describe block "DocxIngestor — image markdown at
  chunk boundaries (spec-silent contract)" with two tests.
- **Source (modify)**:
  `packages/tools/src/runtime/ingestion/docx-ingestor.ts` — add a
  one-line `// Spec-silent contract pinned by: …` comment above
  `tagChunksWithImages` (around line 138).

## Acceptance Criteria

- [ ] New describe block added with the two tests specified in the
  feature body (Unit 1).
- [ ] Test 1 (`"handles an image whose markdown straddles a chunk
  boundary — at most one chunk picks it up OR neither (rare but
  acceptable)"`) asserts `chunksWithImage.length <= 1` AND
  `markerCount <= 1` across all chunks.
- [ ] Test 2 (`"image paragraph at the exact maxChars boundary —
  image survives into the next chunk"`) asserts the chunk containing
  the praxis://embedded marker has `imageNames` populated with
  `"image-1.png"`.
- [ ] One-line source comment added to `tagChunksWithImages`
  referencing the pinning test by name.
- [ ] `pnpm --filter @praxis/tools test` passes locally.
- [ ] `pnpm typecheck`, `pnpm lint` clean.

## Notes

- No new helpers needed — `simulateConvertToMarkdownWithImages`
  already appends the image as its own paragraph.
- Use `maxChars: 100` to force per-paragraph flush. Don't tune to
  byte counts — flaky.
- Run fast lane (no `PRAXIS_RUN_SLOW_TESTS` gating).

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: 26 tests pass. Source comment correctly pins the contract. Fast-lane test, no slow gating needed.
