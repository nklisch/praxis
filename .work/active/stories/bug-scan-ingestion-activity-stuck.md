---
id: bug-scan-ingestion-activity-stuck
kind: story
stage: done
tags: [bug, resource-leak]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
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

## Implementation notes

- Changed `packages/core/src/ingestion/service.ts` to wrap the full ingestion body after activity creation in a guarded failure path, with a final fallback that fails any unfinished activity handle.
- Added regression coverage in `packages/core/src/__tests__/ingestion-service.test.ts` confirming post-parse indexing failures finish the activity as failed.

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Story fast lane. Verdict: Approve - story verified by implement; fast-lane advance. Full integration verification also passed with `TMPDIR=$PWD/.tmp pnpm test` (489 files, 5439 tests) and targeted Biome on the touched-code set.
