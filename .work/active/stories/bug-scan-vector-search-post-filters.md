---
id: bug-scan-vector-search-post-filters
kind: story
stage: implementing
tags: [bug, data-layer]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
bug_origin: scan
bug_severity: medium
bug_domain: data-layer
bug_location: packages/tools/src/runtime/sqlite-vec-store.ts:77
---

# Vector search applies filters after a fixed global KNN fetch

**Location**: `packages/tools/src/runtime/sqlite-vec-store.ts:77` · **Severity**: medium · **Pattern**: wrong query semantics / post-filtered top-K

The store fetches a global candidate window and applies document/page/section filters in memory, so scoped searches can return too few or zero results even when matching chunks exist outside the first global candidates. Push filters into the vector query or iterate candidate retrieval until enough scoped results exist.

```ts
const candidateK = input.topK * 4;
const allRows = this.sqlite.prepare(knnSql).all(...knnParams) as Array<SqliteVecSearchRow>;
let filtered = allRows;
if (input.documentIds && input.documentIds.length > 0) {
  filtered = filtered.filter((r) => idSet.has(r.document_id));
}
return filtered.slice(0, input.topK);
```
