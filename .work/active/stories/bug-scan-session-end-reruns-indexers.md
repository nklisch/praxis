---
id: bug-scan-session-end-reruns-indexers
kind: story
stage: implementing
tags: [bug, concurrency]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
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
