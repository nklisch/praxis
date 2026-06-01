---
id: bug-scan-ipc-stream-startup-hangs
created: 2026-06-01
tags: [bug, error-handling, high]
bug_origin: scan
bug_severity: high
bug_domain: error-handling
bug_location: packages/client/src/transport/ipc.ts:76
---

# Streaming IPC startup failures are swallowed and leave consumers waiting forever

**Location**: `packages/client/src/transport/ipc.ts:76` · **Severity**: high · **Pattern**: silent swallow / logged-but-not-propagated

If `ipcRenderer.invoke` rejects before a stream event can be emitted, the rejection is discarded and the iterator waits forever on an event channel that will never finish. Capture startup rejection into the iterator queue, wake pending readers, and unsubscribe.

```ts
bridge.invoke(startChannel, streamId, ...args).catch(() => {});

async next(): Promise<IteratorResult<T, undefined>> {
  while (queue.length === 0 && !done) {
    await new Promise<void>((resolve) => {
      wakeup = resolve;
    });
  }
}
```
