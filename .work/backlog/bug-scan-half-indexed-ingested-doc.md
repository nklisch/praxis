---
id: bug-scan-half-indexed-ingested-doc
created: 2026-06-01
tags: [bug, data-layer, high]
bug_origin: scan
bug_severity: high
bug_domain: data-layer
bug_location: packages/core/src/ingestion/service.ts:120
---

# Document ingestion can persist half-indexed documents

**Location**: `packages/core/src/ingestion/service.ts:120` · **Severity**: high · **Pattern**: distributed transaction as sequential calls / cancellation leaves partial state

Document and chunk rows are durable before embedding, vector, and FTS indexing complete. Cancellation or an indexing failure leaves a visible document with missing search indexes and retry creates another document instead of repairing it. Stage ingestion with pending/ready status or compensate by deleting partial artifacts on failure.

```ts
this.deps.db.insert(documents).values({ id: documentId, /* ... */ }).run();
if (chunkRows.length > 0) {
  this.deps.db.insert(documentChunks).values(chunkRows).run();
}
await Promise.all([
  this.deps.vectorStore.upsertBatch(vectorUpserts),
  this.deps.ftsStore.upsertBatch(ftsUpserts),
]);
```
