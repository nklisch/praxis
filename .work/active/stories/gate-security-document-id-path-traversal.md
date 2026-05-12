---
id: gate-security-document-id-path-traversal
kind: story
stage: implementing
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
