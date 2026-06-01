---
id: bug-scan-post-turn-indexer-overlap
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

## Implementation notes

- Changed `packages/core/src/services/indexers/orchestrator.ts` to serialize all indexer runs per session through a small promise queue, including debounced post-turn runs and synchronous session-end passes.
- Post-turn floor advancement now uses `Math.max(currentFloor, lastTurn + 1)` so queued/overlapping completions cannot move floors backward.
- Added `packages/core/src/services/indexers/__tests__/orchestrator.test.ts` coverage proving a second post-turn pass waits for the first and only sees events above the advanced floor.
