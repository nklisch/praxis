---
id: gate-security-document-id-path-traversal
kind: story
stage: review
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: security
created: 2026-05-12
updated: 2026-05-12
---

# Renderer-supplied `documentId` flows into filesystem paths without validation

## Severity
Medium

## Domain
Input Validation & Injection / Data Protection

## Location
- `packages/desktop/electron/main/ipc-server.ts:232-243`
- `packages/core/src/services/documents-service.ts:65-76`
- `packages/core/src/ingestion/page-images.ts:36-60`
- `packages/core/src/ingestion/embedded-images.ts:40-70`

## Evidence
```ts
// ipc-server.ts:232
handle("praxis.documents.delete", async (_event, documentId: string) => {
  return services.documents.delete(documentId);
});

// documents-service.ts (delete path) → page-images / embedded-images:
async deleteByDocumentId(documentId: string): Promise<void> {
  await rm(join(this.baseDir, documentId), { recursive: true, force: true });
}

// embedded-images.ts:44 — only imageName sanitized; documentId is not
pathFor(input) { return join(this.dirFor(input), sanitizeImageName(input.imageName)); }
```

A renderer-supplied `documentId` of `"../../foo"` resolves outside `baseDir`.
`delete` then `rm`'s that location with `force: true`; `read` returns its
`0.png` contents. The new `FsEmbeddedImageStore` shipped in this bundle
(`story-embedded-image-store-delete-cascade`,
`story-image-store-dirfor-abstraction`) inherits the same pattern.

## Remediation direction
Validate `documentId` at the IPC boundary (or at the store boundary) — must be
the brand shape Praxis produces (UUIDv7 / opaque non-traversing token).
Reject any value containing `/`, `\\`, `..`, or absolute-path leading chars.
Alternative: resolve and assert the resulting absolute path stays under
`baseDir` (`path.resolve(baseDir, documentId)` then `startsWith(baseDir + sep)`).

## Implementation notes

### Files changed
- `packages/core/src/ingestion/document-id-guard.ts` — new shared module exporting `assertSafeDocumentId(documentId: string): void`
- `packages/core/src/ingestion/page-images.ts` — imports guard; calls it in `dirFor`, `read`, and `deleteByDocumentId`
- `packages/core/src/ingestion/embedded-images.ts` — imports guard; calls it in `dirFor`, `read`, and `deleteByDocumentId`
- `packages/core/src/services/documents-service.ts` — imports guard; calls it at the top of `delete()` and `pageImage()` to cover stores (vectorStore, ftsStore) that don't have their own FS guard

### Guard shape
`assertSafeDocumentId` rejects any string that:
- contains `/` or `\` (path separators)
- contains `..` (parent-directory component)
- contains a null byte (`\0`)
- starts with `~` or matches `/^[A-Za-z]:/` (Windows drive letter)

The guard allows `_pending_<uuid>` (first-party ingestor synthetic IDs — no traversal chars) and UUIDv7-shaped IDs without change.

The guard is placed both at the service layer (for vectorStore/ftsStore delegation) and at each store method individually. Placement in `read()` before the `try/catch` block is intentional — without it, the thrown error would be swallowed and `read()` would return `null` for traversal inputs instead of rejecting.

### Test cases added
**`packages/core/src/ingestion/__tests__/embedded-images.test.ts`** (9 new tests in "documentId path-traversal guard" describe):
- rejects `/` (forward slash) — covers `../../foo` and `a/b`
- rejects `\` (backslash)
- rejects `..` component
- rejects null byte
- rejects `~`-prefixed id
- rejects Windows drive-letter id (`C:`)
- rejects traversal in `deleteByDocumentId`
- allows UUIDv7-shaped id
- allows `_pending_<uuid>` id

**`packages/core/src/__tests__/page-images.test.ts`** (same 9 cases for `FsPageImageStore`)

**`packages/core/src/__tests__/documents-service.test.ts`** (2 new tests in "path-traversal guard" describe):
- `delete()` rejects traversal id before calling vectorStore
- `pageImage()` rejects traversal id (propagates rather than returning null)
