---
id: bug-scan-draft-stream-unhandled-reject
kind: story
stage: implementing
tags: [bug, async]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
bug_origin: scan
bug_severity: medium
bug_domain: async
bug_location: packages/ui/src/components/course-create-tab-body.tsx:153
---

# Draft finalization stream can reject as an unhandled promise

**Location**: `packages/ui/src/components/course-create-tab-body.tsx:153` · **Severity**: medium · **Pattern**: unhandled promise rejection / fire-and-forget async

The fire-and-forget stream listener has no outer `try/catch`, so an IPC stream error rejects the IIFE as an unhandled promise in the renderer. Wrap the stream loop in `try/catch` and pair it with explicit stream cancellation on cleanup.

```ts
(async () => {
  for await (const event of client.drafts.events()) {
    if (cancelled) break;
    if (event.kind === "finalized") {
      // ...
    }
  }
})();
```
