---
id: bug-scan-ingestion-activity-stuck
created: 2026-06-01
tags: [bug, resource-leak]
bug_origin: scan
bug_severity: medium
bug_domain: resource-leak
bug_location: packages/core/src/ingestion/service.ts:67
---

# Ingestion activity item can stay running forever after post-parse failures

**Location**: `packages/core/src/ingestion/service.ts:67` · **Severity**: medium · **Pattern**: resource handle acquired without guaranteed release

The activity handle is finished on parse/cancel/success paths, but DB insertion, embedding, vector upsert, FTS upsert, or scope setup can throw outside those catches and leave the `ActivityRegistry` item running. Wrap the full body after handle creation in `try/catch/finally` and finish failed if needed.

```ts
const actHandle = this.deps.activity?.start({ label: `reading ${prettyName}` });
// ...
this.deps.db.insert(documents).values({ ... }).run();
await Promise.all([
  this.deps.vectorStore.upsertBatch(vectorUpserts),
  this.deps.ftsStore.upsertBatch(ftsUpserts),
]);
actHandle?.finish("done");
```
