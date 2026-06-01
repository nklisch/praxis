---
id: bug-scan-half-indexed-ingested-doc
kind: story
stage: done
tags: [bug, data-layer, high]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
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

## Implementation notes

- Changed `packages/core/src/ingestion/service.ts` to clean up persisted document rows, chunk rows via cascade, and vector/FTS index rows when post-parse indexing or cancellation fails after the document was made durable.
- Added regression coverage in `packages/core/src/__tests__/ingestion-service.test.ts` for vector/FTS cleanup after an indexing failure.

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Story fast lane. Verdict: Approve - story verified by implement; fast-lane advance. Full integration verification also passed with `TMPDIR=$PWD/.tmp pnpm test` (489 files, 5439 tests) and targeted Biome on the touched-code set.
