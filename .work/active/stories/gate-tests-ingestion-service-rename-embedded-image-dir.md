---
id: gate-tests-ingestion-service-rename-embedded-image-dir
kind: story
stage: implementing
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
