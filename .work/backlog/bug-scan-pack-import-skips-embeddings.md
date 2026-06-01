---
id: bug-scan-pack-import-skips-embeddings
created: 2026-06-01
tags: [bug, data-layer, high]
bug_origin: scan
bug_severity: high
bug_domain: data-layer
bug_location: packages/curriculum/src/packs/import-service.ts:91
---

# Pack re-import cannot recover failed embedding writes

**Location**: `packages/curriculum/src/packs/import-service.ts:91` · **Severity**: high · **Pattern**: distributed transaction as sequential calls / idempotency gap

The relational transaction commits `pack_imports` before sqlite-vec embeddings are written. If embedding upsert fails, the pack is permanently marked imported and later imports return early without rebuilding missing embeddings. Track completion state or verify and repair embeddings on the existing-import path.

```ts
const existing = await this.findImportRecord(manifest.id, manifest.version);
if (existing) {
  return existing;
}
this.deps.db.transaction((tx) => {
  // writes concept_graphs, concepts, prerequisite_edges, pack_imports
});
```
