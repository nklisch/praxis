---
id: bug-scan-double-send-bypasses-queue
created: 2026-06-01
tags: [bug, state, high]
bug_origin: scan
bug_severity: high
bug_domain: state
bug_location: packages/ui/src/hooks/use-streamed-send.ts:374
---

# Rapid double-send can start concurrent session streams instead of queueing

**Location**: `packages/ui/src/hooks/use-streamed-send.ts:374` · **Severity**: high · **Pattern**: React stale state used as an async lock

`isStreaming` is render state, not a synchronous lock. A second submit in the same render window can still see `false`, bypass the queue, and open another session stream. Add a ref-backed lock for concurrency control and keep React state as display state.

```ts
const send = async (sessionId: SessionId, message: string, sketchId?: string): Promise<void> => {
  if (isStreaming) {
    queue.enqueue(entry, setItems);
    return;
  }
  await sendInternal(sessionId, message, sketchId, null);
};
```
