---
id: bug-scan-post-turn-indexer-overlap
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
bug_location: packages/core/src/services/indexers/orchestrator.ts:62
---

# Overlapping post-turn indexer runs can double-apply mastery signals

**Location**: `packages/core/src/services/indexers/orchestrator.ts:62` · **Severity**: medium · **Pattern**: atomicity violation across multiple async operations

The orchestrator cancels pending timers but does not serialize in-flight post-turn runs, so overlapping runs can read the same floor and reprocess the same events. Add a per-session run queue or mutex, advance floors monotonically, and make mastery application idempotent by event ID.

```ts
const timer = setTimeout(() => {
  this.timers.delete(input.sessionId);
  this.runScope("post-turn", input, true).catch(/* ... */);
}, debounce);
```
