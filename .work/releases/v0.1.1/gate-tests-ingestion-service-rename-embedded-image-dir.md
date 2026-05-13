---
id: gate-tests-ingestion-service-rename-embedded-image-dir
kind: story
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# `IngestionService` synthetic→real `documentId` rename for embedded images not exercised e2e

## Priority
Medium

## Spec reference
Items: `feature-powerpoint-ingestion-embedded-images` (Unit 3), `feature-docx-ingestor-cleanup`
Acceptance criterion: "End-to-end ingest of a DOCX with images writes the images to the embedded store, persists with the real documentId after the rename, and the resulting document's chunks carry `imageNames`."

## Gap type
e2e-seam (cross-unit integration) — current tests verify the ingestor sets `pendingEmbeddedImageDocId` and store round-trip, but never verify `IngestionService.ingest()`'s rename of the synthetic dir to the real one.

## Suggested test
```ts
// packages/core/src/__tests__/ingestion-service.test.ts
it("renames the embedded-image directory from synthetic id to real documentId after document persist", async () => {
  // Mock a Pptx/Docx ingestor that returns IngestorResult with
  //   pendingEmbeddedImageDocId: "_pending_xxx"
  // Seed an image under that synthetic dir before service.ingest() runs.
  // After ingest() resolves, verify the real documentId is now the dir key
  // and the synthetic name is gone.
});
```

## Test location (suggested)
`packages/core/src/__tests__/ingestion-service.test.ts`

## Implementation notes

The rename logic already existed in `packages/core/src/ingestion/service.ts` (lines 154–164) — it mirrors the page-image rename at lines 141–151. The gap was purely a missing test.

The new test `"embedded-image directory is renamed from synthetic id to real documentId after document persist"` was added to `packages/core/src/__tests__/ingestion-service.test.ts` following the exact pattern of the existing page-image rename test. It:
- Seeds a PNG under the synthetic dir `_pending_test-xyz-embedded` via `embeddedImageStore.save(...)` before `ingest()` runs.
- Calls `svc.ingest(...)` with a PPTX mime type and a stubbed ingestor that returns `pendingEmbeddedImageDocId`.
- After the `done` event, asserts `embeddedImageStore.read({ documentId: synthId, imageName })` returns `null` (synthetic dir gone) and `embeddedImageStore.read({ documentId: doneEvent.documentId, imageName })` returns the original bytes (real dir present).

The `makeIngestorResult` helper's `extra` partial type was also narrowly expanded to include `pendingEmbeddedImageDocId` so the stub could pass the field through without type widening.

All 10 tests pass (`pnpm vitest run packages/core/src/__tests__/ingestion-service.test.ts`). Typecheck clean.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
