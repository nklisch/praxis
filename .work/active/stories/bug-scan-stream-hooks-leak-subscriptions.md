---
id: bug-scan-stream-hooks-leak-subscriptions
kind: story
stage: implementing
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
bug_location: packages/ui/src/hooks/use-sub-agent.ts:33
---

# Streaming subscription hooks leave IPC/server subscriptions alive after unmount

**Location**: `packages/ui/src/hooks/use-sub-agent.ts:33` · **Severity**: medium · **Pattern**: AsyncIterable subscription teardown discarded

Several hooks use a cleanup boolean while the async iterator may be blocked in `next()`. When no event arrives, `return()` is never called and the renderer never sends stream cancellation, leaving main-process subscribers and AbortControllers alive. Capture iterators explicitly and call `return()` in cleanup, or make stream clients AbortSignal-aware.

```ts
for await (const event of client.subAgent.events({ parentCallId })) {
  if (cancelled) break;
  // ...
}
return () => {
  cancelled = true;
};
```
