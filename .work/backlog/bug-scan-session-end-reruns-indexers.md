---
id: bug-scan-session-end-reruns-indexers
created: 2026-06-01
tags: [bug, concurrency]
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
