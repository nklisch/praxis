---
id: gate-security-embedded-image-store-dirfor-guard
kind: story
stage: backlog
tags: [security]
parent: null
depends_on: []
release_binding: null
gate_origin: security
created: 2026-05-12
updated: 2026-05-12
---

# Add a defensive guard inside `FsEmbeddedImageStore.dirFor` / `FsPageImageStore.dirFor`

## Severity
Low

## Domain
Input Validation & Injection

## Location
- `packages/tools/src/runtime/ingestion/pptx-ingestor.ts:96`
- `packages/tools/src/runtime/ingestion/docx-ingestor.ts:94`
- `packages/core/src/ingestion/embedded-images.ts:40-44`

## Evidence
```ts
// pptx-ingestor.ts:96 (docx-ingestor.ts:94 mirrors this)
const syntheticDocId = `_pending_${randomUUID()}`;
await store.save({ documentId: syntheticDocId, imageName: att.name, … });

// embedded-images.ts:40
dirFor(input: { documentId: string }): string {
  return join(this.baseDir, input.documentId);
}
```

Today the value is safe because Praxis controls both sides. But the
`EmbeddedImageStore` port is publicly typed and accepts any string
`documentId`; combined with the broader path-traversal finding, there is no
defensive boundary inside the store itself. A future call site (or a test
fixture) passing a hostile string would be honored by the store.

## Remediation direction
Add a single guard inside `FsEmbeddedImageStore.dirFor` /
`FsPageImageStore.dirFor` that rejects ids containing `/`, `\\`, `..`, or null
bytes. One line; makes both stores correct-by-construction regardless of caller.
