---
id: bug-scan-subagent-callid-collision
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
