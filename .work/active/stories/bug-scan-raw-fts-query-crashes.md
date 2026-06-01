---
id: bug-scan-raw-fts-query-crashes
kind: story
stage: review
tags: [bug, data-layer]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
bug_origin: scan
bug_severity: medium
bug_domain: data-layer
bug_location: packages/core/src/services/library-service.ts:103
---

# Library FTS search passes raw user query to MATCH

**Location**: `packages/core/src/services/library-service.ts:103` · **Severity**: medium · **Pattern**: raw FTS query construction / malformed query crash

SQL parameterization prevents injection, but FTS5 `MATCH` still parses a query language. Unmatched quotes or raw operators can throw from `stmt.all` and break library search. Reuse the FTS sanitizer, safely quote tokens, and catch parse errors as empty results with diagnostics.

```ts
WHERE notes_fts MATCH ?
  AND n.student_id = ?
`;
const params: any[] = [query, studentId];
const stmt = this.deps.sqlite.prepare<any[], any>(sqlStr);
let hits = stmt.all(...params).map(rawRowToNoteHit);
```

## Implementation notes

- Changed `packages/core/src/services/library-service.ts` to convert user FTS input into plain tokens before `MATCH` and to treat any remaining FTS parse/runtime error as an empty result set.
- Added regression coverage in `packages/core/src/services/__tests__/library-service.test.ts` for malformed quoted FTS input.
