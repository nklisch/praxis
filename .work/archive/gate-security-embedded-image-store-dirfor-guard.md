---
id: gate-security-embedded-image-store-dirfor-guard
kind: story
stage: done
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: security
created: 2026-05-12
updated: 2026-05-17
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

## Implementation notes — Land mode

Work already shipped; orchestrator audit confirmed both stores have the guard:

- `packages/core/src/ingestion/embedded-images.ts:42` — `FsEmbeddedImageStore.dirFor` calls `assertSafeDocumentId(input.documentId)` before joining.
- `packages/core/src/ingestion/page-images.ts:37` — `FsPageImageStore.dirFor` mirrors the same call.
- `packages/core/src/ingestion/document-id-guard.ts` — `assertSafeDocumentId` rejects `/`, `\\`, `..`, null bytes, `~/` prefix, and `^[A-Za-z]:` (Windows drive prefix). Broader than the gate's minimal rule set, which is correct given the parallel path-traversal feature that shipped.
- Tests in `packages/core/src/ingestion/__tests__/embedded-images.test.ts:85+` cover the throw cases (lines 103-129) and the success cases (lines 140-146).

Gate is fully closed — no code change required. Advance to review.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Land-mode closure. Citations verified — `assertSafeDocumentId` is called inside both `FsEmbeddedImageStore.dirFor` and `FsPageImageStore.dirFor` exactly as the gate's remediation direction specified, and existing tests pin all seven rejection rules. No diff to evaluate beyond the story-body audit notes.
