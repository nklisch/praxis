---
id: bug-scan-subagent-callid-collision
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
bug_location: packages/core/src/services/subagent-registry.ts:69
---

# Sub-agent registry keys collide across sessions

**Location**: `packages/core/src/services/subagent-registry.ts:69` · **Severity**: medium · **Pattern**: shared-state key collision

The registry is global but keyed only by `parentCallId`, while Claude Code tool-call IDs are sequential per conversation. Two sessions can both use call ID `1`, causing the second sub-agent to reuse and mutate the first item. Key by a globally unique ID or a `{ sessionId, parentCallId }` composite.

```ts
if (this.items.has(parentCallId)) {
  return this.makeHandle(parentCallId);
}

parentCallId: ctx.callId,
```

## Implementation notes

- Changed `packages/core/src/services/subagent-registry.ts` to key registry state and linger timers by the composite `(sessionId, parentCallId)` while preserving the public `parentCallId` in items/events for existing UI subscriptions.
- Same-session duplicate `start()` remains idempotent; same call id from different sessions now creates independent items and handles.
- Added `packages/core/src/services/__tests__/subagent-registry.test.ts` coverage for cross-session call-id collision safety.
