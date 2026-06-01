---
id: bug-scan-session-end-reruns-indexers
kind: story
stage: review
tags: [bug, concurrency]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
bug_origin: scan
bug_severity: medium
bug_domain: concurrency
bug_location: packages/core/src/services/session-service.ts:380
---

# Duplicate session.end calls rerun session-end indexers

**Location**: `packages/core/src/services/session-service.ts:380` · **Severity**: medium · **Pattern**: atomicity violation across multi-step state transition

`end()` does not atomically claim the session before asynchronous indexer work. A retry or second tab can rerun non-idempotent end indexers before or after `endedAt` is set. Atomically transition with `WHERE ended_at IS NULL` before side effects and add idempotency keys where reruns are expected.

```ts
await this.deps.indexerOrchestrator.runAtSessionEnd({ studentId, sessionId });
// ...
this.deps.db.update(sessions).set({ endedAt }).where(eq(sessions.id, sessionId)).run();
```

## Implementation notes

- Changed `packages/core/src/services/session-service.ts` so `end()` atomically claims the session with `WHERE ended_at IS NULL` before async engine close, indexer, and gate side effects.
- Duplicate `end()` calls now return the already-ended timestamp without rerunning session-end indexers or closing the engine twice.
- Added `packages/core/src/services/__tests__/session-service.concurrency.test.ts` coverage for concurrent duplicate `end()` calls while indexer work is still pending.
